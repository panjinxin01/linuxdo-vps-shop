<?php
/**
 * 支付异步通知处理（依据《LD支付文档》3.3 异步通知实现）
 *
 * - 触发：认证成功后；失败自动重试，最多 5 次（单次 30s 超时）
 * - 目标：订单级 notify_url（如有）优先，否则回退到创建应用时设置的 notify_url
 * - 方式：HTTP GET
 * - 参数: pid / trade_no / out_trade_no / type=epay / name / money /
 *         trade_status=TRADE_SUCCESS / sign（MD5 签名）
 * - 应用需返回 HTTP 200 且响应体为 success（大小写不敏感），否则视为失败并继续重试
 *
 * 注意：文档 3.3 中异步通知的 sign 按"签名算法"（MD5, pid+key 体系）生成，
 * 与 Ed25519 无关，因此这里统一走 MD5 验签。
 */

require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/coupons.php';
require_once __DIR__ . '/../includes/commerce.php';
require_once __DIR__ . '/../includes/ldcpay.php';

$pdo = getDB();

/**
 * 解析外部支付请求号 -> 本地订单号
 */
function resolveLocalOrderNo(PDO $pdo, string $externalOrderNo): string {
    if ($externalOrderNo === '') {
        return '';
    }
    try {
        commerceEnsurePaymentRequestTable($pdo);
        $stmt = $pdo->prepare('SELECT order_no FROM payment_requests WHERE external_order_no = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$externalOrderNo]);
        $local = $stmt->fetchColumn();
        if ($local) {
            return (string)$local;
        }
    } catch (Throwable $e) {
    }
    return $externalOrderNo;
}

/**
 * 标记 payment_requests 已支付
 *
 * 注意：不要在这里执行 CREATE TABLE（DDL 会隐式提交外层事务）
 */
function markPaymentRequestPaid(PDO $pdo, string $externalOrderNo, string $tradeNo): void {
    try {
        $sql = 'UPDATE payment_requests SET status = 1, trade_no = ?, paid_at = NOW() WHERE external_order_no = ? AND status = 0';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$tradeNo, $externalOrderNo]);
    } catch (Throwable $e) {
    }
}

try {
    // 在开启事务前确保 payment_requests 表存在（DDL 不能在事务内执行，否则会隐式提交）
    commerceEnsurePaymentRequestTable($pdo);
} catch (Throwable $e) {
    http_response_code(500);
    die('server error');
}

$params = array_merge($_GET, $_POST);

/* ---------- 第一步：按文档 2.4.2 签名算法验签（MD5 + key 直接拼接） ---------- */

$signType = strtoupper(trim((string)($params['sign_type'] ?? 'MD5')));
if ($signType !== 'MD5') {
    die('sign_type error');
}
$key = ldcpay_callback_key($pdo);
if ($key === '') {
    die('config error');
}
if (!epay_verify_sign($params, $key)) {
    logError($pdo, 'notify.verify', '签名验证失败', [
        'out_trade_no' => (string)($params['out_trade_no'] ?? ''),
        'type' => (string)($params['type'] ?? ''),
    ]);
    die('sign error');
}

/* ---------- 第二步：业务参数校验 ---------- */

// 文档 3.3: type 固定 epay；trade_status 固定 TRADE_SUCCESS
if ((string)($params['type'] ?? '') !== 'epay') {
    die('status error');
}
if (($params['trade_status'] ?? '') !== 'TRADE_SUCCESS') {
    die('status error');
}

$externalOrderNo = trim((string)($params['out_trade_no'] ?? ''));
$orderNo = resolveLocalOrderNo($pdo, $externalOrderNo);
$tradeNo = trim((string)($params['trade_no'] ?? ''));
$money = trim((string)($params['money'] ?? ''));
$pid = trim((string)($params['pid'] ?? ''));

if ($orderNo === '') {
    die('order error');
}
if ($tradeNo === '') {
    die('trade_no error');
}
// pid 必须与本商户一致（防止跨商户伪造通知）
[$expectedPid] = ldcpay_get_credentials($pdo);
if ($expectedPid !== '' && $pid !== '' && $pid !== $expectedPid) {
    logError($pdo, 'notify.pid_mismatch', '回调 pid 与商户配置不一致', ['pid' => $pid]);
    die('pid error');
}

