<?php
/**
 * 简单文件缓存
 */

define('CACHE_DIR', __DIR__ . '/../cache');
define('CACHE_DEFAULT_TTL', 300);

function initCacheDir(): bool {
    if (!is_dir(CACHE_DIR)) {
        if (!mkdir(CACHE_DIR, 0755, true)) {
            return false;
        }
    }
    $htaccess = CACHE_DIR . '/.htaccess';
    if (!file_exists($htaccess)) {
        @file_put_contents($htaccess, "Order Deny,Allow\nDeny from all");
    }
    $index = CACHE_DIR . '/index.html';
    if (!file_exists($index)) {
        @file_put_contents($index, '');
    }
    return true;
}

function getCacheFilePath(string $key): string {
    $safeKey = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $key);
    $hash = md5($key);
    return CACHE_DIR . '/' . $safeKey . '_' . $hash . '.cache';
}

function cacheGet(string $key) {
    $key = trim($key);
    if ($key === '') {
        return null;
    }
    $file = getCacheFilePath($key);
    if (!file_exists($file)) {
        return null;
    }
    $content = @file_get_contents($file);
    if ($content === false) {
        return null;
    }
    $data = @unserialize($content);
    if (!is_array($data)) {
        @unlink($file);
        return null;
    }
    if (isset($data['expires']) && $data['expires'] > 0 && time() > $data['expires']) {
        @unlink($file);
        return null;
    }
    return $data['value'] ?? null;
}

function cacheSet(string $key, $value, int $ttl = CACHE_DEFAULT_TTL): bool {
    $key = trim($key);
    if ($key === '') {
        return false;
    }
    if (!initCacheDir()) {
        return false;
    }
    $ttl = max(0, $ttl);
    $file = getCacheFilePath($key);
    $data = [
        'value' => $value,
        'created' => time(),
        'expires' => $ttl > 0 ? time() + $ttl : 0
    ];
    return @file_put_contents($file, serialize($data), LOCK_EX) !== false;
}

function cacheDelete(string $key): bool {
    $key = trim($key);
    if ($key === '') {
        return false;
    }
    $file = getCacheFilePath($key);
    if (file_exists($file)) {
        return @unlink($file);
    }
    return true;
}

function cacheClear(): int {
    $count = 0;
    if (!is_dir(CACHE_DIR)) {
        return 0;
    }
    $files = glob(CACHE_DIR . '/*.cache');
    if (!$files) {
        return 0;
    }
    foreach ($files as $file) {
        if (@unlink($file)) {
            $count++;
        }
    }
    return $count;
}

function cacheCleanup(): int {
    $count = 0;
    if (!is_dir(CACHE_DIR)) {
        return 0;
    }
    $files = glob(CACHE_DIR . '/*.cache');
    if (!$files) {
        return 0;
    }
    $now = time();
    foreach ($files as $file) {
        $content = @file_get_contents($file);
        if ($content === false) {
            continue;
        }
        $data = @unserialize($content);
        if (!is_array($data)) {
            @unlink($file);
            $count++;
            continue;
        }
        if (isset($data['expires']) && $data['expires'] > 0 && $now > $data['expires']) {
            @unlink($file);
            $count++;
        }
    }
    return $count;
}

function cacheStats(): array {
    $stats = [
        'count' => 0,
        'size' => 0,
        'expired' => 0
    ];
    if (!is_dir(CACHE_DIR)) {
        return $stats;
    }
    $files = glob(CACHE_DIR . '/*.cache');
    if (!$files) {
        return $stats;
    }
    $now = time();
    foreach ($files as $file) {
        $stats['count']++;
        $stats['size'] += filesize($file);
        $content = @file_get_contents($file);
        if ($content !== false) {
            $data = @unserialize($content);
            if (is_array($data) && isset($data['expires']) && $data['expires'] > 0 && $now > $data['expires']) {
                $stats['expired']++;
            }
        }
    }
    return $stats;
}

function cacheRemember(string $key, callable $callback, int $ttl = CACHE_DEFAULT_TTL) {
    $key = trim($key);
    if ($key === '') {
        return $callback();
    }
    $cached = cacheGet($key);
    if ($cached !== null) {
        return $cached;
    }
    $value = $callback();
    cacheSet($key, $value, $ttl);
    return $value;
}

function cacheDeleteByPrefix(string $prefix): int {
    $prefix = trim($prefix);
    if ($prefix === '') {
        return 0;
    }
    if (!is_dir(CACHE_DIR)) {
        return 0;
    }
    $count = 0;
    $safePrefix = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $prefix);
    $files = glob(CACHE_DIR . '/' . $safePrefix . '*.cache');
    if (!$files) {
        return 0;
    }
    foreach ($files as $file) {
        if (@unlink($file)) {
            $count++;
        }
    }
    return $count;
}

