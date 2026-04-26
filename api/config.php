<?php

$__appLocalConfig = [];
$__appLocalConfigPath = __DIR__ . '/config.local.php';
if (is_file($__appLocalConfigPath)) {
    $loadedLocalConfig = @include $__appLocalConfigPath;
    if (is_array($loadedLocalConfig)) {
        $__appLocalConfig = $loadedLocalConfig;
    }
}
unset($loadedLocalConfig, $__appLocalConfigPath);

function configValue(string $key, $default = '') {
    $envValue = getenv($key);
    if ($envValue !== false) {
        return $envValue;
    }
    global $__appLocalConfig;
    if (is_array($__appLocalConfig) && array_key_exists($key, $__appLocalConfig)) {
        return $__appLocalConfig[$key];
    }
    return $default;
}

function configBool(string $key, bool $default = false): bool {
    $value = configValue($key, $default ? 'true' : 'false');
    $parsed = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    return $parsed === null ? $default : $parsed;
}

// 数据库配置
// 敏感值请通过环境变量或 /api/config.local.php 注入，不要直接提交到代码仓库
// config.local.php 示例：<?php return ['DB_PASS' => '***'];
define('DB_HOST', (string)configValue('DB_HOST', 'localhost'));
define('DB_PORT', (int)configValue('DB_PORT', 3306));
define('DB_USER', (string)configValue('DB_USER', 'root'));
define('DB_PASS', (string)configValue('DB_PASS', ''));
define('DB_NAME', (string)configValue('DB_NAME', 'vps_shop'));

// 站点配置
define('SITE_NAME', (string)configValue('SITE_NAME', 'VPS积分商城'));

// 加密密钥（用于敏感字段加密，请使用32位以上随机字符串）
define('DATA_ENCRYPTION_KEY', (string)configValue('DATA_ENCRYPTION_KEY', ''));

// 安装器：默认仅允许首次安装阶段远程访问；安装完成后将自动锁定。
// 如确需在已安装状态下远程重新开放安装接口，请在环境变量或 config.local.php 中显式设置 INSTALLER_ALLOW_REMOTE=true
define('INSTALLER_ALLOW_REMOTE', configBool('INSTALLER_ALLOW_REMOTE', false));

// 管理员恢复模式（仅用于紧急恢复）
// 建议仅通过环境变量或 /api/config.local.php 临时开启，并在恢复后立即关闭
define('ADMIN_RECOVERY_ENABLED', configBool('ADMIN_RECOVERY_ENABLED', false));
define('ADMIN_RECOVERY_KEY', (string)configValue('ADMIN_RECOVERY_KEY', ''));

// Linux DO Connect OAuth2 配置
// 建议优先在后台保存到 settings 表；此处仅保留环境变量 / 本地私有配置兼容读取
define('LINUXDO_CLIENT_ID', (string)configValue('LINUXDO_CLIENT_ID', ''));
define('LINUXDO_CLIENT_SECRET', (string)configValue('LINUXDO_CLIENT_SECRET', ''));
define('LINUXDO_REDIRECT_URI', (string)configValue('LINUXDO_REDIRECT_URI', ''));

// Linux DO OAuth2 端点
define('LINUXDO_AUTH_URL', (string)configValue('LINUXDO_AUTH_URL', 'https://connect.linux.do/oauth2/authorize'));
define('LINUXDO_TOKEN_URL', (string)configValue('LINUXDO_TOKEN_URL', 'https://connect.linux.do/oauth2/token'));
define('LINUXDO_USER_URL', (string)configValue('LINUXDO_USER_URL', 'https://connect.linux.do/api/user'));

