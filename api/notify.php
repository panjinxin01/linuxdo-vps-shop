<?php
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/coupons.php';
require_once __DIR__ . '/../includes/commerce.php';

$pdo = getDB();

function getSetting(PDO $pdo, string $key): string {
    return commerceGetSetting($pdo, $key);
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


function ensurePaymentRequestTable(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `payment_requests` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `order_no` VARCHAR(50) NOT NULL,
        `external_order_no` VARCHAR(80) NOT NULL,
        `user_id` INT NOT NULL,
        `trade_no` VARCHAR(100) DEFAULT NULL,
        `status` TINYINT NOT NULL DEFAULT 0,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
        `paid_at` DATETIME DEFAULT NULL,
        UNIQUE KEY `uniq_payment_requests_external` (`external_order_no`),
        INDEX `idx_payment_requests_order` (`order_no`),
        INDEX `idx_payment_requests_user_status` (`user_id`, `status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function resolveLocalOrderNo(PDO $pdo, string $externalOrderNo): string {
    if ($externalOrderNo === '') {
        return '';
    }
    try {
        ensurePaymentRequestTable($pdo);
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
        ensurePaymentRequestTable($pdo);
        $stmt = $pdo->prepare('UPDATE payment_requests SET status = 1, trade_no = ?, paid_at = NOW() WHERE external_order_no = ?');
        $stmt->execute([$tradeNo, $externalOrderNo]);
    } catch (Throwable $e) {
    }
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
        $pdo->commit();
        echo 'success';
        exit;
    }
    if ((int)$order['status'] === 1 || (int)$order['status'] !== 0) {
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
    $deliveryStatus = 'paid_waiting';
    $deliveryNote = null;
    if (!empty($order['delivery_note']) && strpos((string)$order['delivery_note'], '人工审核') !== false) {
        $deliveryStatus = 'exception';
        $deliveryNote = $order['delivery_note'];
    }
    $stmt = $pdo->prepare('UPDATE orders SET status = 1, trade_no = ?, paid_at = NOW(), payment_method = ?, balance_paid_amount = 0, external_pay_amount = ?, delivery_status = ?, delivery_note = ?, delivery_updated_at = NOW() WHERE order_no = ? AND status = 0');
    $stmt->execute([$tradeNo, 'epay', $notifyAmount, $deliveryStatus, $deliveryNote, $orderNo]);
    if (!empty($order['product_id']) && commerceTableExists($pdo, 'products')) {
        $pdo->prepare('UPDATE products SET status = 0 WHERE id = ?')->execute([(int)$order['product_id']]);
    }
    markCouponUsedByOrder($pdo, $orderNo);
    markPaymentRequestPaid($pdo, $externalOrderNo, $tradeNo);
    $pdo->commit();
    createNotification($pdo, (int)$order['user_id'], 'order_paid', '支付成功', '您的订单 ' . $orderNo . ' 已支付成功，金额：' . number_format($notifyAmount, 2) . ' 积分。', $orderNo);
    if ($deliveryStatus === 'exception') {
        createNotification($pdo, (int)$order['user_id'], 'order_exception', '订单待人工审核', '您的订单 ' . $orderNo . ' 已支付，但因社区规则命中人工审核流程，管理员会尽快处理。', $orderNo);
    }
    echo 'success';
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    die('server error');
}
