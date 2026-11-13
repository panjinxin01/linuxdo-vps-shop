<?php
/**
 * 部署私有配置模板（示例文件，可提交仓库）。
 *
 * 使用方法：复制为同目录下的 `config.local.php` 再填入真实值：
 *   cp api/config.local.example.php api/config.local.php
 *
 * 也可以直接走可视化安装向导（admin/install.html），向导会自动生成
 * `config.local.php`。真实的 `config.local.php` 已在 .gitignore 中，
 * 切勿提交到 Git 仓库、切勿随源码包分发。
 */
return [
    'DB_HOST' => '127.0.0.1',
    'DB_PORT' => 3306,
    'DB_USER' => 'your_db_user',
    'DB_PASS' => 'your_db_pass',
    'DB_NAME' => 'your_db_name',
    'DATA_ENCRYPTION_KEY' => '请替换为32位以上随机字符串',

    // Linux DO Connect OAuth2（可选）
    // 'LINUXDO_CLIENT_ID' => '你的 Client ID',
    // 'LINUXDO_CLIENT_SECRET' => '你的 Client Secret',
    // 'LINUXDO_REDIRECT_URI' => 'https://yourdomain.com/api/oauth.php?action=callback',
];
