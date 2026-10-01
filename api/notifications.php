<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';

$action = requestValue('action', '');
$pdo = getDB();

require_once __DIR__ . '/../includes/notifications.php';

$csrfActions = ['mark_read', 'mark_all_read', 'delete', 'send'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

try {
    match ($action) {
        'list'          => handleNotifList($pdo),
        'unread_count'  => handleNotifUnreadCount($pdo),
        'mark_read'     => handleNotifMarkRead($pdo),
        'mark_all_read' => handleNotifMarkAllRead($pdo),
        'delete'        => handleNotifDelete($pdo),
        'admin_list'    => handleNotifAdminList($pdo),
        default         => jsonResponse(0, '未知操作'),
    };
} catch (Throwable $e) {
    logError($pdo, 'api.notifications', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

function handleNotifList(PDO $pdo): void {
    checkUser();
    if (!commerceTableExists($pdo, 'notifications')) {
        jsonResponse(1, '', ['list' => [], 'total' => 0, 'unread' => 0]);
    }
    $pg = paginateParams(20, 50);
    $onlyUnread = requestValue('only_unread', '') === '1';
    $userId = (int)$_SESSION['user_id'];

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ?');
    $stmt->execute([$userId]);
    $total = (int)$stmt->fetchColumn();

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
    $stmt->execute([$userId]);
    $unread = (int)$stmt->fetchColumn();

    $sql = 'SELECT * FROM notifications WHERE user_id = ?';
    if ($onlyUnread) {
        $sql .= ' AND is_read = 0';
    }
    $sql .= ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    $stmt = $pdo->prepare($sql);
    $stmt->bindValue(1, $userId, PDO::PARAM_INT);
    $stmt->bindValue(2, $pg['page_size'], PDO::PARAM_INT);
    $stmt->bindValue(3, $pg['offset'], PDO::PARAM_INT);
    $stmt->execute();

    $result = paginateResponse($stmt->fetchAll(PDO::FETCH_ASSOC), $total, $pg);
    $result['unread'] = $unread;
    jsonResponse(1, '', $result);
}

function handleNotifUnreadCount(PDO $pdo): void {
    checkUser();
    if (!commerceTableExists($pdo, 'notifications')) {
        jsonResponse(1, '', ['count' => 0]);
    }
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
    $stmt->execute([(int)$_SESSION['user_id']]);
    jsonResponse(1, '', ['count' => (int)$stmt->fetchColumn()]);
}

function handleNotifMarkRead(PDO $pdo): void {
    checkUser();
    if (!commerceTableExists($pdo, 'notifications')) {
        jsonResponse(0, '通知功能未启用');
    }
    $id = validateInt(requestValue('id', null), 1);
    if (!$id) {
        jsonResponse(0, '通知ID无效');
    }
    $stmt = $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, (int)$_SESSION['user_id']]);
    jsonResponse(1, '已标记为已读');
}

function handleNotifMarkAllRead(PDO $pdo): void {
    checkUser();
    if (!commerceTableExists($pdo, 'notifications')) {
        jsonResponse(0, '通知功能未启用');
    }
    $stmt = $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0');
    $stmt->execute([(int)$_SESSION['user_id']]);
    $affected = $stmt->rowCount();
    jsonResponse(1, "已将{$affected}条通知标记为已读");
}

function handleNotifDelete(PDO $pdo): void {
    checkUser();
    if (!commerceTableExists($pdo, 'notifications')) {
        jsonResponse(0, '通知功能未启用');
    }
    $id = validateInt(requestValue('id', null), 1);
    if (!$id) {
        jsonResponse(0, '通知ID无效');
    }
    $stmt = $pdo->prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, (int)$_SESSION['user_id']]);
    jsonResponse(1, '通知已删除');
}

function handleNotifAdminList(PDO $pdo): void {
    checkAdmin($pdo);
    if (!commerceTableExists($pdo, 'notifications')) {
        jsonResponse(1, '', ['list' => [], 'total' => 0]);
    }
    $pg = paginateParams(50);
    $total = (int)$pdo->query('SELECT COUNT(*) FROM notifications')->fetchColumn();
    $stmt = $pdo->prepare('SELECT n.*, u.username FROM notifications n LEFT JOIN users u ON n.user_id = u.id ORDER BY n.created_at DESC LIMIT ? OFFSET ?');
    $stmt->bindValue(1, $pg['page_size'], PDO::PARAM_INT);
    $stmt->bindValue(2, $pg['offset'], PDO::PARAM_INT);
    $stmt->execute();
    jsonResponse(1, '', paginateResponse($stmt->fetchAll(PDO::FETCH_ASSOC), $total, $pg));
}

