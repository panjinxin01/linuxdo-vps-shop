<?php
/**
 * 订单交付状态更新
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */

function commerceUpdateOrderDelivery(PDO $pdo, string $orderNo, string $deliveryStatus, string $note = '', string $error = ''): bool {
    $allowed = ['pending', 'paid_waiting', 'provisioning', 'delivered', 'exception', 'cancelled', 'refunded'];
    if (!in_array($deliveryStatus, $allowed, true)) {
        return false;
    }
    $parts = ['delivery_status = ?', 'delivery_updated_at = NOW()'];
    $params = [$deliveryStatus];
    if (commerceColumnExists($pdo, 'orders', 'delivery_note')) {
        $parts[] = 'delivery_note = ?';
        $params[] = $note !== '' ? $note : null;
    }
    if (commerceColumnExists($pdo, 'orders', 'delivery_error')) {
        $parts[] = 'delivery_error = ?';
        $params[] = $error !== '' ? $error : null;
    }
    if ($deliveryStatus === 'delivered' && commerceColumnExists($pdo, 'orders', 'delivered_at')) {
        $parts[] = 'delivered_at = COALESCE(delivered_at, NOW())';
    }
    if (commerceColumnExists($pdo, 'orders', 'handled_admin_id') && !empty($_SESSION['admin_id'])) {
        $parts[] = 'handled_admin_id = ?';
        $params[] = (int)$_SESSION['admin_id'];
    }
    $params[] = $orderNo;
    $stmt = $pdo->prepare('UPDATE orders SET ' . implode(', ', $parts) . ' WHERE order_no = ?');
    return $stmt->execute($params);
}

