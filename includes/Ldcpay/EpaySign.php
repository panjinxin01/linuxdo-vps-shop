<?php
/**
 * 易支付兼容协议 MD5 签名 / 验签
 * 来源：includes/ldcpay.php（目录结构拆分，内容零改动）
 */

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

