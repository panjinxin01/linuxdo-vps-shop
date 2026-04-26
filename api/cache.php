<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/cache.php';

$action = requestValue('action', '');
$pdo = getDB();

try {
    checkAdmin($pdo);

    switch ($action) {
        case 'stats':
            $stats = cacheStats();
            $stats['size_human'] = formatBytes($stats['size']);
            jsonResponse(1, '', $stats);
            break;

        case 'clear':
            requireCsrf();
            $count = cacheClear();
            logAudit($pdo, 'cache.clear', ['count' => $count]);
            jsonResponse(1, "已清理{$count}个缓存文件");
            break;

        case 'cleanup':
            requireCsrf();
            $count = cacheCleanup();
            logAudit($pdo, 'cache.cleanup', ['count' => $count]);
            jsonResponse(1, "已清理{$count}个过期缓存");
            break;

        case 'delete':
            requireCsrf();
            $key = normalizeString(requestValue('key', ''), 128);
            if ($key === '') {
                jsonResponse(0, '缓存键不能为空');
            }
            cacheDelete($key);
            jsonResponse(1, '缓存已删除');
            break;

        case 'delete_prefix':
            requireCsrf();
            $prefix = normalizeString(requestValue('prefix', ''), 64);
            if ($prefix === '') {
                jsonResponse(0, '前缀不能为空');
            }
            $count = cacheDeleteByPrefix($prefix);
            logAudit($pdo, 'cache.delete_prefix', ['prefix' => $prefix, 'count' => $count]);
            jsonResponse(1, "已删除{$count}个缓存");
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.cache', $e->getMessage());
    jsonResponse(0, '服务器错误');
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

