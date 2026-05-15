<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/coupons.php';
require_once __DIR__ . '/../includes/commerce.php';
require_once __DIR__ . '/../includes/ldcpay.php';

$pdo = getDB();

function makeSign(array $params, string $key): string {
    ksort($params);
    $str = '';
    foreach ($params as $k => $v) {
        if ($k !== 'sign' && $k !== 'sign_type' && $v !== '') {
            $str .= $k . '=' . $v . '&';
        }
    }
    $str = rtrim($str, '&') . $key;
    return md5($str);
}



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
                $updateSql .= ' WHERE order_no = ? AND status = 0';
                $pdo->prepare($updateSql)->execute([$orderNo]);
                releaseCouponByOrder($pdo, $orderNo);
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
try {
    $externalOrderNo = reserveExternalOrderNo($pdo, (string)$order['order_no'], (int)$_SESSION['user_id']);
} catch (Throwable $e) {
    exit('支付请求初始化失败，请刷新后重试');
}

// ========== 支付协议自动选择 ==========
// 同一平台 (Linux DO Credit)，优先 LDC Pay (Ed25519)，降级到易支付 (MD5)
$submitUrl = 'https://credit.linux.do/epay/pay/submit.php';
$params = [];
$payLabel = '';
$ldcPayError = '';

// 检查 LDC Pay 是否已配置
$ldcClientId = commerceGetSetting($pdo, 'ldcpay_client_id');
$ldcClientSecret = commerceGetSetting($pdo, 'ldcpay_client_secret');
$ldcPrivateKey = commerceGetSetting($pdo, 'ldcpay_private_key');

if ($ldcClientId !== '' && $ldcClientSecret !== '' && $ldcPrivateKey !== '') {
    $ldcResult = ldcpay_submit($pdo, $order, [
        'external_order_no' => $externalOrderNo,
        'order_name' => ($order['product_name'] ?: '商品') . ' - 1个月',
    ]);
    if ($ldcResult['success']) {
        $payLabel = 'LDC Pay (Ed25519)';
        $params = $ldcResult['params'];
        $submitUrl = $ldcResult['url'];
    } else {
        $ldcPayError = $ldcResult['error'];
    }
}

// 降级到易支付 (MD5)
if ($payLabel === '') {
    $pid = commerceGetSetting($pdo, 'epay_pid');
    $key = commerceGetSetting($pdo, 'epay_key');
    $notifyUrl = commerceGetSetting($pdo, 'notify_url');
    $returnUrl = commerceGetSetting($pdo, 'return_url');

    if ($pid === '' || $key === '') {
        $msg = '支付未配置，请联系管理员';
        if ($ldcPayError !== '') {
            $msg = 'LDC Pay 失败：' . $ldcPayError . '；易支付也未配置';
        }
        exit($msg);
    }

    $payLabel = $ldcPayError !== ''
        ? 'EasyPay (MD5) — LDC Pay 不可用，已自动降级'
        : 'EasyPay (MD5)';

    $params = [
        'pid' => $pid,
        'type' => 'epay',
        'out_trade_no' => $externalOrderNo,
        'name' => ($order['product_name'] ?: '商品') . ' - 1个月',
        'money' => $order['price'],
        'notify_url' => $notifyUrl,
        'return_url' => $returnUrl
    ];
    $params['sign'] = makeSign($params, $key);
    $params['sign_type'] = 'MD5';
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
        <p>正在跳转到支付页面，请稍候...</p>
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