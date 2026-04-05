<?php
// 安装向导 API - 纯 JSON 接口
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../includes/schema.php';

function jsonOut(int $code, string $msg = '', $data = null): void {
    echo json_encode(['code' => $code, 'msg' => $msg, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function getConfigPath(): string {
    return __DIR__ . '/config.php';
}

function getCurrentConfig(): array {
    $defaults = [
        'DB_HOST' => 'localhost',
        'DB_PORT' => 3306,
        'DB_USER' => 'root',
        'DB_PASS' => '',
        'DB_NAME' => 'vps_shop',
        'DATA_ENCRYPTION_KEY' => '',
        'ADMIN_RECOVERY_ENABLED' => false,
        'ADMIN_RECOVERY_KEY' => '',
    ];
    $path = getConfigPath();
    if (file_exists($path)) {
        @include $path;
        foreach (array_keys($defaults) as $key) {
            if (defined($key)) {
                $defaults[$key] = constant($key);
            }
        }
    }
    return $defaults;
}

function writeConfigFile(array $cfg): bool {
    $path = getConfigPath();
    $existingContent = file_exists($path) ? (string)file_get_contents($path) : '';

    $oauthVars = ['LINUXDO_CLIENT_ID' => '', 'LINUXDO_CLIENT_SECRET' => '', 'LINUXDO_REDIRECT_URI' => ''];
    foreach ($oauthVars as $key => &$val) {
        if (preg_match("/define\\('" . preg_quote($key, '/') . "',\\s*'([^']*)'\\)/", $existingContent, $m)) {
            $val = $m[1];
        }
    }
    unset($val);

    $c = "<?php\n";
    $c .= "// 数据库配置\n";
    $c .= "define('DB_HOST', " . var_export((string)$cfg['DB_HOST'], true) . ");\n";
    $c .= "define('DB_PORT', " . (int)$cfg['DB_PORT'] . ");\n";
    $c .= "define('DB_USER', " . var_export((string)$cfg['DB_USER'], true) . ");\n";
    $c .= "define('DB_PASS', " . var_export((string)$cfg['DB_PASS'], true) . ");\n";
    $c .= "define('DB_NAME', " . var_export((string)$cfg['DB_NAME'], true) . ");\n";
    $c .= "\ndefine('SITE_NAME', 'VPS积分商城');\n";
    $c .= "\ndefine('DATA_ENCRYPTION_KEY', " . var_export((string)$cfg['DATA_ENCRYPTION_KEY'], true) . ");\n";
    $c .= "\ndefine('ADMIN_RECOVERY_ENABLED', " . (!empty($cfg['ADMIN_RECOVERY_ENABLED']) ? 'true' : 'false') . ");\n";
    $c .= "define('ADMIN_RECOVERY_KEY', " . var_export((string)$cfg['ADMIN_RECOVERY_KEY'], true) . ");\n";
    $c .= "\ndefine('LINUXDO_CLIENT_ID', " . var_export($oauthVars['LINUXDO_CLIENT_ID'], true) . ");\n";
    $c .= "define('LINUXDO_CLIENT_SECRET', " . var_export($oauthVars['LINUXDO_CLIENT_SECRET'], true) . ");\n";
    $c .= "define('LINUXDO_REDIRECT_URI', " . var_export($oauthVars['LINUXDO_REDIRECT_URI'], true) . ");\n";
    $c .= "\ndefine('LINUXDO_AUTH_URL', 'https://connect.linux.do/oauth2/authorize');\n";
    $c .= "define('LINUXDO_TOKEN_URL', 'https://connect.linux.do/oauth2/token');\n";
    $c .= "define('LINUXDO_USER_URL', 'https://connect.linux.do/api/user');\n";

    $written = file_put_contents($path, $c) !== false;
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

$action = $_POST['action'] ?? $_GET['action'] ?? '';

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
            jsonOut(0, '写入配置文件失败，请检查 api/config.php 权限');
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
