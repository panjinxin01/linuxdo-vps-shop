<?php
// 安装向导 API - 纯 JSON 接口
header('Content-Type: application/json; charset=utf-8');
// 安装向导会写入配置文件并执行建库/建表，属于高危操作，
// 必须开启会话并校验 CSRF，否则可被跨站请求触发。
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/schema.php';

function jsonOut(int $code, string $msg = '', $data = null): void {
    echo json_encode(['code' => $code, 'msg' => $msg, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function getConfigPath(): string {
    return __DIR__ . '/config.local.php';
}

function readLocalConfigFile(string $path): array {
    if (!is_file($path)) {
        return [];
    }
    $loaded = @include $path;
    return is_array($loaded) ? $loaded : [];
}

function applyEnvOverrides(array $cfg): array {
    $envKeys = [
        'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME', 'SITE_NAME',
        'DATA_ENCRYPTION_KEY', 'ADMIN_RECOVERY_ENABLED', 'ADMIN_RECOVERY_KEY',
        'LINUXDO_CLIENT_ID', 'LINUXDO_CLIENT_SECRET', 'LINUXDO_REDIRECT_URI',
        'LINUXDO_AUTH_URL', 'LINUXDO_TOKEN_URL', 'LINUXDO_USER_URL',
    ];
    foreach ($envKeys as $key) {
        $value = getenv($key);
        if ($value === false || $value === '') {
            continue;
        }
        if ($key === 'DB_PORT') {
            $cfg[$key] = (int)$value;
        } elseif ($key === 'ADMIN_RECOVERY_ENABLED') {
            $cfg[$key] = filter_var($value, FILTER_VALIDATE_BOOLEAN);
        } else {
            $cfg[$key] = $value;
        }
    }
    return $cfg;
}

function getCurrentConfig(): array {
    $defaults = [
        'DB_HOST' => 'localhost',
        'DB_PORT' => 3306,
        'DB_USER' => 'root',
        'DB_PASS' => '',
        'DB_NAME' => 'vps_shop',
        'SITE_NAME' => 'VPS积分商城',
        'DATA_ENCRYPTION_KEY' => '',
        'ADMIN_RECOVERY_ENABLED' => false,
        'ADMIN_RECOVERY_KEY' => '',
        'LINUXDO_CLIENT_ID' => '',
        'LINUXDO_CLIENT_SECRET' => '',
        'LINUXDO_REDIRECT_URI' => '',
        'LINUXDO_AUTH_URL' => 'https://connect.linux.do/oauth2/authorize',
        'LINUXDO_TOKEN_URL' => 'https://connect.linux.do/oauth2/token',
        'LINUXDO_USER_URL' => 'https://connect.linux.do/api/user',
    ];
    $cfg = array_merge($defaults, readLocalConfigFile(getConfigPath()));
    return applyEnvOverrides($cfg);
}

function writeConfigFile(array $cfg): bool {
    $path = getConfigPath();
    $current = readLocalConfigFile($path);
    $cfg = array_merge($current, $cfg);

    $preferredKeys = [
        'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME', 'SITE_NAME',
        'DATA_ENCRYPTION_KEY', 'ADMIN_RECOVERY_ENABLED', 'ADMIN_RECOVERY_KEY',
        'LINUXDO_CLIENT_ID', 'LINUXDO_CLIENT_SECRET', 'LINUXDO_REDIRECT_URI',
        'LINUXDO_AUTH_URL', 'LINUXDO_TOKEN_URL', 'LINUXDO_USER_URL',
    ];
    $ordered = [];
    foreach ($preferredKeys as $key) {
        if (array_key_exists($key, $cfg)) {
            $ordered[$key] = $cfg[$key];
        }
    }
    foreach ($cfg as $key => $value) {
        if (!array_key_exists($key, $ordered)) {
            $ordered[$key] = $value;
        }
    }

    $content = "<?php\nreturn [\n";
    foreach ($ordered as $key => $value) {
        if (!preg_match('/^[A-Z0-9_]+$/', (string)$key)) {
            continue;
        }
        $content .= '    ' . var_export((string)$key, true) . ' => ' . var_export($value, true) . ",\n";
    }
    $content .= "];\n";

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

// 安装锁定检查（安装完成后创建 .install_lock 文件禁止危险操作）
$installLockFile = __DIR__ . '/../.install_lock';
$isInstalled = file_exists($installLockFile);
$dangerousActions = ['run_install', 'save_config', 'test_db', 'generate_key'];

$action = $_POST['action'] ?? $_GET['action'] ?? '';

// CSRF 校验：本文件不加载 db.php，因此不能使用 requireCsrf()（它依赖 jsonResponse()），
// 这里直接用 security.php 提供的取 token / 验 token 函数自行校验。
if (in_array($action, $dangerousActions, true)) {
    if (!verifyCsrfToken(getCsrfTokenFromRequest())) {
        jsonOut(0, '安全验证失败（CSRF Token 无效或已过期），请刷新页面后重试');
    }
}

if ($isInstalled && in_array($action, $dangerousActions, true)) {
    jsonOut(0, '安装已完成，危险操作已被锁定。如需重新安装，请手动删除 .install_lock 文件（位于项目根目录）。');
}

switch ($action) {
    case 'get_config':
        $cfg = getCurrentConfig();
        $cfg['DB_PASS'] = $cfg['DB_PASS'] !== '' ? '********' : '';
        $cfg['has_encryption_key'] = $cfg['DATA_ENCRYPTION_KEY'] !== '';
        unset($cfg['DATA_ENCRYPTION_KEY']);
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
            jsonOut(0, '写入配置文件失败，请检查 api/config.local.php 权限');
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
            // 安装成功，写入锁文件
            @file_put_contents($installLockFile, date('Y-m-d H:i:s') . "\n");
            jsonOut(1, '数据库初始化成功');
        } catch (PDOException $e) {
            jsonOut(0, '安装失败: ' . $e->getMessage());
        }
        break;

    default:
        header('Location: ../admin/install.html');
        exit;
}
