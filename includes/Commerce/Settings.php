<?php
/**
 * 系统设置读写与支付请求表初始化
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */

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
        `notify_id` VARCHAR(100) DEFAULT NULL,
        `status` TINYINT NOT NULL DEFAULT 0,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
        `paid_at` DATETIME DEFAULT NULL,
        UNIQUE KEY `uniq_payment_requests_external` (`external_order_no`),
        INDEX `idx_payment_requests_order` (`order_no`),
        INDEX `idx_payment_requests_notify` (`notify_id`),
        INDEX `idx_payment_requests_user_status` (`user_id`, `status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

