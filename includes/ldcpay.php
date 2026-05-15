<?php
/**
 * LDC Pay (Linux DO Credit Pay) - Ed25519 签名工具
 * 
 * 官方接口使用 Ed25519 非对称加密算法进行签名验证。
 * PHP 支持方式：
 *   - Sodium 扩展 (PHP 7.2+, 推荐): sodium_crypto_sign_*
 *   - OpenSSL 3.0+: openssl_sign with Ed25519 支持
 *   - 纯 PHP 实现 (兼容降级)
 */

/**
 * 检查 Ed25519 签名能力
 */
function ldcpay_has_ed25519(): bool {
    // sodium 扩展 (PHP >= 7.2)
    if (function_exists('sodium_crypto_sign_seed_keypair')) {
        return true;
    }
    // openssl 支持 Ed25519 (OpenSSL >= 3.0 / PHP >= 8.0)
    if (function_exists('openssl_sign')) {
        $methods = openssl_get_md_methods();
        if (in_array('ed25519', $methods, true) || in_array('ED25519', $methods, true)) {
            return true;
        }
    }
    return false;
}

/**
 * 用商户私钥对数据进行 Ed25519 签名，返回 Base64 编码的签名
 * 
 * @param string $privateKey Seed 形式 (32字节的 hex 或 base64)
 * @param string $data      待签名的原始数据
 * @return string           Base64 编码的签名
 * @throws RuntimeException
 */
function ldcpay_sign(string $privateKey, string $data): string {
    // 1. 优先使用 sodium
    if (function_exists('sodium_crypto_sign_seed_keypair')) {
        $seed = ldcpay_normalize_seed($privateKey);
        $keypair = sodium_crypto_sign_seed_keypair($seed);
        $secretKey = sodium_crypto_sign_secretkey($keypair);
        $signature = sodium_crypto_sign_detached($data, $secretKey);
        return base64_encode($signature);
    }

    // 2. 尝试 OpenSSL (3.0+)
    if (function_exists('openssl_sign')) {
        $privKey = ldcpay_format_private_key_pem($privateKey);
        if ($privKey && openssl_sign($data, $signature, $privKey, 'ed25519')) {
            return base64_encode($signature);
        }
    }

    // 3. 纯 PHP 实现 (paragonie/sodium_compat 风格 - 简化版)
    if (function_exists('hash_hmac') && function_exists('sodium_crypto_generichash')) {
        // 如果安装了 sodium_compat 或 libsodium-php
        trigger_error('LDC Pay: No native Ed25519 support. Install the sodium PHP extension.', E_USER_WARNING);
    }
    
    throw new RuntimeException('Ed25519 签名不可用：请安装 PHP sodium 扩展或升级到 PHP 8.0+');
}

/**
 * 验证 Ed25519 签名 (用于回调验证)
 * 
 * @param string $publicKey Base64 或 Hex 编码的公钥
 * @param string $data      原始数据
 * @param string $signature Base64 编码的签名
 * @return bool
 */
function ldcpay_verify(string $publicKey, string $data, string $signature): bool {
    $sig = base64_decode($signature, true);
    if ($sig === false) {
        return false;
    }

    // sodium
    if (function_exists('sodium_crypto_sign_verify_detached')) {
        $pubKey = ldcpay_normalize_public_key($publicKey);
        if ($pubKey !== null) {
            return sodium_crypto_sign_verify_detached($sig, $data, $pubKey);
        }
    }

    // openssl
    if (function_exists('openssl_verify')) {
        $pubPem = ldcpay_format_public_key_pem($publicKey);
        if ($pubPem) {
            return openssl_verify($data, $sig, $pubPem, 'ed25519') === 1;
        }
    }

    return false;
}

/**
 * 生成 LDC Pay 签名字符串
 * 
 * 按文档规范：
 * 1. 取除 sign 以外所有非空请求参数
 * 2. 参数按参数名 ASCII 码从小到大排序 (字典序)
 * 3. 用 k1=v1&k2=v2... 格式拼成字符串
 * 4. 将应用密钥 (Client Secret) 直接追加到字符串末尾
 * 
 * @param array $params      请求参数 (不需包含 sign)
 * @param string $clientSecret 应用密钥
 * @return string 待签名字符串
 */
function ldcpay_build_sign_string(array $params, string $clientSecret): string {
    // 过滤掉空值和 sign 字段
    $filtered = [];
    foreach ($params as $k => $v) {
        if ($k === 'sign' || $k === 'sign_type') {
            continue;
        }
        if ($v === '' || $v === null) {
            continue;
        }
        $filtered[$k] = (string)$v;
    }
    // 按 ASCII 字典序排序
    ksort($filtered, SORT_STRING);

    $parts = [];
    foreach ($filtered as $k => $v) {
        $parts[] = $k . '=' . $v;
    }
    $str = implode('&', $parts);
    // 拼接客户端密钥
    return $str . $clientSecret;
}

