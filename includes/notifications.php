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

function sendNotificationEmail(PDO $pdo, int $userId, string $subject, string $content): void {
    if (notificationSetting($pdo, 'notification_email_enabled', '0') !== '1') {
        return;
    }
    try {
        $stmt = $pdo->prepare('SELECT email, username FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user || empty($user['email']) || !filter_var($user['email'], FILTER_VALIDATE_EMAIL)) {
            return;
        }
        $siteName = defined('SITE_NAME') ? SITE_NAME : 'VPS商城';
        $fromEmail = notificationSetting($pdo, 'smtp_from', 'noreply@localhost');
        $fromName = notificationSetting($pdo, 'smtp_name', $siteName);
        $html = '<div style="font-family:Arial,sans-serif;padding:20px"><h2>' . htmlspecialchars($subject, ENT_QUOTES, 'UTF-8') . '</h2><p>' . nl2br(htmlspecialchars($content, ENT_QUOTES, 'UTF-8')) . '</p><p style="color:#666;font-size:12px">发送时间：' . date('Y-m-d H:i:s') . '</p></div>';
        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-type: text/html; charset=UTF-8\r\n";
        $headers .= 'From: ' . $fromName . ' <' . $fromEmail . ">\r\n";
        @mail((string)$user['email'], $siteName . ' - ' . $subject, $html, $headers);
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
