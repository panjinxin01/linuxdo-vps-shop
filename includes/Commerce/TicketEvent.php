<?php
/**
 * 工单事件流水记录
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */

function commerceRecordTicketEvent(PDO $pdo, int $ticketId, string $eventType, string $content = '', array $extra = [], bool $isVisible = false): void {
    if (!commerceTableExists($pdo, 'ticket_events') || $ticketId <= 0) {
        return;
    }
    $actorType = !empty($_SESSION['admin_id']) ? 'admin' : (!empty($_SESSION['user_id']) ? 'user' : 'system');
    $actorId = !empty($_SESSION['admin_id']) ? (int)$_SESSION['admin_id'] : (!empty($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null);
    $details = $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
    try {
        $stmt = $pdo->prepare('INSERT INTO ticket_events (ticket_id, event_type, actor_type, actor_id, content, is_visible, details) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$ticketId, $eventType, $actorType, $actorId, $content, $isVisible ? 1 : 0, $details]);
    } catch (Throwable $e) {
    }
}

