<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';

$action = requestValue('action', '');
$pdo = getDB();

$csrfActions = ['save', 'save_smtp', 'test_smtp', 'save_notification'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function saveSetting(PDO $pdo, string $key, string $value): void {
    $stmt = $pdo->prepare('INSERT INTO settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = VALUES(key_value)');
    $stmt->execute([$key, $value]);
}

try {
    switch ($action) {
        case 'get':
            checkAdmin($pdo);
            $stmt = $pdo->query('SELECT key_name, key_value FROM settings');
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $settings = [];
            foreach ($rows as $row) {
                $settings[$row['key_name']] = $row['key_value'];
            }
            jsonResponse(1, '', $settings);
            break;

        case 'save':
            checkAdmin($pdo);
            $keys = ['epay_pid', 'epay_key', 'notify_url', 'return_url'];
            foreach ($keys as $key) {
                saveSetting($pdo, $key, normalizeString(requestValue($key, ''), 500));
            }
            logAudit($pdo, 'settings.save', ['keys' => $keys]);
            jsonResponse(1, '保存成功');
            break;

        case 'get_oauth':
            checkAdmin($pdo);
            $clientId = defined('LINUXDO_CLIENT_ID') ? (string)LINUXDO_CLIENT_ID : '';
            $clientSecret = defined('LINUXDO_CLIENT_SECRET') ? (string)LINUXDO_CLIENT_SECRET : '';
            $redirectUri = defined('LINUXDO_REDIRECT_URI') ? (string)LINUXDO_REDIRECT_URI : '';
            jsonResponse(1, '', [
                'client_id' => $clientId,
                'client_secret_masked' => $clientSecret !== '' ? '已配置' : '未配置',
                'redirect_uri' => $redirectUri,
                'configured' => $clientId !== '' && $clientSecret !== '' && $redirectUri !== '',
                'config_source' => 'private_config',
                'config_file' => '/api/config.local.php',
            ]);
            break;

        case 'get_smtp':
            checkAdmin($pdo);
            $stmt = $pdo->query("SELECT key_name, key_value FROM settings WHERE key_name LIKE 'smtp_%'");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $smtp = [];
            foreach ($rows as $row) {
                $smtp[$row['key_name']] = $row['key_value'];
            }
            jsonResponse(1, '', $smtp);
            break;

        case 'save_smtp':
            checkAdmin($pdo);
            $smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_name', 'smtp_secure'];
            foreach ($smtpKeys as $key) {
                saveSetting($pdo, $key, normalizeString(requestValue($key, ''), 500));
            }
            logAudit($pdo, 'settings.save_smtp', ['host' => requestValue('smtp_host', '')]);
            jsonResponse(1, 'SMTP配置保存成功');
            break;

        case 'get_notification':
            checkAdmin($pdo);
            jsonResponse(1, '', [
                'notification_email_enabled' => commerceGetSetting($pdo, 'notification_email_enabled', '0'),
                'notification_webhook_enabled' => commerceGetSetting($pdo, 'notification_webhook_enabled', '0'),
                'notification_webhook_url' => commerceGetSetting($pdo, 'notification_webhook_url', ''),
                'linuxdo_silenced_order_mode' => commerceGetSetting($pdo, 'linuxdo_silenced_order_mode', 'review'),
            ]);
            break;

        case 'save_notification':
            checkAdmin($pdo);
            $items = [
                'notification_email_enabled' => (string)(validateInt(requestValue('notification_email_enabled', 0), 0, 1) ?? 0),
                'notification_webhook_enabled' => (string)(validateInt(requestValue('notification_webhook_enabled', 0), 0, 1) ?? 0),
                'notification_webhook_url' => normalizeString(requestValue('notification_webhook_url', ''), 500),
                'linuxdo_silenced_order_mode' => in_array(requestValue('linuxdo_silenced_order_mode', 'review'), ['review', 'block'], true) ? requestValue('linuxdo_silenced_order_mode', 'review') : 'review',
            ];
            foreach ($items as $key => $value) {
                saveSetting($pdo, $key, $value);
            }
            logAudit($pdo, 'settings.save_notification', $items);
            jsonResponse(1, '通知配置保存成功');
            break;

        case 'test_smtp':
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
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.settings', $e->getMessage());
    jsonResponse(0, '服务器错误');
}
