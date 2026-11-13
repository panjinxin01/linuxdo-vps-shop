<?php
/**
 * 订单凭据可见性判定与对外输出预处理
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */

function commerceOrderShouldShowCredentials(array $order): bool {
    $status = (int)($order['status'] ?? 0);
    $delivery = (string)($order['delivery_status'] ?? '');
    if ($status !== 1) {
        return false;
    }
    return !in_array($delivery, ['exception', 'cancelled', 'refunded'], true);
}

function commerceDecryptDeliveryInfo(string $info): string {
    return preg_replace_callback('/enc:[A-Za-z0-9+\/=]+/', static function (array $matches): string {
        return (string)decryptSensitive($matches[0]);
    }, $info);
}

function commercePrepareOrderForOutput(array &$order, bool $hideRestrictedCredentials = false): void {
    commerceNormalizePaymentMethod($order);
    commerceNormalizeDeliveryStatus($order);
    commerceFillRefundPolicy($order);
    if (isset($order['ssh_password'])) {
        $order['ssh_password'] = decryptSensitive($order['ssh_password']);
    }
    if (!empty($order['delivery_info'])) {
        $order['delivery_info'] = commerceDecryptDeliveryInfo((string)$order['delivery_info']);
    }
    if ($hideRestrictedCredentials && !commerceOrderShouldShowCredentials($order)) {
        // 输出层统一收口：除计算别名外，订单表里 o.* 带出的 *_snapshot 原列同样属于凭据明文，
        // 未支付/非交付状态必须一并清除，避免任何复用 buildOrderSelectSql() 的接口泄露。
        unset(
            $order['ip_address'],
            $order['ssh_port'],
            $order['ssh_user'],
            $order['ssh_password'],
            $order['extra_info'],
            $order['ip_address_snapshot'],
            $order['ssh_port_snapshot'],
            $order['ssh_user_snapshot'],
            $order['ssh_password_snapshot'],
            $order['extra_info_snapshot']
        );
    }
}

