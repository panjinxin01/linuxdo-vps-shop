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

// Linux DO Connect OAuth2 配置
// 请在 https://connect.linux.do 申请接入后填写以下信息
define('LINUXDO_CLIENT_ID', '');
define('LINUXDO_CLIENT_SECRET', '');
define('LINUXDO_REDIRECT_URI', '');

// Linux DO OAuth2 端点
define('LINUXDO_AUTH_URL', 'https://connect.linux.do/oauth2/authorize');
define('LINUXDO_TOKEN_URL', 'https://connect.linux.do/oauth2/token');
define('LINUXDO_USER_URL', 'https://connect.linux.do/api/user');