try {
    $pdo->beginTransaction();

    /* ---------- 第三步：幂等保护 ---------- */

    // 幂等点 A：同一外部请求号只允许入账一次
    $reqStmt = $pdo->prepare('SELECT id, order_no, status FROM payment_requests WHERE external_order_no = ? FOR UPDATE');
    $reqStmt->execute([$externalOrderNo]);
    $paymentRequest = $reqStmt->fetch(PDO::FETCH_ASSOC);

    if ($paymentRequest && (int)$paymentRequest['status'] === 1) {
        $pdo->commit();
        echo 'success';
        exit;
    }

    /* ---------- 第四步：锁定并校验本地订单 ---------- */

    $stmt = $pdo->prepare('SELECT * FROM orders WHERE order_no = ? FOR UPDATE');
    $stmt->execute([$orderNo]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        // 找不到本地订单：仅标记支付请求后应答成功，阻止平台无限重试
        markPaymentRequestPaid($pdo, $externalOrderNo, $tradeNo);
        $pdo->commit();
        echo 'success';
        exit;
    }
    if ((int)$order['status'] === 1 || (int)$order['status'] !== 0) {
        markPaymentRequestPaid($pdo, $externalOrderNo, $tradeNo);
        $pdo->commit();
        echo 'success';
        exit;
    }

    // 金额校验（文档要求金额最多两位小数，必须与订单应付金额一致）
    $orderAmount = round((float)$order['price'], 2);
    $notifyAmount = round((float)$money, 2);
    if ($notifyAmount <= 0 || abs($notifyAmount - $orderAmount) > 0.00001) {
        $pdo->rollBack();
        logError($pdo, 'notify.amount_error', '回调金额与订单不一致', [
            'order_no' => $orderNo,
            'order_amount' => $orderAmount,
            'notify_amount' => $notifyAmount,
        ]);
        die('amount error');
    }

    // 幂等点 B：CHANGELOG 记录的历史校验——重复回调交易号一致性检查
    // 同一订单已存在其他 trade_no 的成功支付记录时拒绝（防止单号复用攻击）
    $dupTrade = $pdo->prepare("SELECT COUNT(*) FROM orders WHERE order_no = ? AND status = 1 AND trade_no IS NOT NULL AND trade_no <> '' AND trade_no <> ?");
    $dupTrade->execute([$orderNo, $tradeNo]);
    if ((int)$dupTrade->fetchColumn() > 0) {
        $pdo->rollBack();
        logError($pdo, 'notify.trade_conflict', '重复回调交易号不一致', ['order_no' => $orderNo, 'trade_no' => $tradeNo]);
        die('trade conflict');
    }

    // 同一商品只允许一笔已支付订单，防止并发回调超卖
    if (!empty($order['product_id'])) {
        $dup = $pdo->prepare('SELECT order_no FROM orders WHERE product_id = ? AND status = 1 AND order_no <> ? LIMIT 1 FOR UPDATE');
        $dup->execute([(int)$order['product_id'], $orderNo]);
        if ($dup->fetchColumn()) {
            $pdo->rollBack();
            die('product already sold');
        }
    }

    /* ---------- 第五步：更新订单状态 ---------- */

    $deliveryStatus = commerceResolveAutoDeliveryStatus($order, 'paid_waiting');
    $deliveryNote = $order['delivery_note'] ?? null;
    $sql = 'UPDATE orders SET status = 1, trade_no = ?, paid_at = NOW(), payment_method = ?, balance_paid_amount = 0, external_pay_amount = ?, delivery_status = ?, delivery_note = ?, delivery_updated_at = NOW()';
    if ($deliveryStatus === 'delivered' && commerceColumnExists($pdo, 'orders', 'delivered_at')) {
        $sql .= ', delivered_at = NOW()';
    }
    $sql .= ' WHERE order_no = ? AND status = 0';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$tradeNo, 'epay', $notifyAmount, $deliveryStatus, $deliveryNote, $orderNo]);
    if (!empty($order['product_id']) && commerceTableExists($pdo, 'products')) {
        $pdo->prepare('UPDATE products SET status = 0 WHERE id = ?')->execute([(int)$order['product_id']]);
    }
    markCouponUsedByOrder($pdo, $orderNo);
    markPaymentRequestPaid($pdo, $externalOrderNo, $tradeNo);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    logError($pdo, 'notify.server', $e->getMessage(), ['out_trade_no' => $externalOrderNo]);
    http_response_code(500);
    die('server error');
}

/* ---------- 第六步：事务外发送通知 ---------- */

createNotification($pdo, (int)$order['user_id'], 'order_paid', '支付成功', '您的订单 ' . $orderNo . ' 已支付成功，金额：' . number_format($notifyAmount, 2) . ' 积分。', $orderNo);
if ($deliveryStatus === 'delivered') {
    createNotification($pdo, (int)$order['user_id'], 'order_delivered', '订单已自动交付', '您的订单 ' . $orderNo . ' 已自动标记为已交付，连接信息已可查看。', $orderNo);
} elseif ($deliveryStatus === 'exception') {
    createNotification($pdo, (int)$order['user_id'], 'order_exception', '订单待人工审核', '您的订单 ' . $orderNo . ' 已支付，但因社区规则命中人工审核流程，管理员会尽快处理。', $orderNo);
}

echo 'success';