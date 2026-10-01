<?php
/**
 * 官方协议 Ed25519 签名 / 验签 / 签名串构造
 * 来源：includes/ldcpay.php（目录结构拆分，内容零改动）
 */

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
