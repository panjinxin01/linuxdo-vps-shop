<?php
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/coupons.php';
require_once __DIR__ . '/../includes/commerce.php';
require_once __DIR__ . '/../includes/ldcpay.php';

$pdo = getDB();

function verifySign(array $params, string $key): bool {
    $sign = $params['sign'] ?? '';
    unset($params['sign'], $params['sign_type']);
    ksort($params);
    $str = '';
    foreach ($params as $k => $v) {
        if ($v !== '') {
            $str .= $k . '=' . $v . '&';
        }
    }
    $str = rtrim($str, '&') . $key;
    return md5($str) === $sign;
}

function verifyLdcPaySign(array $params, string $clientSecret, string $publicKey): bool {
    $sign = $params['sign'] ?? '';
    if ($sign === '') return false;
    $data = ldcpay_build_sign_string($params, $clientSecret);
    return ldcpay_verify($publicKey, $data, $sign);
}


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

function markPaymentRequestPaid(PDO $pdo, string $externalOrderNo, string $tradeNo): void {
    try {
        commerceEnsurePaymentRequestTable($pdo);
        $stmt = $pdo->prepare('UPDATE payment_requests SET status = 1, trade_no = ?, paid_at = NOW() WHERE external_order_no = ?');
        $stmt->execute([$tradeNo, $externalOrderNo]);
    } catch (Throwable $e) {
    }
}

$params = array_merge($_GET, $_POST);

// 自动识别签名类型
$payType = (string)($params['type'] ?? 'epay');

if ($payType === 'ldcpay') {
    // LDC Pay (Ed25519) 回调验证
    $clientSecret = commerceGetSetting($pdo, 'ldcpay_client_secret');
    $publicKey = commerceGetSetting($pdo, 'ldcpay_public_key');
    if ($clientSecret === '' || $publicKey === '') {
        die('config error');
    }
    if (!verifyLdcPaySign($params, $clientSecret, $publicKey)) {
        die('sign error');
    }
} else {
    // EasyPay (MD5) 回调验证
    $key = commerceGetSetting($pdo, 'epay_key');
    if ($key === '') {
        die('config error');
    }
    if (!verifySign($params, $key)) {
        die('sign error');
    }
}

if (($params['trade_status'] ?? '') !== 'TRADE_SUCCESS') {
    die('status error');
}

$externalOrderNo = trim((string)($params['out_trade_no'] ?? ''));
$orderNo = resolveLocalOrderNo($pdo, $externalOrderNo);
$tradeNo = trim((string)($params['trade_no'] ?? ''));
$money = $params['money'] ?? '';
if ($orderNo === '') {
    die('order error');
}

try {
    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT * FROM orders WHERE order_no = ? FOR UPDATE');
    $stmt->execute([$orderNo]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        markPaymentRequestPaid($pdo, $externalOrderNo, $tradeNo);
        $pdo->commit();
        echo 'success';
        exit;
    }
    if ((int)$order['status'] === 1 || (int)$order['status'] !== 0) {
        markPaymentRequestPaid($pdo, $externalOrderNo, $tradeNo ?: (string)($order['trade_no'] ?? ''));
        $pdo->commit();
        echo 'success';
        exit;
    }
    $orderAmount = round((float)$order['price'], 2);
    $notifyAmount = round((float)$money, 2);
    if ($notifyAmount <= 0 || abs($notifyAmount - $orderAmount) > 0.00001) {
        $pdo->rollBack();
        die('amount error');
    }
    $deliveryStatus = commerceResolveAutoDeliveryStatus($order, 'paid_waiting');
    $deliveryNote = $order['delivery_note'] ?? null;
    $paymentMethod = ($payType === 'ldcpay') ? 'ldcpay' : 'epay';
    $sql = 'UPDATE orders SET status = 1, trade_no = ?, paid_at = NOW(), payment_method = ?, balance_paid_amount = 0, external_pay_amount = ?, delivery_status = ?, delivery_note = ?, delivery_updated_at = NOW()';
    if ($deliveryStatus === 'delivered' && commerceColumnExists($pdo, 'orders', 'delivered_at')) {
        $sql .= ', delivered_at = NOW()';
    }
    $sql .= ' WHERE order_no = ? AND status = 0';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$tradeNo, $paymentMethod, $notifyAmount, $deliveryStatus, $deliveryNote, $orderNo]);
    if (!empty($order['product_id']) && commerceTableExists($pdo, 'products')) {
        $pdo->prepare('UPDATE products SET status = 0 WHERE id = ?')->execute([(int)$order['product_id']]);
    }
    markCouponUsedByOrder($pdo, $orderNo);
    markPaymentRequestPaid($pdo, $externalOrderNo, $tradeNo);
    $pdo->commit();
    createNotification($pdo, (int)$order['user_id'], 'order_paid', '支付成功', '您的订单 ' . $orderNo . ' 已支付成功，金额：' . number_format($notifyAmount, 2) . ' 积分。', $orderNo);
    if ($deliveryStatus === 'delivered') {
        createNotification($pdo, (int)$order['user_id'], 'order_delivered', '订单已自动交付', '您的订单 ' . $orderNo . ' 已自动标记为已交付，连接信息已可查看。', $orderNo);
    } elseif ($deliveryStatus === 'exception') {
        createNotification($pdo, (int)$order['user_id'], 'order_exception', '订单待人工审核', '您的订单 ' . $orderNo . ' 已支付，但因社区规则命中人工审核流程，管理员会尽快处理。', $orderNo);
    }
    echo 'success';
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    die('server error');
}