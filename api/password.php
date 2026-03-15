<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$action = requestValue('action', '');
$pdo = getDB();

$csrfActions = ['request_reset', 'reset', 'request_verify', 'verify', 'update_email'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}


function generateToken(int $length = 32): string {
    try {
        return bin2hex(random_bytes($length));
    } catch (Throwable $e) {
        return bin2hex(uniqid('', true));
    }
}

function sendEmail(PDO $pdo, string $to, string $subject, string $body): bool {
    $stmt = $pdo->query("SELECT key_name, key_value FROM settings WHERE key_name LIKE 'smtp_%'");
    $smtp = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $smtp[$row['key_name']] = $row['key_value'];
    }

    if (!empty($smtp['smtp_host']) && class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
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
            $mail->setFrom($smtp['smtp_from'] ?? $smtp['smtp_user'], $smtp['smtp_name'] ?? SITE_NAME);
            $mail->addAddress($to);
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body = $body;
            return $mail->send();
        } catch (Throwable $e) {
            logError($pdo, 'email.smtp', $e->getMessage(), ['to' => $to]);
            return false;
        }
    }

    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-type: text/html; charset=UTF-8\r\n";
    $headers .= "From: " . (defined('SITE_NAME') ? SITE_NAME : 'VPS商城') . " <noreply@" . ($_SERVER['HTTP_HOST'] ?? 'localhost') . ">\r\n";
    return @mail($to, $subject, $body, $headers);
}

