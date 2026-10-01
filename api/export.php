<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$pdo = getDB();

try {
    checkAdmin($pdo);

    $type = requestValue('type', '');

    match ($type) {
        'orders'  => handleExportOrders($pdo),
        'coupons' => handleExportCoupons($pdo),
        'tickets' => handleExportTickets($pdo),
        default   => jsonResponse(0, '未知导出类型，支持: orders, coupons, tickets'),
    };
} catch (Throwable $e) {
    logError($pdo, 'api.export', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

function handleExportOrders(PDO $pdo): void {
    $status = requestValue('status', '');
    $startDate = normalizeString(requestValue('start_date', ''));
    $endDate = normalizeString(requestValue('end_date', ''));
    $sql = "SELECT o.order_no, o.trade_no, u.username AS buyer, p.name AS product,
            o.original_price, o.coupon_code, o.coupon_discount, o.price AS paid_amount,
            o.status, o.created_at, o.paid_at, o.refund_at, o.cancelled_at
            FROM orders o LEFT JOIN users u ON o.user_id = u.id LEFT JOIN products p ON o.product_id = p.id WHERE 1=1";
    $params = [];
    if ($status !== '' && validateInt($status, 0, 3) !== null) { $sql .= ' AND o.status = ?'; $params[] = (int)$status; }
    if ($startDate !== '' && isValidDateTime($startDate)) { $sql .= ' AND o.created_at >= ?'; $params[] = $startDate . ' 00:00:00'; }
    if ($endDate !== '' && isValidDateTime($endDate)) { $sql .= ' AND o.created_at <= ?'; $params[] = $endDate . ' 23:59:59'; }
    $sql .= ' ORDER BY o.id DESC';
    $stmt = $pdo->prepare($sql); $stmt->execute($params);
    $statusMap = ['待支付', '已支付', '已退款', '已取消'];
    $rows = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $order) {
        $rows[] = [$order['order_no'], $order['trade_no'] ?: '-', $order['buyer'] ?: '-', $order['product'] ?: '-',
            $order['original_price'], $order['coupon_code'] ?: '-', $order['coupon_discount'] ?: '0', $order['paid_amount'],
            $statusMap[(int)$order['status']] ?? '未知', $order['created_at'], $order['paid_at'] ?: '-', $order['refund_at'] ?: '-', $order['cancelled_at'] ?: '-'];
    }
    logAudit($pdo, 'export.orders', ['count' => count($rows)]);
    outputCSV('orders_' . date('Ymd_His') . '.csv',
        ['订单号', '交易号', '买家', '商品', '原价', '优惠券', '优惠金额', '实付金额', '状态', '创建时间', '支付时间', '退款时间', '取消时间'], $rows);
}

function handleExportCoupons(PDO $pdo): void {
    $stmt = $pdo->query('SELECT code, name, type, value, min_amount, max_discount, max_uses, per_user_limit, used_count, starts_at, ends_at, status, created_at FROM coupons ORDER BY id DESC');
    $rows = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $coupon) {
        $rows[] = [$coupon['code'], $coupon['name'] ?: '-', $coupon['type'] === 'fixed' ? '固定金额' : '百分比', $coupon['value'],
            $coupon['min_amount'], $coupon['max_discount'] ?: '-', $coupon['max_uses'] ?: '不限', $coupon['per_user_limit'] ?: '不限',
            $coupon['used_count'], $coupon['starts_at'] ?: '-', $coupon['ends_at'] ?: '-', $coupon['status'] ? '启用' : '停用', $coupon['created_at']];
    }
    logAudit($pdo, 'export.coupons', ['count' => count($rows)]);
    outputCSV('coupons_' . date('Ymd_His') . '.csv',
        ['优惠码', '名称', '类型', '值', '最低消费', '最大优惠', '总次数限制', '每用户限制', '已使用', '开始时间', '结束时间', '状态', '创建时间'], $rows);
}

function handleExportTickets(PDO $pdo): void {
    $status = requestValue('status', '');
    $sql = "SELECT t.id, t.title, u.username AS user, t.status, t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM ticket_replies WHERE ticket_id = t.id) AS reply_count
            FROM tickets t LEFT JOIN users u ON t.user_id = u.id WHERE 1=1";
    $params = [];
    if ($status !== '' && validateInt($status, 0, 2) !== null) { $sql .= ' AND t.status = ?'; $params[] = (int)$status; }
    $sql .= ' ORDER BY t.id DESC';
    $stmt = $pdo->prepare($sql); $stmt->execute($params);
    $statusMap = ['待回复', '已回复', '已关闭'];
    $rows = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $ticket) {
        $rows[] = [$ticket['id'], $ticket['title'], $ticket['user'] ?: '-', $statusMap[(int)$ticket['status']] ?? '未知',
            $ticket['reply_count'], $ticket['created_at'], $ticket['updated_at']];
    }
    logAudit($pdo, 'export.tickets', ['count' => count($rows)]);
    outputCSV('tickets_' . date('Ymd_His') . '.csv',
        ['工单ID', '标题', '用户', '状态', '回复数', '创建时间', '更新时间'], $rows);
}

function outputCSV(string $filename, array $headers, array $rows): void {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    echo "\xEF\xBB\xBF";
    $output = fopen('php://output', 'w');
    fputcsv($output, $headers);
    foreach ($rows as $row) {
        fputcsv($output, $row);
    }
    fclose($output);
    exit;
}