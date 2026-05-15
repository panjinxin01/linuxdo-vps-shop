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
    'recovery_enabled' => defined('ADMIN_RECOVERY_ENABLED') ? (bool)ADMIN_RECOVERY_ENABLED : false,
    'recovery_key_set' => defined('ADMIN_RECOVERY_KEY') && trim((string)ADMIN_RECOVERY_KEY) !== '',
    'missing_tables' => []
];

// 检查配置是否存在
if (!defined('DB_HOST') || !defined('DB_USER') || !defined('DB_NAME')) {
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

