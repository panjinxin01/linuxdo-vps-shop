<?php
/**
 * 商户积分分发与余额统计
 * 来源：includes/ldcpay.php（目录结构拆分，内容零改动）
 */

function epay_distribute(PDO $pdo, int $userId, string $username, float $amount, string $outTradeNo = '', string $remark = ''): array {
    [$clientId, $clientSecret] = ldcpay_get_credentials($pdo);
    if ($clientId === '' || $clientSecret === '') {
        return ['code' => -1, 'msg' => '支付接口未配置（pid/key）'];
    }
    if ($userId <= 0 || $username === '') {
        return ['code' => -1, 'msg' => '缺少收款人用户 ID 或用户名'];
    }
    $distAmount = ldcpay_format_money($amount);
    if ((float)$distAmount <= 0) {
        return ['code' => -1, 'msg' => '分发积分数量不合法'];
    }

    $payload = [
        'user_id' => $userId,
        'username' => $username,
        'amount' => $distAmount,
    ];
    if ($outTradeNo !== '') {
        $payload['out_trade_no'] = $outTradeNo;
    }
    if ($remark !== '') {
        $payload['remark'] = $remark;
    }

    $response = httpRequest(LDCPAY_DISTRIBUTE_URL, [
        'method' => 'POST',
        'data' => (string)json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'headers' => [
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'Authorization' => 'Basic ' . base64_encode($clientId . ':' . $clientSecret),
        ],
        'timeout' => 30,
        'ssl_verify_peer' => true,
    ]);
    if (!$response['ok']) {
        return ['code' => -1, 'msg' => '分发请求失败: ' . ($response['error'] ?: '网络错误')];
    }
    $result = json_decode((string)$response['body'], true);
    return is_array($result) ? $result : ['code' => -1, 'msg' => '分发响应解析失败'];
}

/**
 * 用户余额统计（文档 3.5）
 * GET /api/v1/dashboard/stats/user-balance — 无需鉴权（公开接口，结果有缓存）
 *
 * 成功响应: {error_msg:"", data:{total_count, total_amount, avg_amount, ...}}
 */
function epay_user_balance_stats(): array {
    $response = httpRequest(LDCPAY_BALANCE_STATS_URL, [
        'method' => 'GET',
        'timeout' => 15,
        'ssl_verify_peer' => true,
    ]);
    if (!$response['ok']) {
        return ['error_msg' => '请求失败: ' . ($response['error'] ?: '网络错误'), 'data' => null];
    }
    $result = json_decode((string)$response['body'], true);
    return is_array($result) ? $result : ['error_msg' => '响应解析失败', 'data' => null];
}

/**
 * 按字符数安全截断 UTF-8 字符串（URL 等场景）
 */
