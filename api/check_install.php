<?php
$configPath = __DIR__ . '/config.php';
if (file_exists($configPath)) {
    require_once $configPath;
}
require_once __DIR__ . '/../includes/db.php';

$status = [
    'config_ok' => false,
    'db_ok' => false,
    'tables_ok' => false,
    'admin_ok' => false,
    'admin_count' => 0,
    // 仅回传是否启用恢复模式，不回传密钥是否已配置，避免信息泄露
    'recovery_enabled' => defined('ADMIN_RECOVERY_ENABLED') ? (bool)ADMIN_RECOVERY_ENABLED : false,
    'recovery_local_allowed' => false,
    'missing_tables' => []
];

// 本机可执行标记：供 setup 页面决定是否展示恢复操作区
$remoteAddr = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$isLocal = $remoteAddr === '127.0.0.1' || $remoteAddr === '::1' || strpos($remoteAddr, '127.') === 0;
if (stripos($remoteAddr, '::ffff:') === 0) {
    $mapped = substr($remoteAddr, 7);
    $isLocal = $isLocal || strpos($mapped, '127.') === 0;
}
$status['recovery_local_allowed'] = $isLocal;

// 检查配置是否存在
// 注意：不能只用 defined() 判断。config.php 总会用内置默认值把 DB_HOST/DB_USER/DB_NAME
// 定义出来（localhost / root / vps_shop），所以未部署的全新站点也会通过 defined() 检查，
// 导致安装向导的"未配置"分支永远不触发。这里改为检测是否真的提供了私有配置。
$configLocalPath = __DIR__ . '/config.local.php';
$hasLocalConfigFile = is_file($configLocalPath);
$envConfigured = false;
foreach (['DB_HOST', 'DB_USER', 'DB_NAME', 'DB_PASS'] as $envKey) {
    $val = getenv($envKey);
    if ($val !== false && $val !== '') {
        $envConfigured = true;
        break;
    }
}
if (!$hasLocalConfigFile && !$envConfigured) {
    jsonResponse(1, '', $status);
}
$status['config_ok'] = true;

$requiredTables = ['users', 'admins', 'products', 'orders', 'settings', 'announcements', 'tickets', 'ticket_replies'];

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $status['db_ok'] = true;

    $stmt = $pdo->prepare('SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?');
    $stmt->execute([DB_NAME]);
    if ($stmt->fetch()) {
        $pdo->exec('USE `' . DB_NAME . '`');
        $existingTables = [];
        $tablesResult = $pdo->query('SHOW TABLES');
        while ($row = $tablesResult->fetch(PDO::FETCH_NUM)) {
            $existingTables[] = $row[0];
        }

        $missingTables = array_values(array_diff($requiredTables, $existingTables));
        $status['missing_tables'] = $missingTables;
        if (empty($missingTables)) {
            $status['tables_ok'] = true;
            $admin = (int)$pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn();
            $status['admin_count'] = $admin;
            $status['admin_ok'] = $admin > 0;
        }
    }
} catch (Throwable $e) {
    $status['error'] = '数据库连接失败';
}

jsonResponse(1, '', $status);