/**
 * LDC Pay 的 Ed25519 签名生成 (完整流程)
 * 
 * @param array  $params       请求参数
 * @param string $clientSecret 客户端密钥 (拼接在字符串末尾)
 * @param string $privateKey   商户 Ed25519 私钥 (seed / base64)
 * @return string Base64 编码的签名
 */
function ldcpay_make_sign(array $params, string $clientSecret, string $privateKey): string {
    $data = ldcpay_build_sign_string($params, $clientSecret);
    return ldcpay_sign($privateKey, $data);
}

/**
 * 规范化 seed (支持 hex 和 base64 两种格式)
 */
function ldcpay_normalize_seed(string $privateKey): string {
    // 尝试 hex
    $hex = $privateKey;
    if (preg_match('/^[0-9a-fA-F]+$/', $hex) && strlen($hex) === 64) {
        return hex2bin($hex);
    }
    // 尝试 base64
    $decoded = base64_decode($privateKey, true);
    if ($decoded !== false && strlen($decoded) === 32) {
        return $decoded;
    }
    // 如果已经是 32 字节的二进制字符串
    if (strlen($privateKey) === 32) {
        return $privateKey;
    }
    throw new InvalidArgumentException('无效的 Ed25519 私钥格式。支持 64 位 hex 或 32 字节 base64');
}

/**
 * 规范化公钥
 */
function ldcpay_normalize_public_key(string $publicKey): ?string {
    // hex 格式
    if (preg_match('/^[0-9a-fA-F]+$/', $publicKey) && strlen($publicKey) === 64) {
        return hex2bin($publicKey);
    }
    // base64
    $decoded = base64_decode($publicKey, true);
    if ($decoded !== false && strlen($decoded) === 32) {
        return $decoded;
    }
    // 已经是 32 字节二进制
    if (strlen($publicKey) === 32) {
        return $publicKey;
    }
    return null;
}

/**
 * 将私钥格式化为 PEM 格式 (OpenSSL)
 */
function ldcpay_format_private_key_pem(string $privateKey): ?string {
    // 如果已经是 PEM
    if (strpos($privateKey, '-----BEGIN') === 0) {
        return $privateKey;
    }
    $seed = ldcpay_normalize_seed($privateKey);
    // OpenSSL 3.0 Ed25519 PEM 格式
    $pem = "-----BEGIN PRIVATE KEY-----\n" .
           chunk_split(base64_encode($seed), 64, "\n") .
           "-----END PRIVATE KEY-----";
    return $pem;
}

/**
 * 将公钥格式化为 PEM 格式
 */
function ldcpay_format_public_key_pem(string $publicKey): ?string {
    if (strpos($publicKey, '-----BEGIN') === 0) {
        return $publicKey;
    }
    $raw = ldcpay_normalize_public_key($publicKey);
    if ($raw === null) return null;
    return "-----BEGIN PUBLIC KEY-----\n" .
           chunk_split(base64_encode($raw), 64, "\n") .
           "-----END PUBLIC KEY-----";
}

/**
 * 发起 LDC Pay 支付请求
 * 
 * @param PDO    $pdo
 * @param array  $order    订单信息
 * @param array  $options  可选参数
 * @return array [success, url|error]
 */
function ldcpay_submit(PDO $pdo, array $order, array $options = []): array {
    $clientId = commerceGetSetting($pdo, 'ldcpay_client_id');
    $clientSecret = commerceGetSetting($pdo, 'ldcpay_client_secret');
    $privateKey = commerceGetSetting($pdo, 'ldcpay_private_key');
    $notifyUrl = $options['notify_url'] ?? commerceGetSetting($pdo, 'ldcpay_notify_url') ?: commerceGetSetting($pdo, 'notify_url');
    $returnUrl = $options['return_url'] ?? commerceGetSetting($pdo, 'ldcpay_return_url') ?: commerceGetSetting($pdo, 'return_url');
    $externalOrderNo = $options['external_order_no'] ?? $order['order_no'];
    $orderName = $options['order_name'] ?? ((string)($order['product_name'] ?? '商品购买'));
    $money = number_format(round((float)($order['price'] ?? 0), 2), 2, '.', '');

    if ($clientId === '' || $clientSecret === '' || $privateKey === '') {
        return ['success' => false, 'error' => 'LDC Pay 未配置'];
    }

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
        $sign = ldcpay_make_sign($params, $clientSecret, $privateKey);
        $params['sign'] = $sign;
    } catch (Throwable $e) {
        logError($pdo, 'ldcpay.sign', $e->getMessage());
        return ['success' => false, 'error' => '签名生成失败: ' . $e->getMessage()];
    }

    return [
        'success' => true,
        'params' => $params,
        'url' => 'https://credit.linux.do/epay/pay/submit.php',
    ];
}

/**
 * 发起 LDC Pay 订单查询
 * 
 * @param PDO    $pdo
 * @param string $outTradeNo 业务单号
 * @return array|null
 */
