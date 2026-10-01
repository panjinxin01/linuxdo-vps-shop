<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';
require_once __DIR__ . '/../includes/ldcpay.php';

$action = requestValue('action', '');
$pdo = getDB();

$csrfActions = ['save', 'save_ldcpay', 'save_oauth', 'save_smtp', 'test_smtp', 'save_notification', 'save_ai'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function saveSetting(PDO $pdo, string $key, string $value): void {
    $stmt = $pdo->prepare('INSERT INTO settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = VALUES(key_value)');
    $stmt->execute([$key, $value]);
}

function getLocalConfigPath(): string {
    return __DIR__ . '/config.local.php';
}

function readLocalConfigFile(string $path): array {
    if (!is_file($path)) {
        return [];
    }
    $loaded = @include $path;
    return is_array($loaded) ? $loaded : [];
}

function writeLocalConfigFile(string $path, array $config): bool {
    $preferredKeys = [
        'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME', 'SITE_NAME',
        'DATA_ENCRYPTION_KEY', 'ADMIN_RECOVERY_ENABLED', 'ADMIN_RECOVERY_KEY',
        'LINUXDO_CLIENT_ID', 'LINUXDO_CLIENT_SECRET', 'LINUXDO_REDIRECT_URI',
        'LINUXDO_AUTH_URL', 'LINUXDO_TOKEN_URL', 'LINUXDO_USER_URL',
    ];

    $ordered = [];
    foreach ($preferredKeys as $key) {
        if (array_key_exists($key, $config)) {
            $ordered[$key] = $config[$key];
        }
    }
    foreach ($config as $key => $value) {
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

try {
    match ($action) {
        'get'               => handleSettingGet($pdo),
        'save'              => handleSettingSave($pdo),
        'get_ldcpay'        => handleSettingGetLdcpay($pdo),
        'save_ldcpay'       => handleSettingSaveLdcpay($pdo),
        'get_oauth'         => handleSettingGetOauth($pdo),
        'save_oauth'        => handleSettingSaveOauth($pdo),
        'get_smtp'          => handleSettingGetSmtp($pdo),
        'save_smtp'         => handleSettingSaveSmtp($pdo),
        'get_notification'  => handleSettingGetNotification($pdo),
        'save_notification' => handleSettingSaveNotification($pdo),
        'test_smtp'         => handleSettingTestSmtp($pdo),
        'get_ai'            => handleSettingGetAi($pdo),
        'save_ai'           => handleSettingSaveAi($pdo),
        default             => jsonResponse(0, '未知操作'),
    };
} catch (Throwable $e) {
    logError($pdo, 'api.settings', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

function handleSettingGet(PDO $pdo): void {
    checkAdmin($pdo);
    $stmt = $pdo->query('SELECT key_name, key_value FROM settings');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $settings = [];
    $maskedKeys = [
        'epay_key' => true,
        'ldcpay_client_secret' => true,
        'ldcpay_private_key' => true,
        'ai_api_key' => true,
        'smtp_pass' => true,
    ];
    foreach ($rows as $row) {
        $key = (string)$row['key_name'];
        $value = (string)($row['key_value'] ?? '');
        if (isset($maskedKeys[$key]) && $value !== '') {
            $settings[$key] = '********';
            $settings[$key . '_set'] = true;
        } else {
            $settings[$key] = $value;
            if (isset($maskedKeys[$key])) {
                $settings[$key . '_set'] = false;
            }
        }
    }
    jsonResponse(1, '', $settings);
}

function handleSettingSave(PDO $pdo): void {
    checkAdmin($pdo);
    $keys = ['epay_pid', 'notify_url', 'return_url'];
    foreach ($keys as $key) {
        saveSetting($pdo, $key, normalizeString(requestValue($key, ''), 500));
    }
    $epayKey = normalizeString(requestValue('epay_key', ''), 500);
    if ($epayKey !== '' && $epayKey !== '********') {
        saveSetting($pdo, 'epay_key', $epayKey);
    }
    logAudit($pdo, 'settings.save', ['keys' => ['epay_pid', 'epay_key', 'notify_url', 'return_url']]);
    jsonResponse(1, '保存成功');
}

function handleSettingGetLdcpay(PDO $pdo): void {
    checkAdmin($pdo);
    $clientSecret = commerceGetSetting($pdo, 'ldcpay_client_secret');
    $privateKey = commerceGetSetting($pdo, 'ldcpay_private_key');
    jsonResponse(1, '', [
        'client_id' => commerceGetSetting($pdo, 'ldcpay_client_id'),
        'client_secret' => $clientSecret !== '' ? '********' : '',
        'client_secret_set' => $clientSecret !== '',
        'private_key' => $privateKey !== '' ? '********' : '',
        'private_key_set' => $privateKey !== '',
        'public_key' => commerceGetSetting($pdo, 'ldcpay_public_key'),
        'notify_url' => commerceGetSetting($pdo, 'ldcpay_notify_url'),
        'return_url' => commerceGetSetting($pdo, 'ldcpay_return_url'),
        'ed25519_available' => function_exists('ldcpay_has_ed25519') ? ldcpay_has_ed25519() : false,
    ]);
}

function handleSettingSaveLdcpay(PDO $pdo): void {
    checkAdmin($pdo);
    $keys = ['ldcpay_client_id', 'ldcpay_public_key', 'ldcpay_notify_url', 'ldcpay_return_url'];
    foreach ($keys as $key) {
        saveSetting($pdo, $key, normalizeString(requestValue($key, ''), 5000));
    }
    $clientSecret = normalizeString(requestValue('ldcpay_client_secret', ''), 5000);
    if ($clientSecret !== '' && $clientSecret !== '********') {
        saveSetting($pdo, 'ldcpay_client_secret', $clientSecret);
    }
    $privateKey = normalizeString(requestValue('ldcpay_private_key', ''), 5000);
    if ($privateKey !== '' && $privateKey !== '********') {
        saveSetting($pdo, 'ldcpay_private_key', $privateKey);
    }
    logAudit($pdo, 'settings.save_ldcpay', ['keys' => array_merge($keys, ['ldcpay_client_secret', 'ldcpay_private_key'])]);
    jsonResponse(1, 'LDC Pay 配置保存成功');
}

function handleSettingGetOauth(PDO $pdo): void {
    checkAdmin($pdo);
    $secret = defined('LINUXDO_CLIENT_SECRET') ? (string)LINUXDO_CLIENT_SECRET : '';
    jsonResponse(1, '', [
        'client_id' => defined('LINUXDO_CLIENT_ID') ? LINUXDO_CLIENT_ID : '',
        'client_secret' => $secret !== '' ? '********' : '',
        'client_secret_set' => $secret !== '',
        'redirect_uri' => defined('LINUXDO_REDIRECT_URI') ? LINUXDO_REDIRECT_URI : '',
    ]);
}

function handleSettingSaveOauth(PDO $pdo): void {
    checkAdmin($pdo);
    $clientId = normalizeString(requestValue('client_id', ''), 200);
    $clientSecret = normalizeString(requestValue('client_secret', ''), 200);
    $redirectUri = normalizeString(requestValue('redirect_uri', ''), 500);

    $configPath = getLocalConfigPath();
    $localConfig = readLocalConfigFile($configPath);
    $localConfig['LINUXDO_CLIENT_ID'] = $clientId;
    if ($clientSecret !== '' && $clientSecret !== '********') {
        $localConfig['LINUXDO_CLIENT_SECRET'] = $clientSecret;
    }
    $localConfig['LINUXDO_REDIRECT_URI'] = $redirectUri;

    if (!writeLocalConfigFile($configPath, $localConfig)) {
        jsonResponse(0, '无法写入 api/config.local.php，请检查文件权限');
    }

    logAudit($pdo, 'settings.save_oauth', ['client_id_set' => $clientId !== '', 'redirect_uri_set' => $redirectUri !== '']);
    jsonResponse(1, 'OAuth 配置保存成功');
}

function handleSettingGetSmtp(PDO $pdo): void {
    checkAdmin($pdo);
    $stmt = $pdo->query("SELECT key_name, key_value FROM settings WHERE key_name LIKE 'smtp_%'");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $smtp = [];
    foreach ($rows as $row) {
        $key = (string)$row['key_name'];
        $value = (string)($row['key_value'] ?? '');
        if ($key === 'smtp_pass' && $value !== '') {
            $smtp[$key] = '********';
            $smtp['smtp_pass_set'] = true;
        } else {
            $smtp[$key] = $value;
        }
    }
    if (!isset($smtp['smtp_pass_set'])) {
        $smtp['smtp_pass_set'] = false;
    }
    jsonResponse(1, '', $smtp);
}

function handleSettingSaveSmtp(PDO $pdo): void {
    checkAdmin($pdo);
    $keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from', 'smtp_name', 'smtp_secure'];
    foreach ($keys as $key) {
        saveSetting($pdo, $key, normalizeString(requestValue($key, ''), 500));
    }
    $smtpPass = normalizeString(requestValue('smtp_pass', ''), 500);
    if ($smtpPass !== '' && $smtpPass !== '********') {
        saveSetting($pdo, 'smtp_pass', $smtpPass);
    }
    logAudit($pdo, 'settings.save_smtp', ['host' => requestValue('smtp_host', '')]);
    jsonResponse(1, 'SMTP配置保存成功');
}

function handleSettingGetNotification(PDO $pdo): void {
    checkAdmin($pdo);
    jsonResponse(1, '', [
        'notification_email_enabled' => commerceGetSetting($pdo, 'notification_email_enabled', '0'),
        'notification_webhook_enabled' => commerceGetSetting($pdo, 'notification_webhook_enabled', '0'),
        'notification_webhook_url' => commerceGetSetting($pdo, 'notification_webhook_url', ''),
        'linuxdo_silenced_order_mode' => commerceGetSetting($pdo, 'linuxdo_silenced_order_mode', 'review'),
    ]);
}

function handleSettingSaveNotification(PDO $pdo): void {
    checkAdmin($pdo);
    $items = [
        'notification_email_enabled' => (string)(validateInt(requestValue('notification_email_enabled', 0), 0, 1) ?? 0),
        'notification_webhook_enabled' => (string)(validateInt(requestValue('notification_webhook_enabled', 0), 0, 1) ?? 0),
        'notification_webhook_url' => normalizeString(requestValue('notification_webhook_url', ''), 500),
        'linuxdo_silenced_order_mode' => in_array(requestValue('linuxdo_silenced_order_mode', 'review'), ['review', 'block'], true)
            ? requestValue('linuxdo_silenced_order_mode', 'review')
            : 'review',
    ];
    foreach ($items as $key => $value) {
        saveSetting($pdo, $key, $value);
    }
    logAudit($pdo, 'settings.save_notification', $items);
    jsonResponse(1, '通知配置保存成功');
}

function handleSettingTestSmtp(PDO $pdo): void {
    checkAdmin($pdo);
    $email = normalizeString(requestValue('email', ''), 100);
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(0, '请输入有效的邮箱地址');
    }
    $subject = (defined('SITE_NAME') ? SITE_NAME : 'VPS商城') . ' - SMTP测试';
    $body = '<div style="font-family:Arial,sans-serif;padding:20px"><h2>SMTP配置测试成功</h2><p>如果您收到这封邮件，说明SMTP配置正确。</p><p style="color:#666">发送时间：' . date('Y-m-d H:i:s') . '</p></div>';
    if (sendSmtpEmail($pdo, $email, $subject, $body)) {
        jsonResponse(1, '测试邮件已发送到' . $email);
    }
    jsonResponse(0, '发送失败，请检查SMTP配置');
}

function handleSettingGetAi(PDO $pdo): void {
    checkAdmin($pdo);
    $apiKey = commerceGetSetting($pdo, 'ai_api_key', '');
    jsonResponse(1, '', [
        'ai_api_endpoint' => commerceGetSetting($pdo, 'ai_api_endpoint', ''),
        'ai_api_key' => $apiKey !== '' ? '********' : '',
        'ai_api_key_set' => $apiKey !== '',
        'ai_model' => commerceGetSetting($pdo, 'ai_model', ''),
    ]);
}

function handleSettingSaveAi(PDO $pdo): void {
    checkAdmin($pdo);
    saveSetting($pdo, 'ai_api_endpoint', normalizeString(requestValue('ai_api_endpoint', ''), 1000));
    saveSetting($pdo, 'ai_model', normalizeString(requestValue('ai_model', ''), 1000));
    $apiKey = normalizeString(requestValue('ai_api_key', ''), 1000);
    if ($apiKey !== '' && $apiKey !== '********') {
        saveSetting($pdo, 'ai_api_key', $apiKey);
    }
    logAudit($pdo, 'settings.save_ai', ['keys' => ['ai_api_endpoint', 'ai_api_key', 'ai_model']]);
    jsonResponse(1, 'AI 配置保存成功');
}
