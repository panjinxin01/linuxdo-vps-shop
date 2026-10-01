<?php
/**
 * 密钥格式归一化与 PEM 转换
 * 来源：includes/Ldcpay.php（目录结构拆分，内容零改动）
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

