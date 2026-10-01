<?php
/**
 * 工单业务服务层（v20260823 重构）
 * ---------------------------------------------------------
 * 从 api/tickets.php 巨型 switch 拆分而来，API 行为与响应
 * 结构保持 100% 兼容。api/tickets.php 仅保留路由与鉴权分发。
 *
 * 约定：
 *  - 所有方法均为静态方法，内部自行做权限校验（复用全局函数）
 *  - CSRF 校验由路由层统一处理，服务层不重复校验
 *  - 错误路径直接 jsonResponse() 终止（与原实现一致）
 */

class TicketService
{
    /** 工单分类（与前端 TICKET_CATEGORIES 保持一致） */
    public static function categories(): array
    {
        return commerceGetTicketCategories();
    }

    /**
     * 去除工单中的管理员内部字段
     *
     * internal_note 是管理员内部备注，绝不能返回给普通用户。
     * 之前 listMine()/detail() 直接 SELECT t.* 全量回传，工单所有者可在响应里直接看到。
     */
    private static function stripInternalForUser(array $ticket): array
    {
        unset($ticket['internal_note']);
        return $ticket;
    }

    /** 创建工单 */
    public static function create(PDO $pdo): void
    {
        checkUser();
        $title = normalizeString(requestValue('title', ''), 200);
        $content = normalizeString(requestValue('content', ''), 5000);
        $orderId = validateInt(requestValue('order_id', 0), 0) ?? 0;
        $category = normalizeString(requestValue('category', 'other'), 30);
        $priority = validateInt(requestValue('priority', 1), 0, 3) ?? 1;
        if ($title === '' || $content === '') {
            jsonResponse(0, '标题和内容不能为空');
        }
        if (!array_key_exists($category, self::categories())) {
            $category = 'other';
        }
        if ($orderId > 0 && !self::orderBelongsToUser($pdo, $orderId, (int)$_SESSION['user_id'])) {
            jsonResponse(0, '关联订单无效');
        }
        $stmt = $pdo->prepare('INSERT INTO tickets (user_id, order_id, title, status, category, priority, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, NOW(), NOW())');
        $stmt->execute([(int)$_SESSION['user_id'], $orderId ?: null, $title, $category, $priority]);
        $ticketId = (int)$pdo->lastInsertId();
        $stmt = $pdo->prepare('INSERT INTO ticket_replies (ticket_id, user_id, content) VALUES (?, ?, ?)');
        $stmt->execute([$ticketId, (int)$_SESSION['user_id'], $content]);
        commerceRecordTicketEvent($pdo, $ticketId, 'created', '工单已创建', ['category' => $category, 'priority' => $priority], true);
        commerceRecordTicketEvent($pdo, $ticketId, 'reply', '用户提交首条描述', [], true);
        jsonResponse(1, '工单创建成功', ['ticket_id' => $ticketId]);
    }

