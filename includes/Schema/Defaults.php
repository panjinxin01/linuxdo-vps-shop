<?php
/**
 * 系统默认配置项种子数据
 * 来源：includes/schema.php（目录结构拆分，内容零改动）
 */

function getProjectDefaultSettings(): array {
    return [
        'epay_pid' => '',
        'epay_key' => '',
        'notify_url' => '',
        'return_url' => '',
        'ldcpay_client_id' => '',
        'ldcpay_client_secret' => '',
        'ldcpay_private_key' => '',
        'ldcpay_public_key' => '',
        'ldcpay_notify_url' => '',
        'ldcpay_return_url' => '',
        'linuxdo_silenced_order_mode' => 'review',
        'notification_email_enabled' => '0',
        'notification_webhook_enabled' => '0',
        'notification_webhook_url' => '',
        'credit_recharge_enabled' => '0',
        'ticket_attachment_max_mb' => '5'
    ];
}
