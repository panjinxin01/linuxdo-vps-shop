<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$action = requestValue('action', '');
$pdo = getDB();

$csrfActions = ['save', 'save_oauth', 'save_smtp', 'test_smtp'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
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
                $value = normalizeString(requestValue($key, ''), 500);
                $stmt = $pdo->prepare('INSERT INTO settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = ?');
                $stmt->execute([$key, $value, $value]);
            }
            logAudit($pdo, 'settings.save', ['keys' => $keys]);
            jsonResponse(1, '保存成功');
            break;

        case 'get_oauth':
            checkAdmin($pdo);
            $oauthConfig = [
                'client_id' => defined('LINUXDO_CLIENT_ID') ? LINUXDO_CLIENT_ID : '',
                'client_secret' => defined('LINUXDO_CLIENT_SECRET') ? LINUXDO_CLIENT_SECRET : '',
                'redirect_uri' => defined('LINUXDO_REDIRECT_URI') ? LINUXDO_REDIRECT_URI : ''
            ];
            jsonResponse(1, '', $oauthConfig);
            break;

        case 'save_oauth':
            checkAdmin($pdo);
            $clientId = normalizeString(requestValue('client_id', ''), 200);
            $clientSecret = normalizeString(requestValue('client_secret', ''), 200);
            $redirectUri = normalizeString(requestValue('redirect_uri', ''), 500);

            $configPath = __DIR__ . '/config.php';
            $configContent = file_get_contents($configPath);
            if ($configContent === false) {
                jsonResponse(0, '无法读取配置文件');
            }

            $patterns = [
                "/define\\('LINUXDO_CLIENT_ID',\\s*'[^']*'\\);/" => "define('LINUXDO_CLIENT_ID', '" . addslashes($clientId) . "');",
                "/define\\('LINUXDO_CLIENT_SECRET',\\s*'[^']*'\\);/" => "define('LINUXDO_CLIENT_SECRET', '" . addslashes($clientSecret) . "');",
                "/define\\('LINUXDO_REDIRECT_URI',\\s*'[^']*'\\);/" => "define('LINUXDO_REDIRECT_URI', '" . addslashes($redirectUri) . "');"
            ];

            foreach ($patterns as $pattern => $replacement) {
                $configContent = preg_replace($pattern, $replacement, $configContent);
            }

            if (file_put_contents($configPath, $configContent, LOCK_EX) === false) {
                jsonResponse(0, '无法写入配置文件，请检查文件权限');
            }
            logAudit($pdo, 'settings.save_oauth', ['client_id_set' => $clientId !== '', 'redirect_uri_set' => $redirectUri !== '']);
            jsonResponse(1, 'OAuth 配置保存成功');
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
                $value = normalizeString(requestValue($key, ''), 500);
                $stmt = $pdo->prepare('INSERT INTO settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = ?');
                $stmt->execute([$key, $value, $value]);
            }
            logAudit($pdo, 'settings.save_smtp', ['host' => requestValue('smtp_host', '')]);
            jsonResponse(1, 'SMTP配置保存成功');
            break;

        case 'test_smtp':
            checkAdmin($pdo);
            $email = normalizeString(requestValue('email', ''), 100);
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                jsonResponse(0, '请输入有效的邮箱地址');
            }

            $stmt = $pdo->query("SELECT key_name, key_value FROM settings WHERE key_name LIKE 'smtp_%'");
            $smtp = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $smtp[$row['key_name']] = $row['key_value'];
            }

            if (empty($smtp['smtp_host'])) {
                jsonResponse(0, '请先配置SMTP服务器');
            }

            $subject = (defined('SITE_NAME') ? SITE_NAME : 'VPS商城') . ' - SMTP测试';
            $body = '<div style="font-family:Arial,sans-serif;padding:20px"><h2>SMTP配置测试成功</h2><p>如果您收到这封邮件，说明SMTP配置正确。</p><p style="color:#666">发送时间：' . date('Y-m-d H:i:s') . '</p></div>';

            if (class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
                try {
                    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
                    $mail->isSMTP();
                    $mail->Host = $smtp['smtp_host'];
                    $mail->SMTPAuth = true;
                    $mail->Username = $smtp['smtp_user'] ?? '';
                    $mail->Password = $smtp['smtp_pass'] ?? '';
                    $mail->SMTPSecure = $smtp['smtp_secure'] ?? 'tls';
                    $mail->Port = (int)($smtp['smtp_port'] ?? 587);
                    $mail->CharSet = 'UTF-8';
                    $mail->setFrom($smtp['smtp_from'] ?? $smtp['smtp_user'], $smtp['smtp_name'] ?? 'VPS商城');
                    $mail->addAddress($email);
                    $mail->isHTML(true);
                    $mail->Subject = $subject;
                    $mail->Body = $body;
                    $mail->send();
                    jsonResponse(1, '测试邮件已发送到' . $email);
                } catch (Throwable $e) {
                    jsonResponse(0, '发送失败: ' . $e->getMessage());
                }
            }

            $headers = "MIME-Version: 1.0\r\n";
            $headers .= "Content-type: text/html; charset=UTF-8\r\n";
            $headers .= "From: " . ($smtp['smtp_name'] ?? 'VPS商城') . " <" . ($smtp['smtp_from'] ?? 'noreply@localhost') . ">\r\n";
            if (@mail($email, $subject, $body, $headers)) {
                jsonResponse(1, '测试邮件已发送（使用PHP mail函数）');
            }
            jsonResponse(0, '发送失败，建议安装PHPMailer库');
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.settings', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

