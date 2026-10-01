<?php
/**
 * 支付方式 / 交付状态归一化与自动状态推导
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */

function commerceNormalizePaymentMethod(array &$order): void {
    $status = (int)($order['status'] ?? 0);
    $method = (string)($order['payment_method'] ?? '');
    if ($method === '' || $method === 'pending') {
        if ($status === 0) {
            $method = 'pending';
        } elseif ((float)($order['balance_paid_amount'] ?? 0) > 0) {
            $method = 'balance';
        } elseif ($status === 1) {
            $method = 'epay';
        }
        $order['payment_method'] = $method;
    }
}

function commerceNormalizeDeliveryStatus(array &$order): void {
    $status = (int)($order['status'] ?? 0);
    $delivery = (string)($order['delivery_status'] ?? '');
    if ($delivery === '' || ($delivery === 'pending' && $status === 1)) {
        if ($status === 0) {
            $delivery = 'pending';
        } elseif ($status === 1) {
            $delivery = !empty($order['delivered_at']) ? 'delivered' : 'paid_waiting';
        } elseif ($status === 2) {
            $delivery = 'refunded';
        } else {
            $delivery = 'cancelled';
        }
        $order['delivery_status'] = $delivery;
    }
    $map = commerceGetDeliveryStatuses();
    $order['delivery_status_text'] = $map[$delivery] ?? $delivery;
}


function commerceOrderHasDeliveryPayload(array $order): bool {
    $fields = [
        'delivery_info',
        'ip_address', 'ssh_user', 'ssh_password',
        'ip_address_snapshot', 'ssh_user_snapshot', 'ssh_password_snapshot',
    ];
    foreach ($fields as $field) {
        if (!empty($order[$field])) {
            return true;
        }
    }
    return false;
}

function commerceResolveAutoDeliveryStatus(array $order, string $fallback = 'paid_waiting'): string {
    if (!empty($order['delivery_note']) && strpos((string)$order['delivery_note'], '人工审核') !== false) {
        return 'exception';
    }
    return commerceOrderHasDeliveryPayload($order) ? 'delivered' : $fallback;
}



