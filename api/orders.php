<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/coupons.php';
require_once __DIR__ . '/../includes/commerce.php';

$action = requestValue('action', '');
$pdo = getDB();

$csrfActions = ['create', 'refund', 'delete', 'batch_delete', 'update_note', 'mark_delivered', 'update_delivery_info', 'update_delivery_status', 'pay_balance'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function ordersHasCouponColumns(PDO $pdo): bool {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $need = ['original_price', 'coupon_id', 'coupon_code', 'coupon_discount'];
    foreach ($need as $col) {
        if (!commerceColumnExists($pdo, 'orders', $col)) {
            $cached = false;
            return false;
        }
    }
    $cached = true;
    return true;
}

function supportsCoupons(PDO $pdo): bool {
    return ordersHasCouponColumns($pdo) && commerceTableExists($pdo, 'coupons') && commerceTableExists($pdo, 'coupon_usages');
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
        if (commerceColumnExists($pdo, 'orders', 'cancel_reason')) {
            $updateSql .= ", cancel_reason = 'timeout'";
        }
        if (commerceColumnExists($pdo, 'orders', 'cancelled_at')) {
            $updateSql .= ', cancelled_at = NOW()';
        }
        if (commerceColumnExists($pdo, 'orders', 'delivery_status')) {
            $updateSql .= ", delivery_status = 'cancelled', delivery_updated_at = NOW()";
        }
        $updateSql .= " WHERE status = 0 AND order_no IN ($place)";
        $stmt = $pdo->prepare($updateSql);
        $stmt->execute($orderNos);
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


function buildOrderFieldSelect(PDO $pdo, string $orderColumn, string $productColumn, string $alias): string {
    $hasOrder = commerceColumnExists($pdo, 'orders', $orderColumn);
    $hasProduct = commerceColumnExists($pdo, 'products', $productColumn);
    if ($alias === 'product_name') {
        if ($hasOrder && $hasProduct) {
            return "COALESCE(NULLIF(o.`{$orderColumn}`, ''), p.`{$productColumn}`, CONCAT('商品#', o.`product_id`)) AS `{$alias}`";
        }
        if ($hasOrder) {
            return "COALESCE(NULLIF(o.`{$orderColumn}`, ''), CONCAT('商品#', o.`product_id`)) AS `{$alias}`";
        }
        if ($hasProduct) {
            return "COALESCE(p.`{$productColumn}`, CONCAT('商品#', o.`product_id`)) AS `{$alias}`";
        }
        return "CONCAT('商品#', o.`product_id`) AS `{$alias}`";
    }
    if ($hasOrder && $hasProduct) {
        return "COALESCE(NULLIF(o.`{$orderColumn}`, ''), p.`{$productColumn}`) AS `{$alias}`";
    }
    if ($hasOrder) {
        return "o.`{$orderColumn}` AS `{$alias}`";
    }
    if ($hasProduct) {
        return "p.`{$productColumn}` AS `{$alias}`";
    }
    return "NULL AS `{$alias}`";
}

function buildPendingOrderResponse(array $order, array $product): array {
    return [
        'order_id' => (int)$order['id'],
        'order_no' => $order['order_no'],
        'price' => round((float)$order['price'], 2),
        'original_price' => round((float)($order['original_price'] ?? $order['price']), 2),
        'trust_discount_amount' => round((float)($order['trust_discount_amount'] ?? 0), 2),
        'coupon_discount' => round((float)($order['coupon_discount'] ?? 0), 2),
        'coupon_code' => $order['coupon_code'] ?? null,
        'product_name' => $product['name'],
        'risk_review' => 0,
        'reused_order' => 1,
    ];
}

function buildOrderSelectSql(bool $forAdmin = false): string {
    global $pdo;
    $productMap = [
        'product_name' => ['product_name_snapshot', 'name'],
        'cpu' => ['cpu_snapshot', 'cpu'],
        'memory' => ['memory_snapshot', 'memory'],
        'disk' => ['disk_snapshot', 'disk'],
        'bandwidth' => ['bandwidth_snapshot', 'bandwidth'],
        'region' => ['region_snapshot', 'region'],
        'line_type' => ['line_type_snapshot', 'line_type'],
        'os_type' => ['os_type_snapshot', 'os_type'],
        'description' => ['description_snapshot', 'description'],
        'ip_address' => ['ip_address_snapshot', 'ip_address'],
        'ssh_port' => ['ssh_port_snapshot', 'ssh_port'],
        'ssh_user' => ['ssh_user_snapshot', 'ssh_user'],
        'ssh_password' => ['ssh_password_snapshot', 'ssh_password'],
        'extra_info' => ['extra_info_snapshot', 'extra_info'],
    ];
    $fields = ['o.*'];
    foreach ($productMap as $alias => [$orderCol, $productCol]) {
        $fields[] = buildOrderFieldSelect($pdo, $orderCol, $productCol, $alias);
    }
    if (commerceColumnExists($pdo, 'products', 'template_id')) {
        $fields[] = 'p.template_id AS template_id';
    } else {
        $fields[] = 'NULL AS template_id';
    }
    $join = ' LEFT JOIN products p ON o.product_id = p.id ';
    if ($forAdmin) {
        if (commerceColumnExists($pdo, 'users', 'username')) {
            $fields[] = 'u.username AS buyer_name';
            $fields[] = 'u.username AS username';
        } else {
            $fields[] = 'NULL AS buyer_name';
            $fields[] = 'NULL AS username';
        }
        $userCols = ['email' => 'buyer_email', 'linuxdo_id' => 'linuxdo_id', 'linuxdo_username' => 'linuxdo_username', 'linuxdo_trust_level' => 'linuxdo_trust_level', 'linuxdo_active' => 'linuxdo_active', 'linuxdo_silenced' => 'linuxdo_silenced'];
        foreach ($userCols as $col => $alias) {
            if (commerceColumnExists($pdo, 'users', $col)) {
                $fields[] = 'u.' . $col . ' AS ' . $alias;
            } else {
                $fields[] = 'NULL AS ' . $alias;
            }
        }
        $join .= 'LEFT JOIN users u ON o.user_id = u.id ';
    }
    return 'SELECT ' . implode(', ', $fields) . ' FROM orders o' . $join;
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
            if ($useCoupons && !supportsCoupons($pdo)) {
                jsonResponse(0, '数据库未升级，无法使用优惠券');
            }
            try {
                $pdo->beginTransaction();
                $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ? FOR UPDATE');
                $stmt->execute([$productId]);
                $product = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$product) {
                    $pdo->rollBack();
                    jsonResponse(0, '商品不存在');
                }
                $stmt = $pdo->prepare('SELECT * FROM orders WHERE user_id = ? AND product_id = ? AND status = 0 ORDER BY id DESC LIMIT 1 FOR UPDATE');
                $stmt->execute([(int)$_SESSION['user_id'], $productId]);
                $existingPendingOrder = $stmt->fetch(PDO::FETCH_ASSOC);
                if ((int)($product['status'] ?? 0) !== 1) {
                    if ($existingPendingOrder) {
                        $createdTs = strtotime((string)($existingPendingOrder['created_at'] ?? ''));
                        if ($createdTs && $createdTs >= time() - 15 * 60) {
                            $pdo->commit();
                            jsonResponse(1, '已为您恢复待支付订单', buildPendingOrderResponse($existingPendingOrder, $product));
                        }
                    }
                    $pdo->rollBack();
                    jsonResponse(0, '商品已下架或暂不可购买');
                }
                $product = commerceApplyTemplateToProduct($product, commerceGetProductTemplate($pdo, (int)($product['template_id'] ?? 0)));
                if ($existingPendingOrder) {
                    $createdTs = strtotime((string)($existingPendingOrder['created_at'] ?? ''));
                    if ($createdTs && $createdTs >= time() - 15 * 60) {
                        $pdo->commit();
                        jsonResponse(1, '您已有待支付订单，已直接跳转支付', buildPendingOrderResponse($existingPendingOrder, $product));
                    }
                }
                $user = commerceGetUserById($pdo, (int)$_SESSION['user_id']);
                if (!$user) {
                    $pdo->rollBack();
                    jsonResponse(0, '用户不存在');
                }
                $access = commerceCheckProductAccess($pdo, $user, $product);
                if (!$access['ok']) {
                    $pdo->rollBack();
                    jsonResponse(0, $access['msg'] ?: '暂不可购买该商品');
                }
                $listPrice = round((float)$product['price'], 2);
                $trustDiscount = commerceGetTrustDiscount($pdo, (int)$product['id'], (int)($user['linuxdo_trust_level'] ?? 0), $listPrice);
                $priceAfterTrust = round(max(0, $listPrice - $trustDiscount['discount_amount']), 2);
                $finalPrice = $priceAfterTrust;
                $couponId = null;
                $couponDiscount = 0.0;
                $normalizedCode = null;
                if ($useCoupons) {
                    $res = validateCouponForAmount($pdo, $couponCode, (int)$user['id'], $priceAfterTrust, true);
                    if (!$res['ok']) {
                        $pdo->rollBack();
                        jsonResponse(0, $res['msg'] ?? '优惠券不可用');
                    }
                    $couponId = (int)$res['coupon']['id'];
                    $couponDiscount = (float)$res['discount'];
                    $finalPrice = (float)$res['final'];
                    $normalizedCode = $res['code'];
                }
                $orderNo = 'VPS' . date('YmdHis') . bin2hex(random_bytes(4));
                $deliveryStatus = 'pending';
                $insertColumns = ['order_no', 'user_id', 'product_id', 'original_price', 'trust_discount_amount', 'trust_level_snapshot', 'coupon_id', 'coupon_code', 'coupon_discount', 'price', 'payment_method', 'balance_paid_amount', 'external_pay_amount', 'delivery_status', 'delivery_note'];
                $insertValues = [
                    $orderNo,
                    (int)$user['id'],
                    $productId,
                    $listPrice,
                    round($trustDiscount['discount_amount'], 2),
                    (int)($user['linuxdo_trust_level'] ?? 0),
                    $couponId,
                    $normalizedCode,
                    round($couponDiscount, 2),
                    round($finalPrice, 2),
                    'pending',
                    0,
                    round($finalPrice, 2),
                    $deliveryStatus,
                    !empty($access['risk_review']) ? '命中社区规则，支付后需人工审核' : null,
                ];
                $snapshotMap = [
                    'product_name_snapshot' => $product['name'] ?? null,
                    'cpu_snapshot' => $product['cpu'] ?? null,
                    'memory_snapshot' => $product['memory'] ?? null,
                    'disk_snapshot' => $product['disk'] ?? null,
                    'bandwidth_snapshot' => $product['bandwidth'] ?? null,
                    'region_snapshot' => $product['region'] ?? null,
                    'line_type_snapshot' => $product['line_type'] ?? null,
                    'os_type_snapshot' => $product['os_type'] ?? null,
                    'description_snapshot' => $product['description'] ?? null,
                    'extra_info_snapshot' => $product['extra_info'] ?? null,
                    'ip_address_snapshot' => $product['ip_address'] ?? null,
                    'ssh_port_snapshot' => $product['ssh_port'] ?? null,
                    'ssh_user_snapshot' => $product['ssh_user'] ?? null,
                    'ssh_password_snapshot' => $product['ssh_password'] ?? null,
                ];
                foreach ($snapshotMap as $column => $value) {
                    if (commerceColumnExists($pdo, 'orders', $column)) {
                        $insertColumns[] = $column;
                        $insertValues[] = $value;
                    }
                }
                $columnSql = implode(', ', array_merge($insertColumns, ['delivery_updated_at']));
                $valueSql = implode(', ', array_merge(array_fill(0, count($insertValues), '?'), ['NOW()']));
                $stmt = $pdo->prepare("INSERT INTO orders ({$columnSql}) VALUES ({$valueSql})");
                $stmt->execute($insertValues);
                $orderId = (int)$pdo->lastInsertId();
                if ($useCoupons && supportsCoupons($pdo)) {
                    $reserved = reserveCouponUsage($pdo, $couponId, (int)$user['id'], $orderNo);
                    if (!$reserved) {
                        $pdo->rollBack();
                        jsonResponse(0, '优惠券占用失败');
                    }
                }
                $pdo->commit();
                jsonResponse(1, '订单创建成功', [
                    'order_id' => $orderId,
                    'order_no' => $orderNo,
                    'price' => round($finalPrice, 2),
                    'original_price' => $listPrice,
                    'trust_discount_amount' => round($trustDiscount['discount_amount'], 2),
                    'coupon_discount' => round($couponDiscount, 2),
                    'coupon_code' => $normalizedCode,
                    'product_name' => $product['name'],
                    'risk_review' => !empty($access['risk_review']) ? 1 : 0,
                ]);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                logError($pdo, 'orders.create', $e->getMessage(), ['user_id' => $_SESSION['user_id'] ?? null, 'product_id' => $productId]);
                jsonResponse(0, '创建订单失败');
            }
            break;

        case 'pay_balance':
            checkUser();
            $orderNo = normalizeString(requestValue('order_no', ''), 50);
            if ($orderNo === '') {
                jsonResponse(0, '订单号不能为空');
            }
            try {
                $pdo->beginTransaction();
                $stmt = $pdo->prepare(buildOrderSelectSql(false) . ' WHERE o.order_no = ? AND o.user_id = ? FOR UPDATE');
                $stmt->execute([$orderNo, (int)$_SESSION['user_id']]);
                $order = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$order) {
                    $pdo->rollBack();
                    jsonResponse(0, '订单不存在');
                }
                if ((int)$order['status'] !== 0) {
                    $pdo->rollBack();
                    jsonResponse(0, '当前订单状态不允许余额支付');
                }
                $price = round((float)$order['price'], 2);
                if ($price <= 0) {
                    $pdo->rollBack();
                    jsonResponse(0, '订单金额无效');
                }
                $balanceResult = commerceAdjustBalance($pdo, (int)$_SESSION['user_id'], 'consume', -$price, [
                    'related_order_id' => (int)$order['id'],
                    'related_order_no' => $orderNo,
                    'remark' => '余额支付订单',
                ]);
                $tradeNo = 'BAL' . date('YmdHis') . bin2hex(random_bytes(3));
                $deliveryStatus = commerceResolveAutoDeliveryStatus($order, 'paid_waiting');
                $sql = 'UPDATE orders SET status = 1, trade_no = ?, paid_at = NOW(), payment_method = ?, balance_paid_amount = ?, external_pay_amount = 0, delivery_status = ?, delivery_updated_at = NOW()';
                if ($deliveryStatus === 'delivered' && commerceColumnExists($pdo, 'orders', 'delivered_at')) {
                    $sql .= ', delivered_at = NOW()';
                }
                $sql .= ' WHERE order_no = ? AND status = 0';
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$tradeNo, 'balance', $price, $deliveryStatus, $orderNo]);
                if (!empty($order['product_id']) && commerceTableExists($pdo, 'products')) {
                    $pdo->prepare('UPDATE products SET status = 0 WHERE id = ?')->execute([(int)$order['product_id']]);
                }
                markCouponUsedByOrder($pdo, $orderNo);
                $pdo->commit();
                createNotification($pdo, (int)$_SESSION['user_id'], 'order_paid', '余额支付成功', '您的订单 ' . $orderNo . ' 已使用余额支付成功，扣减 ' . number_format($price, 2) . ' 积分。', $orderNo);
                if ($deliveryStatus === 'delivered') {
                    createNotification($pdo, (int)$_SESSION['user_id'], 'order_delivered', '订单已自动交付', '您的订单 ' . $orderNo . ' 已自动标记为已交付，连接信息已可查看。', $orderNo);
                } elseif ($deliveryStatus === 'exception') {
                    createNotification($pdo, (int)$_SESSION['user_id'], 'order_exception', '订单待人工审核', '您的订单 ' . $orderNo . ' 已支付，但因社区规则命中人工审核流程，管理员会尽快处理。', $orderNo);
                }
                jsonResponse(1, '余额支付成功', ['balance_after' => $balanceResult['after'], 'order_no' => $orderNo]);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                if ($e->getMessage() === 'insufficient balance') {
                    jsonResponse(0, '余额不足，请选择外部支付');
                }
                logError($pdo, 'orders.pay_balance', $e->getMessage(), ['order_no' => $orderNo]);
                jsonResponse(0, '余额支付失败');
            }
            break;

        case 'my':
            checkUser();
            $pg = paginateParams(5, 50);
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM orders WHERE user_id = ?');
            $stmt->execute([(int)$_SESSION['user_id']]);
            $total = (int)$stmt->fetchColumn();
            $sql = buildOrderSelectSql(false) . " WHERE o.user_id = ? ORDER BY o.id DESC LIMIT {$pg['page_size']} OFFSET {$pg['offset']}";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([(int)$_SESSION['user_id']]);
            $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($orders as &$order) {
                commercePrepareOrderForOutput($order, true);
            }
            unset($order);
            jsonResponse(1, '', paginateResponse($orders, $total, $pg));
            break;

        case 'query':
            checkUser();
            $orderNo = normalizeString(requestValue('order_no', ''));
            if ($orderNo === '') {
                jsonResponse(0, '请输入订单号');
            }
            $stmt = $pdo->prepare(buildOrderSelectSql(false) . ' WHERE o.order_no = ? AND o.user_id = ?');
            $stmt->execute([$orderNo, (int)$_SESSION['user_id']]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '订单不存在');
            }
            commercePrepareOrderForOutput($order, true);
            jsonResponse(1, '', $order);
            break;

        case 'all':
            checkAdmin($pdo);
            $pg = paginateParams();
            $status = requestValue('status', '');
            $delivery = normalizeString(requestValue('delivery_status', ''), 20);
            $where = '1=1';
            $params = [];
            if ($status !== '' && validateInt($status, 0, 3) !== null) {
                $where .= ' AND o.status = ?';
                $params[] = (int)$status;
            }
            if ($delivery !== '') {
                $where .= ' AND o.delivery_status = ?';
                $params[] = $delivery;
            }
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM orders o WHERE ' . $where);
            $stmt->execute($params);
            $total = (int)$stmt->fetchColumn();
            $sql = buildOrderSelectSql(true) . ' WHERE ' . $where . " ORDER BY o.id DESC LIMIT {$pg['page_size']} OFFSET {$pg['offset']}";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($orders as &$order) {
                commercePrepareOrderForOutput($order, false);
            }
            unset($order);
            jsonResponse(1, '', paginateResponse($orders, $total, $pg));
            break;

        case 'list':
            checkAdmin($pdo);
            $limit = validateInt(requestValue('limit', 5), 1, 20) ?? 5;
            $stmt = $pdo->prepare('SELECT o.id, o.order_no, o.status, o.delivery_status, o.created_at, p.name as product_name FROM orders o LEFT JOIN products p ON o.product_id = p.id ORDER BY o.id DESC LIMIT ?');
            $stmt->bindValue(1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $statusMap = [0 => 'pending', 1 => 'paid', 2 => 'refunded', 3 => 'cancelled'];
            $list = array_map(static function (array $row) use ($statusMap) {
                return [
                    'id' => (int)$row['id'],
                    'order_no' => $row['order_no'],
                    'product_name' => $row['product_name'],
                    'created_at' => $row['created_at'],
                    'status' => $statusMap[(int)($row['status'] ?? 0)] ?? 'unknown',
                    'delivery_status' => $row['delivery_status'] ?: 'pending',
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
                'users' => (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),
                'balance_paid_orders' => commerceColumnExists($pdo, 'orders', 'payment_method') ? (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE status = 1 AND payment_method = 'balance'")->fetchColumn() : 0,
                'epay_paid_orders' => commerceColumnExists($pdo, 'orders', 'payment_method') ? (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE status = 1 AND payment_method = 'epay'")->fetchColumn() : 0,
                'exception_orders' => commerceColumnExists($pdo, 'orders', 'delivery_status') ? (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE delivery_status = 'exception'")->fetchColumn() : 0,
            ];
            jsonResponse(1, '', $stats);
            break;

        case 'refund':
            checkAdmin($pdo);
            $orderNo = normalizeString(requestValue('order_no', ''));
            $refundReason = normalizeString(requestValue('refund_reason', '人工退款'), 255);
            $refundTarget = normalizeString(requestValue('refund_target', 'original'), 20);
            if ($orderNo === '') {
                jsonResponse(0, '订单号不能为空');
            }
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE order_no = ?');
            $stmt->execute([$orderNo]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '订单不存在');
            }
            try {
                $result = commerceRefundOrder($pdo, $order, $refundTarget, $refundReason);
            } catch (Throwable $e) {
                logError($pdo, 'orders.refund', $e->getMessage(), ['order_no' => $orderNo]);
                jsonResponse(0, $e->getMessage() ?: '退款失败');
            }
            logAudit($pdo, 'order.refund', ['amount' => $result['refund_total'], 'refund_reason' => $refundReason, 'refund_target' => $result['refund_target']], $orderNo);
            jsonResponse(1, '退款成功', $result);
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
            if ((int)$order['status'] === 1) {
                jsonResponse(0, '已支付订单请先退款再删除');
            }
            try {
                $pdo->beginTransaction();
                releaseCouponByOrder($pdo, $orderNo);
                $pdo->prepare('DELETE FROM orders WHERE order_no = ?')->execute([$orderNo]);
                if ((int)$order['status'] === 0) {
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
            $statusCode = $type === 'expired' ? 3 : ($type === 'refunded' ? 2 : 0);
            $stmt = $pdo->query('SELECT order_no, user_id, product_id FROM orders WHERE status = ' . (int)$statusCode);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as $row) {
                releaseCouponByOrder($pdo, $row['order_no']);
            }
            $pdo->exec('DELETE FROM orders WHERE status = ' . (int)$statusCode);
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
            if (!commerceColumnExists($pdo, 'orders', 'admin_note')) {
                jsonResponse(0, '数据库未升级，请先执行数据库更新');
            }
            $stmt = $pdo->prepare('UPDATE orders SET admin_note = ? WHERE order_no = ?');
            $stmt->execute([$adminNote, $orderNo]);
            if ($stmt->rowCount() === 0) {
                jsonResponse(0, '订单不存在');
            }
            logAudit($pdo, 'order.update_note', ['note_length' => utf8Length($adminNote)], $orderNo);
            jsonResponse(1, '备注已更新');
            break;

        case 'update_delivery_status':
            checkAdmin($pdo);
            $orderNo = normalizeString(requestValue('order_no', ''), 50);
            $deliveryStatus = normalizeString(requestValue('delivery_status', ''), 30);
            $deliveryNote = normalizeString(requestValue('delivery_note', ''), 5000);
            $deliveryError = normalizeString(requestValue('delivery_error', ''), 5000);
            $deliveryInfo = normalizeString(requestValue('delivery_info', ''), 5000);
            if ($orderNo === '') {
                jsonResponse(0, '参数不完整');
            }
            if ($deliveryStatus === '') {
                $deliveryStatus = 'paid_waiting';
            }
            if ($deliveryInfo !== '' && in_array($deliveryStatus, ['pending', 'paid_waiting', 'provisioning'], true)) {
                $deliveryStatus = 'delivered';
            }
            $stmt = $pdo->prepare('SELECT user_id, status, delivery_status FROM orders WHERE order_no = ?');
            $stmt->execute([$orderNo]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '订单不存在');
            }
            try {
                $pdo->beginTransaction();
                if (!commerceUpdateOrderDelivery($pdo, $orderNo, $deliveryStatus, $deliveryNote, $deliveryError)) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    jsonResponse(0, '交付状态更新失败');
                }
                if (commerceColumnExists($pdo, 'orders', 'delivery_info')) {
                    $stmt = $pdo->prepare('UPDATE orders SET delivery_info = ?, delivery_updated_at = NOW() WHERE order_no = ?');
                    $stmt->execute([$deliveryInfo !== '' ? $deliveryInfo : null, $orderNo]);
                }
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                logError($pdo, 'orders.update_delivery_status', $e->getMessage(), ['order_no' => $orderNo]);
                jsonResponse(0, '交付状态更新失败');
            }
            if ($deliveryStatus === 'delivered' && (int)$order['status'] === 1) {
                $title = '订单已交付';
                $content = '您的订单 ' . $orderNo . ' 已完成交付，可在订单详情中查看服务信息。';
                createNotification($pdo, (int)$order['user_id'], 'order_delivered', $title, $content, $orderNo);
            } elseif ($deliveryStatus === 'exception') {
                createNotification($pdo, (int)$order['user_id'], 'order_exception', '订单处理异常', '您的订单 ' . $orderNo . ' 当前被标记为异常，原因：' . ($deliveryError !== '' ? $deliveryError : '请联系管理员') . '。', $orderNo);
            } else {
                createNotification($pdo, (int)$order['user_id'], 'order_delivery_status', '订单状态更新', '您的订单 ' . $orderNo . ' 交付状态已更新为：' . (commerceGetDeliveryStatuses()[$deliveryStatus] ?? $deliveryStatus) . '。', $orderNo);
            }
            logAudit($pdo, 'order.update_delivery_status', ['delivery_status' => $deliveryStatus, 'delivery_info_length' => utf8Length($deliveryInfo)], $orderNo);
            jsonResponse(1, '交付状态已更新');
            break;

        case 'mark_delivered':
            checkAdmin($pdo);
            $orderNo = normalizeString(requestValue('order_no', ''), 50);
            $deliveryInfo = normalizeString(requestValue('delivery_info', ''), 5000);
            if ($orderNo === '') {
                jsonResponse(0, '订单号不能为空');
            }
            try {
                $pdo->beginTransaction();
                if (!commerceUpdateOrderDelivery($pdo, $orderNo, 'delivered', '')) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    jsonResponse(0, '更新失败');
                }
                if (commerceColumnExists($pdo, 'orders', 'delivery_info')) {
                    $stmt = $pdo->prepare('UPDATE orders SET delivery_info = ?, delivery_updated_at = NOW() WHERE order_no = ?');
                    $stmt->execute([$deliveryInfo !== '' ? $deliveryInfo : null, $orderNo]);
                }
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                logError($pdo, 'orders.mark_delivered', $e->getMessage(), ['order_no' => $orderNo]);
                jsonResponse(0, '更新失败');
            }
            logAudit($pdo, 'order.mark_delivered', ['delivery_info_length' => utf8Length($deliveryInfo)], $orderNo);
            jsonResponse(1, '已标记为交付');
            break;

        case 'update_delivery_info':
            checkAdmin($pdo);
            $orderNo = normalizeString(requestValue('order_no', ''));
            $deliveryInfo = normalizeString(requestValue('delivery_info', ''), 5000);
            if ($orderNo === '') {
                jsonResponse(0, '订单号不能为空');
            }
            if (!commerceColumnExists($pdo, 'orders', 'delivery_info')) {
                jsonResponse(0, '数据库未升级，请先执行数据库更新');
            }
            $stmt = $pdo->prepare('UPDATE orders SET delivery_info = ?, delivery_updated_at = NOW() WHERE order_no = ?');
            $stmt->execute([$deliveryInfo !== '' ? $deliveryInfo : null, $orderNo]);
            if ($stmt->rowCount() === 0) {
                jsonResponse(0, '订单不存在');
            }
            logAudit($pdo, 'order.update_delivery_info', ['info_length' => utf8Length($deliveryInfo)], $orderNo);
            jsonResponse(1, '交付信息已更新');
            break;

        case 'detail':
            $isAdmin = !empty($_SESSION['admin_id']);
            $isUser = !empty($_SESSION['user_id']);
            if (!$isAdmin && !$isUser) {
                jsonResponse(0, '请先登录');
            }
            $orderNo = normalizeString(requestValue('order_no', ''));
            $orderId = validateInt(requestValue('id', null), 1);
            if ($orderNo === '' && !$orderId) {
                jsonResponse(0, '订单参数不能为空');
            }
            if ($isAdmin) {
                $sql = buildOrderSelectSql(true) . ' WHERE ' . ($orderNo !== '' ? 'o.order_no = ?' : 'o.id = ?') . ' LIMIT 1';
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$orderNo !== '' ? $orderNo : $orderId]);
            } else {
                $sql = buildOrderSelectSql(false) . ' WHERE ' . ($orderNo !== '' ? 'o.order_no = ?' : 'o.id = ?') . ' AND o.user_id = ? LIMIT 1';
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$orderNo !== '' ? $orderNo : $orderId, (int)$_SESSION['user_id']]);
            }
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                jsonResponse(0, '订单不存在');
            }
            if ($isAdmin) {
                commercePrepareOrderForOutput($order, false);
            } else {
                commercePrepareOrderForOutput($order, true);
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
