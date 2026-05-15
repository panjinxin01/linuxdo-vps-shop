<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/notifications.php';
require_once __DIR__ . '/coupons.php';

function commerceTableExists(PDO $pdo, string $table): bool {
    return securityTableExists($pdo, $table);
}

function commerceColumnExists(PDO $pdo, string $table, string $column): bool {
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    try {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
        $stmt->execute([$table, $column]);
        $cache[$key] = ((int)$stmt->fetchColumn() > 0);
    } catch (Throwable $e) {
        try {
            $safeTable = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
            $stmt = $pdo->query("SHOW COLUMNS FROM `{$safeTable}`");
            $cache[$key] = false;
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                if (isset($row['Field']) && (string)$row['Field'] === $column) {
                    $cache[$key] = true;
                    break;
                }
            }
        } catch (Throwable $inner) {
            $cache[$key] = false;
        }
    }
    return $cache[$key];
}

function commerceGetSetting(PDO $pdo, string $key, string $default = ''): string {
    if (!commerceTableExists($pdo, 'settings')) {
        return $default;
    }
    try {
        $stmt = $pdo->prepare('SELECT key_value FROM settings WHERE key_name = ? LIMIT 1');
        $stmt->execute([$key]);
        $value = $stmt->fetchColumn();
        return $value === false || $value === null ? $default : (string)$value;
    } catch (Throwable $e) {
        return $default;
    }
}

function commerceSetSetting(PDO $pdo, string $key, string $value): bool {
    if (!commerceTableExists($pdo, 'settings')) {
        return false;
    }
    try {
        $stmt = $pdo->prepare('INSERT INTO settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = VALUES(key_value)');
        return $stmt->execute([$key, $value]);
    } catch (Throwable $e) {
        return false;
    }
}


