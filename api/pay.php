<?php
/**
 * 支付发起页（依据《LD支付文档》实现）
 *
 * 协议自动选择：
 *   1. 官方 LDC 接口 (type=ldcpay, Ed25519 签名) —— 配置了 ldcpay_private_key 时优先
 *   2. 易支付兼容接口 (type=epay, MD5 签名)      —— 兜底
 *
 * 两协议提交地址均为 https://credit.linux.do/epay/pay/submit.php (POST 表单)
 * 支付结果通过异步通知(api/notify.php) + 订单查询(api.php)同步。
 */

require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/coupons.php';
require_once __DIR__ . '/../includes/commerce.php';
require_once __DIR__ . '/../includes/ldcpay.php';

$pdo = getDB();

/**
 * 生成本次支付请求的外部单号（payment_requests 映射表）
 */
function createExternalOrderNo(string $orderNo): string {
    $base = preg_replace('/[^A-Za-z0-9]/', '', $orderNo);
    $base = substr($base !== '' ? $base : 'VPS', 0, 28);
    try {
        $suffix = strtoupper(bin2hex(random_bytes(3)));
    } catch (Throwable $e) {
        $suffix = strtoupper(substr(md5(uniqid('', true)), 0, 6));
    }
    return $base . 'P' . date('ymdHis') . $suffix;
}

function reserveExternalOrderNo(PDO $pdo, string $orderNo, int $userId): string {
    commerceEnsurePaymentRequestTable($pdo);
    for ($i = 0; $i < 5; $i++) {
        $externalOrderNo = createExternalOrderNo($orderNo);
        try {
            $stmt = $pdo->prepare('INSERT INTO payment_requests (order_no, external_order_no, user_id, status, created_at) VALUES (?, ?, ?, 0, NOW())');
            $stmt->execute([$orderNo, $externalOrderNo, $userId]);
            return $externalOrderNo;
        } catch (Throwable $e) {
            if ($i === 4) {
                throw $e;
            }
        }
    }
    throw new RuntimeException('reserve external order no failed');
}

if (empty($_SESSION['user_id'])) {
    exit('请先登录');
}

$orderNo = normalizeString(requestValue('order_no', ''));
if ($orderNo === '') {
    exit('订单号不能为空');
}

$stmt = $pdo->prepare('SELECT o.*, p.name as product_name FROM orders o LEFT JOIN products p ON o.product_id = p.id WHERE o.order_no = ? AND o.user_id = ?');
$stmt->execute([$orderNo, (int)$_SESSION['user_id']]);
$order = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$order) {
    exit('订单不存在');
}

$statusCode = (int)($order['status'] ?? 0);
if ($statusCode !== 0) {
    if ($statusCode === 1) {
        exit('订单已支付');
    }
    if ($statusCode === 2) {
        exit('订单已退款');
    }
    if ($statusCode === 3) {
        exit('订单已取消');
    }
    exit('订单状态不允许支付');
}

/* ---------- 过期检查：超过 15 分钟的待支付订单自动关闭 ---------- */

