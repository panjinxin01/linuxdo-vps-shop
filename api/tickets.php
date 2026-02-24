<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$action = requestValue('action', '');
$pdo = getDB();

require_once __DIR__ . '/../includes/notifications.php';

$csrfActions = ['create', 'reply', 'close', 'update_priority', 'update_tags', 'assign'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function ticketsHasColumn(PDO $pdo, string $column): bool {
    static $cache = [];
    if (isset($cache[$column])) {
        return $cache[$column];
    }
    try {
        $stmt = $pdo->prepare('SHOW COLUMNS FROM `tickets` LIKE ?');
        $stmt->execute([$column]);
        $cache[$column] = (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        $cache[$column] = false;
    }
    return $cache[$column];
}


try {
    switch ($action) {
        case 'create':
            checkUser();
            $title = normalizeString(requestValue('title', ''), 200);
            $content = normalizeString(requestValue('content', ''), 5000);
            $orderId = validateInt(requestValue('order_id', 0), 0) ?? 0;

            if ($title === '' || $content === '') {
                jsonResponse(0, '标题和内容不能为空');
            }
            if (mb_strlen($title, 'UTF-8') > 200) {
                jsonResponse(0, '标题不能超过200字');
            }

            $stmt = $pdo->prepare('INSERT INTO tickets (user_id, order_id, title, status) VALUES (?, ?, ?, 0)');
            $stmt->execute([(int)$_SESSION['user_id'], $orderId ?: null, $title]);
            $ticketId = (int)$pdo->lastInsertId();

            $stmt = $pdo->prepare('INSERT INTO ticket_replies (ticket_id, user_id, content) VALUES (?, ?, ?)');
            $stmt->execute([$ticketId, (int)$_SESSION['user_id'], $content]);

            jsonResponse(1, '工单创建成功', ['ticket_id' => $ticketId]);
            break;

        case 'my':
            checkUser();
            $stmt = $pdo->prepare('SELECT t.*, o.order_no FROM tickets t LEFT JOIN orders o ON t.order_id = o.id WHERE t.user_id = ? ORDER BY t.updated_at DESC');
            $stmt->execute([(int)$_SESSION['user_id']]);
            jsonResponse(1, 'ok', $stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'detail':
            $ticketId = validateInt(requestValue('id', null), 1);
            if (!$ticketId) {
                jsonResponse(0, '工单ID无效');
            }
            $stmt = $pdo->prepare('SELECT t.*, u.username, o.order_no FROM tickets t LEFT JOIN users u ON t.user_id = u.id LEFT JOIN orders o ON t.order_id = o.id WHERE t.id = ?');
            $stmt->execute([$ticketId]);
            $ticket = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$ticket) {
                jsonResponse(0, '工单不存在');
            }
            if (empty($_SESSION['admin_id']) && (!isset($_SESSION['user_id']) || (int)$_SESSION['user_id'] !== (int)$ticket['user_id'])) {
                jsonResponse(0, '无权访问此工单');
            }
            $stmt = $pdo->prepare('SELECT r.*, u.username FROM ticket_replies r LEFT JOIN users u ON r.user_id = u.id WHERE r.ticket_id = ? ORDER BY r.created_at ASC');
            $stmt->execute([$ticketId]);
            $ticket['replies'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            jsonResponse(1, 'ok', $ticket);
            break;

        case 'reply':
            $ticketId = validateInt(requestValue('ticket_id', null), 1);
            $content = normalizeString(requestValue('content', ''), 5000);
            if (!$ticketId || $content === '') {
                jsonResponse(0, '参数不完整');
            }
            $stmt = $pdo->prepare('SELECT * FROM tickets WHERE id = ?');
            $stmt->execute([$ticketId]);
            $ticket = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$ticket) {
                jsonResponse(0, '工单不存在');
            }
            if ((int)$ticket['status'] === 2) {
                jsonResponse(0, '工单已关闭，无法回复');
            }

            $isAdmin = !empty($_SESSION['admin_id']);
            $isOwner = !empty($_SESSION['user_id']) && (int)$_SESSION['user_id'] === (int)$ticket['user_id'];
            if (!$isAdmin && !$isOwner) {
                jsonResponse(0, '无权回复此工单');
            }

            $userId = $isAdmin ? null : (int)$_SESSION['user_id'];
            $stmt = $pdo->prepare('INSERT INTO ticket_replies (ticket_id, user_id, content) VALUES (?, ?, ?)');
            $stmt->execute([$ticketId, $userId, $content]);

            $newStatus = $isAdmin ? 1 : 0;
            $stmt = $pdo->prepare('UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?');
            $stmt->execute([$newStatus, $ticketId]);

            if ($isAdmin) {
                logAudit($pdo, 'ticket.reply', ['ticket_id' => $ticketId], (string)$ticketId);
                createNotification(
                    $pdo,
                    (int)$ticket['user_id'],
                    'ticket_reply',
                    '工单有新回复',
                    "您的工单 #{$ticketId}《{$ticket['title']}》收到管理员回复，请及时查看。",
                    (string)$ticketId
                );
            }
            jsonResponse(1, '回复成功');
            break;

        case 'close':
            $ticketId = validateInt(requestValue('ticket_id', null), 1);
            if (!$ticketId) {
                jsonResponse(0, '工单ID无效');
            }
            $stmt = $pdo->prepare('SELECT * FROM tickets WHERE id = ?');
            $stmt->execute([$ticketId]);
            $ticket = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$ticket) {
                jsonResponse(0, '工单不存在');
            }
            $isAdmin = !empty($_SESSION['admin_id']);
            $isOwner = !empty($_SESSION['user_id']) && (int)$_SESSION['user_id'] === (int)$ticket['user_id'];
            if (!$isAdmin && !$isOwner) {
                jsonResponse(0, '无权关闭此工单');
            }
            $stmt = $pdo->prepare('UPDATE tickets SET status = 2, updated_at = NOW() WHERE id = ?');
            $stmt->execute([$ticketId]);
            if ($isAdmin) {
                logAudit($pdo, 'ticket.close', ['ticket_id' => $ticketId], (string)$ticketId);
                // 发送工单关闭通知给用户
                try {
                    createNotification(
                        $pdo,
                        (int)$ticket['user_id'],
                        'ticket_closed',
                        '工单已关闭',
                        "您的工单 #{$ticketId}《{$ticket['title']}》已被管理员关闭。如有新问题请提交新工单。",
                        (string)$ticketId
                    );
                } catch (Throwable $e) {
                    // ignore
                }
            }
            jsonResponse(1, '工单已关闭');
            break;

        case 'all':
            checkAdmin($pdo);
            $stmt = $pdo->query('SELECT t.*, u.username, o.order_no FROM tickets t LEFT JOIN users u ON t.user_id = u.id LEFT JOIN orders o ON t.order_id = o.id ORDER BY CASE WHEN t.status = 0 THEN 0 ELSE 1 END, t.updated_at DESC');
            jsonResponse(1, 'ok', $stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'stats':
            checkAdmin($pdo);
            $stats = [
                'total' => (int)$pdo->query('SELECT COUNT(*) FROM tickets')->fetchColumn(),
                'pending' => (int)$pdo->query('SELECT COUNT(*) FROM tickets WHERE status = 0')->fetchColumn(),
                'replied' => (int)$pdo->query('SELECT COUNT(*) FROM tickets WHERE status = 1')->fetchColumn(),
                'closed' => (int)$pdo->query('SELECT COUNT(*) FROM tickets WHERE status = 2')->fetchColumn()
            ];
            jsonResponse(1, 'ok', $stats);
            break;

        case 'admin_list':
            checkAdmin($pdo);
            $limit = validateInt(requestValue('limit', 5), 1, 20) ?? 5;
            $hasPriority = ticketsHasColumn($pdo, 'priority');
            if ($hasPriority) {
                $sql = 'SELECT id, title, status, priority, created_at FROM tickets ORDER BY CASE WHEN status = 0 THEN 0 ELSE 1 END, priority DESC, updated_at DESC LIMIT ?';
            } else {
                $sql = 'SELECT id, title, status, created_at FROM tickets ORDER BY CASE WHEN status = 0 THEN 0 ELSE 1 END, updated_at DESC LIMIT ?';
            }
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $statusMap = [0 => 'open', 1 => 'replied', 2 => 'closed'];
            $priorityMap = [0 => 'low', 1 => 'normal', 2 => 'high', 3 => 'urgent'];
            $list = array_map(function (array $row) use ($statusMap, $priorityMap, $hasPriority) {
                $code = (int)($row['status'] ?? 0);
                $result = [
                    'id' => (int)$row['id'],
                    'title' => $row['title'],
                    'created_at' => $row['created_at'],
                    'status' => $statusMap[$code] ?? 'unknown'
                ];
                if ($hasPriority) {
                    $result['priority'] = $priorityMap[(int)($row['priority'] ?? 1)] ?? 'normal';
                }
                return $result;
            }, $rows);
            jsonResponse(1, 'ok', $list);
            break;

        case 'update_priority':
            checkAdmin($pdo);
            if (!ticketsHasColumn($pdo, 'priority')) {
                jsonResponse(0, '数据库未升级，请先执行数据库更新');
            }
            $ticketId = validateInt(requestValue('ticket_id', null), 1);
            $priority = validateInt(requestValue('priority', 1), 0, 3);
            if (!$ticketId || $priority === null) {
                jsonResponse(0, '工单ID无效');
            }
            $stmt = $pdo->prepare('UPDATE tickets SET priority = ? WHERE id = ?');
            $stmt->execute([$priority, $ticketId]);
            logAudit($pdo, 'ticket.update_priority', ['priority' => $priority], (string)$ticketId);
            jsonResponse(1, '优先级已更新');
            break;

        case 'update_tags':
            checkAdmin($pdo);
            if (!ticketsHasColumn($pdo, 'tags')) {
                jsonResponse(0, '数据库未升级，请先执行数据库更新');
            }
            $ticketId = validateInt(requestValue('ticket_id', null), 1);
            $tags = normalizeString(requestValue('tags', ''), 255);
            if (!$ticketId) {
                jsonResponse(0, '工单ID无效');
            }
            $stmt = $pdo->prepare('UPDATE tickets SET tags = ? WHERE id = ?');
            $stmt->execute([$tags !== '' ? $tags : null, $ticketId]);
            logAudit($pdo, 'ticket.update_tags', ['tags' => $tags], (string)$ticketId);
            jsonResponse(1, '标签已更新');
            break;

        case 'assign':
            checkAdmin($pdo);
            if (!ticketsHasColumn($pdo, 'assignee_admin_id')) {
                jsonResponse(0, '数据库未升级，请先执行数据库更新');
            }
            $ticketId = validateInt(requestValue('ticket_id', null), 1);
            $assigneeId = validateInt(requestValue('assignee_id', 0), 0) ?? 0;
            if (!$ticketId) {
                jsonResponse(0, '工单ID无效');
            }
            if ($assigneeId > 0) {
                $stmt = $pdo->prepare('SELECT id FROM admins WHERE id = ?');
                $stmt->execute([$assigneeId]);
                if (!$stmt->fetchColumn()) {
                    jsonResponse(0, '指派的管理员不存在');
                }
            }
            $stmt = $pdo->prepare('UPDATE tickets SET assignee_admin_id = ? WHERE id = ?');
            $stmt->execute([$assigneeId ?: null, $ticketId]);
            logAudit($pdo, 'ticket.assign', ['assignee_id' => $assigneeId], (string)$ticketId);
            jsonResponse(1, $assigneeId ? '工单已指派' : '已取消指派');
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.tickets', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

