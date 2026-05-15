<?php
// 数据库配置 - 请修改为实际配置
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ? (int)getenv('DB_PORT') : 3306);
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_NAME', getenv('DB_NAME') ?: 'vps_shop');

// 站点配置
define('SITE_NAME', 'VPS积分商城');

// 加密密钥（用于敏感字段加密，请替换为32位以上随机字符串）
// 示例: openssl rand -base64 32
define('DATA_ENCRYPTION_KEY', getenv('DATA_ENCRYPTION_KEY') ?: '');

// 管理员恢复模式（仅用于忘记管理员账号时的紧急恢复）
// 操作位置：项目根目录 /api/config.php
// 使用方法：临时将 ADMIN_RECOVERY_ENABLED 改为 true，并设置 ADMIN_RECOVERY_KEY；恢复完成后请立即改回 false
// 示例：define('ADMIN_RECOVERY_ENABLED', true);
define('ADMIN_RECOVERY_ENABLED', filter_var(getenv('ADMIN_RECOVERY_ENABLED') ?: 'false', FILTER_VALIDATE_BOOLEAN));
define('ADMIN_RECOVERY_KEY', getenv('ADMIN_RECOVERY_KEY') ?: '');

// Linux DO Connect OAuth2 配置
// 请在 https://connect.linux.do 申请接入后填写以下信息
define('LINUXDO_CLIENT_ID', '');
define('LINUXDO_CLIENT_SECRET', '');
define('LINUXDO_REDIRECT_URI', '');

// Linux DO OAuth2 端点
define('LINUXDO_AUTH_URL', 'https://connect.linux.do/oauth2/authorize');
define('LINUXDO_TOKEN_URL', 'https://connect.linux.do/oauth2/token');
define('LINUXDO_USER_URL', 'https://connect.linux.do/api/user');

