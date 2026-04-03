<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';

$pdo = getDB();
checkAdmin($pdo);
$action = requestValue('action', 'summary');
function scalar(PDO $pdo, string $sql, $default = 0) {
    try {
        $value = $pdo->query($sql)->fetchColumn();
        return $value === false || $value === null ? $default : $value;
    } catch (Throwable $e) {
        return $default;
    }
}

try {
    switch ($action) {
        case 'summary':
        case 'overview':
            $today = date('Y-m-d');
            $monthStart = date('Y-m-01 00:00:00');
            $summary = [
                'today_income' => (float)scalar($pdo, "SELECT COALESCE(SUM(price),0) FROM orders WHERE status = 1 AND DATE(paid_at) = '{$today}'", 0),
                'month_income' => (float)scalar($pdo, "SELECT COALESCE(SUM(price),0) FROM orders WHERE status = 1 AND paid_at >= '{$monthStart}'", 0),
                'paid_orders' => (int)scalar($pdo, 'SELECT COUNT(*) FROM orders WHERE status = 1', 0),
                'refund_orders' => (int)scalar($pdo, 'SELECT COUNT(*) FROM orders WHERE status = 2', 0),
                'balance_paid_orders' => commerceColumnExists($pdo, 'orders', 'payment_method') ? (int)scalar($pdo, "SELECT COUNT(*) FROM orders WHERE status = 1 AND payment_method = 'balance'", 0) : 0,
                'epay_paid_orders' => commerceColumnExists($pdo, 'orders', 'payment_method') ? (int)scalar($pdo, "SELECT COUNT(*) FROM orders WHERE status = 1 AND payment_method = 'epay'", 0) : 0,
                'exception_orders' => commerceColumnExists($pdo, 'orders', 'delivery_status') ? (int)scalar($pdo, "SELECT COUNT(*) FROM orders WHERE delivery_status = 'exception'", 0) : 0,
                'ticket_total' => commerceTableExists($pdo, 'tickets') ? (int)scalar($pdo, 'SELECT COUNT(*) FROM tickets', 0) : 0,
                'ticket_pending' => commerceTableExists($pdo, 'tickets') ? (int)scalar($pdo, 'SELECT COUNT(*) FROM tickets WHERE status = 0', 0) : 0,
                'user_balance_total' => commerceColumnExists($pdo, 'users', 'credit_balance') ? (float)scalar($pdo, 'SELECT COALESCE(SUM(credit_balance),0) FROM users', 0) : 0,
                'credit_total_in' => commerceTableExists($pdo, 'credit_transactions') ? (float)scalar($pdo, "SELECT COALESCE(SUM(amount),0) FROM credit_transactions WHERE amount > 0", 0) : 0,
                'credit_total_out' => commerceTableExists($pdo, 'credit_transactions') ? (float)scalar($pdo, "SELECT COALESCE(SUM(ABS(amount)),0) FROM credit_transactions WHERE amount < 0", 0) : 0,
                'products_total' => (int)scalar($pdo, 'SELECT COUNT(*) FROM products', 0),
                'users_total' => (int)scalar($pdo, 'SELECT COUNT(*) FROM users', 0),
            ];
            jsonResponse(1, '', $summary);
            break;

        case 'trends':
            $days = validateInt(requestValue('days', 7), 1, 90) ?? 7;
            $rows = [];
            $stmt = $pdo->prepare("SELECT DATE(created_at) AS date,
                    COUNT(*) AS order_count,
                    SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS paid_count,
                    SUM(CASE WHEN status = 1 THEN price ELSE 0 END) AS income
                FROM orders
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                GROUP BY DATE(created_at)
                ORDER BY DATE(created_at) ASC");
            $stmt->execute([$days]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            jsonResponse(1, '', $rows);
            break;

        case 'hot_products':
            $limit = validateInt(requestValue('limit', 10), 1, 50) ?? 10;
            $stmt = $pdo->prepare("SELECT p.id, p.name,
                    COUNT(o.id) AS order_count,
                    SUM(CASE WHEN o.status = 1 THEN 1 ELSE 0 END) AS paid_count,
                    SUM(CASE WHEN o.status = 1 THEN o.price ELSE 0 END) AS income
                FROM products p
                LEFT JOIN orders o ON o.product_id = p.id
                GROUP BY p.id, p.name
                ORDER BY paid_count DESC, income DESC, order_count DESC
                LIMIT ?");
            $stmt->execute([$limit]);
            jsonResponse(1, '', $stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'ticket_summary':
            $data = [
                'total' => commerceTableExists($pdo, 'tickets') ? (int)scalar($pdo, 'SELECT COUNT(*) FROM tickets', 0) : 0,
                'pending' => commerceTableExists($pdo, 'tickets') ? (int)scalar($pdo, 'SELECT COUNT(*) FROM tickets WHERE status = 0', 0) : 0,
                'replied' => commerceTableExists($pdo, 'tickets') ? (int)scalar($pdo, 'SELECT COUNT(*) FROM tickets WHERE status = 1', 0) : 0,
                'closed' => commerceTableExists($pdo, 'tickets') ? (int)scalar($pdo, 'SELECT COUNT(*) FROM tickets WHERE status = 2', 0) : 0,
                'category_breakdown' => [],
            ];
            if (commerceTableExists($pdo, 'tickets') && commerceColumnExists($pdo, 'tickets', 'category')) {
                $stmt = $pdo->query('SELECT category, COUNT(*) AS total FROM tickets GROUP BY category ORDER BY total DESC');
                $data['category_breakdown'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
            jsonResponse(1, '', $data);
            break;

        case 'recent':
            $limit = validateInt(requestValue('limit', 10), 1, 50) ?? 10;
            $orders = $pdo->query('SELECT order_no, status, delivery_status, price, created_at FROM orders ORDER BY id DESC LIMIT ' . (int)$limit)->fetchAll(PDO::FETCH_ASSOC);
            $tickets = commerceTableExists($pdo, 'tickets') ? $pdo->query('SELECT id, title, status, category, updated_at FROM tickets ORDER BY id DESC LIMIT ' . (int)$limit)->fetchAll(PDO::FETCH_ASSOC) : [];
            $credits = commerceTableExists($pdo, 'credit_transactions') ? $pdo->query('SELECT id, user_id, type, amount, created_at FROM credit_transactions ORDER BY id DESC LIMIT ' . (int)$limit)->fetchAll(PDO::FETCH_ASSOC) : [];
            jsonResponse(1, '', [
                'orders' => $orders,
                'tickets' => $tickets,
                'credits' => $credits,
            ]);
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.dashboard', $e->getMessage());
    jsonResponse(0, '服务器错误');
}
