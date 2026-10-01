<?php
/**
 * 接口限流（滑动窗口）
 * 来源：includes/security.php（目录结构拆分，内容零改动）
 */

function rateLimit(PDO $pdo, string $action, string $identity = '', int $limit = 5, int $windowSeconds = 300, int $blockSeconds = 900): void {
    $action = trim($action);
    if ($action === '') {
        return;
    }
    if (!securityTableExists($pdo, 'rate_limits')) {
        return;
    }

    $limit = max(1, $limit);
    $windowSeconds = max(60, $windowSeconds);
    $blockSeconds = max(60, $blockSeconds);

    $ip = getClientIp();
    $identity = trim($identity);
    $key = $action . '|' . $ip;
    if ($identity !== '') {
        $key .= '|' . $identity;
    }
    if (strlen($key) > 255) {
        $key = substr($key, 0, 255);
    }

    $stmt = $pdo->prepare('SELECT id, hit_count, window_start, blocked_until FROM rate_limits WHERE rate_key = ? LIMIT 1');
    $stmt->execute([$key]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $now = time();

    if ($row && !empty($row['blocked_until'])) {
        $blockedUntil = strtotime($row['blocked_until']);
        if ($blockedUntil && $blockedUntil > $now) {
            jsonResponse(0, '操作过于频繁，请稍后再试');
        }
    }

    if (!$row) {
        $stmt = $pdo->prepare('INSERT INTO rate_limits (rate_key, hit_count, window_start) VALUES (?, 1, NOW())');
        $stmt->execute([$key]);
        return;
    }

    $windowStart = strtotime($row['window_start']) ?: $now;
    if ($windowStart + $windowSeconds <= $now) {
        $stmt = $pdo->prepare('UPDATE rate_limits SET hit_count = 1, window_start = NOW(), blocked_until = NULL WHERE id = ?');
        $stmt->execute([(int)$row['id']]);
        return;
    }

    $count = (int)$row['hit_count'] + 1;
    if ($count > $limit) {
        $stmt = $pdo->prepare('UPDATE rate_limits SET hit_count = ?, blocked_until = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?');
        $stmt->execute([$count, $blockSeconds, (int)$row['id']]);
        jsonResponse(0, '操作过于频繁，请稍后再试');
    }

    $stmt = $pdo->prepare('UPDATE rate_limits SET hit_count = ? WHERE id = ?');
    $stmt->execute([$count, (int)$row['id']]);
}

