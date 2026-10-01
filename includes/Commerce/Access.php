<?php
/**
 * 购买限制：黑白名单 / 等级折扣 / 准入校验
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */

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

