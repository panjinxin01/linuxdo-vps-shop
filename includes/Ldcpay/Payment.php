<?php
/**
 * 发起支付（自动选择 Ed25519 / MD5 协议）
 * 来源：includes/ldcpay.php（目录结构拆分，内容零改动）
 */

/* ==========================================================
 * 业务接口
 * ========================================================== */

/**
 * 构建官方 LDC 接口 (type=ldcpay) 提交参数（文档 1.4）
 *
 * @param PDO    $pdo
 * @param array  $order   订单信息 (order_no, price, product_name)
 * @param array  $options external_order_no / order_name / notify_url / return_url
 * @return array [success, params, url] 或 [success=false, error]
 */
function ldcpay_submit(PDO $pdo, array $order, array $options = []): array {
    [$clientId, $clientSecret] = ldcpay_get_credentials($pdo);
    $privateKey = ldcpay_get_private_key($pdo);

    if ($clientId === '' || $clientSecret === '' || $privateKey === '') {
        return ['success' => false, 'error' => 'LDC Pay 未配置（需要 client_id / client_secret / Ed25519 私钥）'];
    }

    // 订单级 notify_url/return_url 优先（文档 1.4：会参与签名，长度不超过 100），
    // 未传时回退应用级配置
    $notifyUrl = trim((string)($options['notify_url'] ?? (commerceGetSetting($pdo, 'ldcpay_notify_url') ?: commerceGetSetting($pdo, 'notify_url'))));
    $returnUrl = trim((string)($options['return_url'] ?? (commerceGetSetting($pdo, 'ldcpay_return_url') ?: commerceGetSetting($pdo, 'return_url'))));
    $notifyUrl = mb_substr_safe($notifyUrl, 100);
    $returnUrl = mb_substr_safe($returnUrl, 100);

    $externalOrderNo = (string)($options['external_order_no'] ?? $order['order_no']);
    $orderName = ldcpay_truncate_name((string)($options['order_name'] ?? ($order['product_name'] ?? '商品购买')));
    $money = ldcpay_format_money($order['price'] ?? 0);

    $params = [
        'client_id' => $clientId,
        'type' => 'ldcpay',
        'out_trade_no' => $externalOrderNo,
        'money' => $money,
        'order_name' => $orderName,
    ];
    if ($notifyUrl !== '') {
        $params['notify_url'] = $notifyUrl;
    }
    if ($returnUrl !== '') {
        $params['return_url'] = $returnUrl;
    }

    try {
        $params['sign'] = ldcpay_make_sign($params, $clientSecret, $privateKey);
    } catch (Throwable $e) {
        logError($pdo, 'ldcpay.sign', $e->getMessage());
        return ['success' => false, 'error' => '签名生成失败: ' . $e->getMessage()];
    }

    return [
        'success' => true,
        'params' => $params,
        'url' => LDCPAY_SUBMIT_URL,
    ];
}

/**
 * 构建易支付兼容接口 (type=epay) 提交参数（文档 2.5）
 *
 * @return array 提交参数（含 sign / sign_type）
 */
