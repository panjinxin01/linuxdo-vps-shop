<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/coupons.php';
require_once __DIR__ . '/../includes/notifications.php';

$action = requestValue('action', '');
$pdo = getDB();

$csrfActions = ['create', 'refund', 'delete', 'batch_delete', 'update_note', 'mark_delivered', 'update_delivery_info'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function tableExists(PDO $pdo, string $table): bool {
    return securityTableExists($pdo, $table);
}

function ordersHasCouponColumns(PDO $pdo): bool {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    try {
        $need = ['original_price', 'coupon_id', 'coupon_code', 'coupon_discount'];
        foreach ($need as $col) {
            $stmt = $pdo->prepare('SHOW COLUMNS FROM `orders` LIKE ?');
            $stmt->execute([$col]);
            if (!$stmt->fetchColumn()) {
                $cached = false;
                return $cached;
            }
        }
        $cached = true;
    } catch (Throwable $e) {
        $cached = false;
    }
    return $cached;
}

function ordersHasColumn(PDO $pdo, string $column): bool {
    static $cache = [];
    if (array_key_exists($column, $cache)) {
        return $cache[$column];
    }
    try {
        $stmt = $pdo->prepare('SHOW COLUMNS FROM `orders` LIKE ?');
        $stmt->execute([$column]);
        $cache[$column] = (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        $cache[$column] = false;
    }
    return $cache[$column];
}

function supportsCoupons(PDO $pdo): bool {
    return ordersHasCouponColumns($pdo) && tableExists($pdo, 'coupons') && tableExists($pdo, 'coupon_usages');
}

function autoCancelExpiredOrders(PDO $pdo): void {
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->query('SELECT order_no, product_id FROM orders WHERE status = 0 AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE) ORDER BY id ASC LIMIT 200 FOR UPDATE');
        $expired = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$expired) {
            $pdo->commit();
            return;
        }

        $orderNos = [];
        $productIds = [];
        foreach ($expired as $row) {
            $orderNos[] = $row['order_no'];
            $productIds[] = (int)$row['product_id'];
        }

        $place = implode(',', array_fill(0, count($orderNos), '?'));
        $updateSql = 'UPDATE orders SET status = 3';
        if (ordersHasColumn($pdo, 'cancel_reason')) {
            $updateSql .= ", cancel_reason = 'timeout'";
        }
        if (ordersHasColumn($pdo, 'cancelled_at')) {
            $updateSql .= ', cancelled_at = NOW()';
        }
        $updateSql .= " WHERE status = 0 AND order_no IN ($place)";
        $stmt = $pdo->prepare($updateSql);
        $stmt->execute($orderNos);

        if (!empty($productIds)) {
            $idList = implode(',', array_map('intval', $productIds));
            $pdo->exec("UPDATE products SET status = 1 WHERE id IN ($idList)");
        }

        foreach ($orderNos as $no) {
            releaseCouponByOrder($pdo, $no);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        logError($pdo, 'orders.autocancel', $e->getMessage());
    }
}

autoCancelExpiredOrders($pdo);

try {
    switch ($action) {
        case 'create':
            checkUser();
            $productId = validateInt(requestValue('product_id', null), 1);
            $couponCode = normalizeString(requestValue('coupon_code', ''));

            if (!$productId) {
                jsonResponse(0, '商品参数不正确');
            }

            $useCoupons = $couponCode !== '';
            $hasCoupons = supportsCoupons($pdo);
            if ($useCoupons && !$hasCoupons) {
                jsonResponse(0, '数据库未升级，无法使用优惠券（后台执行数据库更新后再试）');
            }

            try {
                $pdo->beginTransaction();

                $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ? AND status = 1 FOR UPDATE');
                $stmt->execute([$productId]);
                $product = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$product) {
                    $pdo->rollBack();
                    jsonResponse(0, '商品不存在或已售出');
                }

                $originalPrice = (float)$product['price'];
                $finalPrice = $originalPrice;
                $couponId = null;
                $couponDiscount = 0.0;
                $normalizedCode = null;

                if ($useCoupons) {
                    $res = validateCouponForAmount($pdo, $couponCode, (int)$_SESSION['user_id'], $originalPrice, true);
                    if (!$res['ok']) {
                        $pdo->rollBack();
                        jsonResponse(0, $res['msg'] ?? '优惠券不可用');
                    }
                    $coupon = $res['coupon'];
                    $couponId = (int)$coupon['id'];
                    $couponDiscount = (float)$res['discount'];
                    $finalPrice = (float)$res['final'];
                    $normalizedCode = $res['code'];
                }

                $orderNo = 'VPS' . date('YmdHis') . bin2hex(random_bytes(4));

                if (ordersHasCouponColumns($pdo)) {
                    $stmt = $pdo->prepare('INSERT INTO orders (order_no, user_id, product_id, original_price, coupon_id, coupon_code, coupon_discount, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                    $stmt->execute([
                        $orderNo,
                        (int)$_SESSION['user_id'],
                        $productId,
                        round($originalPrice, 2),
                        $couponId,
                        $normalizedCode,
                        round($couponDiscount, 2),
                        round($finalPrice, 2)
                    ]);
                } else {
                    $stmt = $pdo->prepare('INSERT INTO orders (order_no, user_id, product_id, price) VALUES (?, ?, ?, ?)');
                    $stmt->execute([$orderNo, (int)$_SESSION['user_id'], $productId, round($finalPrice, 2)]);
                }

                $pdo->prepare('UPDATE products SET status = 0 WHERE id = ?')->execute([$productId]);

                if ($useCoupons && $hasCoupons) {
                    $reserved = reserveCouponUsage($pdo, $couponId, (int)$_SESSION['user_id'], $orderNo);
                    if (!$reserved) {
                        $pdo->rollBack();
                        jsonResponse(0, '优惠券占用失败');
                    }
                }

                $pdo->commit();

                jsonResponse(1, '订单创建成功', [
                    'order_no' => $orderNo,
                    'price' => round($finalPrice, 2),
                    'original_price' => round($originalPrice, 2),
                    'coupon_discount' => round($couponDiscount, 2),
                    'coupon_code' => $normalizedCode,
                    'product_name' => $product['name']
                ]);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                logError($pdo, 'orders.create', $e->getMessage(), [
                    'user_id' => $_SESSION['user_id'] ?? null,
                    'product_id' => $productId
                ]);
                jsonResponse(0, '创建订单失败');
            }
            break;

        case 'my':
            checkUser();
            $page = validateInt(requestValue('page', 1), 1) ?? 1;
            $pageSize = validateInt(requestValue('page_size', 5), 1, 50) ?? 5;
            $offset = ($page - 1) * $pageSize;

            $stmt = $pdo->prepare('SELECT COUNT(*) FROM orders WHERE user_id = ?');
            $stmt->execute([(int)$_SESSION['user_id']]);
            $total = (int)$stmt->fetchColumn();

            $sql = "SELECT o.*, p.name as product_name, p.cpu, p.memory, p.disk, p.bandwidth, p.ip_address, p.ssh_port, p.ssh_user, p.ssh_password, p.extra_info
                FROM orders o LEFT JOIN products p ON o.product_id = p.id
                WHERE o.user_id = ? ORDER BY o.id DESC LIMIT {$pageSize} OFFSET {$offset}";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([(int)$_SESSION['user_id']]);
            $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($orders as &$order) {
                if (isset($order['ssh_password'])) {
                    $order['ssh_password'] = decryptSensitive($order['ssh_password']);
                }
                if ((int)$order['status'] !== 1) {
                    unset($order['ip_address'], $order['ssh_port'], $order['ssh_user'], $order['ssh_password'], $order['extra_info']);
                }
            }
            unset($order);

            jsonResponse(1, '', [
                'list' => $orders,
                'total' => $total,
                'page' => $page,
                'page_size' => $pageSize,
                'total_pages' => $pageSize > 0 ? ceil($total / $pageSize) : 0
            ]);
            break;

        case 'query':
            checkUser();
            $orderNo = normalizeString(requestValue('order_no', ''));
            if ($orderNo === '') {
                jsonResponse(0, '请输入订单号');
            }

            $stmt = $pdo->prepare("SELECT o.*, p.name as product_name, p.cpu, p.memory, p.disk, p.bandwidth,
                p.ip_address, p.ssh_port, p.ssh_user, p.ssh_password, p.extra_info
                FROM orders o LEFT JOIN products p ON o.product_id = p.id
                WHERE o.order_no = ? AND o.user_id = ?");
            $stmt->execute([$orderNo, (int)$_SESSION['user_id']]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '订单不存在');
            }
            if (isset($order['ssh_password'])) {
                $order['ssh_password'] = decryptSensitive($order['ssh_password']);
            }
            if ((int)$order['status'] !== 1) {
                unset($order['ip_address'], $order['ssh_port'], $order['ssh_user'], $order['ssh_password'], $order['extra_info']);
            }
            jsonResponse(1, '', $order);
            break;

        case 'all':
            checkAdmin($pdo);
            $page = validateInt(requestValue('page', 1), 1) ?? 1;
            $pageSize = validateInt(requestValue('page_size', 20), 1, 100) ?? 20;
            $offset = ($page - 1) * $pageSize;
            $total = (int)$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn();

            $sql = "SELECT o.*, p.name as product_name, u.username as buyer_name FROM orders o
                LEFT JOIN products p ON o.product_id = p.id
                LEFT JOIN users u ON o.user_id = u.id
                ORDER BY o.id DESC LIMIT {$pageSize} OFFSET {$offset}";
            $orders = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

            jsonResponse(1, '', [
                'list' => $orders,
                'total' => $total,
                'page' => $page,
                'page_size' => $pageSize,
                'total_pages' => $pageSize > 0 ? ceil($total / $pageSize) : 0
            ]);
            break;

        case 'list':
            checkAdmin($pdo);
            $limit = validateInt(requestValue('limit', 5), 1, 20) ?? 5;
            $stmt = $pdo->prepare('SELECT o.id, o.order_no, o.status, o.created_at, p.name as product_name FROM orders o LEFT JOIN products p ON o.product_id = p.id ORDER BY o.id DESC LIMIT ?');
            $stmt->bindValue(1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $statusMap = [
                0 => 'pending',
                1 => 'paid',
                2 => 'refunded',
                3 => 'cancelled'
            ];
            $list = array_map(function (array $row) use ($statusMap) {
                $code = (int)($row['status'] ?? 0);
                return [
                    'id' => (int)$row['id'],
                    'order_no' => $row['order_no'],
                    'product_name' => $row['product_name'],
                    'created_at' => $row['created_at'],
                    'status' => $statusMap[$code] ?? 'unknown'
                ];
            }, $rows);
            jsonResponse(1, '', $list);
            break;

        case 'stats':
            checkAdmin($pdo);
            $stats = [
                'products' => (int)$pdo->query('SELECT COUNT(*) FROM products')->fetchColumn(),
                'pending' => (int)$pdo->query('SELECT COUNT(*) FROM orders WHERE status = 0')->fetchColumn(),
                'paid' => (int)$pdo->query('SELECT COUNT(*) FROM orders WHERE status = 1')->fetchColumn(),
                'refunded' => (int)$pdo->query('SELECT COUNT(*) FROM orders WHERE status = 2')->fetchColumn(),
                'income' => (float)$pdo->query('SELECT COALESCE(SUM(price), 0) FROM orders WHERE status = 1')->fetchColumn(),
                'users' => (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn()
            ];
            jsonResponse(1, '', $stats);
            break;

        case 'refund':
            checkAdmin($pdo);
            $orderNo = normalizeString(requestValue('order_no', ''));
            if ($orderNo === '') {
                jsonResponse(0, '订单号不能为空');
            }

            $stmt = $pdo->prepare('SELECT * FROM orders WHERE order_no = ?');
            $stmt->execute([$orderNo]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '订单不存在');
            }
            if ((int)$order['status'] !== 1) {
                jsonResponse(0, '只能退款已支付的订单');
            }
            if (empty($order['trade_no'])) {
                jsonResponse(0, '订单缺少平台交易号，无法退款');
            }

            $stmt = $pdo->query("SELECT key_name, key_value FROM settings WHERE key_name IN ('epay_pid', 'epay_key')");
            $settings = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $settings[$row['key_name']] = $row['key_value'];
            }
            if (empty($settings['epay_pid']) || empty($settings['epay_key'])) {
                jsonResponse(0, '支付配置不完整');
            }

            $refundData = [
                'pid' => $settings['epay_pid'],
                'key' => $settings['epay_key'],
                'trade_no' => $order['trade_no'],
                'money' => $order['price'],
                'out_trade_no' => $order['order_no']
            ];

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, 'https://credit.linux.do/epay/api.php');
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($refundData));
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);

            $response = curl_exec($ch);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($curlError) {
                jsonResponse(0, '请求退款接口失败: ' . $curlError);
            }
            $result = json_decode((string)$response, true);
            if ($result && ((int)($result['code'] ?? 0)) === 1) {
                try {
                    $pdo->beginTransaction();
                    releaseCouponByOrder($pdo, $orderNo);

                    $updateParts = ['status = 2'];
                    $params = [];
                    if (ordersHasColumn($pdo, 'refund_reason')) {
                        $updateParts[] = 'refund_reason = ?';
                        $params[] = 'admin_refund';
                    }
                    if (ordersHasColumn($pdo, 'refund_trade_no')) {
                        $updateParts[] = 'refund_trade_no = ?';
                        $params[] = $result['trade_no'] ?? null;
                    }
                    if (ordersHasColumn($pdo, 'refund_amount')) {
                        $updateParts[] = 'refund_amount = ?';
                        $params[] = (float)$order['price'];
                    }
                    if (ordersHasColumn($pdo, 'refund_at')) {
                        $updateParts[] = 'refund_at = NOW()';
                    }
                    $params[] = $orderNo;
                    $sql = 'UPDATE orders SET ' . implode(', ', $updateParts) . ' WHERE order_no = ? AND status = 1';
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params);

                    $stmt = $pdo->prepare('UPDATE products SET status = 1 WHERE id = ?');
                    $stmt->execute([(int)$order['product_id']]);
                    $pdo->commit();
                } catch (Throwable $e) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    logError($pdo, 'orders.refund', $e->getMessage(), ['order_no' => $orderNo]);
                    jsonResponse(0, '退款成功但本地更新失败，请手动检查');
                }
                logAudit($pdo, 'order.refund', ['amount' => (float)$order['price']], $orderNo);
                
                // 发送退款通知
                try {
                    $stmt = $pdo->prepare('SELECT name FROM products WHERE id = ?');
                    $stmt->execute([(int)$order['product_id']]);
                    $productName = $stmt->fetchColumn() ?: '商品';
                    $content = "您的订单 {$orderNo} 已退款，商品：{$productName}，退款金额：{$order['price']} 积分。款项已原路返回。";
                    createNotification($pdo, (int)$order['user_id'], 'order_refund', '订单已退款', $content, $orderNo);
                } catch (Throwable $e) {
                    // ignore
                }
                
                jsonResponse(1, '退款成功');
            }
            $errMsg = $result['msg'] ?? '退款失败，请稍后重试';
            jsonResponse(0, $errMsg);
            break;

        case 'delete':
            checkAdmin($pdo);
            $orderNo = normalizeString(requestValue('order_no', ''));
            if ($orderNo === '') {
                jsonResponse(0, '订单号不能为空');
            }
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE order_no = ?');
            $stmt->execute([$orderNo]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '订单不存在');
            }
            if ((int)$order['status'] === 1 && !empty($order['trade_no'])) {
                jsonResponse(0, '已支付订单请先退款再删除');
            }
            try {
                $pdo->beginTransaction();
                releaseCouponByOrder($pdo, $orderNo);
                $stmt = $pdo->prepare('DELETE FROM orders WHERE order_no = ?');
                $stmt->execute([$orderNo]);
                if ((int)$order['status'] === 0) {
                    $stmt = $pdo->prepare('UPDATE products SET status = 1 WHERE id = ?');
                    $stmt->execute([(int)$order['product_id']]);
                }
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                logError($pdo, 'orders.delete', $e->getMessage(), ['order_no' => $orderNo]);
                jsonResponse(0, '删除失败');
            }
            logAudit($pdo, 'order.delete', [], $orderNo);
            jsonResponse(1, '订单已删除');
            break;

        case 'batch_delete':
            checkAdmin($pdo);
            $type = normalizeString(requestValue('type', 'expired'));
            
            // 先查询并发送通知，再删除
            try {
                $reasonMap = ['expired' => '超时自动取消', 'refunded' => '订单已退款', 'pending' => '手动清理待支付'];
                $reason = $reasonMap[$type] ?? '订单已取消';
                $statusCode = $type === 'expired' ? 3 : ($type === 'refunded' ? 2 : 0);
                
                $stmt = $pdo->query("SELECT order_no, user_id FROM orders WHERE status = {$statusCode}");
                $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                foreach ($orders as $ord) {
                    $content = "您的订单 {$ord['order_no']} 已{$reason}，如有疑问请联系客服。";
                    createNotification($pdo, (int)$ord['user_id'], 'order_cancelled', '订单状态变更', $content, $ord['order_no']);
                }
            } catch (Throwable $e) {
                // ignore
            }
            
            if ($type === 'expired') {
                $stmt = $pdo->query('SELECT order_no FROM orders WHERE status = 3');
                $nos = $stmt->fetchAll(PDO::FETCH_COLUMN);
                foreach ($nos as $no) {
                    releaseCouponByOrder($pdo, $no);
                }
                $pdo->exec('DELETE FROM orders WHERE status = 3');
            } elseif ($type === 'refunded') {
                $stmt = $pdo->query('SELECT order_no FROM orders WHERE status = 2');
                $nos = $stmt->fetchAll(PDO::FETCH_COLUMN);
                foreach ($nos as $no) {
                    releaseCouponByOrder($pdo, $no);
                }
                $pdo->exec('DELETE FROM orders WHERE status = 2');
            } elseif ($type === 'pending') {
                $stmt = $pdo->query('SELECT order_no, product_id FROM orders WHERE status = 0');
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $productIds = [];
                foreach ($rows as $row) {
                    $productIds[] = (int)$row['product_id'];
                    releaseCouponByOrder($pdo, $row['order_no']);
                }
                if (!empty($productIds)) {
                    $pdo->exec('UPDATE products SET status = 1 WHERE id IN (' . implode(',', array_map('intval', $productIds)) . ')');
                }
                $pdo->exec('DELETE FROM orders WHERE status = 0');
            }
            
            logAudit($pdo, 'order.batch_delete', ['type' => $type]);
            jsonResponse(1, '批量删除完成');
            break;

        case 'update_note':
            checkAdmin($pdo);
            $orderNo = normalizeString(requestValue('order_no', ''));
            $adminNote = normalizeString(requestValue('admin_note', ''));
            if ($orderNo === '') {
                jsonResponse(0, '订单号不能为空');
            }
            if (!ordersHasColumn($pdo, 'admin_note')) {
                jsonResponse(0, '数据库未升级，请先执行数据库更新');
            }
            $stmt = $pdo->prepare('UPDATE orders SET admin_note = ? WHERE order_no = ?');
            $stmt->execute([$adminNote, $orderNo]);
            if ($stmt->rowCount() === 0) {
                jsonResponse(0, '订单不存在');
            }
            logAudit($pdo, 'order.update_note', ['note_length' => mb_strlen($adminNote, 'UTF-8')], $orderNo);
            jsonResponse(1, '备注已更新');
            break;

        case 'mark_delivered':
            checkAdmin($pdo);
            $orderNo = normalizeString(requestValue('order_no', ''));
            if ($orderNo === '') {
                jsonResponse(0, '订单号不能为空');
            }
            if (!ordersHasColumn($pdo, 'delivered_at')) {
                jsonResponse(0, '数据库未升级，请先执行数据库更新');
            }
            $stmt = $pdo->prepare('SELECT status, delivered_at FROM orders WHERE order_no = ?');
            $stmt->execute([$orderNo]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '订单不存在');
            }
            if ((int)$order['status'] !== 1) {
                jsonResponse(0, '只能标记已支付订单为已交付');
            }
            if (!empty($order['delivered_at'])) {
                jsonResponse(0, '订单已标记为交付，无需重复操作');
            }
            $stmt = $pdo->prepare('UPDATE orders SET delivered_at = NOW() WHERE order_no = ?');
            $stmt->execute([$orderNo]);
            logAudit($pdo, 'order.mark_delivered', [], $orderNo);
            
            // 发送交付通知
            try {
                $stmt = $pdo->prepare('SELECT user_id, product_id FROM orders WHERE order_no = ?');
                $stmt->execute([$orderNo]);
                $order = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($order) {
                    $stmt = $pdo->prepare('SELECT name FROM products WHERE id = ?');
                    $stmt->execute([(int)$order['product_id']]);
                    $productName = $stmt->fetchColumn() ?: '商品';
                    $content = "您的订单 {$orderNo}（{$productName}）已完成交付，VPS信息已可在订单详情中查看。如有问题请提交工单。";
                    createNotification($pdo, (int)$order['user_id'], 'order_delivered', '订单已交付', $content, $orderNo);
                }
            } catch (Throwable $e) {
                // ignore
            }
            
            jsonResponse(1, '已标记为交付');
            break;

        case 'update_delivery_info':
            checkAdmin($pdo);
            $orderNo = normalizeString(requestValue('order_no', ''));
            $deliveryInfo = normalizeString(requestValue('delivery_info', ''));
            if ($orderNo === '') {
                jsonResponse(0, '订单号不能为空');
            }
            if (!ordersHasColumn($pdo, 'delivery_info')) {
                jsonResponse(0, '数据库未升级，请先执行数据库更新');
            }
            $stmt = $pdo->prepare('SELECT status FROM orders WHERE order_no = ?');
            $stmt->execute([$orderNo]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '订单不存在');
            }
            if ((int)$order['status'] !== 1) {
                jsonResponse(0, '只能为已支付订单补发交付信息');
            }
            $sql = 'UPDATE orders SET delivery_info = ?';
            if (ordersHasColumn($pdo, 'delivered_at')) {
                $sql .= ', delivered_at = COALESCE(delivered_at, NOW())';
            }
            $sql .= ' WHERE order_no = ?';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$deliveryInfo, $orderNo]);
            logAudit($pdo, 'order.update_delivery_info', ['info_length' => mb_strlen($deliveryInfo, 'UTF-8')], $orderNo);
            
            // 发送补发通知
            try {
                $stmt = $pdo->prepare('SELECT user_id, product_id FROM orders WHERE order_no = ?');
                $stmt->execute([$orderNo]);
                $order = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($order) {
                    $stmt = $pdo->prepare('SELECT name FROM products WHERE id = ?');
                    $stmt->execute([(int)$order['product_id']]);
                    $productName = $stmt->fetchColumn() ?: '商品';
                    $content = "您的订单 {$orderNo}（{$productName}）交付信息已更新/补发，请在订单详情中查看最新信息。";
                    createNotification($pdo, (int)$order['user_id'], 'order_delivery_updated', '交付信息已更新', $content, $orderNo);
                }
            } catch (Throwable $e) {
                // ignore
            }
            
            jsonResponse(1, '交付信息已更新');
            break;

        case 'detail':
            checkAdmin($pdo);
            $orderNo = normalizeString(requestValue('order_no', ''));
            if ($orderNo === '') {
                jsonResponse(0, '订单号不能为空');
            }
            $stmt = $pdo->prepare("SELECT o.*, p.name as product_name, p.cpu, p.memory, p.disk, p.bandwidth, p.ip_address, p.ssh_port, p.ssh_user, p.ssh_password, p.extra_info,
                u.username as buyer_name, u.email as buyer_email
                FROM orders o
                LEFT JOIN products p ON o.product_id = p.id
                LEFT JOIN users u ON o.user_id = u.id
                WHERE o.order_no = ?");
            $stmt->execute([$orderNo]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '订单不存在');
            }
            if (isset($order['ssh_password'])) {
                $order['ssh_password'] = decryptSensitive($order['ssh_password']);
            }
            jsonResponse(1, '', $order);
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.orders', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

