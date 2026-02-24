<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$action = requestValue('action', '');
$pdo = getDB();

function tableExists(PDO $pdo, string $table): bool {
    static $cache = [];
    if (isset($cache[$table])) {
        return $cache[$table];
    }
    try {
        $stmt = $pdo->prepare('SHOW TABLES LIKE ?');
        $stmt->execute([$table]);
        $cache[$table] = (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        $cache[$table] = false;
    }
    return $cache[$table];
}

try {
    checkAdmin($pdo);

    switch ($action) {
        case 'overview':
            $today = date('Y-m-d');
            $thisMonth = date('Y-m-01');
            $lastMonth = date('Y-m-01', strtotime('-1 month'));
            $lastMonthEnd = date('Y-m-t', strtotime('-1 month'));

            $stats = [
                'today_orders' => (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE DATE(created_at) = '$today'")->fetchColumn(),
                'today_paid' => (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE DATE(paid_at) = '$today' AND status = 1")->fetchColumn(),
                'today_income' => (float)$pdo->query("SELECT COALESCE(SUM(price), 0) FROM orders WHERE DATE(paid_at) = '$today' AND status = 1")->fetchColumn(),
                'month_orders' => (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE created_at >= '$thisMonth'")->fetchColumn(),
                'month_paid' => (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE paid_at >= '$thisMonth' AND status = 1")->fetchColumn(),
                'month_income' => (float)$pdo->query("SELECT COALESCE(SUM(price), 0) FROM orders WHERE paid_at >= '$thisMonth' AND status = 1")->fetchColumn(),
                'last_month_income' => (float)$pdo->query("SELECT COALESCE(SUM(price), 0) FROM orders WHERE paid_at >= '$lastMonth' AND paid_at <= '$lastMonthEnd 23:59:59' AND status = 1")->fetchColumn(),
                'total_orders' => (int)$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn(),
                'total_paid' => (int)$pdo->query('SELECT COUNT(*) FROM orders WHERE status = 1')->fetchColumn(),
                'total_income' => (float)$pdo->query('SELECT COALESCE(SUM(price), 0) FROM orders WHERE status = 1')->fetchColumn(),
                'total_refunded' => (float)$pdo->query('SELECT COALESCE(SUM(refund_amount), 0) FROM orders WHERE status = 2')->fetchColumn(),
                'products_total' => (int)$pdo->query('SELECT COUNT(*) FROM products')->fetchColumn(),
                'products_available' => (int)$pdo->query('SELECT COUNT(*) FROM products WHERE status = 1')->fetchColumn(),
                'products_sold' => (int)$pdo->query('SELECT COUNT(*) FROM products WHERE status = 0')->fetchColumn(),
                'users_total' => (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),
                'users_today' => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE DATE(created_at) = '$today'")->fetchColumn(),
                'users_month' => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE created_at >= '$thisMonth'")->fetchColumn()
            ];

            $stats['conversion_rate'] = $stats['total_orders'] > 0 ? round($stats['total_paid'] / $stats['total_orders'] * 100, 1) : 0;
            $stats['month_growth'] = $stats['last_month_income'] > 0 ? round(($stats['month_income'] - $stats['last_month_income']) / $stats['last_month_income'] * 100, 1) : 0;
            $stats['avg_order_value'] = $stats['total_paid'] > 0 ? round($stats['total_income'] / $stats['total_paid'], 2) : 0;

            if (tableExists($pdo, 'tickets')) {
                $stats['tickets_pending'] = (int)$pdo->query('SELECT COUNT(*) FROM tickets WHERE status = 0')->fetchColumn();
                $stats['tickets_total'] = (int)$pdo->query('SELECT COUNT(*) FROM tickets')->fetchColumn();
            }

            if (tableExists($pdo, 'coupons')) {
                $stats['coupons_active'] = (int)$pdo->query('SELECT COUNT(*) FROM coupons WHERE status = 1')->fetchColumn();
                $stats['coupons_used'] = (int)$pdo->query('SELECT COALESCE(SUM(used_count), 0) FROM coupons')->fetchColumn();
                $stats['coupon_discount_total'] = (float)$pdo->query('SELECT COALESCE(SUM(coupon_discount), 0) FROM orders WHERE status = 1 AND coupon_id IS NOT NULL')->fetchColumn();
            }

            jsonResponse(1, '', $stats);
            break;

        case 'trend':
            $days = validateInt(requestValue('days', 30), 7, 90) ?? 30;
            $startDate = date('Y-m-d', strtotime("-{$days} days"));

            $sql = "SELECT DATE(created_at) as date, COUNT(*) as orders,
                    SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as paid,
                    SUM(CASE WHEN status = 1 THEN price ELSE 0 END) as income
                    FROM orders
                    WHERE created_at >= '$startDate'
                    GROUP BY DATE(created_at)
                    ORDER BY date ASC";
            $orderTrend = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

            $sql = "SELECT DATE(created_at) as date, COUNT(*) as users
                    FROM users
                    WHERE created_at >= '$startDate'
                    GROUP BY DATE(created_at)
                    ORDER BY date ASC";
            $userTrend = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

            $dateMap = [];
            foreach ($orderTrend as $row) {
                $dateMap[$row['date']] = [
                    'date' => $row['date'],
                    'orders' => (int)$row['orders'],
                    'paid' => (int)$row['paid'],
                    'income' => (float)$row['income'],
                    'users' => 0
                ];
            }
            foreach ($userTrend as $row) {
                if (isset($dateMap[$row['date']])) {
                    $dateMap[$row['date']]['users'] = (int)$row['users'];
                } else {
                    $dateMap[$row['date']] = [
                        'date' => $row['date'],
                        'orders' => 0,
                        'paid' => 0,
                        'income' => 0,
                        'users' => (int)$row['users']
                    ];
                }
            }

            for ($i = $days; $i >= 0; $i--) {
                $date = date('Y-m-d', strtotime("-{$i} days"));
                if (!isset($dateMap[$date])) {
                    $dateMap[$date] = [
                        'date' => $date,
                        'orders' => 0,
                        'paid' => 0,
                        'income' => 0,
                        'users' => 0
                    ];
                }
            }
            ksort($dateMap);
            jsonResponse(1, '', array_values($dateMap));
            break;

        case 'products_rank':
            $limit = validateInt(requestValue('limit', 10), 5, 20) ?? 10;
            $sql = "SELECT p.id, p.name, p.price, COUNT(o.id) as sales,
                    SUM(CASE WHEN o.status = 1 THEN o.price ELSE 0 END) as revenue
                    FROM products p
                    LEFT JOIN orders o ON p.id = o.product_id AND o.status = 1
                    GROUP BY p.id
                    ORDER BY sales DESC, revenue DESC
                    LIMIT {$limit}";
            $products = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
            jsonResponse(1, '', $products);
            break;

        case 'payment_stats':
            $stats = [
                'pending' => (int)$pdo->query('SELECT COUNT(*) FROM orders WHERE status = 0')->fetchColumn(),
                'paid' => (int)$pdo->query('SELECT COUNT(*) FROM orders WHERE status = 1')->fetchColumn(),
                'refunded' => (int)$pdo->query('SELECT COUNT(*) FROM orders WHERE status = 2')->fetchColumn(),
                'cancelled' => (int)$pdo->query('SELECT COUNT(*) FROM orders WHERE status = 3')->fetchColumn()
            ];
            $stats['total'] = array_sum($stats);
            $stats['success_rate'] = $stats['total'] > 0 ? round($stats['paid'] / $stats['total'] * 100, 1) : 0;
            $avgPayTime = $pdo->query('SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, paid_at)) FROM orders WHERE status = 1 AND paid_at IS NOT NULL')->fetchColumn();
            $stats['avg_pay_minutes'] = $avgPayTime ? round($avgPayTime, 1) : 0;
            jsonResponse(1, '', $stats);
            break;

        case 'coupon_stats':
            if (!tableExists($pdo, 'coupons')) {
                jsonResponse(1, '', []);
            }
            $sql = "SELECT c.id, c.code, c.name, c.type, c.value, c.used_count, c.max_uses,
                    COALESCE(SUM(CASE WHEN o.status = 1 THEN o.coupon_discount ELSE 0 END), 0) as total_discount,
                    COUNT(DISTINCT CASE WHEN o.status = 1 THEN o.id END) as success_uses
                    FROM coupons c
                    LEFT JOIN orders o ON c.id = o.coupon_id
                    GROUP BY c.id
                    ORDER BY c.used_count DESC
                    LIMIT 20";
            $coupons = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
            $summary = [
                'total_coupons' => (int)$pdo->query('SELECT COUNT(*) FROM coupons')->fetchColumn(),
                'active_coupons' => (int)$pdo->query('SELECT COUNT(*) FROM coupons WHERE status = 1')->fetchColumn(),
                'total_uses' => (int)$pdo->query('SELECT SUM(used_count) FROM coupons')->fetchColumn(),
                'total_discount' => (float)$pdo->query('SELECT COALESCE(SUM(coupon_discount), 0) FROM orders WHERE status = 1 AND coupon_id IS NOT NULL')->fetchColumn(),
                'usage_rate' => 0
            ];
            $ordersWithCoupon = (int)$pdo->query('SELECT COUNT(*) FROM orders WHERE status = 1 AND coupon_id IS NOT NULL')->fetchColumn();
            $totalPaidOrders = (int)$pdo->query('SELECT COUNT(*) FROM orders WHERE status = 1')->fetchColumn();
            $summary['usage_rate'] = $totalPaidOrders > 0 ? round($ordersWithCoupon / $totalPaidOrders * 100, 1) : 0;
            jsonResponse(1, '', [
                'summary' => $summary,
                'list' => $coupons
            ]);
            break;

        case 'user_stats':
            $today = date('Y-m-d');
            $thisMonth = date('Y-m-01');
            $stats = [
                'total' => (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),
                'today' => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE DATE(created_at) = '$today'")->fetchColumn(),
                'this_month' => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE created_at >= '$thisMonth'")->fetchColumn(),
                'with_orders' => (int)$pdo->query('SELECT COUNT(DISTINCT user_id) FROM orders WHERE status = 1')->fetchColumn(),
                'oauth_users' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE linuxdo_id IS NOT NULL')->fetchColumn()
            ];
            $sql = "SELECT u.id, u.username, COUNT(o.id) as order_count,
                    COALESCE(SUM(CASE WHEN o.status = 1 THEN o.price ELSE 0 END), 0) as total_spent
                    FROM users u
                    LEFT JOIN orders o ON u.id = o.user_id
                    GROUP BY u.id
                    HAVING total_spent > 0
                    ORDER BY total_spent DESC
                    LIMIT 10";
            $topUsers = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
            jsonResponse(1, '', [
                'summary' => $stats,
                'top_users' => $topUsers
            ]);
            break;

        case 'recent_activity':
            $limit = validateInt(requestValue('limit', 20), 10, 50) ?? 20;
            $activities = [];

            $sql = "SELECT 'order' as type, o.order_no as id, o.status, o.price as amount, o.created_at, u.username
                    FROM orders o LEFT JOIN users u ON o.user_id = u.id
                    ORDER BY o.id DESC LIMIT " . (int)floor($limit / 2);
            $orders = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
            $orderStatusText = ['待支付', '已支付', '已退款', '已取消'];
            foreach ($orders as $order) {
                $statusText = $orderStatusText[(int)$order['status']] ?? '未知';
                $activities[] = [
                    'type' => 'order',
                    'icon' => (int)$order['status'] === 1 ? '💰' : ((int)$order['status'] === 0 ? '🕒' : '📦'),
                    'title' => "订单 {$order['id']}",
                    'desc' => "{$order['username']} - ￥{$order['amount']} - {$statusText}",
                    'time' => $order['created_at']
                ];
            }

            if (tableExists($pdo, 'tickets')) {
                $sql = "SELECT t.id, t.title, t.status, t.created_at, u.username
                        FROM tickets t LEFT JOIN users u ON t.user_id = u.id
                        ORDER BY t.id DESC LIMIT " . (int)floor($limit / 4);
                $tickets = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
                $ticketStatusText = ['待回复', '已回复', '已关闭'];
                foreach ($tickets as $ticket) {
                    $statusText = $ticketStatusText[(int)$ticket['status']] ?? '未知';
                    $activities[] = [
                        'type' => 'ticket',
                        'icon' => (int)$ticket['status'] === 0 ? '🎫' : ((int)$ticket['status'] === 2 ? '✅' : '💬'),
                        'title' => "工单 #{$ticket['id']}",
                        'desc' => "{$ticket['username']} - {$ticket['title']} - {$statusText}",
                        'time' => $ticket['created_at']
                    ];
                }
            }

            $sql = "SELECT id, username, created_at FROM users ORDER BY id DESC LIMIT " . (int)floor($limit / 4);
            $users = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
            foreach ($users as $user) {
                $activities[] = [
                    'type' => 'user',
                    'icon' => '👤',
                    'title' => '新用户注册',
                    'desc' => $user['username'],
                    'time' => $user['created_at']
                ];
            }

            usort($activities, fn($a, $b) => strtotime($b['time']) - strtotime($a['time']));
            $activities = array_slice($activities, 0, $limit);
            jsonResponse(1, '', $activities);
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.dashboard', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

