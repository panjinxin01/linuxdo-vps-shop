<?php
/**
 * 敏感数据加解密（DATA_ENCRYPTION_KEY）
 * 来源：includes/security.php（目录结构拆分，内容零改动）
 */

function encryptionKey(): ?string {
    if (!defined('DATA_ENCRYPTION_KEY') || DATA_ENCRYPTION_KEY === '') {
        return null;
    }
    return hash('sha256', DATA_ENCRYPTION_KEY, true);
}

function encryptSensitive(?string $value): ?string {
    if ($value === null || $value === '') {
        return $value;
    }
    if (!function_exists('openssl_encrypt')) {
        return $value;
    }
    $key = encryptionKey();
    if (!$key) {
        return $value;
    }
    try {
        $iv = random_bytes(12);
    } catch (Throwable $e) {
        return $value;
    }
    $tag = '';
    $cipher = openssl_encrypt($value, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) {
        return $value;
    }
    return 'enc:' . base64_encode($iv . $tag . $cipher);
}

function decryptSensitive(?string $value): ?string {
    if ($value === null || $value === '') {
        return $value;
    }
    if (strpos($value, 'enc:') !== 0) {
        return $value;
    }
    if (!function_exists('openssl_decrypt')) {
        return '';
    }
    $key = encryptionKey();
    if (!$key) {
        return '';
    }
    $data = base64_decode(substr($value, 4), true);
    if ($data === false || strlen($data) < 28) {
        return '';
    }
    $iv = substr($data, 0, 12);
    $tag = substr($data, 12, 16);
    $cipher = substr($data, 28);
    $plain = openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    return $plain === false ? '' : $plain;
}

