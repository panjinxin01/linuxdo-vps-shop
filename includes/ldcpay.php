<?php
/**
 * LDC Pay — Linux DO Credit 积分支付 SDK（依据《LD支付文档》实现）
 *
 * 网关基址: https://credit.linux.do
 *
 * 双协议支持：
 *   1. 官方 LDC 接口 (type=ldcpay)
 *      - 提交: POST /epay/pay/submit.php（client_id + Ed25519 签名）
 *      - 签名: 非空参数(除 sign) ASCII 升序 k1=v1&k2=v2 + Client Secret 直接拼接
 *              → 商户私钥 Ed25519 签名 → Base64
 *   2. 易支付兼容接口 (type=epay)
 *      - 提交: POST /epay/pay/submit.php（pid/key + MD5 签名）
 *      - 签名: 非空字段(排除 sign/sign_type) ASCII 升序 k1=v1&k2=v2 + key → MD5 小写
 *
 * 公共接口（两协议共用，认证均为 pid + key，即 Client ID + Client Secret）：
 *   - 订单查询:  GET  /epay/api.php                          (文档 3.1)
 *   - 订单退款:  POST /epay/api.php                          (文档 3.2，仅支持全额退回)
 *   - 异步通知:  HTTP GET 回调，应用需响应体返回 success     (文档 3.3，sign 为 MD5)
 *   - 商户分发:  POST /lpay/distribute（Basic Auth）         (文档 3.4)
 *   - 余额统计:  GET  /api/v1/dashboard/stats/user-balance   (文档 3.5，无需鉴权)
 */

if (!defined('LDCPAY_GATEWAY')) {
    define('LDCPAY_GATEWAY', 'https://credit.linux.do');
    define('LDCPAY_SUBMIT_URL', LDCPAY_GATEWAY . '/epay/pay/submit.php');
    define('LDCPAY_API_URL', LDCPAY_GATEWAY . '/epay/api.php');
    define('LDCPAY_DISTRIBUTE_URL', LDCPAY_GATEWAY . '/lpay/distribute');
    define('LDCPAY_BALANCE_STATS_URL', LDCPAY_GATEWAY . '/api/v1/dashboard/stats/user-balance');
}

/* ==========================================================
 * 凭证读取
 * 文档 2.4.1: pid = Client ID, key = Client Secret（同一应用身份）
 * ========================================================== */

/**
 * 统一读取支付凭证 (client_id, client_secret)
 * 优先读取 LDC Pay 专属配置，缺失时回退到易支付 pid/key 配置
 *
 * @return array [string $clientId, string $clientSecret]
 */
function ldcpay_get_credentials(PDO $pdo): array {
    $clientId = commerceGetSetting($pdo, 'ldcpay_client_id');
    $clientSecret = commerceGetSetting($pdo, 'ldcpay_client_secret');
    if ($clientId === '' || $clientSecret === '') {
        if ($clientId === '') {
            $clientId = commerceGetSetting($pdo, 'epay_pid');
        }
        if ($clientSecret === '') {
            $clientSecret = commerceGetSetting($pdo, 'epay_key');
        }
    }
    return [$clientId, $clientSecret];
}

/**
 * 读取商户 Ed25519 私钥（官方接口请求签名用）
 */
function ldcpay_get_private_key(PDO $pdo): string {
    return commerceGetSetting($pdo, 'ldcpay_private_key');
}

/**
 * 读取回调验签密钥
 * 文档 3.3: 异步通知 sign 按"签名算法"(MD5, pid+key 体系)生成，
 * 与 Ed25519 无关。key 优先取易支付 epay_key，回退 LDC Client Secret（同一密钥）。
 */
function ldcpay_callback_key(PDO $pdo): string {
    $key = commerceGetSetting($pdo, 'epay_key');
    if ($key === '') {
        $key = commerceGetSetting($pdo, 'ldcpay_client_secret');
    }
    return $key;
}

/* ==========================================================
 * Ed25519 签名（官方 LDC 接口专用）
 * PHP 支持方式：
 *   - Sodium 扩展 (PHP 7.2+, 推荐): sodium_crypto_sign_*
 *   - OpenSSL 3.0+: openssl_sign with Ed25519 支持
 * ========================================================== */

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

    throw new RuntimeException('Ed25519 签名不可用：请安装 PHP sodium 扩展或升级到 PHP 8.0+ (OpenSSL 3.0)');
}

/**
 * 验证 Ed25519 签名
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
 * 生成官方 LDC 接口签名字符串（文档 1.3.1）
 *
 * 1. 取除 sign 以外所有非空请求参数（sign_type 一并排除）
 * 2. 参数按参数名 ASCII 码从小到大排序（字典序）
 * 3. 用 k1=v1&k2=v2... 格式拼成字符串
 * 4. 将应用密钥 (Client Secret) 直接追加到字符串末尾
 */
function ldcpay_build_sign_string(array $params, string $clientSecret): string {
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
    ksort($filtered, SORT_STRING);

    $parts = [];
    foreach ($filtered as $k => $v) {
        $parts[] = $k . '=' . $v;
    }
    return implode('&', $parts) . $clientSecret;
}

/**
 * 官方 LDC 接口 Ed25519 签名（完整流程）
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
    if (preg_match('/^[0-9a-fA-F]+$/', $privateKey) && strlen($privateKey) === 64) {
        return (string)hex2bin($privateKey);
    }
    // 尝试 base64
    $decoded = base64_decode($privateKey, true);
    if ($decoded !== false && strlen($decoded) === 32) {
        return $decoded;
    }
    // 已经是 32 字节的二进制字符串
    if (strlen($privateKey) === 32) {
        return $privateKey;
    }
    throw new InvalidArgumentException('无效的 Ed25519 私钥格式。支持 64 位 hex 或 32 字节 base64');
}

/**
 * 规范化公钥
 */
