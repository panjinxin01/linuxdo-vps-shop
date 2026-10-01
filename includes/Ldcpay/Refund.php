<?php
/**
 * 订单退款（仅支持全额）
 * 来源：includes/ldcpay.php（目录结构拆分，内容零改动）
 */

function epay_refund(PDO $pdo, string $tradeNo, float $money, string $outTradeNo = ''): array {
    [$clientId, $clientSecret] = ldcpay_get_credentials($pdo);
    if ($clientId === '' || $clientSecret === '') {
        return ['code' => -1, 'msg' => '支付接口未配置（pid/key）'];
    }
    if ($tradeNo === '') {
        return ['code' => -1, 'msg' => '缺少平台交易号 trade_no'];
    }
    $refundMoney = ldcpay_format_money($money);
    if ((float)$refundMoney <= 0) {
        return ['code' => -1, 'msg' => '退款金额不合法'];
    }

    $data = [
        'pid' => $clientId,
        'key' => $clientSecret,
        'trade_no' => $tradeNo,
        'money' => $refundMoney,
    ];
    if ($outTradeNo !== '') {
        $data['out_trade_no'] = $outTradeNo;
    }

    $response = httpRequest(LDCPAY_API_URL, [
        'method' => 'POST',
        'data' => $data,
        'timeout' => 30,
        'ssl_verify_peer' => true,
    ]);
    if (!$response['ok']) {
        return ['code' => -1, 'msg' => '退款请求失败: ' . ($response['error'] ?: '网络错误')];
    }
    $result = json_decode((string)$response['body'], true);
    return is_array($result) ? $result : ['code' => -1, 'msg' => '退款响应解析失败'];
}

/**
 * 商户分发接口（文档 3.4）
 * POST /lpay/distribute — Basic Auth (client_id:client_secret)
 *
 * 成功响应: {code:1, data:{trade_no, out_trade_no}}
 */