function ldcpay_query_order(PDO $pdo, string $outTradeNo): ?array {
    $clientId = commerceGetSetting($pdo, 'ldcpay_client_id');
    $clientSecret = commerceGetSetting($pdo, 'ldcpay_client_secret');

    if ($clientId === '' || $clientSecret === '') {
        return ['code' => -1, 'msg' => 'LDC Pay 未配置'];
    }

    $params = [
        'act' => 'order',
        'pid' => $clientId,
        'key' => $clientSecret,
        'out_trade_no' => $outTradeNo,
    ];

    $response = httpRequest('https://credit.linux.do/epay/api.php?' . http_build_query($params), [
        'method' => 'GET',
        'timeout' => 15,
        'ssl_verify_peer' => true,
    ]);

    if (!$response['ok']) {
        return ['code' => -1, 'msg' => '查询请求失败: ' . ($response['error'] ?: '未知错误')];
    }

    $result = json_decode((string)$response['body'], true);
    return is_array($result) ? $result : ['code' => -1, 'msg' => '响应解析失败'];
}

/**
 * 发起 LDC Pay 退款
 * 
 * @param PDO    $pdo
 * @param string $tradeNo    原交易号
 * @param float  $money      退款金额 (需等于原金额)
 * @param string $outTradeNo 业务单号 (可选)
 * @return array
 */
function ldcpay_refund(PDO $pdo, string $tradeNo, float $money, string $outTradeNo = ''): array {
    $clientId = commerceGetSetting($pdo, 'ldcpay_client_id');
    $clientSecret = commerceGetSetting($pdo, 'ldcpay_client_secret');

    if ($clientId === '' || $clientSecret === '') {
        return ['code' => -1, 'msg' => 'LDC Pay 未配置'];
    }

    $data = [
        'pid' => $clientId,
        'key' => $clientSecret,
        'trade_no' => $tradeNo,
        'money' => number_format($money, 2, '.', ''),
    ];
    if ($outTradeNo !== '') {
        $data['out_trade_no'] = $outTradeNo;
    }

    $response = httpRequest('https://credit.linux.do/epay/api.php', [
        'method' => 'POST',
        'data' => $data,
        'timeout' => 30,
        'ssl_verify_peer' => true,
    ]);

    if (!$response['ok']) {
        return ['code' => -1, 'msg' => '退款请求失败: ' . ($response['error'] ?: '网络错误')];
    }

    $result = json_decode((string)$response['body'], true);
    return is_array($result) ? $result : ['code' => -1, 'msg' => '响应解析失败'];
}

/**
 * LDC 商户分发接口 (发放积分给用户)
 * 
 * @param PDO    $pdo
 * @param int    $userId      收款人 Linux DO 用户 ID
 * @param string $username    收款人用户名 (用于二次校验)
 * @param float  $amount      分发积分数量
 * @param string $outTradeNo  商户自定义单号 (可选)
 * @param string $remark      备注 (可选)
 * @return array
 */
function ldcpay_distribute(PDO $pdo, int $userId, string $username, float $amount, string $outTradeNo = '', string $remark = ''): array {
    $clientId = commerceGetSetting($pdo, 'ldcpay_client_id');
    $clientSecret = commerceGetSetting($pdo, 'ldcpay_client_secret');

    if ($clientId === '' || $clientSecret === '') {
        return ['code' => -1, 'msg' => 'LDC Pay 未配置'];
    }

    $data = [
        'user_id' => $userId,
        'username' => $username,
        'amount' => number_format($amount, 2, '.', ''),
    ];
    if ($outTradeNo !== '') {
        $data['out_trade_no'] = $outTradeNo;
    }
    if ($remark !== '') {
        $data['remark'] = $remark;
    }

    $auth = base64_encode($clientId . ':' . $clientSecret);

    $response = httpRequest('https://credit.linux.do/lpay/distribute', [
        'method' => 'POST',
        'data' => json_encode($data),
        'headers' => [
            'Content-Type' => 'application/json',
            'Authorization' => 'Basic ' . $auth,
        ],
        'timeout' => 30,
        'ssl_verify_peer' => true,
    ]);

    if (!$response['ok']) {
        return ['code' => -1, 'msg' => '分发请求失败: ' . ($response['error'] ?: '网络错误')];
    }

    $result = json_decode((string)$response['body'], true);
    return is_array($result) ? $result : ['code' => -1, 'msg' => '响应解析失败'];
}

/**
 * 获取平台用户余额统计 (公开接口)
 * 
 * @return array|null
 */
function ldcpay_user_balance_stats(): ?array {
    $response = httpRequest('https://credit.linux.do/api/v1/dashboard/stats/user-balance', [
        'method' => 'GET',
        'timeout' => 15,
        'ssl_verify_peer' => true,
    ]);

    if (!$response['ok']) {
        return null;
    }

    $result = json_decode((string)$response['body'], true);
    if (is_array($result) && isset($result['data'])) {
        return $result['data'];
    }
    return null;
}
