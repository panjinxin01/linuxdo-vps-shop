<?php
// 安装向导 API - 纯 JSON 接口
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/schema.php';

function jsonOut(int $code, string $msg = '', $data = null): void {
    echo json_encode(['code' => $code, 'msg' => $msg, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}
function getConfigPath(): string {
    return __DIR__ . '/config.local.php';
}


function getCurrentConfig(): array {
    return [
        'DB_HOST' => defined('DB_HOST') ? DB_HOST : 'localhost',
        'DB_PORT' => defined('DB_PORT') ? DB_PORT : 3306,
        'DB_USER' => defined('DB_USER') ? DB_USER : 'root',
        'DB_PASS' => defined('DB_PASS') ? DB_PASS : '',
        'DB_NAME' => defined('DB_NAME') ? DB_NAME : 'vps_shop',
        'DATA_ENCRYPTION_KEY' => defined('DATA_ENCRYPTION_KEY') ? DATA_ENCRYPTION_KEY : '',
        'ADMIN_RECOVERY_ENABLED' => defined('ADMIN_RECOVERY_ENABLED') ? (bool)ADMIN_RECOVERY_ENABLED : false,
        'ADMIN_RECOVERY_KEY' => defined('ADMIN_RECOVERY_KEY') ? ADMIN_RECOVERY_KEY : '',
        'INSTALLER_ALLOW_REMOTE' => defined('INSTALLER_ALLOW_REMOTE') ? (bool)INSTALLER_ALLOW_REMOTE : false,
    ];
}

function readExistingLocalConfig(): array {
    $path = getConfigPath();
    if (!is_file($path)) {
        return [];
    }
    $loaded = @include $path;
    return is_array($loaded) ? $loaded : [];
}

function writeConfigFile(array $cfg): bool {
    $path = getConfigPath();
    $existing = readExistingLocalConfig();
    $data = array_merge($existing, [
        'DB_HOST' => (string)$cfg['DB_HOST'],
        'DB_PORT' => (int)$cfg['DB_PORT'],
        'DB_USER' => (string)$cfg['DB_USER'],
        'DB_PASS' => (string)$cfg['DB_PASS'],
        'DB_NAME' => (string)$cfg['DB_NAME'],
        'DATA_ENCRYPTION_KEY' => (string)($cfg['DATA_ENCRYPTION_KEY'] ?? ''),
        'ADMIN_RECOVERY_ENABLED' => !empty($cfg['ADMIN_RECOVERY_ENABLED']),
        'ADMIN_RECOVERY_KEY' => (string)($cfg['ADMIN_RECOVERY_KEY'] ?? ''),
        'INSTALLER_ALLOW_REMOTE' => !empty($cfg['INSTALLER_ALLOW_REMOTE']),
    ]);

    $content = "<?php\nreturn " . var_export($data, true) . ";\n";
    $written = file_put_contents($path, $content, LOCK_EX) !== false;
    clearstatcache(true, $path);
    if ($written && function_exists('opcache_invalidate')) {
        @opcache_invalidate($path, true);
    }
    return $written;
}

function seedInstallSettings(PDO $pdo): void {
    $stmt = $pdo->prepare('INSERT INTO settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = VALUES(key_value)');
    foreach (getProjectDefaultSettings() as $key => $value) {
        $stmt->execute([$key, $value]);
    }
}

function installerAlreadyInitialized(array $status): bool {
    return !empty($status['config_ok']) && !empty($status['tables_ok']);
}

function getInstallStatus(): array {
    $status = [
        'config_ok' => false,
        'db_ok' => false,
        'tables_ok' => false,
        'admin_ok' => false,
        'admin_count' => 0,
        'missing_tables' => []
    ];

    if (!defined('DB_HOST') || !defined('DB_USER') || !defined('DB_NAME')) {
        return $status;
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
            $pdo->exec('USE `' . preg_replace('/[^a-zA-Z0-9_]/', '', DB_NAME) . '`');
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
    }

    return $status;
}

function ensureInstallerAccessAllowed(): void {
    $status = getInstallStatus();
    if (installerAlreadyInitialized($status) && !isLocalRequest() && !(defined('INSTALLER_ALLOW_REMOTE') && INSTALLER_ALLOW_REMOTE)) {
        jsonOut(0, '安装接口已禁用');
    }
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';
ensureInstallerAccessAllowed();

switch ($action) {
    case 'get_config':
        $cfg = getCurrentConfig();
        $cfg['DB_PASS'] = $cfg['DB_PASS'] !== '' ? '********' : '';
        $cfg['has_encryption_key'] = $cfg['DATA_ENCRYPTION_KEY'] !== '';
        unset($cfg['DATA_ENCRYPTION_KEY'], $cfg['ADMIN_RECOVERY_ENABLED'], $cfg['ADMIN_RECOVERY_KEY'], $cfg['INSTALLER_ALLOW_REMOTE']);
        jsonOut(1, '', $cfg);
        break;

    case 'test_db':
        $host = trim($_POST['db_host'] ?? 'localhost');
        $port = (int)($_POST['db_port'] ?? 3306);
        $user = trim($_POST['db_user'] ?? '');
        $pass = $_POST['db_pass'] ?? '';

        if ($host === '' || $user === '') {
            jsonOut(0, '地址和用户名不能为空');
        }
        try {
            new PDO("mysql:host={$host};port={$port};charset=utf8mb4", $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 5,
            ]);
            jsonOut(1, '连接成功');
        } catch (PDOException $e) {
            jsonOut(0, '连接失败: ' . $e->getMessage());
        }
        break;

    case 'save_config':
        $cfg = getCurrentConfig();
        $cfg['DB_HOST'] = trim($_POST['db_host'] ?? 'localhost');
        $cfg['DB_PORT'] = (int)($_POST['db_port'] ?? 3306);
        $cfg['DB_USER'] = trim($_POST['db_user'] ?? 'root');
        $pass = $_POST['db_pass'] ?? '';
        if ($pass !== '' && $pass !== '********') {
            $cfg['DB_PASS'] = $pass;
        }
        $cfg['DB_NAME'] = trim($_POST['db_name'] ?? 'vps_shop');

        if ($cfg['DB_HOST'] === '' || $cfg['DB_USER'] === '' || $cfg['DB_NAME'] === '') {
            jsonOut(0, '地址、用户名、数据库名不能为空');
        }

        try {
            new PDO("mysql:host={$cfg['DB_HOST']};port={$cfg['DB_PORT']};charset=utf8mb4", $cfg['DB_USER'], $cfg['DB_PASS'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 5,
            ]);
        } catch (PDOException $e) {
            jsonOut(0, '数据库连接失败: ' . $e->getMessage());
        }

        if (!writeConfigFile($cfg)) {
            jsonOut(0, '写入本地配置失败，请检查 api/config.local.php 所在目录权限');
        }
        jsonOut(1, '配置已保存');
        break;

    case 'generate_key':
        $key = bin2hex(random_bytes(32));
        $cfg = getCurrentConfig();
        $cfg['DATA_ENCRYPTION_KEY'] = $key;
        $written = writeConfigFile($cfg);
        jsonOut(1, $written ? '密钥已生成并写入配置' : '密钥已生成但写入失败，请手动配置', [
            'key' => $key,
            'written' => $written,
        ]);
        break;

    case 'run_install':
        $cfg = getCurrentConfig();
        try {
            $pdo = new PDO("mysql:host={$cfg['DB_HOST']};port={$cfg['DB_PORT']};charset=utf8mb4", $cfg['DB_USER'], $cfg['DB_PASS'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
            $dbName = preg_replace('/[^a-zA-Z0-9_]/', '', $cfg['DB_NAME']);
            $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $pdo->exec("USE `{$dbName}`");
            foreach (getProjectTableDefinitions() as $sql) {
                $pdo->exec($sql);
            }
            seedInstallSettings($pdo);
            jsonOut(1, '数据库初始化成功');
        } catch (PDOException $e) {
            jsonOut(0, '安装失败: ' . $e->getMessage());
        }
        break;

    default:
        header('Location: ../admin/install.html');
        exit;
}
