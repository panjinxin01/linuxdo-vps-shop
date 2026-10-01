<?php
/**
 * AppConfig — 强类型应用配置对象
 *
 * 封装 api/config.php 中的所有配置常量，提供类型安全的只读访问。
 * 与 define() 常量保持兼容：config.php 在定义常量后会创建本实例，旧代码仍可使用常量。
 *
 * 使用方式：
 *   $cfg = AppConfig::getInstance();
 *   $host = $cfg->dbHost;
 *   $db   = $cfg->getPDO();
 */
class AppConfig {
    // 数据库
    public string $dbHost;
    public int    $dbPort;
    public string $dbUser;
    public string $dbPass;
    public string $dbName;

    // 站点
    public string $siteName;

    // 加密
    public string $dataEncryptionKey;

    // 管理员恢复
    public bool   $adminRecoveryEnabled;
    public string $adminRecoveryKey;

    // Linux DO OAuth2
    public string $linuxdoClientId;
    public string $linuxdoClientSecret;
    public string $linuxdoRedirectUri;

    // Linux DO 端点
    public string $linuxdoAuthUrl;
    public string $linuxdoTokenUrl;
    public string $linuxdoUserUrl;

    private static ?self $instance = null;

    public function __construct(array $cfg) {
        $this->dbHost              = (string)($cfg['DB_HOST'] ?? 'localhost');
        $this->dbPort              = (int)($cfg['DB_PORT'] ?? 3306);
        $this->dbUser              = (string)($cfg['DB_USER'] ?? 'root');
        $this->dbPass              = (string)($cfg['DB_PASS'] ?? '');
        $this->dbName              = (string)($cfg['DB_NAME'] ?? 'vps_shop');
        $this->siteName            = (string)($cfg['SITE_NAME'] ?? 'VPS积分商城');
        $this->dataEncryptionKey   = (string)($cfg['DATA_ENCRYPTION_KEY'] ?? '');
        $this->adminRecoveryEnabled = (bool)($cfg['ADMIN_RECOVERY_ENABLED'] ?? false);
        $this->adminRecoveryKey    = (string)($cfg['ADMIN_RECOVERY_KEY'] ?? '');
        $this->linuxdoClientId     = (string)($cfg['LINUXDO_CLIENT_ID'] ?? '');
        $this->linuxdoClientSecret = (string)($cfg['LINUXDO_CLIENT_SECRET'] ?? '');
        $this->linuxdoRedirectUri  = (string)($cfg['LINUXDO_REDIRECT_URI'] ?? '');
        $this->linuxdoAuthUrl      = (string)($cfg['LINUXDO_AUTH_URL'] ?? 'https://connect.linux.do/oauth2/authorize');
        $this->linuxdoTokenUrl     = (string)($cfg['LINUXDO_TOKEN_URL'] ?? 'https://connect.linux.do/oauth2/token');
        $this->linuxdoUserUrl      = (string)($cfg['LINUXDO_USER_URL'] ?? 'https://connect.linux.do/api/user');
    }

    /** 从环境变量 + config.local.php 构建配置 */
    public static function fromEnv(string $localConfigPath = ''): self {
        $cfg = [];

        // 1) 默认值
        $cfg['DB_HOST']     = 'localhost';
        $cfg['DB_PORT']     = 3306;
        $cfg['DB_USER']     = 'root';
        $cfg['DB_PASS']     = '';
        $cfg['DB_NAME']     = 'vps_shop';
        $cfg['SITE_NAME']   = 'VPS积分商城';
        $cfg['DATA_ENCRYPTION_KEY'] = '';
        $cfg['ADMIN_RECOVERY_ENABLED'] = false;
        $cfg['ADMIN_RECOVERY_KEY'] = '';
        $cfg['LINUXDO_CLIENT_ID'] = '';
        $cfg['LINUXDO_CLIENT_SECRET'] = '';
        $cfg['LINUXDO_REDIRECT_URI'] = '';
        $cfg['LINUXDO_AUTH_URL']  = 'https://connect.linux.do/oauth2/authorize';
        $cfg['LINUXDO_TOKEN_URL'] = 'https://connect.linux.do/oauth2/token';
        $cfg['LINUXDO_USER_URL']  = 'https://connect.linux.do/api/user';

        // 2) config.local.php 覆盖
        if ($localConfigPath !== '' && file_exists($localConfigPath)) {
            $local = (array)(require $localConfigPath);
            foreach ($local as $k => $v) {
                $cfg[$k] = $v;
            }
        }

        // 3) 环境变量覆盖（优先级最高）
        $envMap = [
            'DB_HOST' => 'DB_HOST', 'DB_PORT' => 'DB_PORT', 'DB_USER' => 'DB_USER',
            'DB_PASS' => 'DB_PASS', 'DB_NAME' => 'DB_NAME',
            'DATA_ENCRYPTION_KEY' => 'DATA_ENCRYPTION_KEY',
            'ADMIN_RECOVERY_ENABLED' => 'ADMIN_RECOVERY_ENABLED',
            'ADMIN_RECOVERY_KEY' => 'ADMIN_RECOVERY_KEY',
            'LINUXDO_CLIENT_ID' => 'LINUXDO_CLIENT_ID',
            'LINUXDO_CLIENT_SECRET' => 'LINUXDO_CLIENT_SECRET',
            'LINUXDO_REDIRECT_URI' => 'LINUXDO_REDIRECT_URI',
        ];
        foreach ($envMap as $key => $envName) {
            $val = getenv($envName);
            if ($val !== false && $val !== '') {
                $cfg[$key] = $key === 'DB_PORT' ? (int)$val : ($key === 'ADMIN_RECOVERY_ENABLED' ? filter_var($val, FILTER_VALIDATE_BOOLEAN) : $val);
            }
        }

        return new self($cfg);
    }

    /** 设置全局单例（config.php 加载后调用，避免重复解析配置） */
    public static function setInstance(self $config): void {
        self::$instance = $config;
    }

    /** 获取全局单例 */
    public static function getInstance(): self {
        if (self::$instance === null) {
            self::$instance = self::fromEnv(__DIR__ . '/../api/config.local.php');
        }
        return self::$instance;
    }

    /** 创建 PDO 连接 */
    public function getPDO(): PDO {
        return new PDO(
            'mysql:host=' . $this->dbHost . ';port=' . $this->dbPort . ';dbname=' . $this->dbName . ';charset=utf8mb4',
            $this->dbUser,
            $this->dbPass,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    }

    /** 获取 DSN 字符串 */
    public function getDSN(): string {
        return 'mysql:host=' . $this->dbHost . ';port=' . $this->dbPort . ';dbname=' . $this->dbName . ';charset=utf8mb4';
    }
}