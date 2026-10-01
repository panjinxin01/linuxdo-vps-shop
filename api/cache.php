<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/cache.php';

$action = requestValue('action', '');
$pdo = getDB();

try {
    checkAdmin($pdo);

    match ($action) {
        'stats'         => handleCacheStats(),
        'clear'         => handleCacheClear($pdo),
        'cleanup'       => handleCacheCleanup($pdo),
        'delete'        => handleCacheDelete(),
        default         => jsonResponse(0, '未知操作'),
    };
} catch (Throwable $e) {
    logError($pdo, 'api.cache', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

function handleCacheStats(): void {
    $stats = cacheStats();
    $stats['size_human'] = formatBytes($stats['size']);
    jsonResponse(1, '', $stats);
}

function handleCacheClear(PDO $pdo): void {
    requireCsrf();
    $count = cacheClear();
    logAudit($pdo, 'cache.clear', ['count' => $count]);
    jsonResponse(1, "已清理{$count}个缓存文件");
}

function handleCacheCleanup(PDO $pdo): void {
    requireCsrf();
    $count = cacheCleanup();
    logAudit($pdo, 'cache.cleanup', ['count' => $count]);
    jsonResponse(1, "已清理{$count}个过期缓存");
}

function handleCacheDelete(): void {
    requireCsrf();
    $key = normalizeString(requestValue('key', ''), 128);
    if ($key === '') {
        jsonResponse(0, '缓存键不能为空');
    }
    cacheDelete($key);
    jsonResponse(1, '缓存已删除');
}

function formatBytes(int $bytes): string {
    if ($bytes >= 1073741824) {
        return number_format($bytes / 1073741824, 2) . ' GB';
    }
    if ($bytes >= 1048576) {
        return number_format($bytes / 1048576, 2) . ' MB';
    }
    if ($bytes >= 1024) {
        return number_format($bytes / 1024, 2) . ' KB';
    }
    return $bytes . ' B';
}

