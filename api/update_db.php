<?php
/**
 * 数据库更新脚本
 * 包含Linux DO OAuth2 字段迁移
 */
// 数据库更新API - 用于安装缺失的表
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/../includes/db.php';

$pdo = getDB();
checkAdmin($pdo);

$action = requestValue('action', '');

$csrfActions = ['update', 'reset', 'migrate_admin_role', 'migrate_linuxdo'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function ensureIndex(PDO $pdo, string $table, string $indexName, string $definition, array &$migrated, array &$errors): void {
    try {
        $stmt = $pdo->prepare("SHOW INDEX FROM `$table` WHERE Key_name = ?");
        $stmt->execute([$indexName]);
        if ($stmt->fetch()) {
            return;
        }
        $pdo->exec("ALTER TABLE `$table` ADD INDEX `$indexName` ($definition)");
        $migrated[] = "$table.$indexName";
    } catch (PDOException $e) {
        $errors[] = "$table.$indexName: " . $e->getMessage();
    }
}

try {
switch ($action) {
    case 'check':
        // 检查哪些表缺失
        $pdo = getDB();
        $requiredTables = ['users', 'admins', 'products', 'orders', 'coupons', 'coupon_usages', 'settings', 'announcements', 'tickets', 'ticket_replies', 'rate_limits', 'audit_logs', 'error_logs', 'notifications', 'password_resets', 'email_verifications', 'ticket_attachments', 'schema_migrations'];
        $existingTables = [];
        $missingTables = [];
        
        $stmt = $pdo->query("SHOW TABLES");
        while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
            $existingTables[] = $row[0];
        }
        
        foreach ($requiredTables as $table) {
            if (!in_array($table, $existingTables)) {
                $missingTables[] = $table;
            }
        }
        
        jsonResponse(1, 'ok', [
            'existing' => $existingTables,
            'missing' => $missingTables,
            'all_installed' => empty($missingTables)
        ]);
        break;
    
    case 'update':
        // 执行更新，创建缺失的表
        try {
            $pdo = getDB();
            $created = [];
            $errors = [];
            
            // 表定义
            // 表定义
            $tableDefinitions = [
                'users' => "CREATE TABLE IF NOT EXISTS `users` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `username` VARCHAR(50) NOT NULL UNIQUE,
                    `password` VARCHAR(255) DEFAULT NULL,
                    `email` VARCHAR(100),
                    `linuxdo_id` INT DEFAULT NULL UNIQUE COMMENT 'Linux DO用户ID',
                    `linuxdo_username` VARCHAR(100) DEFAULT NULL COMMENT 'Linux DO用户名',
                    `linuxdo_name` VARCHAR(100) DEFAULT NULL COMMENT 'Linux DO昵称',
                    `linuxdo_trust_level` TINYINT DEFAULT 0 COMMENT 'Linux DO信任等级0-4',
                    `linuxdo_avatar` VARCHAR(500) DEFAULT NULL COMMENT 'Linux DO头像URL',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` DATETIME DEFAULT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                'admins' => "CREATE TABLE IF NOT EXISTS `admins` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `username` VARCHAR(50) NOT NULL UNIQUE,
                    `password` VARCHAR(255) NOT NULL,
                    `role` VARCHAR(20) DEFAULT 'admin' COMMENT 'admin普通管理员 super超级管理员',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'products' => "CREATE TABLE IF NOT EXISTS `products` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `name` VARCHAR(100) NOT NULL,
                    `cpu` VARCHAR(50),
                    `memory` VARCHAR(50),
                    `disk` VARCHAR(50),
                    `bandwidth` VARCHAR(50),
                    `price` DECIMAL(10,2) NOT NULL,
                    `ip_address` VARCHAR(50) NOT NULL,
                    `ssh_port` INT DEFAULT 22,
                    `ssh_user` VARCHAR(50) DEFAULT 'root',
                    `ssh_password` VARCHAR(255) NOT NULL,
                    `extra_info` TEXT,
                    `status` TINYINT DEFAULT 1 COMMENT '1在售0已售',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'orders' => "CREATE TABLE IF NOT EXISTS `orders` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `order_no` VARCHAR(50) NOT NULL UNIQUE,
                    `trade_no` VARCHAR(50),
                    `user_id` INT NOT NULL,
                    `product_id` INT NOT NULL,
                    `original_price` DECIMAL(10,2) NOT NULL COMMENT '原价',
                    `coupon_id` INT DEFAULT NULL,
                    `coupon_code` VARCHAR(50) DEFAULT NULL,
                    `coupon_discount` DECIMAL(10,2) DEFAULT 0 COMMENT '优惠金额',
                    `price` DECIMAL(10,2) NOT NULL COMMENT '应付金额',
                    `status` TINYINT DEFAULT 0 COMMENT '0待支付 1已支付 2已退款 3已取消',
                    `refund_reason` VARCHAR(255) DEFAULT NULL,
                    `refund_trade_no` VARCHAR(100) DEFAULT NULL,
                    `refund_amount` DECIMAL(10,2) DEFAULT NULL,
                    `refund_at` DATETIME DEFAULT NULL,
                    `cancel_reason` VARCHAR(255) DEFAULT NULL,
                    `cancelled_at` DATETIME DEFAULT NULL,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    `paid_at` DATETIME,
                    INDEX `idx_orders_user_status_created` (`user_id`, `status`, `created_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                'coupons' => "CREATE TABLE IF NOT EXISTS `coupons` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `code` VARCHAR(50) NOT NULL UNIQUE,
                    `name` VARCHAR(100) DEFAULT NULL,
                    `type` VARCHAR(10) NOT NULL COMMENT 'fixed/percent',
                    `value` DECIMAL(10,2) NOT NULL,
                    `min_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
                    `max_discount` DECIMAL(10,2) DEFAULT NULL,
                    `max_uses` INT NOT NULL DEFAULT 0 COMMENT '0=不限',
                    `per_user_limit` INT NOT NULL DEFAULT 0 COMMENT '0=不限',
                    `used_count` INT NOT NULL DEFAULT 0,
                    `starts_at` DATETIME DEFAULT NULL,
                    `ends_at` DATETIME DEFAULT NULL,
                    `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1启用0停用',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                'coupon_usages' => "CREATE TABLE IF NOT EXISTS `coupon_usages` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `coupon_id` INT NOT NULL,
                    `user_id` INT NOT NULL,
                    `order_no` VARCHAR(50) NOT NULL UNIQUE,
                    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0占用 1已使用',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    `used_at` DATETIME DEFAULT NULL,
                    INDEX (`coupon_id`),
                    INDEX (`user_id`),
                    INDEX `idx_coupon_user_order` (`coupon_id`, `user_id`, `order_no`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                'settings' => "CREATE TABLE IF NOT EXISTS `settings` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `key_name` VARCHAR(50) NOT NULL UNIQUE,
                    `key_value` TEXT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'announcements' => "CREATE TABLE IF NOT EXISTS `announcements` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `title` VARCHAR(200) NOT NULL,
                    `content` TEXT NOT NULL,
                    `is_top` TINYINT DEFAULT 0 COMMENT '是否置顶',
                    `status` TINYINT DEFAULT 1 COMMENT '1显示 0隐藏',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'tickets' => "CREATE TABLE IF NOT EXISTS `tickets` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `user_id` INT NOT NULL,
                    `order_id` INT DEFAULT NULL COMMENT '关联订单(可选)',
                    `title` VARCHAR(200) NOT NULL,
                    `status` TINYINT DEFAULT 0 COMMENT '0待回复 1已回复 2已关闭',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX `idx_tickets_user_status_updated` (`user_id`, `status`, `updated_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'ticket_replies' => "CREATE TABLE IF NOT EXISTS `ticket_replies` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `ticket_id` INT NOT NULL,
                    `user_id` INT DEFAULT NULL COMMENT 'NULL表示管理员回复',
                    `content` TEXT NOT NULL,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                'rate_limits' => "CREATE TABLE IF NOT EXISTS `rate_limits` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `rate_key` VARCHAR(255) NOT NULL UNIQUE,
                    `hit_count` INT NOT NULL DEFAULT 0,
                    `window_start` DATETIME NOT NULL,
                    `blocked_until` DATETIME DEFAULT NULL,
                    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                'audit_logs' => "CREATE TABLE IF NOT EXISTS `audit_logs` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `actor_type` VARCHAR(20) NOT NULL,
                    `actor_id` INT DEFAULT NULL,
                    `actor_name` VARCHAR(50) DEFAULT NULL,
                    `action` VARCHAR(100) NOT NULL,
                    `target_id` VARCHAR(100) DEFAULT NULL,
                    `ip_address` VARCHAR(50) DEFAULT NULL,
                    `user_agent` VARCHAR(255) DEFAULT NULL,
                    `details` TEXT DEFAULT NULL,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX (`actor_id`),
                    INDEX (`created_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
'error_logs' => "CREATE TABLE IF NOT EXISTS `error_logs` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `context` VARCHAR(100) NOT NULL,
                    `message` TEXT NOT NULL,
                    `details` TEXT DEFAULT NULL,
                    `ip_address` VARCHAR(50) DEFAULT NULL,
                    `user_agent` VARCHAR(255) DEFAULT NULL,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX (`created_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
'notifications' => "CREATE TABLE IF NOT EXISTS `notifications` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `user_id` INT NOT NULL,
                    `type` VARCHAR(50) NOT NULL COMMENT '通知类型: order_paid/order_delivered/ticket_reply/system',
                    `title` VARCHAR(200) NOT NULL,
                    `content` TEXT NOT NULL,
                    `related_id` VARCHAR(100) DEFAULT NULL COMMENT '关联ID',
                    `is_read` TINYINT DEFAULT 0 COMMENT '0未读 1已读',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX `idx_notifications_user_read` (`user_id`, `is_read`, `created_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                'password_resets' => "CREATE TABLE IF NOT EXISTS `password_resets` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `user_id` INT NOT NULL,
                    `token` VARCHAR(255) NOT NULL,
                    `expires_at` DATETIME NOT NULL,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX (`user_id`),
                    INDEX (`expires_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'email_verifications' => "CREATE TABLE IF NOT EXISTS `email_verifications` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `user_id` INT NOT NULL,
                    `email` VARCHAR(100) NOT NULL,
                    `code` VARCHAR(255) NOT NULL,
                    `expires_at` DATETIME NOT NULL,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX (`user_id`),
                    INDEX (`expires_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'ticket_attachments' => "CREATE TABLE IF NOT EXISTS `ticket_attachments` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `ticket_id` INT NOT NULL,
                    `reply_id` INT DEFAULT NULL,
                    `uploader_type` VARCHAR(10) NOT NULL COMMENT 'user/admin',
                    `uploader_id` INT NOT NULL,
                    `original_name` VARCHAR(255) NOT NULL,
                    `file_path` VARCHAR(500) NOT NULL,
                    `file_size` INT NOT NULL,
                    `mime_type` VARCHAR(100) NOT NULL,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX (`ticket_id`),
                    INDEX (`reply_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'schema_migrations' => "CREATE TABLE IF NOT EXISTS `schema_migrations` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `version` VARCHAR(50) NOT NULL UNIQUE,
                    `description` VARCHAR(255) DEFAULT NULL,
                    `executed_at` DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            ];
            
            // 获取已存在的表
            $existingTables = [];
            $stmt = $pdo->query("SHOW TABLES");
            while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
                $existingTables[] = $row[0];
            }
// 创建缺失的表
            foreach ($tableDefinitions as $tableName => $sql) {
                if (!in_array($tableName, $existingTables)) {
                    try {
                        $pdo->exec($sql);
                        $created[] = $tableName;
                    } catch (PDOException $e) {
                        $errors[] = "$tableName: " . $e->getMessage();
                    }
                }
            }
            
            // 自动执行字段迁移
            $migrated = [];
// 1. admins表role字段迁移
            if (in_array('admins', $existingTables)) {
                $stmt = $pdo->query("DESCRIBE `admins`");
                $adminCols = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'Field');
                if (!in_array('role', $adminCols)) {
                    try {
                        $pdo->exec("ALTER TABLE `admins` ADD COLUMN `role` VARCHAR(20) DEFAULT 'admin' COMMENT 'admin普通管理员 super超级管理员'");
                        $migrated[] = 'admins.role';
                    } catch (PDOException $e) {
                        $errors[] = "admins.role: " . $e->getMessage();
                    }
                }
                // 确保至少有一个超级管理员（检查NULL和空值）
                $superCount = $pdo->query("SELECT COUNT(*) FROM `admins` WHERE `role` = 'super'")->fetchColumn();
                if ($superCount == 0) {
                    // 将第一个管理员设为超级管理员
                    $firstId = $pdo->query("SELECT MIN(id) FROM `admins`")->fetchColumn();
                    if ($firstId) {
                        $pdo->exec("UPDATE `admins` SET `role` = 'super' WHERE `id` = $firstId");
                        $migrated[] = 'admins.first_super';
                    }
                }
            }
            
            // 2. users表Linux DO字段迁移
            if (in_array('users', $existingTables)) {
                $stmt = $pdo->query("DESCRIBE `users`");
                $userCols = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'Field');
$linuxdoFields = [
                    'linuxdo_id' => "ALTER TABLE `users` ADD COLUMN `linuxdo_id` INT DEFAULT NULL UNIQUE COMMENT 'Linux DO用户ID'",
                    'linuxdo_username' => "ALTER TABLE `users` ADD COLUMN `linuxdo_username` VARCHAR(100) DEFAULT NULL COMMENT 'Linux DO用户名'",
                    'linuxdo_name' => "ALTER TABLE `users` ADD COLUMN `linuxdo_name` VARCHAR(100) DEFAULT NULL COMMENT 'Linux DO昵称'",
                    'linuxdo_trust_level' => "ALTER TABLE `users` ADD COLUMN `linuxdo_trust_level` TINYINT DEFAULT 0 COMMENT 'Linux DO信任等级0-4'",
                    'linuxdo_avatar' => "ALTER TABLE `users` ADD COLUMN `linuxdo_avatar` VARCHAR(500) DEFAULT NULL COMMENT 'Linux DO头像URL'",
                    'email_verified' => "ALTER TABLE `users` ADD COLUMN `email_verified` DATETIME DEFAULT NULL COMMENT '邮箱验证时间'",
                    'updated_at' => "ALTER TABLE `users` ADD COLUMN `updated_at` DATETIME DEFAULT NULL"
                ];
                foreach ($linuxdoFields as $field => $sql) {
                    if (!in_array($field, $userCols)) {
                        try {
                            $pdo->exec($sql);
                            $migrated[] = "users.$field";
                        } catch (PDOException $e) {
                            $errors[] = "users.$field: " . $e->getMessage();
                        }
                    }
                }
                // 修改password字段允许NULL
                if (in_array('password', $userCols)) {
                    try {
                        $pdo->exec("ALTER TABLE `users` MODIFY COLUMN `password` VARCHAR(255) DEFAULT NULL");} catch (PDOException $e) {
                        //忽略
                    }
                }
            }
            

            // 2.1 products表敏感字段长度迁移
            if (in_array('products', $existingTables)) {
                try {
                    $pdo->exec("ALTER TABLE `products` MODIFY COLUMN `ssh_password` VARCHAR(255) NOT NULL");
                    $migrated[] = 'products.ssh_password';
                } catch (PDOException $e) {
                    // 忽略重复修改
                }
            }

            // 3. orders表优惠券字段迁移
            if (in_array('orders', $existingTables)) {
                try {
                    $stmt = $pdo->query("DESCRIBE `orders`");
                    $orderCols = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'Field');

                    $orderFields = [
                        'original_price' => "ALTER TABLE `orders` ADD COLUMN `original_price` DECIMAL(10,2) DEFAULT NULL COMMENT '原价' AFTER `product_id`",
                        'coupon_id' => "ALTER TABLE `orders` ADD COLUMN `coupon_id` INT DEFAULT NULL AFTER `original_price`",
                        'coupon_code' => "ALTER TABLE `orders` ADD COLUMN `coupon_code` VARCHAR(50) DEFAULT NULL AFTER `coupon_id`",
                        'coupon_discount' => "ALTER TABLE `orders` ADD COLUMN `coupon_discount` DECIMAL(10,2) DEFAULT 0 COMMENT '优惠金额' AFTER `coupon_code`",
                        'admin_note' => "ALTER TABLE `orders` ADD COLUMN `admin_note` TEXT DEFAULT NULL COMMENT '管理员备注'",
                        'delivered_at' => "ALTER TABLE `orders` ADD COLUMN `delivered_at` DATETIME DEFAULT NULL COMMENT '交付时间'",
                        'delivery_info' => "ALTER TABLE `orders` ADD COLUMN `delivery_info` TEXT DEFAULT NULL COMMENT '补发交付信息'",
                        'refund_reason' => "ALTER TABLE `orders` ADD COLUMN `refund_reason` VARCHAR(255) DEFAULT NULL",
                        'refund_trade_no' => "ALTER TABLE `orders` ADD COLUMN `refund_trade_no` VARCHAR(100) DEFAULT NULL",
                        'refund_amount' => "ALTER TABLE `orders` ADD COLUMN `refund_amount` DECIMAL(10,2) DEFAULT NULL",
                        'refund_at' => "ALTER TABLE `orders` ADD COLUMN `refund_at` DATETIME DEFAULT NULL",
                        'cancel_reason' => "ALTER TABLE `orders` ADD COLUMN `cancel_reason` VARCHAR(255) DEFAULT NULL",
                        'cancelled_at' => "ALTER TABLE `orders` ADD COLUMN `cancelled_at` DATETIME DEFAULT NULL"
                    ];

                    foreach ($orderFields as $field => $sql) {
                        if (!in_array($field, $orderCols)) {
                            try {
                                $pdo->exec($sql);
                                $migrated[] = "orders.$field";
                            } catch (PDOException $e) {
                                $errors[] = "orders.$field: " . $e->getMessage();
                            }
                        }
                    }

                    // 历史订单回填原价
                    if (in_array('original_price', $orderCols) || in_array('original_price', array_keys($orderFields))) {
                        try {
                            $pdo->exec("UPDATE `orders` SET `original_price` = `price` WHERE `original_price` IS NULL");
                            // 尝试改为 NOT NULL
                            $pdo->exec("ALTER TABLE `orders` MODIFY COLUMN `original_price` DECIMAL(10,2) NOT NULL COMMENT '原价'");
                        } catch (PDOException $e) {
                            // 忽略
                        }
                    }
                } catch (PDOException $e) {
                    // 忽略
                }
            }

            // 4. 索引补齐
            if (in_array('orders', $existingTables)) {
                ensureIndex($pdo, 'orders', 'idx_orders_user_status_created', '`user_id`, `status`, `created_at`', $migrated, $errors);
            }
            if (in_array('coupon_usages', $existingTables)) {
                ensureIndex($pdo, 'coupon_usages', 'idx_coupon_user_order', '`coupon_id`, `user_id`, `order_no`', $migrated, $errors);
            }
            if (in_array('tickets', $existingTables)) {
                ensureIndex($pdo, 'tickets', 'idx_tickets_user_status_updated', '`user_id`, `status`, `updated_at`', $migrated, $errors);
            }

            // 5. announcements表定时发布字段迁移
            if (in_array('announcements', $existingTables)) {
                try {
                    $stmt = $pdo->query("DESCRIBE `announcements`");
                    $annCols = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'Field');
                    $annFields = [
                        'publish_at' => "ALTER TABLE `announcements` ADD COLUMN `publish_at` DATETIME DEFAULT NULL COMMENT '定时发布时间'",
                        'expires_at' => "ALTER TABLE `announcements` ADD COLUMN `expires_at` DATETIME DEFAULT NULL COMMENT '过期时间'"
                    ];
                    foreach ($annFields as $field => $sql) {
                        if (!in_array($field, $annCols)) {
                            try {
                                $pdo->exec($sql);$migrated[] = "announcements.$field";
                            } catch (PDOException $e) {
                                $errors[] = "announcements.$field: " . $e->getMessage();
                            }
                        }
                    }
                } catch (PDOException $e) {
                    //忽略
                }
            }

            // 6. tickets表优先级/标签/指派字段迁移
            if (in_array('tickets', $existingTables)) {
                try {
                    $stmt = $pdo->query("DESCRIBE `tickets`");
                    $ticketCols = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'Field');
                    $ticketFields = [
                        'priority' => "ALTER TABLE `tickets` ADD COLUMN `priority` TINYINT DEFAULT 1 COMMENT '优先级: 0低 1普通 2高 3紧急'",
                        'tags' => "ALTER TABLE `tickets` ADD COLUMN `tags` VARCHAR(255) DEFAULT NULL COMMENT '标签,逗号分隔'",
                        'assignee_admin_id' => "ALTER TABLE `tickets` ADD COLUMN `assignee_admin_id` INT DEFAULT NULL COMMENT '指派的管理员ID'"
                    ];
                    foreach ($ticketFields as $field => $sql) {
                        if (!in_array($field, $ticketCols)) {
                            try {
                                $pdo->exec($sql);
                                $migrated[] = "tickets.$field";
                            } catch (PDOException $e) {
                                $errors[] = "tickets.$field: " . $e->getMessage();
                            }
                        }
                    }// 添加优先级索引
                    ensureIndex($pdo, 'tickets', 'idx_tickets_priority', '`priority`, `status`', $migrated, $errors);
                } catch (PDOException $e) {
                    //忽略
                }
            }

            if (empty($errors)) {
                if (empty($created) && empty($migrated)) {
                    logAudit($pdo, 'db.update', ['created' => $created, 'migrated' => $migrated]);
                    jsonResponse(1, '数据库已是最新版本，无需更新');
                } else {
                    logAudit($pdo, 'db.update', ['created' => $created, 'migrated' => $migrated]);
                    jsonResponse(1, '数据库更新成功', ['created' => $created, 'migrated' => $migrated]);
                }
            } else {
                jsonResponse(0, '部分更新失败', ['created' => $created, 'migrated' => $migrated, 'errors' => $errors]);
            }
        } catch (PDOException $e) {
            jsonResponse(0, '数据库更新失败: ' . $e->getMessage());
        }
        break;
    case 'reset':
        // 重置数据库 - 删除所有表并重新创建
        try {
            $pdo = getDB();
            
            // 先备份管理员数据
            $adminData = [];
            try {
                $stmt = $pdo->query("SELECT * FROM admins");
                $adminData = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (PDOException $e) {
                // 表可能不存在，忽略
            }
            
            // 备份设置数据（包含OAuth配置）
            $settingsData = [];
            try {
                $stmt = $pdo->query("SELECT * FROM settings");
                $settingsData = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (PDOException $e) {
                // 表可能不存在，忽略
            }
            
            // 要删除的表（按依赖顺序）
            $tablesToDrop = ['coupon_usages', 'coupons', 'ticket_replies', 'tickets', 'orders', 'products', 'users', 'announcements', 'settings', 'admins', 'rate_limits', 'audit_logs', 'error_logs'];
            
            //禁用外键检查
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
            
            // 删除所有表
            foreach ($tablesToDrop as $table) {
                try {
                    $pdo->exec("DROP TABLE IF EXISTS `$table`");
                } catch (PDOException $e) {
                    // 忽略错误
                }
            }
            
            //恢复外键检查
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            // 重新创建所有表
            $tableDefinitions = [
                'users' => "CREATE TABLE `users` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `username` VARCHAR(50) NOT NULL UNIQUE,
                    `password` VARCHAR(255) DEFAULT NULL,
                    `email` VARCHAR(100),
                    `linuxdo_id` INT DEFAULT NULL UNIQUE COMMENT 'Linux DO用户ID',
                    `linuxdo_username` VARCHAR(100) DEFAULT NULL COMMENT 'Linux DO用户名',
                    `linuxdo_name` VARCHAR(100) DEFAULT NULL COMMENT 'Linux DO昵称',
                    `linuxdo_trust_level` TINYINT DEFAULT 0 COMMENT 'Linux DO信任等级0-4',
                    `linuxdo_avatar` VARCHAR(500) DEFAULT NULL COMMENT 'Linux DO头像URL',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` DATETIME DEFAULT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                'admins' => "CREATE TABLE `admins` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `username` VARCHAR(50) NOT NULL UNIQUE,
                    `password` VARCHAR(255) NOT NULL,
                    `role` VARCHAR(20) DEFAULT 'admin' COMMENT 'admin普通管理员 super超级管理员',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'products' => "CREATE TABLE `products` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `name` VARCHAR(100) NOT NULL,
                    `cpu` VARCHAR(50),
                    `memory` VARCHAR(50),
                    `disk` VARCHAR(50),
                    `bandwidth` VARCHAR(50),
                    `price` DECIMAL(10,2) NOT NULL,
                    `ip_address` VARCHAR(50) NOT NULL,
                    `ssh_port` INT DEFAULT 22,
                    `ssh_user` VARCHAR(50) DEFAULT 'root',
                    `ssh_password` VARCHAR(255) NOT NULL,
                    `extra_info` TEXT,
                    `status` TINYINT DEFAULT 1 COMMENT '1在售0已售',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'orders' => "CREATE TABLE `orders` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `order_no` VARCHAR(50) NOT NULL UNIQUE,
                    `trade_no` VARCHAR(50),
                    `user_id` INT NOT NULL,
                    `product_id` INT NOT NULL,
                    `original_price` DECIMAL(10,2) NOT NULL COMMENT '原价',
                    `coupon_id` INT DEFAULT NULL,
                    `coupon_code` VARCHAR(50) DEFAULT NULL,
                    `coupon_discount` DECIMAL(10,2) DEFAULT 0 COMMENT '优惠金额',
                    `price` DECIMAL(10,2) NOT NULL COMMENT '应付金额',
                    `status` TINYINT DEFAULT 0 COMMENT '0待支付 1已支付 2已退款 3已取消',
                    `refund_reason` VARCHAR(255) DEFAULT NULL,
                    `refund_trade_no` VARCHAR(100) DEFAULT NULL,
                    `refund_amount` DECIMAL(10,2) DEFAULT NULL,
                    `refund_at` DATETIME DEFAULT NULL,
                    `cancel_reason` VARCHAR(255) DEFAULT NULL,
                    `cancelled_at` DATETIME DEFAULT NULL,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    `paid_at` DATETIME,
                    INDEX `idx_orders_user_status_created` (`user_id`, `status`, `created_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                'coupons' => "CREATE TABLE `coupons` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `code` VARCHAR(50) NOT NULL UNIQUE,
                    `name` VARCHAR(100) DEFAULT NULL,
                    `type` VARCHAR(10) NOT NULL COMMENT 'fixed/percent',
                    `value` DECIMAL(10,2) NOT NULL,
                    `min_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
                    `max_discount` DECIMAL(10,2) DEFAULT NULL,
                    `max_uses` INT NOT NULL DEFAULT 0 COMMENT '0=不限',
                    `per_user_limit` INT NOT NULL DEFAULT 0 COMMENT '0=不限',
                    `used_count` INT NOT NULL DEFAULT 0,
                    `starts_at` DATETIME DEFAULT NULL,
                    `ends_at` DATETIME DEFAULT NULL,
                    `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1启用0停用',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                'coupon_usages' => "CREATE TABLE `coupon_usages` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `coupon_id` INT NOT NULL,
                    `user_id` INT NOT NULL,
                    `order_no` VARCHAR(50) NOT NULL UNIQUE,
                    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0占用 1已使用',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    `used_at` DATETIME DEFAULT NULL,
                    INDEX (`coupon_id`),
                    INDEX (`user_id`),
                    INDEX `idx_coupon_user_order` (`coupon_id`, `user_id`, `order_no`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'settings' => "CREATE TABLE `settings` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `key_name` VARCHAR(50) NOT NULL UNIQUE,
                    `key_value` TEXT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'announcements' => "CREATE TABLE `announcements` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `title` VARCHAR(200) NOT NULL,
                    `content` TEXT NOT NULL,
                    `is_top` TINYINT DEFAULT 0 COMMENT '是否置顶',
                    `status` TINYINT DEFAULT 1 COMMENT '1显示 0隐藏',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'tickets' => "CREATE TABLE `tickets` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `user_id` INT NOT NULL,
                    `order_id` INT DEFAULT NULL COMMENT '关联订单(可选)',
                    `title` VARCHAR(200) NOT NULL,
                    `status` TINYINT DEFAULT 0 COMMENT '0待回复 1已回复 2已关闭',
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX `idx_tickets_user_status_updated` (`user_id`, `status`, `updated_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                
                'ticket_replies' => "CREATE TABLE `ticket_replies` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `ticket_id` INT NOT NULL,
                    `user_id` INT DEFAULT NULL COMMENT 'NULL表示管理员回复',
                    `content` TEXT NOT NULL,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                'rate_limits' => "CREATE TABLE `rate_limits` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `rate_key` VARCHAR(255) NOT NULL UNIQUE,
                    `hit_count` INT NOT NULL DEFAULT 0,
                    `window_start` DATETIME NOT NULL,
                    `blocked_until` DATETIME DEFAULT NULL,
                    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                'audit_logs' => "CREATE TABLE `audit_logs` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `actor_type` VARCHAR(20) NOT NULL,
                    `actor_id` INT DEFAULT NULL,
                    `actor_name` VARCHAR(50) DEFAULT NULL,
                    `action` VARCHAR(100) NOT NULL,
                    `target_id` VARCHAR(100) DEFAULT NULL,
                    `ip_address` VARCHAR(50) DEFAULT NULL,
                    `user_agent` VARCHAR(255) DEFAULT NULL,
                    `details` TEXT DEFAULT NULL,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX (`actor_id`),
                    INDEX (`created_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                'error_logs' => "CREATE TABLE `error_logs` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `context` VARCHAR(100) NOT NULL,
                    `message` TEXT NOT NULL,
                    `details` TEXT DEFAULT NULL,
                    `ip_address` VARCHAR(50) DEFAULT NULL,
                    `user_agent` VARCHAR(255) DEFAULT NULL,
                    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX (`created_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            ];
            
            foreach ($tableDefinitions as $tableName => $sql) {
                $pdo->exec($sql);
            }
            //恢复管理员数据
            if (!empty($adminData)) {
                $stmt = $pdo->prepare("INSERT INTO admins (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)");
                foreach ($adminData as $admin) {
                    $role = $admin['role'] ?? 'super';
                    $stmt->execute([$admin['id'], $admin['username'], $admin['password'], $role, $admin['created_at']]);
                }
            }
            
            // 恢复设置数据（包含OAuth配置）
            if (!empty($settingsData)) {
                $stmt = $pdo->prepare("INSERT INTO settings (id, key_name, key_value) VALUES (?, ?, ?)");
                foreach ($settingsData as $setting) {
                    $stmt->execute([$setting['id'], $setting['key_name'], $setting['key_value']]);
                }
            }
            logAudit($pdo, 'db.reset');
            jsonResponse(1, '数据库已重置完成，管理员账号和系统设置已保留');
} catch (PDOException $e) {
            jsonResponse(0, '重置失败: ' . $e->getMessage());
        }
        break;

    case 'migrate_admin_role':
        // 为现有admins表添加role字段并确保有超级管理员
        try {
            $pdo = getDB();
            $actions = [];
            
            // 检查role字段是否存在
            $stmt = $pdo->query("DESCRIBE `admins`");
            $existingColumns = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $existingColumns[] = $row['Field'];
            }
            
            if (!in_array('role', $existingColumns)) {
                // 添加role字段
                $pdo->exec("ALTER TABLE `admins` ADD COLUMN `role` VARCHAR(20) DEFAULT 'admin' COMMENT 'admin普通管理员 super超级管理员'");
                $actions[] = 'role字段已添加';
            }
            
            // 无论字段是否存在，都检查并确保有超级管理员
            $superCount = $pdo->query("SELECT COUNT(*) FROM `admins` WHERE `role` = 'super'")->fetchColumn();
            if ($superCount == 0) {
                $firstId = $pdo->query("SELECT MIN(id) FROM `admins`")->fetchColumn();
                if ($firstId) {
                    $pdo->exec("UPDATE `admins` SET `role` = 'super' WHERE `id` = $firstId");
                    $actions[] = '首个管理员已升级为超级管理员';
                }
            }
            
            if (empty($actions)) {
                jsonResponse(1, '已存在超级管理员，无需操作');
            } else {
                logAudit($pdo, 'db.migrate_admin_role', ['actions' => $actions]);
                jsonResponse(1, implode('，', $actions));
            }
        } catch (PDOException $e) {
            jsonResponse(0, '迁移失败: ' . $e->getMessage());
        }
        break;

    case 'migrate_linuxdo':
        // 添加Linux DO OAuth2相关字段到现有users表
        try {
            $pdo = getDB();
            $migrations = [];
            $errors = [];
            
            // 检查并添加缺失的字段
            $fieldsToAdd = [
                'linuxdo_id' => "ALTER TABLE `users` ADD COLUMN `linuxdo_id` INT DEFAULT NULL UNIQUE COMMENT 'Linux DO用户ID'",
                'linuxdo_username' => "ALTER TABLE `users` ADD COLUMN `linuxdo_username` VARCHAR(100) DEFAULT NULL COMMENT 'Linux DO用户名'",
                'linuxdo_name' => "ALTER TABLE `users` ADD COLUMN `linuxdo_name` VARCHAR(100) DEFAULT NULL COMMENT 'Linux DO昵称'",
                'linuxdo_trust_level' => "ALTER TABLE `users` ADD COLUMN `linuxdo_trust_level` TINYINT DEFAULT 0 COMMENT 'Linux DO信任等级0-4'",
                'linuxdo_avatar' => "ALTER TABLE `users` ADD COLUMN `linuxdo_avatar` VARCHAR(500) DEFAULT NULL COMMENT 'Linux DO头像URL'",
                'updated_at' => "ALTER TABLE `users` ADD COLUMN `updated_at` DATETIME DEFAULT NULL"
            ];
            
            // 获取现有字段
            $stmt = $pdo->query("DESCRIBE `users`");
            $existingColumns = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $existingColumns[] = $row['Field'];
            }
            
            // 修改password字段允许NULL（用于OAuth用户）
            if (in_array('password', $existingColumns)) {
                try {
                    $pdo->exec("ALTER TABLE `users` MODIFY COLUMN `password` VARCHAR(255) DEFAULT NULL");$migrations[] = 'password字段已修改为可空';
                } catch (PDOException $e) {
                    // 忽略如果已经是可空的
                }
            }
            
            // 添加缺失字段
            foreach ($fieldsToAdd as $field => $sql) {
                if (!in_array($field, $existingColumns)) {
                    try {
                        $pdo->exec($sql);
                        $migrations[] = $field;
                    } catch (PDOException $e) {
                        $errors[] = "$field: " . $e->getMessage();
                    }
                }
            }
            
            if (empty($errors)) {
                if (empty($migrations)) {
                    jsonResponse(1, 'Linux DO字段已存在，无需迁移');
                } else {
                    logAudit($pdo, 'db.migrate_linuxdo', ['added' => $migrations]);
                    jsonResponse(1, 'Linux DO字段迁移成功', ['added' => $migrations]);
                }
            } else {
                jsonResponse(0, '部分字段迁移失败', ['added' => $migrations, 'errors' => $errors]);
            }
        } catch (PDOException $e) {
            jsonResponse(0, '迁移失败: ' . $e->getMessage());
        }
        break;
    
    default:
        jsonResponse(0, '未知操作');
}
} catch (Throwable $e) {
    logError($pdo, 'api.update_db', $e->getMessage());
    jsonResponse(0, '服务器错误');
}
