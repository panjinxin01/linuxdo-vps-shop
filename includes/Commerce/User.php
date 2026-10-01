<?php
/**
 * 用户查询
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */

function commerceGetUserById(PDO $pdo, int $userId): ?array {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

