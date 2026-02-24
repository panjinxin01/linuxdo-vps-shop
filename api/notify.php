<?php
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/coupons.php';
require_once __DIR__ . '/../includes/notifications.php';

$pdo = getDB();

function getSetting(PDO $pdo, string $key): string {
    $stmt = $pdo->prepare('SELECT key_value FROM settings WHERE key_name = ?');
    $stmt->execute([$key]);
    return (string)($stmt->fetchColumn() ?: '');
}

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

$params = array_merge($_GET, $_POST);
$key = getSetting($pdo, 'epay_key');
if ($key === '') {
    die('config error');
}

if (!verifySign($params, $key)) {
    die('sign error');
}

if (($params['trade_status'] ?? '') !== 'TRADE_SUCCESS') {
    die('status error');
}

$orderNo = trim((string)($params['out_trade_no'] ?? ''));
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
        $pdo->commit();
        echo 'success';
        exit;
    }

    $status = (int)($order['status'] ?? 0);
    if ($status === 1 || $status !== 0) {
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

    $stmt = $pdo->prepare('UPDATE orders SET status = 1, trade_no = ?, paid_at = NOW() WHERE order_no = ? AND status = 0');
    $stmt->execute([$tradeNo, $orderNo]);

    $pdo->prepare('UPDATE products SET status = 0 WHERE id = ?')
        ->execute([(int)$order['product_id']]);

    markCouponUsedByOrder($pdo, $orderNo);

    $pdo->commit();

    try {
        $stmt = $pdo->prepare('SELECT name FROM products WHERE id = ?');
        $stmt->execute([(int)$order['product_id']]);
        $productName = $stmt->fetchColumn() ?: '商品';
        $content = "您的订单 {$orderNo} 已支付成功，商品：{$productName}，金额：{$money}。请在“我的订单”中查看交付信息。";
        createNotification($pdo, (int)$order['user_id'], 'order_paid', '支付成功', $content, $orderNo);
    } catch (Throwable $e) {
        // ignore
    }

    echo 'success';
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    die('server error');
}
