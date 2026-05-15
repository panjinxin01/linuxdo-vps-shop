<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/coupons.php';

$pdo = getDB();
$action = requestValue('action', '');

$csrfActions = ['create', 'update', 'toggle', 'delete'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function ensureCouponTables(PDO $pdo): void {
    if (!securityTableExists($pdo, 'coupons') || !securityTableExists($pdo, 'coupon_usages')) {
        jsonResponse(0, '数据库未升级，未启用优惠券功能');
    }
}

try {
    switch ($action) {
        case 'validate':
            checkUser();
            ensureCouponTables($pdo);
            $couponCode = normalizeCouponCode(requestValue('coupon_code', ''));
            $productId = validateInt(requestValue('product_id', null), 1);

            if ($couponCode === '') {
                jsonResponse(0, '优惠券码不能为空');
            }

            if ($productId) {
                $stmt = $pdo->prepare('SELECT price, status FROM products WHERE id = ?');
                $stmt->execute([$productId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    jsonResponse(0, '商品不存在');
                }
                if ((int)$row['status'] !== 1) {
                    jsonResponse(0, '商品已下架或暂不可购买');
                }
                $amount = (float)$row['price'];
            } else {
                $amount = validateFloat(requestValue('amount', 0), 0);
                if ($amount === null) {
                    $amount = 0;
                }
            }

            if ($amount <= 0) {
                jsonResponse(0, '金额不合法');
            }

            $res = validateCouponForAmount($pdo, $couponCode, (int)$_SESSION['user_id'], $amount, false);
            if (!$res['ok']) {
                jsonResponse(0, $res['msg'] ?? '优惠券不可用');
            }
            $coupon = $res['coupon'];

            jsonResponse(1, 'ok', [
                'code' => $res['code'],
                'coupon' => [
                    'id' => (int)$coupon['id'],
                    'name' => $coupon['name'],
                    'type' => $coupon['type'],
                    'value' => (float)$coupon['value'],
                    'min_amount' => (float)$coupon['min_amount'],
                    'max_discount' => $coupon['max_discount'] === null ? null : (float)$coupon['max_discount'],
                    'max_uses' => (int)$coupon['max_uses'],
                    'per_user_limit' => (int)$coupon['per_user_limit'],
                    'used_count' => (int)$coupon['used_count'],
                    'starts_at' => $coupon['starts_at'],
                    'ends_at' => $coupon['ends_at'],
                    'status' => (int)$coupon['status']
                ],
                'amount' => round($amount, 2),
                'discount' => (float)$res['discount'],
                'final' => (float)$res['final']
            ]);
            break;

        case 'all':
            checkAdmin($pdo);
            ensureCouponTables($pdo);
            $pg = paginateParams();
            $total = (int)$pdo->query('SELECT COUNT(*) FROM coupons')->fetchColumn();
            $stmt = $pdo->prepare('SELECT * FROM coupons ORDER BY id DESC LIMIT ? OFFSET ?');
            $stmt->bindValue(1, $pg['page_size'], PDO::PARAM_INT);
            $stmt->bindValue(2, $pg['offset'], PDO::PARAM_INT);
            $stmt->execute();
            jsonResponse(1, 'ok', paginateResponse($stmt->fetchAll(PDO::FETCH_ASSOC), $total, $pg));
            break;

        case 'create':
            checkAdmin($pdo);
            ensureCouponTables($pdo);

            $code = normalizeCouponCode(requestValue('code', ''));
            $name = normalizeString(requestValue('name', ''), 100);
            $type = normalizeString(requestValue('type', ''), 20);
            $value = validateFloat(requestValue('value', null), 0.01);
            $minAmount = validateFloat(requestValue('min_amount', 0), 0) ?? 0;
            $maxDiscount = requestValue('max_discount', null);
            $maxUses = validateInt(requestValue('max_uses', 0), 0) ?? 0;
            $perUserLimit = validateInt(requestValue('per_user_limit', 0), 0) ?? 0;
            $startsAt = normalizeString(requestValue('starts_at', ''));
            $endsAt = normalizeString(requestValue('ends_at', ''));
            $status = validateInt(requestValue('status', 1), 0, 1) ?? 1;

            if ($code === '') {
                jsonResponse(0, '优惠券码不能为空');
            }
            if (!preg_match('/^[A-Z0-9_-]{3,50}$/', $code)) {
                jsonResponse(0, '优惠券码格式不正确');
            }
            if (!in_array($type, ['fixed', 'percent'], true)) {
                jsonResponse(0, 'type 仅支持 fixed / percent');
            }
            if ($value === null || $value <= 0) {
                jsonResponse(0, 'value 必须大于0');
            }
            if ($type === 'percent' && ($value <= 0 || $value > 100)) {
                jsonResponse(0, 'percent 类型 value 需在 0-100');
            }
            if ($maxDiscount === '' || $maxDiscount === null) {
                $maxDiscount = null;
            } else {
                $maxDiscount = validateFloat($maxDiscount, 0);
                if ($maxDiscount !== null && $maxDiscount <= 0) {
                    $maxDiscount = null;
                }
            }

            if ($startsAt !== '' && !isValidDateTime($startsAt)) {
                jsonResponse(0, 'starts_at 时间格式不正确');
            }
            if ($endsAt !== '' && !isValidDateTime($endsAt)) {
                jsonResponse(0, 'ends_at 时间格式不正确');
            }
            if ($startsAt !== '' && $endsAt !== '' && strtotime($startsAt) > strtotime($endsAt)) {
                jsonResponse(0, 'starts_at 不能晚于 ends_at');
            }

            $stmt = $pdo->prepare('SELECT COUNT(*) FROM coupons WHERE code = ?');
            $stmt->execute([$code]);
            if ((int)$stmt->fetchColumn() > 0) {
                jsonResponse(0, '该优惠券码已存在');
            }

            $stmt = $pdo->prepare('INSERT INTO coupons (code, name, type, value, min_amount, max_discount, max_uses, per_user_limit, used_count, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)');
            $stmt->execute([
                $code,
                $name,
                $type,
                round($value, 2),
                round($minAmount, 2),
                $maxDiscount === null ? null : round($maxDiscount, 2),
                $maxUses,
                $perUserLimit,
                $startsAt === '' ? null : $startsAt,
                $endsAt === '' ? null : $endsAt,
                $status ? 1 : 0
            ]);

            $newId = (int)$pdo->lastInsertId();
            logAudit($pdo, 'coupon.create', ['code' => $code, 'type' => $type], (string)$newId);
            jsonResponse(1, '创建成功', ['id' => $newId]);
            break;

        case 'update':
            checkAdmin($pdo);
            ensureCouponTables($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, 'id 不合法');
            }

            $stmt = $pdo->prepare('SELECT * FROM coupons WHERE id = ?');
            $stmt->execute([$id]);
            $exist = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$exist) {
                jsonResponse(0, '优惠券不存在');
            }

            $name = normalizeString(requestValue('name', $exist['name']), 100);
            $type = normalizeString(requestValue('type', $exist['type']), 20);
            $value = requestValue('value', $exist['value']);
            $minAmount = requestValue('min_amount', $exist['min_amount']);
            $maxDiscount = requestValue('max_discount', $exist['max_discount']);
            $maxUses = requestValue('max_uses', $exist['max_uses']);
            $perUserLimit = requestValue('per_user_limit', $exist['per_user_limit']);
            $startsAt = requestValue('starts_at', $exist['starts_at']);
            $endsAt = requestValue('ends_at', $exist['ends_at']);
            $status = requestValue('status', $exist['status']);

            if (!in_array($type, ['fixed', 'percent'], true)) {
                jsonResponse(0, 'type 仅支持 fixed / percent');
            }
            $value = validateFloat($value, 0.01);
            if ($value === null) {
                jsonResponse(0, 'value 必须大于0');
            }
            if ($type === 'percent' && ($value <= 0 || $value > 100)) {
                jsonResponse(0, 'percent 类型 value 需在 0-100');
            }
            $minAmount = validateFloat($minAmount, 0) ?? 0;

            if ($maxDiscount === '' || $maxDiscount === null) {
                $maxDiscount = null;
            } else {
                $maxDiscount = validateFloat($maxDiscount, 0);
                if ($maxDiscount !== null && $maxDiscount <= 0) {
                    $maxDiscount = null;
                }
            }

            $maxUses = validateInt($maxUses, 0) ?? 0;
            $perUserLimit = validateInt($perUserLimit, 0) ?? 0;
            $startsAt = normalizeString((string)$startsAt);
            $endsAt = normalizeString((string)$endsAt);
            $status = validateInt($status, 0, 1) ?? (int)$exist['status'];

            if ($startsAt !== '' && !isValidDateTime($startsAt)) {
                jsonResponse(0, 'starts_at 时间格式不正确');
            }
            if ($endsAt !== '' && !isValidDateTime($endsAt)) {
                jsonResponse(0, 'ends_at 时间格式不正确');
            }
            if ($startsAt !== '' && $endsAt !== '' && strtotime($startsAt) > strtotime($endsAt)) {
                jsonResponse(0, 'starts_at 不能晚于 ends_at');
            }

            $stmt = $pdo->prepare('UPDATE coupons SET name=?, type=?, value=?, min_amount=?, max_discount=?, max_uses=?, per_user_limit=?, starts_at=?, ends_at=?, status=? WHERE id=?');
            $stmt->execute([
                $name,
                $type,
                round($value, 2),
                round($minAmount, 2),
                $maxDiscount === null ? null : round((float)$maxDiscount, 2),
                $maxUses,
                $perUserLimit,
                $startsAt === '' ? null : $startsAt,
                $endsAt === '' ? null : $endsAt,
                $status,
                $id
            ]);

            logAudit($pdo, 'coupon.update', ['code' => $exist['code'], 'type' => $type], (string)$id);
            jsonResponse(1, '更新成功');
            break;

        case 'toggle':
            checkAdmin($pdo);
            ensureCouponTables($pdo);
            $id = validateInt(requestValue('id', null), 1);
            $status = validateInt(requestValue('status', 0), 0, 1);
            if (!$id || $status === null) {
                jsonResponse(0, 'id 不合法');
            }
            $stmt = $pdo->prepare('UPDATE coupons SET status = ? WHERE id = ?');
            $stmt->execute([$status ? 1 : 0, $id]);
            logAudit($pdo, 'coupon.toggle', ['status' => $status], (string)$id);
            jsonResponse(1, 'ok');
            break;

        case 'delete':
            checkAdmin($pdo);
            ensureCouponTables($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, 'id 不合法');
            }
            $stmt = $pdo->prepare('SELECT code, used_count FROM coupons WHERE id = ?');
            $stmt->execute([$id]);
            $coupon = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$coupon) {
                jsonResponse(0, '优惠券不存在');
            }
            if ((int)$coupon['used_count'] > 0) {
                jsonResponse(0, '该优惠券已有使用记录，建议停用而不是删除');
            }

            $stmt = $pdo->prepare('SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = ?');
            $stmt->execute([$id]);
            if ((int)$stmt->fetchColumn() > 0) {
                jsonResponse(0, '该优惠券已有使用记录，建议停用而不是删除');
            }

            $stmt = $pdo->prepare('DELETE FROM coupons WHERE id = ?');
            $stmt->execute([$id]);
            logAudit($pdo, 'coupon.delete', ['code' => $coupon['code']], (string)$id);
            jsonResponse(1, '删除成功');
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.coupons', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