try {
    $createdAtTs = strtotime((string)$order['created_at']);
    if ($createdAtTs && $createdAtTs < time() - 15 * 60) {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT * FROM orders WHERE order_no = ? AND user_id = ? FOR UPDATE');
        $stmt->execute([$orderNo, (int)$_SESSION['user_id']]);
        $fresh = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($fresh && (int)$fresh['status'] === 0) {
            $freshCreated = strtotime((string)$fresh['created_at']);
            if ($freshCreated && $freshCreated < time() - 15 * 60) {
                $updateSql = 'UPDATE orders SET status = 3';
                if (commerceColumnExists($pdo, 'orders', 'cancel_reason')) {
                    $updateSql .= ", cancel_reason = 'timeout'";
                }
                if (commerceColumnExists($pdo, 'orders', 'cancelled_at')) {
                    $updateSql .= ', cancelled_at = NOW()';
                }
                if (commerceColumnExists($pdo, 'orders', 'delivery_status')) {
                    $updateSql .= ", delivery_status = 'cancelled', delivery_updated_at = NOW()";
                }
                $updateSql .= ' WHERE order_no = ? AND status = 0';
                $pdo->prepare($updateSql)->execute([$orderNo]);
                releaseCouponByOrder($pdo, $orderNo);
                // 释放因本待支付订单锁定的商品库存
                $productId = (int)($fresh['product_id'] ?? 0);
                if ($productId > 0) {
                    $paid = $pdo->prepare('SELECT COUNT(*) FROM orders WHERE product_id = ? AND status = 1');
                    $paid->execute([$productId]);
                    if ((int)$paid->fetchColumn() === 0) {
                        $pdo->prepare('UPDATE products SET status = 1 WHERE id = ? AND status = 0')->execute([$productId]);
                    }
                }
                $pdo->commit();
                exit('订单已过期，请重新下单');
            }
        }
        $pdo->commit();
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
}

/* ---------- 生成外部支付请求号 ---------- */

try {
    $externalOrderNo = reserveExternalOrderNo($pdo, (string)$order['order_no'], (int)$_SESSION['user_id']);
} catch (Throwable $e) {
    exit('支付请求初始化失败，请刷新后重试');
}

// 商品名称：优先使用下单时的快照（商品可能已被删除或改名），并截断到 64 字符
$productName = trim((string)(
    $order['product_name_snapshot']
    ?? $order['product_name']
    ?? ''
));
if ($productName === '') {
    $productName = '商品订单';
}
$payProductName = $productName . ' - 1个月';
$payMoney = ldcpay_format_money($order['price'] ?? 0);

// 回调地址：订单级 notify_url / return_url 会参与签名，长度不超过 100
$notifyUrl = mb_substr_safe(trim(commerceGetSetting($pdo, 'notify_url')), 100);
$returnUrl = mb_substr_safe(trim(commerceGetSetting($pdo, 'return_url')), 100);

/* ---------- 支付协议自动选择 ---------- */

$submitUrl = LDCPAY_SUBMIT_URL;
$params = [];
$payLabel = '';
$ldcPayError = '';

// 1) 官方 LDC 接口 (Ed25519)：需要 client_id / client_secret / 私钥齐备
[$ldcClientId, $ldcClientSecret] = ldcpay_get_credentials($pdo);
$ldcPrivateKey = ldcpay_get_private_key($pdo);

if ($ldcClientId !== '' && $ldcClientSecret !== '' && $ldcPrivateKey !== '') {
    $ldcResult = ldcpay_submit($pdo, [
        'order_no' => (string)$order['order_no'],
        'price' => $order['price'],
        'product_name' => $payProductName,
    ], [
        'external_order_no' => $externalOrderNo,
    ]);
    if ($ldcResult['success']) {
        $payLabel = 'Linux DO Credit · 官方接口';
        $params = $ldcResult['params'];
        $submitUrl = $ldcResult['url'];
    } else {
        $ldcPayError = $ldcResult['error'];
    }
}

// 2) 降级到易支付兼容接口 (MD5)
if ($payLabel === '' || empty($params)) {
    if ($ldcClientId === '' || $ldcClientSecret === '') {
        $msg = '支付未配置，请联系管理员';
        if ($ldcPayError !== '') {
            $msg = '官方支付接口失败：' . $ldcPayError . '；易支付兼容接口也无法使用（凭证缺失）';
        }
        exit($msg);
    }

    $payLabel = $ldcPayError !== ''
        ? 'Linux DO Credit · 易支付兼容'
        : 'Linux DO Credit';

    try {
        $params = epay_submit_params(
            [$ldcClientId, $ldcClientSecret],
            $externalOrderNo,
            $payProductName,
            $payMoney,
            $notifyUrl,
            $returnUrl
        );
    } catch (Throwable $e) {
        logError($pdo, 'pay.submit', $e->getMessage(), ['order_no' => $orderNo]);
        exit('支付参数生成失败，请稍后重试');
    }
}
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>正在跳转支付...</title>
    <style>
        body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .loading { text-align: center; color: #666; }
        .spinner {
            width: 40px; height: 40px;
            border: 3px solid #e0e0e0;
            border-top-color: #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pay-label { font-size: 12px; color: #999; margin-top: 8px; }
    </style>
</head>
<body>
    <div class="loading">
        <div class="spinner"></div>
        <p>正在跳转到 Linux DO Credit 支付页面，请稍候...</p>
        <p class="pay-label">支付方式：<?= htmlspecialchars($payLabel, ENT_QUOTES, 'UTF-8') ?></p>
    </div>
    <form id="payForm" method="POST" action="<?= htmlspecialchars($submitUrl, ENT_QUOTES, 'UTF-8') ?>">
        <?php foreach ($params as $k => $v): ?>
            <input type="hidden" name="<?= htmlspecialchars($k, ENT_QUOTES, 'UTF-8') ?>" value="<?= htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8') ?>">
        <?php endforeach; ?>
    </form>
    <script>document.getElementById('payForm').submit();</script>
</body>
</html>