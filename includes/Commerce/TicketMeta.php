<?php
/**
 * 工单分类 / 交付状态枚举（单一数据源）
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */

function commerceGetTicketCategories(): array {
    return [
        'login_issue' => '登录异常',
        'credential_error' => '凭据错误',
        'delivery_issue' => '发货异常',
        'payment_issue' => '支付问题',
        'refund_request' => '退款申请',
        'other' => '其他',
    ];
}

function commerceGetDeliveryStatuses(): array {
    return [
        'pending' => '待支付',
        'paid_waiting' => '待开通',
        'provisioning' => '处理中',
        'delivered' => '已交付',
        'exception' => '异常',
        'cancelled' => '已取消',
        'refunded' => '已退款',
    ];
}

