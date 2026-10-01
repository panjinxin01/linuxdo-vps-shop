<?php
/**
 * 配置加载器
 *
 * 同时支持两种使用方式：
 *   1. 传统 define() 常量（旧代码兼容）：DB_HOST, DB_USER, LINUXDO_CLIENT_ID …
 *   2. AppConfig 对象（新代码推荐）：AppConfig::getInstance()->dbHost
 *
 * 配置优先级（高→低）：
 *   环境变量 → config.local.php（部署私有配置）→ 内置默认值
 *
 * 部署私有配置示例（config.local.php）：
 *   <?php
 *   return [
 *       'DB_HOST' => '127.0.0.1',
 *       'DB_USER' => 'your_user',
 *       'DB_PASS' => 'your_pass',
 *       'DB_NAME' => 'your_db',
 *       'DATA_ENCRYPTION_KEY' => '你的32位以上加密密钥',
 *       'ADMIN_RECOVERY_ENABLED' => false,
 *       'ADMIN_RECOVERY_KEY' => '恢复密钥',
 *       'LINUXDO_CLIENT_ID' => '',
 *       'LINUXDO_CLIENT_SECRET' => '',
 *       'LINUXDO_REDIRECT_URI' => '',
 *   ];
 */

// ── 1. 从 config.local.php + 环境变量构建 AppConfig ──
require_once __DIR__ . '/../includes/AppConfig.php';
$appConfig = AppConfig::fromEnv(__DIR__ . '/config.local.php');
// 同步单例，避免后续 getInstance() 重复加载配置
AppConfig::setInstance($appConfig);

// ── 2. 定义传统常量（向后兼容） ──
$defineMap = [
    'DB_HOST'                => $appConfig->dbHost,
    'DB_PORT'                => $appConfig->dbPort,
    'DB_USER'                => $appConfig->dbUser,
    'DB_PASS'                => $appConfig->dbPass,
    'DB_NAME'                => $appConfig->dbName,
    'SITE_NAME'              => $appConfig->siteName,
    'DATA_ENCRYPTION_KEY'    => $appConfig->dataEncryptionKey,
    'ADMIN_RECOVERY_ENABLED' => $appConfig->adminRecoveryEnabled,
    'ADMIN_RECOVERY_KEY'     => $appConfig->adminRecoveryKey,
    'LINUXDO_CLIENT_ID'      => $appConfig->linuxdoClientId,
    'LINUXDO_CLIENT_SECRET'  => $appConfig->linuxdoClientSecret,
    'LINUXDO_REDIRECT_URI'   => $appConfig->linuxdoRedirectUri,
    'LINUXDO_AUTH_URL'       => $appConfig->linuxdoAuthUrl,
    'LINUXDO_TOKEN_URL'      => $appConfig->linuxdoTokenUrl,
    'LINUXDO_USER_URL'       => $appConfig->linuxdoUserUrl,
];
foreach ($defineMap as $name => $value) {
    if (!defined($name)) {
        define($name, $value);
    }
}