try {
    switch ($action) {
        case 'request_reset':
            $email = normalizeString(requestValue('email', ''), 100);
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                jsonResponse(0, '请输入有效的邮箱地址');
            }
            rateLimit($pdo, 'password_reset', $email, 3, 3600, 7200);
            if (!securityTableExists($pdo, 'password_resets')) {
                jsonResponse(0, '功能未启用，请先执行数据库更新');
            }

            $stmt = $pdo->prepare('SELECT id, username, email FROM users WHERE email = ?');
            $stmt->execute([$email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$user) {
                jsonResponse(1, '如果该邮箱已注册，重置链接将发送到您的邮箱');
            }

            $stmt = $pdo->prepare('DELETE FROM password_resets WHERE user_id = ? OR expires_at < NOW()');
            $stmt->execute([$user['id']]);

            $token = generateToken();
            $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));
            $stmt = $pdo->prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)');
            $stmt->execute([$user['id'], password_hash($token, PASSWORD_DEFAULT), $expires]);

            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
            $base = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . dirname($_SERVER['REQUEST_URI'] ?? '/');
            $resetUrl = $base . '/../index.html#reset-password?token=' . urlencode($token) . '&email=' . urlencode($email);

            $subject = (defined('SITE_NAME') ? SITE_NAME : 'VPS商城') . ' - 重置密码';
            $body = "
                <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>
                    <h2>重置密码</h2>
                    <p>您好 {$user['username']}：</p>
                    <p>我们收到您的密码重置请求，请点击下方链接设置新密码：</p>
                    <p><a href='{$resetUrl}' style='display: inline-block; padding: 12px 24px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 6px;'>重置密码</a></p>
                    <p>或复制此链接到浏览器：<br><code>{$resetUrl}</code></p>
                    <p style='color: #666;'>此链接1小时内有效，如非本人操作请忽略。</p>
                </div>
            ";

            $sent = sendEmail($pdo, $email, $subject, $body);
            if (!$sent) {
                logError($pdo, 'password.reset_email', 'Failed to send reset email', ['email' => $email]);
            }
            jsonResponse(1, '如果该邮箱已注册，重置链接将发送到您的邮箱');
            break;

        case 'reset':
            $email = normalizeString(requestValue('email', ''), 100);
            $token = normalizeString(requestValue('token', ''), 128);
            $password = (string)requestValue('password', '');

            if ($email === '' || $token === '' || $password === '') {
                jsonResponse(0, '参数不完整');
            }
            if (strlen($password) < 6) {
                jsonResponse(0, '密码至少6位');
            }
            if (!securityTableExists($pdo, 'password_resets')) {
                jsonResponse(0, '功能未启用');
            }

            $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
            $stmt->execute([$email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$user) {
                jsonResponse(0, '重置链接无效或已过期');
            }

            $stmt = $pdo->prepare('SELECT * FROM password_resets WHERE user_id = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1');
            $stmt->execute([$user['id']]);
            $reset = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$reset || !password_verify($token, $reset['token'])) {
                jsonResponse(0, '重置链接无效或已过期');
            }

            $hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?');
            $stmt->execute([$hash, $user['id']]);
            $stmt = $pdo->prepare('DELETE FROM password_resets WHERE user_id = ?');
            $stmt->execute([$user['id']]);

            logAudit($pdo, 'password.reset', ['user_id' => $user['id']], (string)$user['id']);
            jsonResponse(1, '密码重置成功，请使用新密码登录');
            break;

        case 'request_verify':
            checkUser();
            if (!securityTableExists($pdo, 'email_verifications')) {
                jsonResponse(0, '功能未启用，请先执行数据库更新');
            }

            $stmt = $pdo->prepare('SELECT id, username, email, email_verified FROM users WHERE id = ?');
            $stmt->execute([(int)$_SESSION['user_id']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$user || empty($user['email'])) {
                jsonResponse(0, '请先设置邮箱地址');
            }
            if (!empty($user['email_verified'])) {
                jsonResponse(0, '邮箱已验证');
            }

            rateLimit($pdo, 'email_verify', $user['email'], 3, 3600, 7200);
            $stmt = $pdo->prepare('DELETE FROM email_verifications WHERE user_id = ? OR expires_at < NOW()');
            $stmt->execute([$user['id']]);

            $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $expires = date('Y-m-d H:i:s', strtotime('+30 minutes'));
            $stmt = $pdo->prepare('INSERT INTO email_verifications (user_id, email, code, expires_at) VALUES (?, ?, ?, ?)');
            $stmt->execute([$user['id'], $user['email'], password_hash($code, PASSWORD_DEFAULT), $expires]);

            $subject = (defined('SITE_NAME') ? SITE_NAME : 'VPS商城') . ' - 邮箱验证';
            $body = "
                <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>
                    <h2>邮箱验证</h2>
                    <p>您好 {$user['username']}：</p>
                    <p>您的邮箱验证码为：</p>
                    <p style='font-size: 32px; font-weight: bold; color: #6366f1; letter-spacing: 4px;'>{$code}</p>
                    <p style='color: #666;'>验证码30分钟内有效。</p>
                </div>
            ";

            $sent = sendEmail($pdo, $user['email'], $subject, $body);
            if (!$sent) {
                logError($pdo, 'email.verify_send', 'Failed to send verification email', ['email' => $user['email']]);
                jsonResponse(0, '发送验证邮件失败，请稍后重试');
            }

            jsonResponse(1, '验证码已发送到您的邮箱');
            break;

        case 'verify':
            checkUser();
            $code = normalizeString(requestValue('code', ''), 6);
            if ($code === '' || strlen($code) !== 6) {
                jsonResponse(0, '请输入6位验证码');
            }
            if (!securityTableExists($pdo, 'email_verifications')) {
                jsonResponse(0, '功能未启用');
            }
            $stmt = $pdo->prepare('SELECT * FROM email_verifications WHERE user_id = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1');
            $stmt->execute([(int)$_SESSION['user_id']]);
            $verification = $stmt->fetch(PDO::FETCH_ASSOC);

            $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
            $stmt->execute([(int)$_SESSION['user_id']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$verification || !$user || empty($user['email']) || $verification['email'] !== $user['email'] || !password_verify($code, $verification['code'])) {
                if ($verification) {
                    $stmt = $pdo->prepare('DELETE FROM email_verifications WHERE user_id = ?');
                    $stmt->execute([(int)$_SESSION['user_id']]);
                }
                jsonResponse(0, '验证码无效或已过期');
            }

            $stmt = $pdo->prepare('UPDATE users SET email_verified = NOW(), updated_at = NOW() WHERE id = ?');
            $stmt->execute([(int)$_SESSION['user_id']]);
            $stmt = $pdo->prepare('DELETE FROM email_verifications WHERE user_id = ?');
            $stmt->execute([(int)$_SESSION['user_id']]);

            logAudit($pdo, 'email.verified', ['email' => $verification['email']], (string)$_SESSION['user_id']);
            jsonResponse(1, '邮箱验证成功');
            break;

        case 'update_email':
            checkUser();
            $email = normalizeString(requestValue('email', ''), 100);
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                jsonResponse(0, '请输入有效的邮箱地址');
            }
            $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
            $stmt->execute([$email, (int)$_SESSION['user_id']]);
            if ($stmt->fetch()) {
                jsonResponse(0, '该邮箱已被其他账号使用');
            }
            $stmt = $pdo->prepare('UPDATE users SET email = ?, email_verified = NULL, updated_at = NOW() WHERE id = ?');
            $stmt->execute([$email, (int)$_SESSION['user_id']]);
            $stmt = $pdo->prepare('DELETE FROM email_verifications WHERE user_id = ?');
            $stmt->execute([(int)$_SESSION['user_id']]);
            jsonResponse(1, '邮箱已更新，请重新验证');
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.password', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

