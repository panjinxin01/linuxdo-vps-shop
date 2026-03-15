<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';

$action = requestValue('action', '');
$pdo = getDB();

$csrfActions = ['create', 'create_refund_request', 'reply', 'close', 'update_priority', 'assign', 'add_internal_note', 'update_meta', 'approve_refund', 'save_template', 'delete_template'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function ticketsHasColumn(PDO $pdo, string $column): bool {
    return commerceColumnExists($pdo, 'tickets', $column);
}

try {
    switch ($action) {
        case 'create':
            checkUser();
            $title = normalizeString(requestValue('title', ''), 200);
            $content = normalizeString(requestValue('content', ''), 5000);
            $orderId = validateInt(requestValue('order_id', 0), 0) ?? 0;
            $category = normalizeString(requestValue('category', 'other'), 30);
            $priority = validateInt(requestValue('priority', 1), 0, 3) ?? 1;
            if ($title === '' || $content === '') {
                jsonResponse(0, '标题和内容不能为空');
            }
            if (!array_key_exists($category, commerceGetTicketCategories())) {
                $category = 'other';
            }
            if ($orderId > 0) {
                $stmt = $pdo->prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?');
                $stmt->execute([$orderId, (int)$_SESSION['user_id']]);
                if (!$stmt->fetchColumn()) {
                    jsonResponse(0, '关联订单无效');
                }
            }
            $stmt = $pdo->prepare('INSERT INTO tickets (user_id, order_id, title, status, category, priority, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, NOW(), NOW())');
            $stmt->execute([(int)$_SESSION['user_id'], $orderId ?: null, $title, $category, $priority]);
            $ticketId = (int)$pdo->lastInsertId();
            $stmt = $pdo->prepare('INSERT INTO ticket_replies (ticket_id, user_id, content) VALUES (?, ?, ?)');
            $stmt->execute([$ticketId, (int)$_SESSION['user_id'], $content]);
            commerceRecordTicketEvent($pdo, $ticketId, 'created', '工单已创建', ['category' => $category, 'priority' => $priority], true);
            commerceRecordTicketEvent($pdo, $ticketId, 'reply', '用户提交首条描述', [], true);
            jsonResponse(1, '工单创建成功', ['ticket_id' => $ticketId]);
            break;


        case 'create_refund_request':
            checkUser();
            $orderId = validateInt(requestValue('order_id', null), 1);
            $refundTarget = normalizeString(requestValue('refund_target', 'original'), 20);
            $refundReason = normalizeString(requestValue('refund_reason', ''), 255);
            $content = normalizeString(requestValue('content', ''), 5000);
            if (!$orderId) {
                jsonResponse(0, '订单ID无效');
            }
            if (!in_array($refundTarget, ['original', 'balance'], true)) {
                $refundTarget = 'original';
            }
            if ($refundReason === '') {
                jsonResponse(0, '请填写退款原因');
            }
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ? AND user_id = ? LIMIT 1');
            $stmt->execute([$orderId, (int)$_SESSION['user_id']]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '订单不存在');
            }
            if ((int)$order['status'] !== 1) {
                jsonResponse(0, '仅支持对已支付订单发起退款申请');
            }
            if (in_array((string)($order['delivery_status'] ?? ''), ['refunded', 'cancelled'], true)) {
                jsonResponse(0, '该订单当前状态不支持退款申请');
            }
            $refundPolicy = commerceBuildRefundPolicy($order);
            if ((float)($refundPolicy['refundable_amount'] ?? 0) <= 0) {
                jsonResponse(0, '当前订单剩余时长为 0，可退金额为 0');
            }
            $stmt = $pdo->prepare("SELECT id FROM tickets WHERE user_id = ? AND order_id = ? AND category = 'refund_request' AND status <> 2 ORDER BY id DESC LIMIT 1");
            $stmt->execute([(int)$_SESSION['user_id'], $orderId]);
            $exists = $stmt->fetchColumn();
            if ($exists) {
                jsonResponse(0, '该订单已有处理中退款工单');
            }
            $title = '退款申请 - ' . ($order['order_no'] ?? ('订单#' . $orderId));
            $targetText = $refundTarget === 'balance' ? '退回站内余额' : '原路退回';
            $fullContent = "订单号：" . ($order['order_no'] ?? '') . "
退款方式：" . $targetText . "
退款原因：" . $refundReason . "
预计退款：" . number_format((float)($refundPolicy['refundable_amount'] ?? 0), 2) . " 积分";
            if ($content !== '') {
                $fullContent .= "
补充说明：" . $content;
            }
            if (ticketsHasColumn($pdo, 'refund_target')) {
                $stmt = $pdo->prepare('INSERT INTO tickets (user_id, order_id, title, status, category, priority, refund_reason, refund_target, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, NOW(), NOW())');
                $stmt->execute([(int)$_SESSION['user_id'], $orderId, $title, 'refund_request', 2, $refundReason, $refundTarget]);
            } else {
                $stmt = $pdo->prepare('INSERT INTO tickets (user_id, order_id, title, status, category, priority, refund_reason, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, NOW(), NOW())');
                $stmt->execute([(int)$_SESSION['user_id'], $orderId, $title, 'refund_request', 2, $refundReason]);
            }
            $ticketId = (int)$pdo->lastInsertId();
            $stmt = $pdo->prepare('INSERT INTO ticket_replies (ticket_id, user_id, content) VALUES (?, ?, ?)');
            $stmt->execute([$ticketId, (int)$_SESSION['user_id'], $fullContent]);
            commerceRecordTicketEvent($pdo, $ticketId, 'refund_request', '用户提交退款申请', ['refund_target' => $refundTarget, 'refund_reason' => $refundReason], true);
            jsonResponse(1, '退款申请已提交', ['ticket_id' => $ticketId]);
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
            if (!empty($ticket['order_id'])) {
                $stmt = $pdo->prepare('SELECT id, order_no, status, delivery_status, price, payment_method, refund_at, paid_at, delivered_at, created_at, balance_paid_amount, external_pay_amount FROM orders WHERE id = ? LIMIT 1');
                $stmt->execute([(int)$ticket['order_id']]);
                $ticket['order_info'] = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
                if ($ticket['order_info']) {
                    commerceFillRefundPolicy($ticket['order_info']);
                }
            } else {
                $ticket['order_info'] = null;
            }
            if (commerceTableExists($pdo, 'ticket_events')) {
                $sql = 'SELECT e.*, a.username AS admin_name, u.username AS user_name FROM ticket_events e LEFT JOIN admins a ON e.actor_type = "admin" AND e.actor_id = a.id LEFT JOIN users u ON e.actor_type = "user" AND e.actor_id = u.id WHERE e.ticket_id = ?';
                if (empty($_SESSION['admin_id'])) {
                    $sql .= ' AND e.is_visible = 1';
                }
                $sql .= ' ORDER BY e.id ASC';
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$ticketId]);
                $ticket['events'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } else {
                $ticket['events'] = [];
            }
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
            $stmt = $pdo->prepare('UPDATE tickets SET status = ?, updated_at = NOW(), handled_admin_id = ? WHERE id = ?');
            $stmt->execute([$newStatus, $isAdmin ? (int)$_SESSION['admin_id'] : ($ticket['handled_admin_id'] ?? null), $ticketId]);
            commerceRecordTicketEvent($pdo, $ticketId, 'reply', $isAdmin ? '管理员回复' : '用户回复', [], true);
            if ($isAdmin) {
                logAudit($pdo, 'ticket.reply', ['ticket_id' => $ticketId], (string)$ticketId);
                createNotification($pdo, (int)$ticket['user_id'], 'ticket_reply', '工单有新回复', "您的工单 #{$ticketId}《{$ticket['title']}》收到管理员回复，请及时查看。", (string)$ticketId);
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
            commerceRecordTicketEvent($pdo, $ticketId, 'status_change', $isAdmin ? '管理员关闭工单' : '用户关闭工单', ['status' => 2], true);
            if ($isAdmin) {
                logAudit($pdo, 'ticket.close', ['ticket_id' => $ticketId], (string)$ticketId);
                createNotification($pdo, (int)$ticket['user_id'], 'ticket_closed', '工单已关闭', "您的工单 #{$ticketId}《{$ticket['title']}》已被管理员关闭。如有新问题请提交新工单。", (string)$ticketId);
            }
            jsonResponse(1, '工单已关闭');
            break;

        case 'all':
            checkAdmin($pdo);
            $status = requestValue('status', '');
            $category = normalizeString(requestValue('category', ''), 30);
            $priority = requestValue('priority', '');
            $keyword = normalizeString(requestValue('keyword', ''), 100);
            $orderNo = normalizeString(requestValue('order_no', ''), 50);
            $where = '1=1';
            $params = [];
            if ($status !== '' && validateInt($status, 0, 2) !== null) {
                $where .= ' AND t.status = ?';
                $params[] = (int)$status;
            }
            if ($category !== '') {
                $where .= ' AND t.category = ?';
                $params[] = $category;
            }
            if ($priority !== '' && validateInt($priority, 0, 3) !== null) {
                $where .= ' AND t.priority = ?';
                $params[] = (int)$priority;
            }
            if ($keyword !== '') {
                $where .= ' AND (t.title LIKE ? OR u.username LIKE ?)';
                $kw = '%' . $keyword . '%';
                $params[] = $kw;
                $params[] = $kw;
            }
            if ($orderNo !== '') {
                $where .= ' AND o.order_no = ?';
                $params[] = $orderNo;
            }
            $sql = 'SELECT t.*, u.username, o.order_no, a.username AS handled_admin_name FROM tickets t LEFT JOIN users u ON t.user_id = u.id LEFT JOIN orders o ON t.order_id = o.id LEFT JOIN admins a ON t.handled_admin_id = a.id WHERE ' . $where . ' ORDER BY CASE WHEN t.status = 0 THEN 0 ELSE 1 END, t.priority DESC, t.updated_at DESC';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            jsonResponse(1, 'ok', $stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'stats':
            checkAdmin($pdo);
            $stats = [
                'total' => (int)$pdo->query('SELECT COUNT(*) FROM tickets')->fetchColumn(),
                'pending' => (int)$pdo->query('SELECT COUNT(*) FROM tickets WHERE status = 0')->fetchColumn(),
                'replied' => (int)$pdo->query('SELECT COUNT(*) FROM tickets WHERE status = 1')->fetchColumn(),
                'closed' => (int)$pdo->query('SELECT COUNT(*) FROM tickets WHERE status = 2')->fetchColumn(),
                'refund_requests' => ticketsHasColumn($pdo, 'category') ? (int)$pdo->query("SELECT COUNT(*) FROM tickets WHERE category = 'refund_request'")->fetchColumn() : 0,
            ];
            if (ticketsHasColumn($pdo, 'category')) {
                $stmt = $pdo->query('SELECT category, COUNT(*) AS total FROM tickets GROUP BY category');
                $stats['category_breakdown'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } else {
                $stats['category_breakdown'] = [];
            }
            jsonResponse(1, 'ok', $stats);
            break;

        case 'admin_list':
            checkAdmin($pdo);
            $limit = validateInt(requestValue('limit', 5), 1, 20) ?? 5;
            $stmt = $pdo->prepare('SELECT id, title, status, priority, category, created_at FROM tickets ORDER BY CASE WHEN status = 0 THEN 0 ELSE 1 END, priority DESC, updated_at DESC LIMIT ?');
            $stmt->bindValue(1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $statusMap = [0 => 'open', 1 => 'replied', 2 => 'closed'];
            $priorityMap = [0 => 'low', 1 => 'normal', 2 => 'high', 3 => 'urgent'];
            $list = array_map(static function (array $row) use ($statusMap, $priorityMap) {
                return [
                    'id' => (int)$row['id'],
                    'title' => $row['title'],
                    'created_at' => $row['created_at'],
                    'status' => $statusMap[(int)($row['status'] ?? 0)] ?? 'unknown',
                    'priority' => $priorityMap[(int)($row['priority'] ?? 1)] ?? 'normal',
                    'category' => $row['category'] ?? 'other',
                ];
            }, $rows);
            jsonResponse(1, 'ok', $list);
            break;

        case 'update_priority':
            checkAdmin($pdo);
            $ticketId = validateInt(requestValue('ticket_id', null), 1);
            $priority = validateInt(requestValue('priority', 1), 0, 3);
            if (!$ticketId || $priority === null) {
                jsonResponse(0, '工单ID无效');
            }
            $stmt = $pdo->prepare('UPDATE tickets SET priority = ?, updated_at = NOW() WHERE id = ?');
            $stmt->execute([$priority, $ticketId]);
            commerceRecordTicketEvent($pdo, $ticketId, 'priority_change', '优先级已更新', ['priority' => $priority], false);
            logAudit($pdo, 'ticket.update_priority', ['priority' => $priority], (string)$ticketId);
            jsonResponse(1, '优先级已更新');
            break;

        case 'assign':
            checkAdmin($pdo);
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
            $stmt = $pdo->prepare('UPDATE tickets SET assignee_admin_id = ?, handled_admin_id = ?, updated_at = NOW() WHERE id = ?');
            $stmt->execute([$assigneeId ?: null, $assigneeId ?: null, $ticketId]);
            commerceRecordTicketEvent($pdo, $ticketId, 'assign', $assigneeId ? '工单已指派' : '已取消指派', ['assignee_id' => $assigneeId], false);
            logAudit($pdo, 'ticket.assign', ['assignee_id' => $assigneeId], (string)$ticketId);
            jsonResponse(1, $assigneeId ? '工单已指派' : '已取消指派');
            break;

        case 'add_internal_note':
            checkAdmin($pdo);
            $ticketId = validateInt(requestValue('ticket_id', null), 1);
            $note = normalizeString(requestValue('note', ''), 5000);
            if (!$ticketId || $note === '') {
                jsonResponse(0, '参数不完整');
            }
            $stmt = $pdo->prepare('UPDATE tickets SET internal_note = ?, updated_at = NOW(), handled_admin_id = ? WHERE id = ?');
            $stmt->execute([$note, (int)$_SESSION['admin_id'], $ticketId]);
            commerceRecordTicketEvent($pdo, $ticketId, 'internal_note', $note, [], false);
            logAudit($pdo, 'ticket.internal_note', ['length' => utf8Length($note)], (string)$ticketId);
            jsonResponse(1, '内部备注已保存');
            break;

        case 'update_meta':
            checkAdmin($pdo);
            $ticketId = validateInt(requestValue('ticket_id', null), 1);
            if (!$ticketId) {
                jsonResponse(0, '工单ID无效');
            }
            $category = normalizeString(requestValue('category', 'other'), 30);
            $priority = validateInt(requestValue('priority', 1), 0, 3) ?? 1;
            $verified = validateInt(requestValue('verified_status', 0), 0, 1) ?? 0;
            $refundAllowed = validateInt(requestValue('refund_allowed', 0), 0, 1) ?? 0;
            $refundReason = normalizeString(requestValue('refund_reason', ''), 255);
            if (!array_key_exists($category, commerceGetTicketCategories())) {
                $category = 'other';
            }
            $stmt = $pdo->prepare('UPDATE tickets SET category=?, priority=?, verified_status=?, refund_allowed=?, refund_reason=?, handled_admin_id=?, updated_at=NOW() WHERE id=?');
            $stmt->execute([$category, $priority, $verified, $refundAllowed, $refundReason ?: null, (int)$_SESSION['admin_id'], $ticketId]);
            commerceRecordTicketEvent($pdo, $ticketId, 'meta_update', '工单信息已更新', ['category' => $category, 'priority' => $priority, 'verified_status' => $verified, 'refund_allowed' => $refundAllowed], false);
            logAudit($pdo, 'ticket.update_meta', ['category' => $category, 'priority' => $priority], (string)$ticketId);
            jsonResponse(1, '工单信息已更新');
            break;


        case 'approve_refund':
            checkAdmin($pdo);
            $ticketId = validateInt(requestValue('ticket_id', null), 1);
            if (!$ticketId) {
                jsonResponse(0, '工单ID无效');
            }
            $stmt = $pdo->prepare('SELECT * FROM tickets WHERE id = ? LIMIT 1');
            $stmt->execute([$ticketId]);
            $ticket = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$ticket) {
                jsonResponse(0, '工单不存在');
            }
            if ((string)($ticket['category'] ?? '') !== 'refund_request' || empty($ticket['order_id'])) {
                jsonResponse(0, '该工单不是退款申请');
            }
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ? LIMIT 1');
            $stmt->execute([(int)$ticket['order_id']]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '关联订单不存在');
            }
            $refundTarget = normalizeString(requestValue('refund_target', (string)($ticket['refund_target'] ?? 'auto')), 20);
            $refundReason = normalizeString(requestValue('refund_reason', (string)($ticket['refund_reason'] ?? '工单退款')), 255);
            try {
                $result = commerceRefundOrder($pdo, $order, $refundTarget, $refundReason);
            } catch (Throwable $e) {
                logError($pdo, 'tickets.approve_refund', $e->getMessage(), ['ticket_id' => $ticketId, 'order_id' => $ticket['order_id']]);
                jsonResponse(0, $e->getMessage() ?: '退款失败');
            }
            $reply = '退款申请已通过。退款金额：' . number_format((float)$result['refund_total'], 2) . ' 积分；退款方式：' . ($result['refund_target'] === 'balance' ? '退回站内余额' : '原路退回') . '。';
            $stmt = $pdo->prepare('INSERT INTO ticket_replies (ticket_id, user_id, content) VALUES (?, NULL, ?)');
            $stmt->execute([$ticketId, $reply]);
            $parts = ['status = 2', 'refund_allowed = 1', 'refund_reason = ?', 'handled_admin_id = ?', 'updated_at = NOW()'];
            $params = [$refundReason, (int)$_SESSION['admin_id']];
            if (ticketsHasColumn($pdo, 'refund_target')) {
                $parts[] = 'refund_target = ?';
                $params[] = $result['refund_target'];
            }
            $params[] = $ticketId;
            $stmt = $pdo->prepare('UPDATE tickets SET ' . implode(', ', $parts) . ' WHERE id = ?');
            $stmt->execute($params);
            commerceRecordTicketEvent($pdo, $ticketId, 'refund_approved', '管理员已同意退款', ['refund_target' => $result['refund_target'], 'refund_total' => $result['refund_total']], true);
            logAudit($pdo, 'ticket.approve_refund', ['ticket_id' => $ticketId, 'order_no' => $result['order_no'], 'refund_target' => $result['refund_target'], 'refund_total' => $result['refund_total']], (string)$ticketId);
            jsonResponse(1, '退款已完成', $result);
            break;

        case 'templates':
            checkAdmin($pdo);
            if (!commerceTableExists($pdo, 'ticket_reply_templates')) {
                jsonResponse(1, 'ok', []);
            }
            $stmt = $pdo->query('SELECT * FROM ticket_reply_templates ORDER BY sort_order ASC, id DESC');
            jsonResponse(1, 'ok', $stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'save_template':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', 0), 0) ?? 0;
            $title = normalizeString(requestValue('title', ''), 100);
            $content = normalizeString(requestValue('content', ''), 5000);
            $category = normalizeString(requestValue('category', ''), 30);
            $sortOrder = validateInt(requestValue('sort_order', 0), 0, 99999) ?? 0;
            $status = validateInt(requestValue('status', 1), 0, 1) ?? 1;
            if ($title === '' || $content === '') {
                jsonResponse(0, '模板标题和内容不能为空');
            }
            if ($id > 0) {
                $stmt = $pdo->prepare('UPDATE ticket_reply_templates SET title=?, content=?, category=?, sort_order=?, status=?, updated_at=NOW() WHERE id=?');
                $stmt->execute([$title, $content, $category ?: null, $sortOrder, $status, $id]);
                logAudit($pdo, 'ticket.template_update', ['title' => $title], (string)$id);
                jsonResponse(1, '回复模板已更新');
            }
            $stmt = $pdo->prepare('INSERT INTO ticket_reply_templates (title, content, category, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())');
            $stmt->execute([$title, $content, $category ?: null, $sortOrder, $status]);
            $newId = (int)$pdo->lastInsertId();
            logAudit($pdo, 'ticket.template_create', ['title' => $title], (string)$newId);
            jsonResponse(1, '回复模板已创建', ['id' => $newId]);
            break;

        case 'delete_template':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '模板ID无效');
            }
            $pdo->prepare('DELETE FROM ticket_reply_templates WHERE id = ?')->execute([$id]);
            logAudit($pdo, 'ticket.template_delete', [], (string)$id);
            jsonResponse(1, '回复模板已删除');
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.tickets', $e->getMessage());
    jsonResponse(0, '服务器错误');
}
