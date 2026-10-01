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