function commerceEnsurePaymentRequestTable(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `payment_requests` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `order_no` VARCHAR(50) NOT NULL,
        `external_order_no` VARCHAR(80) NOT NULL,
        `user_id` INT NOT NULL,
        `trade_no` VARCHAR(100) DEFAULT NULL,
        `status` TINYINT NOT NULL DEFAULT 0,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
        `paid_at` DATETIME DEFAULT NULL,
        UNIQUE KEY `uniq_payment_requests_external` (`external_order_no`),
        INDEX `idx_payment_requests_order` (`order_no`),
        INDEX `idx_payment_requests_user_status` (`user_id`, `status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function commerceOrderShouldShowCredentials(array $order): bool {
    $status = (int)($order['status'] ?? 0);
    $delivery = (string)($order['delivery_status'] ?? '');
    if ($status !== 1) {
        return false;
    }
    return !in_array($delivery, ['exception', 'cancelled', 'refunded'], true);
}

function commerceDecryptDeliveryInfo(string $info): string {
    return preg_replace_callback('/enc:[A-Za-z0-9+\/=]+/', static function (array $matches): string {
        return (string)decryptSensitive($matches[0]);
    }, $info);
}

function commercePrepareOrderForOutput(array &$order, bool $hideRestrictedCredentials = false): void {
    commerceNormalizePaymentMethod($order);
    commerceNormalizeDeliveryStatus($order);
    commerceFillRefundPolicy($order);
    if (isset($order['ssh_password'])) {
        $order['ssh_password'] = decryptSensitive($order['ssh_password']);
    }
    if (!empty($order['delivery_info'])) {
        $order['delivery_info'] = commerceDecryptDeliveryInfo((string)$order['delivery_info']);
    }
    if ($hideRestrictedCredentials && !commerceOrderShouldShowCredentials($order)) {
        unset($order['ip_address'], $order['ssh_port'], $order['ssh_user'], $order['ssh_password'], $order['extra_info']);
    }
}

function commerceGetTicketCategories(): array {
    return [
        'login_issue' => '登录异常',
        'credential_error' => '凭据错误',
        'delivery_issue' => '发货异常',
        'payment_issue' => '支付问题',
        'refund_request' => '退款申请',
        'other' => '其他',
    ];
}

function commerceGetDeliveryStatuses(): array {
    return [
        'pending' => '待支付',
        'paid_waiting' => '待开通',
        'provisioning' => '处理中',
        'delivered' => '已交付',
        'exception' => '异常',
        'cancelled' => '已取消',
        'refunded' => '已退款',
    ];
}

function commerceGetUserById(PDO $pdo, int $userId): ?array {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function commerceGetProductTemplate(PDO $pdo, ?int $templateId): ?array {
    if (!$templateId || !commerceTableExists($pdo, 'product_templates')) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT * FROM product_templates WHERE id = ? LIMIT 1');
    $stmt->execute([$templateId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function commerceApplyTemplateToProduct(array $product, ?array $template): array {
    if (!$template) {
        return $product;
    }
    $fallbackFields = ['cpu', 'memory', 'disk', 'bandwidth', 'region', 'line_type', 'os_type', 'description', 'extra_info'];
    foreach ($fallbackFields as $field) {
        $productValue = isset($product[$field]) ? trim((string)$product[$field]) : '';
        if ($productValue === '' && isset($template[$field]) && trim((string)$template[$field]) !== '') {
            $product[$field] = $template[$field];
        }
    }
    if (empty($product['template_name']) && !empty($template['name'])) {
        $product['template_name'] = $template['name'];
    }
    return $product;
}

function commerceFindUserAccessRule(PDO $pdo, array $user, int $productId, string $ruleType): ?array {
    if (!commerceTableExists($pdo, 'linuxdo_user_access_rules')) {
        return null;
    }
    $linuxdoId = (int)($user['linuxdo_id'] ?? 0);
    $userId = (int)($user['id'] ?? 0);
    $sql = 'SELECT * FROM linuxdo_user_access_rules WHERE status = 1 AND rule_type = ? AND (product_id IS NULL OR product_id = ?) AND ((linuxdo_id IS NOT NULL AND linuxdo_id = ?) OR (user_id IS NOT NULL AND user_id = ?)) ORDER BY product_id DESC, id DESC LIMIT 1';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$ruleType, $productId, $linuxdoId, $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function commerceGetTrustDiscount(PDO $pdo, int $productId, int $trustLevel, float $basePrice): array {
    $result = [
        'discount_amount' => 0.0,
        'discount_type' => '',
        'discount_value' => 0.0,
        'trust_level' => $trustLevel,
        'rule_id' => 0,
        'label' => ''
    ];
    if ($trustLevel < 0 || !commerceTableExists($pdo, 'trust_level_discounts')) {
        return $result;
    }
    $sql = 'SELECT * FROM trust_level_discounts WHERE status = 1 AND trust_level = ? AND (product_id IS NULL OR product_id = ?) ORDER BY product_id DESC, id DESC LIMIT 1';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$trustLevel, $productId]);
    $rule = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$rule) {
        return $result;
    }
    $type = (string)($rule['discount_type'] ?? 'percent');
    $value = round((float)($rule['discount_value'] ?? 0), 2);
    $amount = 0.0;
    if ($type === 'fixed') {
        $amount = min($basePrice, max(0, $value));
    } else {
        $amount = min($basePrice, round($basePrice * max(0, $value) / 100, 2));
    }
    $result['discount_amount'] = round($amount, 2);
    $result['discount_type'] = $type;
    $result['discount_value'] = $value;
    $result['rule_id'] = (int)$rule['id'];
    $result['label'] = 'TL' . $trustLevel . ($type === 'fixed' ? (' -' . $value) : (' -' . $value . '%'));
    return $result;
}

function commerceCheckProductAccess(PDO $pdo, array $user, array $product): array {
    $linuxdoId = (int)($user['linuxdo_id'] ?? 0);
    $trustLevel = (int)($user['linuxdo_trust_level'] ?? 0);
    $silenced = (int)($user['linuxdo_silenced'] ?? 0);
    $active = array_key_exists('linuxdo_active', $user) ? (int)$user['linuxdo_active'] : 1;
    $productId = (int)($product['id'] ?? 0);
    $minTrust = (int)($product['min_trust_level'] ?? 0);
    $allowWhitelistOnly = (int)($product['allow_whitelist_only'] ?? 0) === 1;
    $riskReviewRequired = (int)($product['risk_review_required'] ?? 0) === 1;

    $black = commerceFindUserAccessRule($pdo, $user, $productId, 'blacklist');
    if ($black) {
        return ['ok' => false, 'msg' => '当前账号被限制购买该商品', 'risk_review' => true];
    }

    $white = commerceFindUserAccessRule($pdo, $user, $productId, 'whitelist');
    if ($allowWhitelistOnly && !$white) {
        return ['ok' => false, 'msg' => '该商品仅对白名单用户开放', 'risk_review' => false];
    }

    if ($linuxdoId > 0 && $active === 0) {
        return ['ok' => false, 'msg' => '社区账号未激活，暂不可购买', 'risk_review' => false];
    }

    if ($linuxdoId > 0 && $trustLevel < $minTrust) {
        return ['ok' => false, 'msg' => '您的 Linux DO 信任等级不足，暂不可购买该商品', 'risk_review' => false];
    }

    $silencedMode = commerceGetSetting($pdo, 'linuxdo_silenced_order_mode', 'review');
    if ($linuxdoId > 0 && $silenced === 1) {
        if ($silencedMode === 'block') {
            return ['ok' => false, 'msg' => '当前社区账号处于受限状态，暂不可下单', 'risk_review' => true];
        }
        return ['ok' => true, 'msg' => '', 'risk_review' => true];
    }

    return ['ok' => true, 'msg' => '', 'risk_review' => $riskReviewRequired];
}

function commerceRecordTicketEvent(PDO $pdo, int $ticketId, string $eventType, string $content = '', array $extra = [], bool $isVisible = false): void {
    if (!commerceTableExists($pdo, 'ticket_events') || $ticketId <= 0) {
        return;
    }
    $actorType = !empty($_SESSION['admin_id']) ? 'admin' : (!empty($_SESSION['user_id']) ? 'user' : 'system');
    $actorId = !empty($_SESSION['admin_id']) ? (int)$_SESSION['admin_id'] : (!empty($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null);
    $details = $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
    try {
        $stmt = $pdo->prepare('INSERT INTO ticket_events (ticket_id, event_type, actor_type, actor_id, content, is_visible, details) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$ticketId, $eventType, $actorType, $actorId, $content, $isVisible ? 1 : 0, $details]);
    } catch (Throwable $e) {
    }
}

function commerceCreateTicketNotification(PDO $pdo, array $ticket, string $type, string $title, string $content): void {
    try {
        createNotification($pdo, (int)$ticket['user_id'], $type, $title, $content, (string)$ticket['id']);
    } catch (Throwable $e) {
    }
}


function commerceNormalizePaymentMethod(array &$order): void {
    $status = (int)($order['status'] ?? 0);
    $method = (string)($order['payment_method'] ?? '');
    if ($method === '' || $method === 'pending') {
        if ($status === 0) {
            $method = 'pending';
        } elseif ((float)($order['balance_paid_amount'] ?? 0) > 0) {
            $method = 'balance';
        } elseif ($status === 1) {
            $method = 'epay';
        }
        $order['payment_method'] = $method;
    }
}

function commerceNormalizeDeliveryStatus(array &$order): void {
    $status = (int)($order['status'] ?? 0);
    $delivery = (string)($order['delivery_status'] ?? '');
    if ($delivery === '' || ($delivery === 'pending' && $status === 1)) {
        if ($status === 0) {
            $delivery = 'pending';
        } elseif ($status === 1) {
            $delivery = !empty($order['delivered_at']) ? 'delivered' : 'paid_waiting';
        } elseif ($status === 2) {
            $delivery = 'refunded';
        } else {
            $delivery = 'cancelled';
        }
        $order['delivery_status'] = $delivery;
    }
    $map = commerceGetDeliveryStatuses();
    $order['delivery_status_text'] = $map[$delivery] ?? $delivery;
}


function commerceOrderHasDeliveryPayload(array $order): bool {
    $fields = [
        'delivery_info',
        'ip_address', 'ssh_user', 'ssh_password',
        'ip_address_snapshot', 'ssh_user_snapshot', 'ssh_password_snapshot',
    ];
    foreach ($fields as $field) {
        if (!empty($order[$field])) {
            return true;
        }
    }
    return false;
}

function commerceResolveAutoDeliveryStatus(array $order, string $fallback = 'paid_waiting'): string {
    if (!empty($order['delivery_note']) && strpos((string)$order['delivery_note'], '人工审核') !== false) {
        return 'exception';
    }
    return commerceOrderHasDeliveryPayload($order) ? 'delivered' : $fallback;
}



function commerceBuildRefundPolicy(array $order): array {
    $status = (int)($order['status'] ?? 0);
    $delivery = (string)($order['delivery_status'] ?? '');
    $price = round((float)($order['price'] ?? 0), 2);
    $durationDays = max(1, (int)($order['service_period_days'] ?? 30));
    $baseTime = (string)($order['delivered_at'] ?? '');
    if ($baseTime === '') {
        $baseTime = (string)($order['paid_at'] ?? '');
    }
    if ($baseTime === '') {
        $baseTime = (string)($order['created_at'] ?? '');
    }
    $startTs = strtotime($baseTime ?: 'now');
    if (!$startTs) {
        $startTs = time();
    }
    $endTs = $startTs + ($durationDays * 86400);
    if (!empty($order['service_end_at'])) {
        $customEnd = strtotime((string)$order['service_end_at']);
        if ($customEnd) {
            $endTs = $customEnd;
        }
    }
    $totalSeconds = max(1, $endTs - $startTs);
    $remainingSeconds = max(0, $endTs - time());
    $ratio = min(1, max(0, $remainingSeconds / $totalSeconds));
    $amount = round($price * $ratio, 2);
    if ($status !== 1 || in_array($delivery, ['refunded', 'cancelled'], true)) {
        $remainingSeconds = 0;
        $ratio = 0;
        $amount = 0.00;
    }
    if ($price > 0 && $ratio > 0 && $amount <= 0) {
        $amount = 0.01;
    }
    if ($amount > $price) {
        $amount = $price;
    }
    return [
        'service_start_at' => date('Y-m-d H:i:s', $startTs),
        'service_end_at' => date('Y-m-d H:i:s', $endTs),
        'service_period_days' => $durationDays,
        'remaining_seconds' => (int)$remainingSeconds,
        'remaining_days' => round($remainingSeconds / 86400, 2),
        'refund_ratio' => round($ratio, 6),
        'refundable_amount' => round($amount, 2),
    ];
}

function commerceFillRefundPolicy(array &$order): void {
    $order = array_merge($order, commerceBuildRefundPolicy($order));
}

function commerceRefundOrder(PDO $pdo, array $order, string $refundTarget = 'original', string $refundReason = '人工退款'): array {
    if (!$order || empty($order['order_no'])) {
        throw new InvalidArgumentException('order missing');
    }
    if ((int)($order['status'] ?? 0) !== 1) {
        throw new RuntimeException('只能退款已支付的订单');
    }

    $policy = commerceBuildRefundPolicy($order);
    $refundTotal = round((float)($policy['refundable_amount'] ?? 0), 2);
    if ($refundTotal <= 0) {
        throw new RuntimeException('当前订单剩余时长为 0，可退金额为 0');
    }

    $refundTarget = trim((string)$refundTarget);
    if (!in_array($refundTarget, ['original', 'balance', 'auto'], true)) {
        $refundTarget = 'original';
    }

    $orderNo = (string)$order['order_no'];
    $externalPaid = round((float)($order['external_pay_amount'] ?? ((($order['payment_method'] ?? '') === 'epay') ? $order['price'] : 0)), 2);
    $balancePaid = round((float)($order['balance_paid_amount'] ?? ((($order['payment_method'] ?? '') === 'balance') ? $order['price'] : 0)), 2);
    $totalPaid = round($externalPaid + $balancePaid, 2);
    if ($totalPaid <= 0) {
        $totalPaid = round((float)($order['price'] ?? 0), 2);
        if (($order['payment_method'] ?? '') === 'balance') {
            $balancePaid = $totalPaid;
            $externalPaid = 0.00;
        } else {
            $externalPaid = $totalPaid;
            $balancePaid = 0.00;
        }
    }
    if ($refundTarget === 'auto') {
        $refundTarget = $externalPaid > 0 ? 'original' : 'balance';
    }

    $externalRatio = $totalPaid > 0 ? ($externalPaid / $totalPaid) : 0;
    $externalRefundAmount = min($externalPaid, round($refundTotal * $externalRatio, 2));
    $refundToBalanceAmount = round($refundTotal - $externalRefundAmount, 2);
    if ($refundToBalanceAmount > $balancePaid) {
        $overflow = round($refundToBalanceAmount - $balancePaid, 2);
        $refundToBalanceAmount = $balancePaid;
        $externalRefundAmount = min($externalPaid, round($externalRefundAmount + $overflow, 2));
    }
    if ($refundTarget === 'balance') {
        $refundToBalanceAmount = $refundTotal;
        $externalRefundAmount = 0.00;
    }

    $refundTradeNo = null;
    if ($externalRefundAmount > 0) {
        if (empty($order['trade_no'])) {
            throw new RuntimeException('订单缺少平台交易号，无法发起外部退款');
        }
        $paymentMethod = (string)($order['payment_method'] ?? 'epay');
        $refundOk = false;

        // 优先尝试 LDC Pay 退款 (Ed25519)，再降级到易支付 (MD5)
        require_once __DIR__ . '/ldcpay.php';

        // 1) 尝试 LDC Pay
        if (!$refundOk) {
            $ldcClientId = commerceGetSetting($pdo, 'ldcpay_client_id');
            $ldcClientSecret = commerceGetSetting($pdo, 'ldcpay_client_secret');
            if ($ldcClientId !== '' && $ldcClientSecret !== '') {
                $refundResult = ldcpay_refund($pdo, $order['trade_no'], $externalRefundAmount, $orderNo);
                if ((int)($refundResult['code'] ?? 0) === 1) {
                    $refundTradeNo = $refundResult['trade_no'] ?? $order['trade_no'];
                    $refundOk = true;
                }
            }
        }

        // 2) 降级到易支付 (MD5)
        if (!$refundOk) {
            $pid = commerceGetSetting($pdo, 'epay_pid');
            $key = commerceGetSetting($pdo, 'epay_key');
            if ($pid === '' || $key === '') {
                throw new RuntimeException('退款配置不完整（LDC Pay 和易支付均未配置）');
            }
            $refundData = ['pid' => $pid, 'key' => $key, 'trade_no' => $order['trade_no'], 'money' => $externalRefundAmount, 'out_trade_no' => $orderNo];
            $refundResponse = httpRequest('https://credit.linux.do/epay/api.php', ['method' => 'POST', 'data' => $refundData, 'timeout' => 30, 'ssl_verify_peer' => true, 'ssl_verify_host' => 2]);
            if (!$refundResponse['ok']) {
                throw new RuntimeException('请求退款接口失败: ' . ($refundResponse['error'] ?: 'network error'));
            }
            $result = json_decode((string)$refundResponse['body'], true);
            if (!$result || (int)($result['code'] ?? 0) !== 1) {
                throw new RuntimeException($result['msg'] ?? '退款失败');
            }
            $refundTradeNo = $result['trade_no'] ?? $order['trade_no'];
            $refundOk = true;
        }
    }

    try {
        $pdo->beginTransaction();
        // 事务内重新锁定订单，防止并发重复退款
        $lockStmt = $pdo->prepare('SELECT status FROM orders WHERE order_no = ? FOR UPDATE');
        $lockStmt->execute([$orderNo]);
        $lockedOrder = $lockStmt->fetch(PDO::FETCH_ASSOC);
        if (!$lockedOrder || (int)$lockedOrder['status'] !== 1) {
            $pdo->rollBack();
            throw new RuntimeException('订单已退款或状态已变更，无法重复退款');
        }
        if ($refundToBalanceAmount > 0) {
            commerceAdjustBalance($pdo, (int)$order['user_id'], 'refund', $refundToBalanceAmount, [
                'related_order_id' => (int)$order['id'],
                'related_order_no' => $orderNo,
                'remark' => $refundTarget === 'balance' ? '按剩余时长退款退回站内余额' : '按剩余时长退款返还余额',
            ]);
        }
        releaseCouponByOrder($pdo, $orderNo);
        $parts = ['status = 2'];
        $params = [];
        if (commerceColumnExists($pdo, 'orders', 'refund_reason')) {
            $parts[] = 'refund_reason = ?';
            $params[] = $refundReason;
        }
        if (commerceColumnExists($pdo, 'orders', 'refund_trade_no')) {
            $parts[] = 'refund_trade_no = ?';
            $params[] = $refundTradeNo;
        }
        if (commerceColumnExists($pdo, 'orders', 'refund_amount')) {
            $parts[] = 'refund_amount = ?';
            $params[] = $refundTotal;
        }
        if (commerceColumnExists($pdo, 'orders', 'refund_at')) {
            $parts[] = 'refund_at = NOW()';
        }
        if (commerceColumnExists($pdo, 'orders', 'delivery_status')) {
            $parts[] = "delivery_status = 'refunded'";
            $parts[] = 'delivery_updated_at = NOW()';
        }
        $params[] = $orderNo;
        $stmt = $pdo->prepare('UPDATE orders SET ' . implode(', ', $parts) . ' WHERE order_no = ? AND status = 1');
        $stmt->execute($params);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    $refundMsg = $refundTarget === 'balance' ? '已按剩余时长退回站内余额' : '已按剩余时长原路退款';
    createNotification($pdo, (int)$order['user_id'], 'order_refund', '订单已退款', '您的订单 ' . $orderNo . ' 已退款成功，退款金额：' . number_format($refundTotal, 2) . ' 积分，' . $refundMsg . '。', $orderNo);

    return [
        'order_no' => $orderNo,
        'refund_total' => $refundTotal,
        'refund_target' => $refundTarget,
        'refund_reason' => $refundReason,
        'refund_trade_no' => $refundTradeNo,
        'refund_to_balance_amount' => round($refundToBalanceAmount, 2),
        'external_refund_amount' => round($externalRefundAmount, 2),
        'refund_ratio' => (float)$policy['refund_ratio'],
        'remaining_days' => (float)$policy['remaining_days'],
        'service_end_at' => $policy['service_end_at'],
        'message' => $refundMsg,
    ];
}

function commerceUpdateOrderDelivery(PDO $pdo, string $orderNo, string $deliveryStatus, string $note = '', string $error = ''): bool {
    $allowed = ['pending', 'paid_waiting', 'provisioning', 'delivered', 'exception', 'cancelled', 'refunded'];
    if (!in_array($deliveryStatus, $allowed, true)) {
        return false;
    }
    $parts = ['delivery_status = ?', 'delivery_updated_at = NOW()'];
    $params = [$deliveryStatus];
    if (commerceColumnExists($pdo, 'orders', 'delivery_note')) {
        $parts[] = 'delivery_note = ?';
        $params[] = $note !== '' ? $note : null;
    }
    if (commerceColumnExists($pdo, 'orders', 'delivery_error')) {
        $parts[] = 'delivery_error = ?';
        $params[] = $error !== '' ? $error : null;
    }
    if ($deliveryStatus === 'delivered' && commerceColumnExists($pdo, 'orders', 'delivered_at')) {
        $parts[] = 'delivered_at = COALESCE(delivered_at, NOW())';
    }
    if (commerceColumnExists($pdo, 'orders', 'handled_admin_id') && !empty($_SESSION['admin_id'])) {
        $parts[] = 'handled_admin_id = ?';
        $params[] = (int)$_SESSION['admin_id'];
    }
    $params[] = $orderNo;
    $stmt = $pdo->prepare('UPDATE orders SET ' . implode(', ', $parts) . ' WHERE order_no = ?');
    return $stmt->execute($params);
}

function commerceAdjustBalance(PDO $pdo, int $userId, string $type, float $amount, array $options = []): array {
    if ($userId <= 0 || $amount == 0.0) {
        throw new InvalidArgumentException('invalid balance params');
    }
    $stmt = $pdo->prepare('SELECT id, credit_balance FROM users WHERE id = ? FOR UPDATE');
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        throw new RuntimeException('user not found');
    }

    $before = round((float)($user['credit_balance'] ?? 0), 2);
    $after = round($before + $amount, 2);
    if ($after < 0) {
        throw new RuntimeException('insufficient balance');
    }

    $stmt = $pdo->prepare('UPDATE users SET credit_balance = ? WHERE id = ?');
    $stmt->execute([$after, $userId]);

    if (commerceTableExists($pdo, 'credit_transactions')) {
        $stmt = $pdo->prepare('INSERT INTO credit_transactions (user_id, type, amount, balance_before, balance_after, related_order_id, related_order_no, remark, operator_admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
        $stmt->execute([
            $userId,
            $type,
            round($amount, 2),
            $before,
            $after,
            $options['related_order_id'] ?? null,
            $options['related_order_no'] ?? null,
            $options['remark'] ?? null,
            !empty($_SESSION['admin_id']) ? (int)$_SESSION['admin_id'] : ($options['operator_admin_id'] ?? null),
        ]);
        $options['transaction_id'] = (int)$pdo->lastInsertId();
    }

    if (!empty($options['notify'])) {
        $title = $options['notify_title'] ?? '余额变动通知';
        $content = $options['notify_content'] ?? ('您的账户余额已变动，当前余额：' . number_format($after, 2) . ' 积分');
        createNotification($pdo, $userId, $options['notify_type'] ?? 'balance_change', $title, $content, $options['related_order_no'] ?? null);
    }

    return [
        'before' => $before,
        'after' => $after,
        'amount' => round($amount, 2),
        'transaction_id' => $options['transaction_id'] ?? 0,
    ];
}