<?php
require_once __DIR__ . '/security.php';

function normalizeCouponCode(string $code): string {
    $code = trim($code);
    if ($code === '') {
        return '';
    }
    $code = preg_replace('/\s+/', '', $code);
    $code = strtoupper($code);
    $code = preg_replace('/[^A-Z0-9_-]/', '', $code);
    if ($code === '') {
        return '';
    }
    return substr($code, 0, 50);
}

function computeCouponDiscount(array $coupon, float $amount): array {
    $amount = round(max(0, $amount), 2);
    if ($amount <= 0) {
        return [0.0, 0.0];
    }
    $type = $coupon['type'] ?? '';
    $value = isset($coupon['value']) ? (float)$coupon['value'] : 0.0;
    $discount = 0.0;

    if ($type === 'fixed') {
        $discount = min($value, $amount);
    } elseif ($type === 'percent') {
        $value = max(0.0, min(100.0, $value));
        $discount = round($amount * $value / 100.0, 2);
        $maxDiscount = $coupon['max_discount'] ?? null;
        if ($maxDiscount !== null) {
            $maxDiscount = (float)$maxDiscount;
            if ($maxDiscount > 0) {
                $discount = min($discount, $maxDiscount);
            }
        }
    }

    $discount = round(max(0, $discount), 2);
    $final = round(max(0, $amount - $discount), 2);
    return [$discount, $final];
}

/**
 * @return array { ok: bool, msg?: string, coupon?: array, discount?: float, final?: float, code?: string }
 */
function validateCouponForAmount(PDO $pdo, string $code, ?int $userId, float $amount, bool $forUpdate = false): array {
    $code = normalizeCouponCode($code);
    if ($code === '') {
        return ['ok' => false, 'msg' => '优惠券码不能为空'];
    }

    $amount = round(max(0, $amount), 2);
    if ($amount <= 0) {
        return ['ok' => false, 'msg' => '金额不合法'];
    }

    if (!securityTableExists($pdo, 'coupons')) {
        return ['ok' => false, 'msg' => '数据库未升级，未启用优惠券功能'];
    }

    $sql = 'SELECT * FROM coupons WHERE code = ? LIMIT 1';
    if ($forUpdate) {
        $sql .= ' FOR UPDATE';
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$code]);
    $coupon = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$coupon) {
        return ['ok' => false, 'msg' => '优惠券不存在'];
    }
    if ((int)($coupon['status'] ?? 0) !== 1) {
        return ['ok' => false, 'msg' => '优惠券已停用'];
    }

    $now = time();
    if (!empty($coupon['starts_at']) && strtotime($coupon['starts_at']) > $now) {
        return ['ok' => false, 'msg' => '优惠券尚未开始'];
    }
    if (!empty($coupon['ends_at']) && strtotime($coupon['ends_at']) < $now) {
        return ['ok' => false, 'msg' => '优惠券已过期'];
    }

    $minAmount = isset($coupon['min_amount']) ? (float)$coupon['min_amount'] : 0.0;
    if ($amount < $minAmount) {
        return ['ok' => false, 'msg' => '订单金额未达到使用门槛'];
    }

    $maxUses = (int)($coupon['max_uses'] ?? 0);
    $usedCount = (int)($coupon['used_count'] ?? 0);
    if ($maxUses > 0 && $usedCount >= $maxUses) {
        return ['ok' => false, 'msg' => '优惠券已被使用完'];
    }

    if ($userId !== null && $userId > 0 && securityTableExists($pdo, 'coupon_usages')) {
        $perUser = (int)($coupon['per_user_limit'] ?? 0);
        if ($perUser > 0) {
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = ? AND user_id = ? AND status IN (0, 1)');
            $stmt->execute([(int)$coupon['id'], $userId]);
            $cnt = (int)$stmt->fetchColumn();
            if ($cnt >= $perUser) {
                return ['ok' => false, 'msg' => '已达到该优惠券使用次数上限'];
            }
        }
    }

    [$discount, $final] = computeCouponDiscount($coupon, $amount);
    if ($discount <= 0) {
        return ['ok' => false, 'msg' => '该优惠券当前不可用'];
    }
    if ($final <= 0) {
        return ['ok' => false, 'msg' => '优惠后金额必须大于0'];
    }

    return ['ok' => true, 'coupon' => $coupon, 'discount' => $discount, 'final' => $final, 'code' => $code];
}

function reserveCouponUsage(PDO $pdo, int $couponId, int $userId, string $orderNo): bool {
    if ($couponId <= 0 || $userId <= 0 || trim($orderNo) === '') {
        return false;
    }
    if (!securityTableExists($pdo, 'coupon_usages')) {
        return false;
    }
    $stmt = $pdo->prepare('INSERT INTO coupon_usages (coupon_id, user_id, order_no, status) VALUES (?, ?, ?, 0)');
    $ok = $stmt->execute([$couponId, $userId, $orderNo]);
    if ($ok && securityTableExists($pdo, 'coupons')) {
        $stmt = $pdo->prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?');
        $stmt->execute([$couponId]);
    }
    return $ok;
}

function markCouponUsedByOrder(PDO $pdo, string $orderNo): bool {
    $orderNo = trim($orderNo);
    if ($orderNo === '' || !securityTableExists($pdo, 'coupon_usages')) {
        return false;
    }
    try {
        $stmt = $pdo->prepare('UPDATE coupon_usages SET status = 1, used_at = NOW() WHERE order_no = ? AND status = 0');
        return $stmt->execute([$orderNo]);
    } catch (Throwable $e) {
        return false;
    }
}

function releaseCouponByOrder(PDO $pdo, string $orderNo): bool {
    $orderNo = trim($orderNo);
    if ($orderNo === '' || !securityTableExists($pdo, 'coupon_usages')) {
        return false;
    }
    try {
        $stmt = $pdo->prepare('SELECT coupon_id FROM coupon_usages WHERE order_no = ? LIMIT 1');
        $stmt->execute([$orderNo]);
        $couponId = $stmt->fetchColumn();
        if (!$couponId) {
            return false;
        }

        $stmt = $pdo->prepare('DELETE FROM coupon_usages WHERE order_no = ?');
        $stmt->execute([$orderNo]);

        if (securityTableExists($pdo, 'coupons')) {
            $stmt = $pdo->prepare('UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = ?');
            $stmt->execute([(int)$couponId]);
        }
        return true;
    } catch (Throwable $e) {
        return false;
    }
}

