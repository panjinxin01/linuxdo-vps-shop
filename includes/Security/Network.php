<?php
/**
 * 客户端 IP 解析与表存在性检测
 * 来源：includes/security.php（目录结构拆分，内容零改动）
 */

function getClientIp(): string {
    $candidates = [
        $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '',
        $_SERVER['HTTP_X_REAL_IP'] ?? '',
        $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '',
        $_SERVER['REMOTE_ADDR'] ?? ''
    ];
    foreach ($candidates as $candidate) {
        if ($candidate === '') {
            continue;
        }
        if (strpos($candidate, ',') !== false) {
            $parts = explode(',', $candidate);
            $candidate = trim($parts[0]);
        }
        if (filter_var($candidate, FILTER_VALIDATE_IP)) {
            return $candidate;
        }
    }
    return '0.0.0.0';
}

function securityTableExists(PDO $pdo, string $table): bool {
    static $cache = [];
    if (($cache[$table] ?? false) === true) {
        return true;
    }
    try {
        // 直接尝试查询表，比SHOW TABLES LIKE 更可靠。
        // 只缓存存在=true，避免同一请求内迁移建表后仍读取旧的 false。
        $pdo->query("SELECT 1 FROM `" . preg_replace('/[^a-zA-Z0-9_]/', '', $table) . "` LIMIT 0");
        $cache[$table] = true;
        return true;
    } catch (Throwable $e) {
        return false;
    }
}

