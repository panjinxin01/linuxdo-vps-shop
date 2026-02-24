<?php
// 安装向导 API - 纯 JSON 接口

header('Content-Type: application/json; charset=utf-8');

function jsonOut(int $code, string $msg = '', $data = null): void {
    echo json_encode(['code' => $code, 'msg' => $msg, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function getConfigPath(): string {
    return __DIR__ . '/config.php';
}

function getCurrentConfig(): array {
    $defaults = [
        'DB_HOST' => 'localhost', 'DB_PORT' => 3306,
        'DB_USER' => 'root', 'DB_PASS' => '', 'DB_NAME' => 'vps_shop',
        'DATA_ENCRYPTION_KEY' => '',];
    $path = getConfigPath();
    if (file_exists($path)) {
        @include $path;
        if (defined('DB_HOST')) $defaults['DB_HOST'] = DB_HOST;
        if (defined('DB_PORT')) $defaults['DB_PORT'] = DB_PORT;
        if (defined('DB_USER')) $defaults['DB_USER'] = DB_USER;
        if (defined('DB_PASS')) $defaults['DB_PASS'] = DB_PASS;
        if (defined('DB_NAME')) $defaults['DB_NAME'] = DB_NAME;
        if (defined('DATA_ENCRYPTION_KEY')) $defaults['DATA_ENCRYPTION_KEY'] = DATA_ENCRYPTION_KEY;
    }
    return $defaults;
}

function writeConfigFile(array $cfg): bool {
    $path = getConfigPath();
    $existingContent = file_exists($path) ? file_get_contents($path) : '';

    $oauthVars = ['LINUXDO_CLIENT_ID' => '', 'LINUXDO_CLIENT_SECRET' => '', 'LINUXDO_REDIRECT_URI' => ''];
    foreach ($oauthVars as $key => &$val) {
        if (preg_match("/define\\('" . $key . "',\\s*'([^']*)'\\)/", $existingContent, $m)) {
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
    $c .= "\ndefine('LINUXDO_CLIENT_ID', " . var_export($oauthVars['LINUXDO_CLIENT_ID'], true) . ");\n";
    $c .= "define('LINUXDO_CLIENT_SECRET', " . var_export($oauthVars['LINUXDO_CLIENT_SECRET'], true) . ");\n";
    $c .= "define('LINUXDO_REDIRECT_URI', " . var_export($oauthVars['LINUXDO_REDIRECT_URI'], true) . ");\n";
    $c .= "\ndefine('LINUXDO_AUTH_URL', 'https://connect.linux.do/oauth2/authorize');\n";
    $c .= "define('LINUXDO_TOKEN_URL', 'https://connect.linux.do/oauth2/token');\n";
    $c .= "define('LINUXDO_USER_URL', 'https://connect.linux.do/api/user');\n";

    return file_put_contents($path, $c) !== false;
}

function getTableDefinitions(): array {
    return [
        "CREATE TABLE IF NOT EXISTS `users` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `username` VARCHAR(50) NOT NULL UNIQUE,
            `password` VARCHAR(255) DEFAULT NULL,
            `email` VARCHAR(100),
            `linuxdo_id` INT DEFAULT NULL UNIQUE,
            `linuxdo_username` VARCHAR(100) DEFAULT NULL,
            `linuxdo_name` VARCHAR(100) DEFAULT NULL,
            `linuxdo_trust_level` TINYINT DEFAULT 0,
            `linuxdo_avatar` VARCHAR(500) DEFAULT NULL,
            `email_verified` DATETIME DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `admins` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `username` VARCHAR(50) NOT NULL UNIQUE,
            `password` VARCHAR(255) NOT NULL,
            `role` VARCHAR(20) DEFAULT 'admin',
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `products` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(100) NOT NULL,
            `cpu` VARCHAR(50), `memory` VARCHAR(50), `disk` VARCHAR(50), `bandwidth` VARCHAR(50),
            `price` DECIMAL(10,2) NOT NULL,
            `ip_address` VARCHAR(50) NOT NULL,
            `ssh_port` INT DEFAULT 22, `ssh_user` VARCHAR(50) DEFAULT 'root',
            `ssh_password` VARCHAR(255) NOT NULL, `extra_info` TEXT,
            `status` TINYINT DEFAULT 1,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `orders` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `order_no` VARCHAR(50) NOT NULL UNIQUE, `trade_no` VARCHAR(50),
            `user_id` INT NOT NULL, `product_id` INT NOT NULL,
            `original_price` DECIMAL(10,2) NOT NULL,
            `coupon_id` INT DEFAULT NULL, `coupon_code` VARCHAR(50) DEFAULT NULL,
            `coupon_discount` DECIMAL(10,2) DEFAULT 0,
            `price` DECIMAL(10,2) NOT NULL,
            `status` TINYINT DEFAULT 0,
            `admin_note` TEXT DEFAULT NULL, `delivered_at` DATETIME DEFAULT NULL,
            `delivery_info` TEXT DEFAULT NULL,
            `refund_reason` VARCHAR(255) DEFAULT NULL, `refund_trade_no` VARCHAR(100) DEFAULT NULL,
            `refund_amount` DECIMAL(10,2) DEFAULT NULL, `refund_at` DATETIME DEFAULT NULL,
            `cancel_reason` VARCHAR(255) DEFAULT NULL, `cancelled_at` DATETIME DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP, `paid_at` DATETIME,
            INDEX `idx_orders_user_status_created` (`user_id`, `status`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `coupons` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `code` VARCHAR(50) NOT NULL UNIQUE, `name` VARCHAR(100) DEFAULT NULL,
            `type` VARCHAR(10) NOT NULL, `value` DECIMAL(10,2) NOT NULL,
            `min_amount` DECIMAL(10,2) NOT NULL DEFAULT 0, `max_discount` DECIMAL(10,2) DEFAULT NULL,
            `max_uses` INT NOT NULL DEFAULT 0, `per_user_limit` INT NOT NULL DEFAULT 0,
            `used_count` INT NOT NULL DEFAULT 0,
            `starts_at` DATETIME DEFAULT NULL, `ends_at` DATETIME DEFAULT NULL,
            `status` TINYINT NOT NULL DEFAULT 1,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `coupon_usages` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `coupon_id` INT NOT NULL, `user_id` INT NOT NULL,
            `order_no` VARCHAR(50) NOT NULL UNIQUE,
            `status` TINYINT NOT NULL DEFAULT 0,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP, `used_at` DATETIME DEFAULT NULL,
            INDEX (`coupon_id`), INDEX (`user_id`),
            INDEX `idx_coupon_user_order` (`coupon_id`, `user_id`, `order_no`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `settings` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `key_name` VARCHAR(50) NOT NULL UNIQUE, `key_value` TEXT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `announcements` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `title` VARCHAR(200) NOT NULL, `content` TEXT NOT NULL,
            `is_top` TINYINT DEFAULT 0, `status` TINYINT DEFAULT 1,
            `publish_at` DATETIME DEFAULT NULL, `expires_at` DATETIME DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `tickets` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL, `order_id` INT DEFAULT NULL,
            `title` VARCHAR(200) NOT NULL, `status` TINYINT DEFAULT 0,
            `priority` TINYINT DEFAULT 1, `tags` VARCHAR(255) DEFAULT NULL,
            `assignee_admin_id` INT DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX `idx_tickets_user_status_updated` (`user_id`, `status`, `updated_at`),
            INDEX `idx_tickets_priority` (`priority`, `status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `ticket_replies` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `ticket_id` INT NOT NULL, `user_id` INT DEFAULT NULL,
            `content` TEXT NOT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `rate_limits` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `rate_key` VARCHAR(255) NOT NULL UNIQUE,
            `hit_count` INT NOT NULL DEFAULT 0, `window_start` DATETIME NOT NULL,
            `blocked_until` DATETIME DEFAULT NULL,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `audit_logs` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `actor_type` VARCHAR(20) NOT NULL, `actor_id` INT DEFAULT NULL,
            `actor_name` VARCHAR(50) DEFAULT NULL, `action` VARCHAR(100) NOT NULL,
            `target_id` VARCHAR(100) DEFAULT NULL, `ip_address` VARCHAR(50) DEFAULT NULL,
            `user_agent` VARCHAR(255) DEFAULT NULL, `details` TEXT DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (`actor_id`), INDEX (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `error_logs` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `context` VARCHAR(100) NOT NULL, `message` TEXT NOT NULL,
            `details` TEXT DEFAULT NULL, `ip_address` VARCHAR(50) DEFAULT NULL,
            `user_agent` VARCHAR(255) DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `notifications` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL, `type` VARCHAR(50) NOT NULL,
            `title` VARCHAR(200) NOT NULL, `content` TEXT NOT NULL,
            `related_id` VARCHAR(100) DEFAULT NULL, `is_read` TINYINT DEFAULT 0,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_notifications_user_read` (`user_id`, `is_read`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `password_resets` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL, `token` VARCHAR(255) NOT NULL,
            `expires_at` DATETIME NOT NULL, `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (`user_id`), INDEX (`expires_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `email_verifications` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL, `email` VARCHAR(100) NOT NULL,
            `code` VARCHAR(255) NOT NULL, `expires_at` DATETIME NOT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (`user_id`), INDEX (`expires_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `ticket_attachments` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `ticket_id` INT NOT NULL, `reply_id` INT DEFAULT NULL,
            `uploader_type` VARCHAR(10) NOT NULL, `uploader_id` INT NOT NULL,
            `original_name` VARCHAR(255) NOT NULL, `file_path` VARCHAR(500) NOT NULL,
            `file_size` INT NOT NULL, `mime_type` VARCHAR(100) NOT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (`ticket_id`), INDEX (`reply_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS `schema_migrations` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `version` VARCHAR(50) NOT NULL UNIQUE, `description` VARCHAR(255) DEFAULT NULL,
            `executed_at` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    ];
}

// 路由
$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'get_config':
        $cfg = getCurrentConfig();
        // 密码脱敏
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
            new PDO("mysql:host={$host};port={$port};charset=utf8mb4", $user, $pass,
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
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

        // 验证连接
        try {
            new PDO("mysql:host={$cfg['DB_HOST']};port={$cfg['DB_PORT']};charset=utf8mb4",
                $cfg['DB_USER'], $cfg['DB_PASS'],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
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
        jsonOut(1, $written ? '密钥已生成并写入配置' : '密钥已生成但写入失败，请手动配置', ['key' => $key, 'written' => $written]);
        break;

    case 'run_install':
        $cfg = getCurrentConfig();
        try {
            $pdo = new PDO("mysql:host={$cfg['DB_HOST']};port={$cfg['DB_PORT']};charset=utf8mb4",
                $cfg['DB_USER'], $cfg['DB_PASS'],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $dbName = preg_replace('/[^a-zA-Z0-9_]/', '', $cfg['DB_NAME']);
            $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $pdo->exec("USE `{$dbName}`");
            foreach (getTableDefinitions() as $sql) {
                $pdo->exec($sql);
            }
            jsonOut(1, '数据库初始化成功');
        } catch (PDOException $e) {
            jsonOut(0, '安装失败: ' . $e->getMessage());
        }
        break;

    default:
        // 无 action 时重定向到安装页面
        header('Location: ../admin/install.html');
        exit;
}
