<?php
/**
 * 余额增减与流水记账
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */

function commerceAdjustBalance(PDO $pdo, int $userId, string $type, float $amount, array $options = []): array {
    if ($userId <= 0 || abs($amount) < 0.00001) {
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
