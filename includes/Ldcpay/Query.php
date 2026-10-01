<?php
/**
 * 提交参数构造与订单查询
 * 来源：includes/ldcpay.php（目录结构拆分，内容零改动）
 */

function epay_submit_params(array $credentials, string $externalOrderNo, string $name, string $money, string $notifyUrl = '', string $returnUrl = '', string $device = ''): array {
    [$pid, $key] = $credentials;

    $params = [
        'pid' => $pid,
        'type' => 'epay',
        'out_trade_no' => $externalOrderNo,
        'name' => ldcpay_truncate_name($name),
        'money' => ldcpay_format_money($money),
    ];
    if (trim($notifyUrl) !== '') {
        $params['notify_url'] = trim($notifyUrl);
    }
    if (trim($returnUrl) !== '') {
        $params['return_url'] = trim($returnUrl);
    }
    if (trim($device) !== '') {
        $params['device'] = trim($device);
    }
    $params['sign'] = epay_make_sign($params, $key);
    $params['sign_type'] = 'MD5';
    return $params;
}

/**
 * 订单查询（文档 3.1）
 * GET /epay/api.php — 认证: pid + key；out_trade_no 必填；act 建议 order
 *
 * 成功响应: {code:1, trade_no, out_trade_no, money, status, ...}
 * status: 1=成功，0=失败/处理中；不存在返回 HTTP 404 且 {code:-1}
 */
function epay_query_order(PDO $pdo, string $outTradeNo): array {
    [$clientId, $clientSecret] = ldcpay_get_credentials($pdo);
    if ($clientId === '' || $clientSecret === '') {
        return ['code' => -1, 'msg' => '支付接口未配置（pid/key）'];
    }
    if ($outTradeNo === '') {
        return ['code' => -1, 'msg' => '业务单号不能为空'];
    }

    $query = http_build_query([
        'act' => 'order',
        'pid' => $clientId,
        'key' => $clientSecret,
        'out_trade_no' => $outTradeNo,
    ]);
    $response = httpRequest(LDCPAY_API_URL . '?' . $query, [
        'method' => 'GET',
        'timeout' => 30,
        'ssl_verify_peer' => true,
    ]);
    if (!$response['ok']) {
        return ['code' => -1, 'msg' => '订单查询请求失败: ' . ($response['error'] ?: '网络错误')];
    }
    $result = json_decode((string)$response['body'], true);
    if (!is_array($result)) {
        return ['code' => -1, 'msg' => '订单查询响应解析失败'];
    }
    return $result;
}

/**
 * 订单退款（文档 3.2）
 * POST /epay/api.php — 仅支持对已成功的积分流转服务进行积分的全额退回，
 * money 必须等于原积分流转服务的积分数量。
 *
 * 成功响应: {code:1, msg:"退款成功"}
 */
