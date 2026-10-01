<?php
/**
 * 退款策略计算与退款执行（含支付通道回调）
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */

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

    // 文档 3.2 限制：平台仅支持对已成功的积分流转服务进行【全额】退回，
    // money 必须等于原积分流转服务的积分数量。
    // 因此外部渠道退款金额只能是 0（不退外部）或 externalPaid（全额退回）。
    if ($refundTarget === 'balance') {
        $externalRefundAmount = 0.00;
    } elseif ($refundTotal + 0.00001 >= $externalPaid) {
        // 可退金额足以覆盖外部支付部分 → 外部渠道全额原路退回
        $externalRefundAmount = $externalPaid;
    } else {
        // 可退金额（按剩余时长折算）不足以发起外部全额退款 → 全部退回站内余额
        $externalRefundAmount = 0.00;
    }
    $refundToBalanceAmount = round($refundTotal - $externalRefundAmount, 2);
    // 校验基准必须是"实付总额"，而不是"余额支付部分"。
    // 外部渠道只支持全额退回，因此部分退款时外部金额为 0、剩余部分退回站内余额，
    // 此时 refundToBalanceAmount 会大于 balancePaid（外部支付订单 balancePaid = 0），
    // 若拿 balancePaid 比较会误判为超额，导致所有外部支付订单的部分退款直接失败。
    if ($refundToBalanceAmount + $externalRefundAmount > $totalPaid + 0.00001) {
        throw new RuntimeException('退款金额超出已支付金额，无法执行退款');
    }
    if ($refundToBalanceAmount < 0) {
        $refundToBalanceAmount = 0.00;
    }

    $refundTradeNo = null;
    if ($externalRefundAmount > 0) {
        if (empty($order['trade_no'])) {
            throw new RuntimeException('订单缺少平台交易号，无法发起外部退款');
        }
        // 统一走易支付兼容退款接口（文档 3.2：pid + key 认证，仅支持全额退回）
        require_once __DIR__ . '/../ldcpay.php';
        $refundResult = epay_refund($pdo, (string)$order['trade_no'], $externalRefundAmount, $orderNo);
        if ((int)($refundResult['code'] ?? 0) !== 1) {
            throw new RuntimeException((string)($refundResult['msg'] ?? '平台退款失败'));
        }
        $refundTradeNo = (string)($refundResult['trade_no'] ?? $order['trade_no']);
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