function ldcpay_normalize_public_key(string $publicKey): ?string {
    if (preg_match('/^[0-9a-fA-F]+$/', $publicKey) && strlen($publicKey) === 64) {
        return (string)hex2bin($publicKey);
    }
    $decoded = base64_decode($publicKey, true);
    if ($decoded !== false && strlen($decoded) === 32) {
        return $decoded;
    }
    if (strlen($publicKey) === 32) {
        return $publicKey;
    }
    return null;
}

/**
 * 将私钥格式化为 PEM 格式 (OpenSSL)
 *
 * Ed25519 PKCS#8 私钥需要包含 OID 等结构，不能直接将 seed 封装为 PEM。
 * 这里构造符合 RFC 8410 的标准 PKCS#8 DER 编码。
 */
function ldcpay_format_private_key_pem(string $privateKey): ?string {
    if (strpos($privateKey, '-----BEGIN') === 0) {
        return $privateKey;
    }
    try {
        $seed = ldcpay_normalize_seed($privateKey);
    } catch (Throwable $e) {
        return null;
    }
    // 构造 PKCS#8 的 DER 编码 (Ed25519 OID: 1.3.101.112)
    $oid = "\x2b\x65\x70"; // OID 1.3.101.112 (Ed25519)
    $algSeq = "\x30\x05\x06\x03" . $oid; // SEQUENCE { OID }
    $innerOctet = "\x04\x20" . $seed; // OCTET STRING { seed }
    $outerOctet = "\x04\x22" . $innerOctet; // OCTET STRING { OCTET STRING { seed } }
    $pkcs8 = "\x30\x2e\x02\x01\x00" . $algSeq . $outerOctet; // SEQUENCE { ... }
    return "-----BEGIN PRIVATE KEY-----\n" .
           chunk_split(base64_encode($pkcs8), 64, "\n") .
           "-----END PRIVATE KEY-----";
}

/**
 * 将公钥格式化为 PEM 格式 (OpenSSL)
 *
 * 构造符合 RFC 8410 的标准 SubjectPublicKeyInfo DER 编码。
 */
function ldcpay_format_public_key_pem(string $publicKey): ?string {
    if (strpos($publicKey, '-----BEGIN') === 0) {
        return $publicKey;
    }
    $raw = ldcpay_normalize_public_key($publicKey);
    if ($raw === null) {
        return null;
    }
    $oid = "\x2b\x65\x70"; // OID 1.3.101.112
    $algSeq = "\x30\x05\x06\x03" . $oid; // SEQUENCE { OID }
    $bitString = "\x03\x21\x00" . $raw; // BIT STRING (32 bytes + null padding prefix)
    $spki = "\x30\x2a" . $algSeq . $bitString; // SEQUENCE { AlgorithmIdentifier, SubjectPublicKey }
    return "-----BEGIN PUBLIC KEY-----\n" .
           chunk_split(base64_encode($spki), 64, "\n") .
           "-----END PUBLIC KEY-----";
}

/* ==========================================================
 * 易支付兼容协议 MD5 签名（文档 2.4.2 / 3.3）
 * ========================================================== */

/**
 * 生成易支付签名字符串
 *
 * 1. 取所有非空字段（排除 sign、sign_type）
 * 2. 按 ASCII 升序拼成 k1=v1&k2=v2
 * 3. 末尾追加应用密钥: k1=v1&k2=v2{secret}
 */
function epay_build_sign_string(array $params, string $secret): string {
    $filtered = [];
    foreach ($params as $k => $v) {
        if ($k === 'sign' || $k === 'sign_type') {
            continue;
        }
        if ($v === null || (is_string($v) && trim($v) === '')) {
            continue;
        }
        $filtered[$k] = (string)$v;
    }
    ksort($filtered, SORT_STRING);

    $parts = [];
    foreach ($filtered as $k => $v) {
        $parts[] = $k . '=' . $v;
    }
    return implode('&', $parts) . $secret;
}

/**
 * 易支付 MD5 签名（小写十六进制）
 */
function epay_make_sign(array $params, string $secret): string {
    return md5(epay_build_sign_string($params, $secret));
}

/**
 * 易支付验签（用于异步通知，文档 3.3）
 */
function epay_verify_sign(array $params, string $secret): bool {
    $sign = trim((string)($params['sign'] ?? ''));
    if ($sign === '' || $secret === '') {
        return false;
    }
    // MD5 小写十六进制比对（兼容大写传入）
    return hash_equals(epay_make_sign($params, $secret), strtolower($sign));
}

/* ==========================================================
 * 通用工具
 * ========================================================== */

/**
 * 格式化积分金额（文档要求：最多/必须保留两位小数）
 */
function ldcpay_format_money($money): string {
    return number_format(round((float)$money, 2), 2, '.', '');
}

/**
 * 截断商品名称（易支付 name 最多 64 字符）
 */
function ldcpay_truncate_name(string $name, int $max = 64): string {
    $name = trim($name);
    if ($name === '') {
        $name = '商品订单';
    }
    if (function_exists('mb_substr')) {
        return mb_substr($name, 0, $max, 'UTF-8');
    }
    $cut = substr($name, 0, $max);
    // 去掉按字节截断产生的残缺多字节尾部
    return (string)preg_replace('/[\x80-\xFF]+$/', '', $cut);
}

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
function mb_substr_safe(string $str, int $length): string {
    if (strlen($str) <= $length) {
        return $str;
    }
    if (function_exists('mb_substr')) {
        return (string)mb_substr($str, 0, $length, 'UTF-8');
    }
    return substr($str, 0, $length);
}