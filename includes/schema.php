<?php

function getProjectTableDefinitions(): array {
    return [
        'users' => "CREATE TABLE IF NOT EXISTS `users` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `username` VARCHAR(50) NOT NULL UNIQUE,
            `password` VARCHAR(255) DEFAULT NULL,
            `email` VARCHAR(100) DEFAULT NULL,
            `linuxdo_id` INT DEFAULT NULL UNIQUE,
            `linuxdo_username` VARCHAR(100) DEFAULT NULL,
            `linuxdo_name` VARCHAR(100) DEFAULT NULL,
            `linuxdo_trust_level` TINYINT DEFAULT 0,
            `linuxdo_avatar` VARCHAR(500) DEFAULT NULL,
            `linuxdo_active` TINYINT DEFAULT 1,
            `linuxdo_silenced` TINYINT DEFAULT 0,
            `credit_balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `email_verified` DATETIME DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT NULL,
            INDEX `idx_users_linuxdo` (`linuxdo_id`),
            INDEX `idx_users_balance` (`credit_balance`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'admins' => "CREATE TABLE IF NOT EXISTS `admins` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `username` VARCHAR(50) NOT NULL UNIQUE,
            `password` VARCHAR(255) NOT NULL,
            `role` VARCHAR(20) DEFAULT 'admin',
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'product_templates' => "CREATE TABLE IF NOT EXISTS `product_templates` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(100) NOT NULL,
            `cpu` VARCHAR(50) DEFAULT NULL,
            `memory` VARCHAR(50) DEFAULT NULL,
            `disk` VARCHAR(50) DEFAULT NULL,
            `bandwidth` VARCHAR(50) DEFAULT NULL,
            `region` VARCHAR(100) DEFAULT NULL,
            `line_type` VARCHAR(100) DEFAULT NULL,
            `os_type` VARCHAR(100) DEFAULT NULL,
            `description` TEXT DEFAULT NULL,
            `extra_info` TEXT DEFAULT NULL,
            `status` TINYINT NOT NULL DEFAULT 1,
            `sort_order` INT NOT NULL DEFAULT 0,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX `idx_templates_status_sort` (`status`, `sort_order`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'products' => "CREATE TABLE IF NOT EXISTS `products` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `template_id` INT DEFAULT NULL,
            `name` VARCHAR(100) NOT NULL,
            `cpu` VARCHAR(50) DEFAULT NULL,
            `memory` VARCHAR(50) DEFAULT NULL,
            `disk` VARCHAR(50) DEFAULT NULL,
            `bandwidth` VARCHAR(50) DEFAULT NULL,
            `region` VARCHAR(100) DEFAULT NULL,
            `line_type` VARCHAR(100) DEFAULT NULL,
            `os_type` VARCHAR(100) DEFAULT NULL,
            `description` TEXT DEFAULT NULL,
            `price` DECIMAL(10,2) NOT NULL,
            `ip_address` VARCHAR(50) NOT NULL,
            `ssh_port` INT DEFAULT 22,
            `ssh_user` VARCHAR(50) DEFAULT 'root',
            `ssh_password` VARCHAR(255) NOT NULL,
            `extra_info` TEXT DEFAULT NULL,
            `min_trust_level` TINYINT DEFAULT 0,
            `risk_review_required` TINYINT NOT NULL DEFAULT 0,
            `allow_whitelist_only` TINYINT NOT NULL DEFAULT 0,
            `status` TINYINT DEFAULT 1,
            `sort_order` INT NOT NULL DEFAULT 0,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX `idx_products_status_sort` (`status`, `sort_order`),
            INDEX `idx_products_template` (`template_id`),
            INDEX `idx_products_trust` (`min_trust_level`, `allow_whitelist_only`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'orders' => "CREATE TABLE IF NOT EXISTS `orders` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `order_no` VARCHAR(50) NOT NULL UNIQUE,
            `trade_no` VARCHAR(50) DEFAULT NULL,
            `user_id` INT NOT NULL,
            `product_id` INT NOT NULL,
            `product_name_snapshot` VARCHAR(100) DEFAULT NULL,
            `cpu_snapshot` VARCHAR(50) DEFAULT NULL,
            `memory_snapshot` VARCHAR(50) DEFAULT NULL,
            `disk_snapshot` VARCHAR(50) DEFAULT NULL,
            `bandwidth_snapshot` VARCHAR(50) DEFAULT NULL,
            `region_snapshot` VARCHAR(100) DEFAULT NULL,
            `line_type_snapshot` VARCHAR(100) DEFAULT NULL,
            `os_type_snapshot` VARCHAR(100) DEFAULT NULL,
            `description_snapshot` TEXT DEFAULT NULL,
            `extra_info_snapshot` TEXT DEFAULT NULL,
            `ip_address_snapshot` VARCHAR(50) DEFAULT NULL,
            `ssh_port_snapshot` INT DEFAULT NULL,
            `ssh_user_snapshot` VARCHAR(50) DEFAULT NULL,
            `ssh_password_snapshot` VARCHAR(255) DEFAULT NULL,
            `original_price` DECIMAL(10,2) NOT NULL,
            `trust_discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `trust_level_snapshot` TINYINT DEFAULT NULL,
            `coupon_id` INT DEFAULT NULL,
            `coupon_code` VARCHAR(50) DEFAULT NULL,
            `coupon_discount` DECIMAL(10,2) DEFAULT 0.00,
            `price` DECIMAL(10,2) NOT NULL,
            `payment_method` VARCHAR(20) NOT NULL DEFAULT 'pending',
            `balance_paid_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `external_pay_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `status` TINYINT DEFAULT 0,
            `delivery_status` VARCHAR(30) NOT NULL DEFAULT 'pending',
            `delivery_note` TEXT DEFAULT NULL,
            `delivery_error` TEXT DEFAULT NULL,
            `delivery_updated_at` DATETIME DEFAULT NULL,
            `admin_note` TEXT DEFAULT NULL,
            `delivered_at` DATETIME DEFAULT NULL,
            `delivery_info` TEXT DEFAULT NULL,
            `handled_admin_id` INT DEFAULT NULL,
            `refund_reason` VARCHAR(255) DEFAULT NULL,
            `refund_trade_no` VARCHAR(100) DEFAULT NULL,
            `refund_amount` DECIMAL(10,2) DEFAULT NULL,
            `refund_at` DATETIME DEFAULT NULL,
            `cancel_reason` VARCHAR(255) DEFAULT NULL,
            `cancelled_at` DATETIME DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `paid_at` DATETIME DEFAULT NULL,
            INDEX `idx_orders_user_status_created` (`user_id`, `status`, `created_at`),
            INDEX `idx_orders_delivery_status` (`delivery_status`, `status`),
            INDEX `idx_orders_payment_method` (`payment_method`, `status`),
            INDEX `idx_orders_product` (`product_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'credit_transactions' => "CREATE TABLE IF NOT EXISTS `credit_transactions` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL,
            `type` VARCHAR(30) NOT NULL,
            `amount` DECIMAL(10,2) NOT NULL,
            `balance_before` DECIMAL(10,2) NOT NULL,
            `balance_after` DECIMAL(10,2) NOT NULL,
            `related_order_id` INT DEFAULT NULL,
            `related_order_no` VARCHAR(50) DEFAULT NULL,
            `remark` VARCHAR(255) DEFAULT NULL,
            `operator_admin_id` INT DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_credit_user_created` (`user_id`, `created_at`),
            INDEX `idx_credit_order` (`related_order_no`),
            INDEX `idx_credit_type` (`type`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'coupons' => "CREATE TABLE IF NOT EXISTS `coupons` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `code` VARCHAR(50) NOT NULL UNIQUE,
            `name` VARCHAR(100) DEFAULT NULL,
            `type` VARCHAR(10) NOT NULL,
            `value` DECIMAL(10,2) NOT NULL,
            `min_amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `max_discount` DECIMAL(10,2) DEFAULT NULL,
            `max_uses` INT NOT NULL DEFAULT 0,
            `per_user_limit` INT NOT NULL DEFAULT 0,
            `used_count` INT NOT NULL DEFAULT 0,
            `starts_at` DATETIME DEFAULT NULL,
            `ends_at` DATETIME DEFAULT NULL,
            `status` TINYINT NOT NULL DEFAULT 1,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'payment_requests' => "CREATE TABLE IF NOT EXISTS `payment_requests` (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'coupon_usages' => "CREATE TABLE IF NOT EXISTS `coupon_usages` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `coupon_id` INT NOT NULL,
            `user_id` INT NOT NULL,
            `order_no` VARCHAR(50) NOT NULL UNIQUE,
            `status` TINYINT NOT NULL DEFAULT 0,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `used_at` DATETIME DEFAULT NULL,
            INDEX `idx_coupon_user_order` (`coupon_id`, `user_id`, `order_no`),
            INDEX `idx_coupon_usage_status` (`status`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'settings' => "CREATE TABLE IF NOT EXISTS `settings` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `key_name` VARCHAR(100) NOT NULL UNIQUE,
            `key_value` TEXT DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'announcements' => "CREATE TABLE IF NOT EXISTS `announcements` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `title` VARCHAR(200) NOT NULL,
            `content` TEXT NOT NULL,
            `is_top` TINYINT DEFAULT 0,
            `status` TINYINT DEFAULT 1,
            `publish_at` DATETIME DEFAULT NULL,
            `expires_at` DATETIME DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'tickets' => "CREATE TABLE IF NOT EXISTS `tickets` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL,
            `order_id` INT DEFAULT NULL,
            `title` VARCHAR(200) NOT NULL,
            `status` TINYINT DEFAULT 0,
            `category` VARCHAR(30) DEFAULT 'other',
            `priority` TINYINT DEFAULT 1,
            `tags` VARCHAR(255) DEFAULT NULL,
            `internal_note` TEXT DEFAULT NULL,
            `verified_status` TINYINT DEFAULT 0,
            `refund_allowed` TINYINT DEFAULT 0,
            `refund_reason` VARCHAR(255) DEFAULT NULL,
            `refund_target` VARCHAR(20) DEFAULT NULL,
            `handled_admin_id` INT DEFAULT NULL,
            `assignee_admin_id` INT DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX `idx_tickets_user_status_updated` (`user_id`, `status`, `updated_at`),
            INDEX `idx_tickets_priority` (`priority`, `status`),
            INDEX `idx_tickets_filters` (`category`, `priority`, `status`),
            INDEX `idx_tickets_order` (`order_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'ticket_replies' => "CREATE TABLE IF NOT EXISTS `ticket_replies` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `ticket_id` INT NOT NULL,
            `user_id` INT DEFAULT NULL,
            `content` TEXT NOT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_ticket_replies_ticket_created` (`ticket_id`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'ticket_events' => "CREATE TABLE IF NOT EXISTS `ticket_events` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `ticket_id` INT NOT NULL,
            `event_type` VARCHAR(30) NOT NULL,
            `actor_type` VARCHAR(20) NOT NULL DEFAULT 'system',
            `actor_id` INT DEFAULT NULL,
            `content` TEXT DEFAULT NULL,
            `is_visible` TINYINT NOT NULL DEFAULT 0,
            `details` JSON DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_ticket_events_ticket_created` (`ticket_id`, `created_at`),
            INDEX `idx_ticket_events_visible` (`ticket_id`, `is_visible`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'ticket_reply_templates' => "CREATE TABLE IF NOT EXISTS `ticket_reply_templates` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `title` VARCHAR(100) NOT NULL,
            `content` TEXT NOT NULL,
            `category` VARCHAR(30) DEFAULT NULL,
            `sort_order` INT NOT NULL DEFAULT 0,
            `status` TINYINT NOT NULL DEFAULT 1,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX `idx_ticket_reply_templates_status_sort` (`status`, `sort_order`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'linuxdo_user_access_rules' => "CREATE TABLE IF NOT EXISTS `linuxdo_user_access_rules` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `rule_type` VARCHAR(20) NOT NULL,
            `user_id` INT DEFAULT NULL,
            `linuxdo_id` INT DEFAULT NULL,
            `product_id` INT DEFAULT NULL,
            `remark` VARCHAR(255) DEFAULT NULL,
            `status` TINYINT NOT NULL DEFAULT 1,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX `idx_access_rule_lookup` (`rule_type`, `status`, `product_id`),
            INDEX `idx_access_rule_user` (`linuxdo_id`, `user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'trust_level_discounts' => "CREATE TABLE IF NOT EXISTS `trust_level_discounts` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `product_id` INT DEFAULT NULL,
            `trust_level` TINYINT NOT NULL,
            `discount_type` VARCHAR(10) NOT NULL DEFAULT 'percent',
            `discount_value` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `remark` VARCHAR(255) DEFAULT NULL,
            `status` TINYINT NOT NULL DEFAULT 1,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX `idx_trust_discount_lookup` (`trust_level`, `status`, `product_id`)
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
            INDEX `idx_audit_actor` (`actor_id`),
            INDEX `idx_audit_created` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'error_logs' => "CREATE TABLE IF NOT EXISTS `error_logs` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `context` VARCHAR(100) NOT NULL,
            `message` TEXT NOT NULL,
            `details` TEXT DEFAULT NULL,
            `ip_address` VARCHAR(50) DEFAULT NULL,
            `user_agent` VARCHAR(255) DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_error_created` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'notifications' => "CREATE TABLE IF NOT EXISTS `notifications` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL,
            `type` VARCHAR(50) NOT NULL,
            `title` VARCHAR(200) NOT NULL,
            `content` TEXT NOT NULL,
            `related_id` VARCHAR(100) DEFAULT NULL,
            `related_type` VARCHAR(30) DEFAULT NULL,
            `channel` VARCHAR(20) NOT NULL DEFAULT 'site',
            `extra_data` JSON DEFAULT NULL,
            `is_read` TINYINT DEFAULT 0,
            `read_at` DATETIME DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_notifications_user_read` (`user_id`, `is_read`, `created_at`),
            INDEX `idx_notifications_type` (`type`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'password_resets' => "CREATE TABLE IF NOT EXISTS `password_resets` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL,
            `token` VARCHAR(255) NOT NULL,
            `expires_at` DATETIME NOT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_password_resets_user` (`user_id`),
            INDEX `idx_password_resets_exp` (`expires_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'email_verifications' => "CREATE TABLE IF NOT EXISTS `email_verifications` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT NOT NULL,
            `email` VARCHAR(100) NOT NULL,
            `code` VARCHAR(255) NOT NULL,
            `expires_at` DATETIME NOT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_email_verify_user` (`user_id`),
            INDEX `idx_email_verify_exp` (`expires_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'ticket_attachments' => "CREATE TABLE IF NOT EXISTS `ticket_attachments` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `ticket_id` INT NOT NULL,
            `reply_id` INT DEFAULT NULL,
            `uploader_type` VARCHAR(10) NOT NULL,
            `uploader_id` INT NOT NULL,
            `original_name` VARCHAR(255) NOT NULL,
            `file_path` VARCHAR(500) NOT NULL,
            `file_size` INT NOT NULL,
            `mime_type` VARCHAR(100) NOT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_ticket_attachments_ticket` (`ticket_id`),
            INDEX `idx_ticket_attachments_reply` (`reply_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'schema_migrations' => "CREATE TABLE IF NOT EXISTS `schema_migrations` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `version` VARCHAR(50) NOT NULL UNIQUE,
            `description` VARCHAR(255) DEFAULT NULL,
            `executed_at` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    ];
}

function getProjectDefaultSettings(): array {
    return [
        'epay_pid' => '',
        'epay_key' => '',
        'notify_url' => '',
        'return_url' => '',
        'linuxdo_silenced_order_mode' => 'review',
        'notification_email_enabled' => '0',
        'notification_webhook_enabled' => '0',
        'notification_webhook_url' => '',
        'credit_recharge_enabled' => '0',
        'ticket_attachment_max_mb' => '5'
    ];
}
