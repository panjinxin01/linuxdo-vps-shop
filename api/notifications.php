<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$action = requestValue('action', '');
$pdo = getDB();

require_once __DIR__ . '/../includes/notifications.php';

$csrfActions = ['mark_read', 'mark_all_read', 'delete', 'send'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function notificationsEnabled(PDO $pdo): bool {
    return securityTableExists($pdo, 'notifications');
}

try {
    switch ($action) {
        case 'list':
            checkUser();
            if (!notificationsEnabled($pdo)) {
                jsonResponse(1, '', ['list' => [], 'total' => 0, 'unread' => 0]);
            }
            $page = validateInt(requestValue('page', 1), 1) ?? 1;
            $pageSize = validateInt(requestValue('page_size', 20), 1, 50) ?? 20;
            $offset = ($page - 1) * $pageSize;
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
            $stmt->bindValue(2, $pageSize, PDO::PARAM_INT);
            $stmt->bindValue(3, $offset, PDO::PARAM_INT);
            $stmt->execute();
            $list = $stmt->fetchAll(PDO::FETCH_ASSOC);

            jsonResponse(1, '', [
                'list' => $list,
                'total' => $total,
                'unread' => $unread,
                'page' => $page,
                'page_size' => $pageSize
            ]);
            break;

        case 'unread_count':
            checkUser();
            if (!notificationsEnabled($pdo)) {
                jsonResponse(1, '', ['count' => 0]);
            }
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
            $stmt->execute([(int)$_SESSION['user_id']]);
            jsonResponse(1, '', ['count' => (int)$stmt->fetchColumn()]);
            break;

        case 'mark_read':
            checkUser();
            if (!notificationsEnabled($pdo)) {
                jsonResponse(0, '通知功能未启用');
            }
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '通知ID无效');
            }
            $stmt = $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?');
            $stmt->execute([$id, (int)$_SESSION['user_id']]);
            jsonResponse(1, '已标记为已读');
            break;

        case 'mark_all_read':
            checkUser();
            if (!notificationsEnabled($pdo)) {
                jsonResponse(0, '通知功能未启用');
            }
            $stmt = $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0');
            $stmt->execute([(int)$_SESSION['user_id']]);
            $affected = $stmt->rowCount();
            jsonResponse(1, "已将{$affected}条通知标记为已读");
            break;

        case 'delete':
            checkUser();
            if (!notificationsEnabled($pdo)) {
                jsonResponse(0, '通知功能未启用');
            }
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '通知ID无效');
            }
            $stmt = $pdo->prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?');
            $stmt->execute([$id, (int)$_SESSION['user_id']]);
            jsonResponse(1, '通知已删除');
            break;

        case 'send':
            checkAdmin($pdo);
            if (!notificationsEnabled($pdo)) {
                jsonResponse(0, '通知功能未启用，请先执行数据库更新');
            }
            $title = normalizeString(requestValue('title', ''), 200);
            $content = normalizeString(requestValue('content', ''));
            $targetUser = validateInt(requestValue('user_id', 0), 0) ?? 0;
            if ($title === '' || $content === '') {
                jsonResponse(0, '标题和内容不能为空');
            }
            if ($targetUser > 0) {
                createNotification($pdo, $targetUser, 'system', $title, $content);
                logAudit($pdo, 'notification.send', ['user_id' => $targetUser]);
                jsonResponse(1, '通知已发送');
            }
            $stmt = $pdo->query('SELECT id FROM users');
            $users = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $count = 0;
            foreach ($users as $uid) {
                if (createNotification($pdo, (int)$uid, 'system', $title, $content)) {
                    $count++;
                }
            }
            logAudit($pdo, 'notification.broadcast', ['count' => $count]);
            jsonResponse(1, "已向{$count}位用户发送通知");
            break;

        case 'admin_list':
            checkAdmin($pdo);
            if (!notificationsEnabled($pdo)) {
                jsonResponse(1, '', ['list' => [], 'total' => 0]);
            }
            $page = validateInt(requestValue('page', 1), 1) ?? 1;
            $pageSize = validateInt(requestValue('page_size', 50), 1, 100) ?? 50;
            $offset = ($page - 1) * $pageSize;
            $total = (int)$pdo->query('SELECT COUNT(*) FROM notifications')->fetchColumn();
            $sql = 'SELECT n.*, u.username FROM notifications n LEFT JOIN users u ON n.user_id = u.id ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(1, $pageSize, PDO::PARAM_INT);
            $stmt->bindValue(2, $offset, PDO::PARAM_INT);
            $stmt->execute();
            $list = $stmt->fetchAll(PDO::FETCH_ASSOC);
            jsonResponse(1, '', [
                'list' => $list,
                'total' => $total,
                'page' => $page,
                'page_size' => $pageSize
            ]);
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.notifications', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