    /** 创建退款申请工单 */
    public static function createRefundRequest(PDO $pdo): void
    {
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
        if ($stmt->fetchColumn()) {
            jsonResponse(0, '该订单已有处理中退款工单');
        }
        $title = '退款申请 - ' . ($order['order_no'] ?? ('订单#' . $orderId));
        $targetText = $refundTarget === 'balance' ? '退回站内余额' : '原路退回';
        $fullContent = "订单号：" . ($order['order_no'] ?? '') . "\n"
            . "退款方式：" . $targetText . "\n"
            . "退款原因：" . $refundReason . "\n"
            . "预计退款：" . number_format((float)($refundPolicy['refundable_amount'] ?? 0), 2) . " 积分";
        if ($content !== '') {
            $fullContent .= "\n补充说明：" . $content;
        }
        if (commerceColumnExists($pdo, 'tickets', 'refund_target')) {
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
    }

    /** 我的工单列表 */
    public static function listMine(PDO $pdo): void
    {
        checkUser();
        $stmt = $pdo->prepare('SELECT t.*, o.order_no FROM tickets t LEFT JOIN orders o ON t.order_id = o.id WHERE t.user_id = ? ORDER BY t.updated_at DESC');
        $stmt->execute([(int)$_SESSION['user_id']]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // 列表接口属于普通用户视角，剔除管理员内部备注
        $rows = array_map([self::class, 'stripInternalForUser'], $rows);
        jsonResponse(1, 'ok', $rows);
    }

    /** 工单详情（本人或管理员） */
    public static function detail(PDO $pdo): void
    {
        $ticketId = validateInt(requestValue('id', null), 1);
        if (!$ticketId) {
            jsonResponse(0, '工单ID无效');
        }
        $ticket = self::findTicket($pdo, $ticketId);
        if (!$ticket) {
            jsonResponse(0, '工单不存在');
        }
        $adminId = self::currentAdminId($pdo);
        if ($adminId <= 0 && (!isset($_SESSION['user_id']) || (int)$_SESSION['user_id'] !== (int)$ticket['user_id'])) {
            jsonResponse(0, '无权访问此工单');
        }
        $stmt = $pdo->prepare('SELECT r.*, u.username FROM ticket_replies r LEFT JOIN users u ON r.user_id = u.id WHERE r.ticket_id = ? ORDER BY r.created_at ASC');
        $stmt->execute([$ticketId]);
        $ticket['replies'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $ticket['order_info'] = null;
        if (!empty($ticket['order_id'])) {
            $stmt = $pdo->prepare('SELECT id, order_no, status, delivery_status, price, payment_method, refund_at, paid_at, delivered_at, created_at, balance_paid_amount, external_pay_amount FROM orders WHERE id = ? LIMIT 1');
            $stmt->execute([(int)$ticket['order_id']]);
            $ticket['order_info'] = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($ticket['order_info']) {
                commerceFillRefundPolicy($ticket['order_info']);
            }
        }
        $ticket['events'] = [];
        if (commerceTableExists($pdo, 'ticket_events')) {
            $sql = 'SELECT e.*, a.username AS admin_name, u.username AS user_name FROM ticket_events e LEFT JOIN admins a ON e.actor_type = "admin" AND e.actor_id = a.id LEFT JOIN users u ON e.actor_type = "user" AND e.actor_id = u.id WHERE e.ticket_id = ?';
            if ($adminId <= 0) {
                $sql .= ' AND e.is_visible = 1';
            }
            $sql .= ' ORDER BY e.id ASC';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$ticketId]);
            $ticket['events'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
        if ($adminId <= 0) {
            $ticket = self::stripInternalForUser($ticket);
        }
        jsonResponse(1, 'ok', $ticket);
    }

    /** 回复工单（用户本人或管理员） */
    public static function reply(PDO $pdo): void
    {
        $ticketId = validateInt(requestValue('ticket_id', null), 1);
        $content = normalizeString(requestValue('content', ''), 5000);
        if (!$ticketId || $content === '') {
            jsonResponse(0, '参数不完整');
        }
        $ticket = self::findTicket($pdo, $ticketId);
        if (!$ticket) {
            jsonResponse(0, '工单不存在');
        }
        if ((int)$ticket['status'] === 2) {
            jsonResponse(0, '工单已关闭，无法回复');
        }
        [$isAdmin, $isOwner] = self::resolveActor($pdo, $ticket);
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
    }

    /** 关闭工单（本人或管理员） */
    public static function close(PDO $pdo): void
    {
        $ticketId = validateInt(requestValue('ticket_id', null), 1);
        if (!$ticketId) {
            jsonResponse(0, '工单ID无效');
        }
        $ticket = self::findTicket($pdo, $ticketId);
        if (!$ticket) {
            jsonResponse(0, '工单不存在');
        }
        [$isAdmin, $isOwner] = self::resolveActor($pdo, $ticket);
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
    }

    /** 后台工单列表（支持状态/分类/优先级/关键词/订单号筛选） */
    public static function listAll(PDO $pdo): void
    {
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
    }

    /** 工单统计（后台统计卡） */
    public static function stats(PDO $pdo): void
    {
        checkAdmin($pdo);
        $stats = [
            'total' => (int)$pdo->query('SELECT COUNT(*) FROM tickets')->fetchColumn(),
            'pending' => (int)$pdo->query('SELECT COUNT(*) FROM tickets WHERE status = 0')->fetchColumn(),
            'replied' => (int)$pdo->query('SELECT COUNT(*) FROM tickets WHERE status = 1')->fetchColumn(),
            'closed' => (int)$pdo->query('SELECT COUNT(*) FROM tickets WHERE status = 2')->fetchColumn(),
            'refund_requests' => commerceColumnExists($pdo, 'tickets', 'category') ? (int)$pdo->query("SELECT COUNT(*) FROM tickets WHERE category = 'refund_request'")->fetchColumn() : 0,
        ];
        if (commerceColumnExists($pdo, 'tickets', 'category')) {
            $stmt = $pdo->query('SELECT category, COUNT(*) AS total FROM tickets GROUP BY category');
            $stats['category_breakdown'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $stats['category_breakdown'] = [];
        }
        jsonResponse(1, 'ok', $stats);
    }

    /** 后台仪表盘最近工单 */
    public static function adminList(PDO $pdo): void
    {
        checkAdmin($pdo);
        $limit = validateInt(requestValue('limit', 5), 1, 20) ?? 5;
        $stmt = $pdo->prepare('SELECT id, title, status, priority, category, created_at FROM tickets ORDER BY CASE WHEN status = 0 THEN 0 ELSE 1 END, priority DESC, updated_at DESC LIMIT ?');
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $statusMap = [0 => 'open', 1 => 'replied', 2 => 'closed'];
        $priorityMap = [0 => 'low', 1 => 'normal', 2 => 'high', 3 => 'urgent'];
        $list = array_map(static function (array $row) use ($statusMap, $priorityMap): array {
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
    }

    /** 指派管理员（后台，预留能力保持兼容） */
    public static function assign(PDO $pdo): void
    {
        checkAdmin($pdo);
        $ticketId = validateInt(requestValue('ticket_id', null), 1);
        $assigneeId = validateInt(requestValue('assignee_id', 0), 0) ?? 0;
        if (!$ticketId) {
            jsonResponse(0, '工单ID无效');
        }
        if ($assigneeId > 0 && !self::adminExists($pdo, $assigneeId)) {
            jsonResponse(0, '指派的管理员不存在');
        }
        // 必须先确认工单存在：UPDATE 影响 0 行时也会返回成功，
        // 不校验就会给不存在的工单写入孤儿 ticket_events 与审计日志。
        if (!self::findTicket($pdo, $ticketId)) {
            jsonResponse(0, '工单不存在');
        }
        $stmt = $pdo->prepare('UPDATE tickets SET assignee_admin_id = ?, handled_admin_id = ?, updated_at = NOW() WHERE id = ?');
        $stmt->execute([$assigneeId ?: null, $assigneeId ?: null, $ticketId]);
        commerceRecordTicketEvent($pdo, $ticketId, 'assign', $assigneeId ? '工单已指派' : '已取消指派', ['assignee_id' => $assigneeId], false);
        logAudit($pdo, 'ticket.assign', ['assignee_id' => $assigneeId], (string)$ticketId);
        jsonResponse(1, $assigneeId ? '工单已指派' : '已取消指派');
    }

    /** 审批退款并执行退款（后台） */
    public static function approveRefund(PDO $pdo): void
    {
        checkAdmin($pdo);
        $ticketId = validateInt(requestValue('ticket_id', null), 1);
        if (!$ticketId) {
            jsonResponse(0, '工单ID无效');
        }
        $ticket = self::findTicket($pdo, $ticketId);
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
        if (commerceColumnExists($pdo, 'tickets', 'refund_target')) {
            $parts[] = 'refund_target = ?';
            $params[] = $result['refund_target'];
        }
        $params[] = $ticketId;
        $stmt = $pdo->prepare('UPDATE tickets SET ' . implode(', ', $parts) . ' WHERE id = ?');
        $stmt->execute($params);
        commerceRecordTicketEvent($pdo, $ticketId, 'refund_approved', '管理员已同意退款', ['refund_target' => $result['refund_target'], 'refund_total' => $result['refund_total']], true);
        logAudit($pdo, 'ticket.approve_refund', ['ticket_id' => $ticketId, 'order_no' => $result['order_no'], 'refund_target' => $result['refund_target'], 'refund_total' => $result['refund_total']], (string)$ticketId);
        jsonResponse(1, '退款已完成', $result);
    }

    /** 快捷回复模板列表（后台） */
    public static function templates(PDO $pdo): void
    {
        checkAdmin($pdo);
        if (!commerceTableExists($pdo, 'ticket_reply_templates')) {
            jsonResponse(1, 'ok', []);
        }
        $stmt = $pdo->query('SELECT * FROM ticket_reply_templates ORDER BY sort_order ASC, id DESC');
        jsonResponse(1, 'ok', $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    /* ----------------------- 私有辅助 ----------------------- */

    private static function findTicket(PDO $pdo, int $ticketId): ?array
    {
        $stmt = $pdo->prepare('SELECT * FROM tickets WHERE id = ? LIMIT 1');
        $stmt->execute([$ticketId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /**
     * 取得"仍然有效"的当前管理员 ID
     *
     * 不能只凭 $_SESSION['admin_id'] 判断：管理员账号被删除/清空后，
     * 旧会话里的 admin_id 依然存在，会继续拥有读全部工单、回复、关闭工单的权限，
     * 并把已不存在的管理员 ID 写进 handled_admin_id。
     *
     * @return int 有效管理员 ID，非管理员或已失效返回 0
     */
    private static function currentAdminId(PDO $pdo): int
    {
        if (empty($_SESSION['admin_id'])) {
            return 0;
        }
        $adminId = (int)$_SESSION['admin_id'];
        if ($adminId <= 0) {
            return 0;
        }
        if (!self::adminExists($pdo, $adminId)) {
            // 账号已不存在，清理会话残留，避免后续逻辑继续把它当管理员
            unset($_SESSION['admin_id'], $_SESSION['admin_name'], $_SESSION['admin_role']);
            return 0;
        }
        return $adminId;
    }

    private static function resolveActor(PDO $pdo, array $ticket): array
    {
        $isAdmin = self::currentAdminId($pdo) > 0;
        $isOwner = !empty($_SESSION['user_id']) && isset($ticket['user_id']) && (int)$_SESSION['user_id'] === (int)$ticket['user_id'];
        return [$isAdmin, $isOwner];
    }

    private static function orderBelongsToUser(PDO $pdo, int $orderId, int $userId): bool
    {
        $stmt = $pdo->prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?');
        $stmt->execute([$orderId, $userId]);
        return (bool)$stmt->fetchColumn();
    }

    private static function adminExists(PDO $pdo, int $adminId): bool
    {
        $stmt = $pdo->prepare('SELECT id FROM admins WHERE id = ?');
        $stmt->execute([$adminId]);
        return (bool)$stmt->fetchColumn();
    }
}