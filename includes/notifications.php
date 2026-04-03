<?php
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/db.php';

function notificationSetting(PDO $pdo, string $key, string $default = ''): string {
    try {
        if (!securityTableExists($pdo, 'settings')) {
            return $default;
        }
        $stmt = $pdo->prepare('SELECT key_value FROM settings WHERE key_name = ? LIMIT 1');
        $stmt->execute([$key]);
        $value = $stmt->fetchColumn();
        return $value === false || $value === null ? $default : (string)$value;
    } catch (Throwable $e) {
        return $default;
    }
}

function notificationTableAvailable(PDO $pdo): bool {
    return securityTableExists($pdo, 'notifications');
}

function sendSmtpEmail(PDO $pdo, string $to, string $subject, string $body): bool {
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    $smtp = [];
    if (securityTableExists($pdo, 'settings')) {
        $stmt = $pdo->query("SELECT key_name, key_value FROM settings WHERE key_name LIKE 'smtp_%'");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $smtp[$row['key_name']] = $row['key_value'];
        }
    }
    $siteName = defined('SITE_NAME') ? SITE_NAME : 'VPS商城';
    $fromEmail = $smtp['smtp_from'] ?? ($smtp['smtp_user'] ?? 'noreply@localhost');
    $fromName = $smtp['smtp_name'] ?? $siteName;

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
            $mail->setFrom($fromEmail, $fromName);
            $mail->addAddress($to);
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body = $body;
            return $mail->send();
        } catch (Throwable $e) {
            return false;
        }
    }

    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-type: text/html; charset=UTF-8\r\n";
    $headers .= 'From: ' . $fromName . ' <' . $fromEmail . ">\r\n";
    return @mail($to, $siteName . ' - ' . $subject, $body, $headers);
}

function sendNotificationEmail(PDO $pdo, int $userId, string $subject, string $content): void {
    if (notificationSetting($pdo, 'notification_email_enabled', '0') !== '1') {
        return;
    }
    try {
        $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $email = $stmt->fetchColumn();
        if (!$email) {
            return;
        }
        $html = '<div style="font-family:Arial,sans-serif;padding:20px"><h2>' . htmlspecialchars($subject, ENT_QUOTES, 'UTF-8') . '</h2><p>' . nl2br(htmlspecialchars($content, ENT_QUOTES, 'UTF-8')) . '</p><p style="color:#666;font-size:12px">发送时间：' . date('Y-m-d H:i:s') . '</p></div>';
        sendSmtpEmail($pdo, (string)$email, $subject, $html);
    } catch (Throwable $e) {
    }
}

function sendNotificationWebhook(PDO $pdo, array $payload): void {
    $enabled = notificationSetting($pdo, 'notification_webhook_enabled', '0');
    $url = notificationSetting($pdo, 'notification_webhook_url', '');
    if ($enabled !== '1' || $url === '') {
        return;
    }
    try {
        httpRequest($url, [
            'method' => 'POST',
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ],
            'data' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'timeout' => 10,
            'ssl_verify_peer' => true,
        ]);
    } catch (Throwable $e) {
    }
}

function createNotification(PDO $pdo, int $userId, string $type, string $title, string $content, ?string $relatedId = null): bool {
    if ($userId <= 0 || $title === '' || $content === '') {
        return false;
    }
    $created = false;
    if (notificationTableAvailable($pdo)) {
        try {
            $stmt = $pdo->prepare('INSERT INTO notifications (user_id, type, title, content, related_id) VALUES (?, ?, ?, ?, ?)');
            $created = $stmt->execute([$userId, $type, $title, $content, $relatedId]);
        } catch (Throwable $e) {
            $created = false;
        }
    }

    $payload = [
        'user_id' => $userId,
        'type' => $type,
        'title' => $title,
        'content' => $content,
        'related_id' => $relatedId,
        'created_at' => date('Y-m-d H:i:s'),
    ];
    sendNotificationEmail($pdo, $userId, $title, $content);
    sendNotificationWebhook($pdo, $payload);
    return $created;
}
