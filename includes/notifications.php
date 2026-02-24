<?php
require_once __DIR__ . '/security.php';

function createNotification(PDO $pdo, int $userId, string $type, string $title, string $content, ?string $relatedId = null): bool {
    if ($userId <= 0 || $title === '' || $content === '') {
        return false;
    }
    if (!securityTableExists($pdo, 'notifications')) {
        return false;
    }
    try {
        $stmt = $pdo->prepare('INSERT INTO notifications (user_id, type, title, content, related_id) VALUES (?, ?, ?, ?, ?)');
        return $stmt->execute([$userId, $type, $title, $content, $relatedId]);
    } catch (Throwable $e) {
        return false;
    }
}
