<?php
/**
 * 数据库更新脚本
 * 兼容旧站增量升级，不破坏现有数据
 */
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/schema.php';

$pdo = getDB();
checkAdmin($pdo);

$action = requestValue('action', '');
$csrfActions = ['update', 'reset', 'migrate_admin_role', 'migrate_linuxdo'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function updTableExists(PDO $pdo, string $table): bool {
    return securityTableExists($pdo, $table);
}

function updColumnExists(PDO $pdo, string $table, string $column): bool {
    try {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
        $stmt->execute([$table, $column]);
        return (int)$stmt->fetchColumn() > 0;
    } catch (Throwable $e) {
        try {
            $safeTable = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
            $stmt = $pdo->query("SHOW COLUMNS FROM `{$safeTable}`");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                if (isset($row['Field']) && (string)$row['Field'] === $column) {
                    return true;
                }
            }
        } catch (Throwable $inner) {
        }
        return false;
    }
}


function updIsIgnorableSchemaError(Throwable $e, string $kind = 'column'): bool {
    $msg = $e->getMessage();
    $code = (int)$e->getCode();
    if ($kind === 'column') {
        return $code === 1060 || stripos($msg, 'Duplicate column name') !== false;
    }
    if ($kind === 'index') {
        return in_array($code, [1061, 1062, 1831], true)
            || stripos($msg, 'Duplicate key name') !== false
            || stripos($msg, 'already exists') !== false;
    }
    return false;
}

function updBuildCompatibleColumnDefinitions(PDO $pdo, string $table, string $definitionSql): array {
    $defs = [];
    $push = static function (string $sql) use (&$defs): void {
        $sql = trim(preg_replace('/\s+/', ' ', $sql));
        if ($sql !== '' && !in_array($sql, $defs, true)) {
            $defs[] = $sql;
        }
    };

    $push($definitionSql);

    if (preg_match('/\s+AFTER\s+`([^`]+)`/i', $definitionSql, $m)) {
        $afterCol = $m[1];
        if (!updColumnExists($pdo, $table, $afterCol)) {
            $push(preg_replace('/\s+AFTER\s+`[^`]+`/i', '', $definitionSql));
        }
    }

    foreach (array_values($defs) as $candidate) {
        $compat = $candidate;
        $compat = preg_replace('/\bTEXT\s+DEFAULT\s+NULL\b/i', 'TEXT NULL', $compat);
        $compat = preg_replace('/\bLONGTEXT\s+DEFAULT\s+NULL\b/i', 'LONGTEXT NULL', $compat);
        $compat = preg_replace('/\bMEDIUMTEXT\s+DEFAULT\s+NULL\b/i', 'MEDIUMTEXT NULL', $compat);
        $compat = preg_replace('/\bJSON\s+DEFAULT\s+NULL\b/i', 'LONGTEXT NULL', $compat);
        $compat = preg_replace('/\bDATETIME\s+DEFAULT\s+CURRENT_TIMESTAMP\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP\b/i', 'DATETIME NULL', $compat);
        $compat = preg_replace('/\bTIMESTAMP\s+DEFAULT\s+CURRENT_TIMESTAMP\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP\b/i', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP', $compat);
        $push($compat);
        if (preg_match('/\s+AFTER\s+`[^`]+`/i', $compat)) {
            $push(preg_replace('/\s+AFTER\s+`[^`]+`/i', '', $compat));
        }
    }

    return $defs;
}

function updEnsureColumn(PDO $pdo, string $table, string $column, string $definitionSql, array &$migrated, array &$errors): void {
    if (!updTableExists($pdo, $table) || updColumnExists($pdo, $table, $column)) {
        return;
    }

    $lastError = null;
    foreach (updBuildCompatibleColumnDefinitions($pdo, $table, $definitionSql) as $candidateSql) {
        try {
            $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN {$candidateSql}");
            $migrated[] = "{$table}.{$column}";
            return;
        } catch (PDOException $e) {
            if (updIsIgnorableSchemaError($e, 'column')) {
                $migrated[] = "{$table}.{$column}(already_exists)";
                return;
            }
            $lastError = $e;
        }
        if (updColumnExists($pdo, $table, $column)) {
            $migrated[] = "{$table}.{$column}(verified)";
            return;
        }
    }

    $errors[] = "{$table}.{$column}: " . ($lastError ? $lastError->getMessage() : 'unknown error');
}

function updIndexExists(PDO $pdo, string $table, string $indexName): bool {
    try {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?');
        $stmt->execute([$table, $indexName]);
        return (int)$stmt->fetchColumn() > 0;
    } catch (Throwable $e) {
        try {
            $safeTable = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
            $stmt = $pdo->query("SHOW INDEX FROM `{$safeTable}`");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                if (isset($row['Key_name']) && (string)$row['Key_name'] === $indexName) {
                    return true;
                }
            }
        } catch (Throwable $inner) {
        }
        return false;
    }
}

function updEnsureIndex(PDO $pdo, string $table, string $indexName, string $definition, array &$migrated, array &$errors): void {
    if (!updTableExists($pdo, $table) || updIndexExists($pdo, $table, $indexName)) {
        return;
    }
    try {
        $pdo->exec("ALTER TABLE `{$table}` ADD INDEX `{$indexName}` ({$definition})");
        $migrated[] = "{$table}.{$indexName}";
    } catch (PDOException $e) {
        if (updIsIgnorableSchemaError($e, 'index') || updIndexExists($pdo, $table, $indexName)) {
            $migrated[] = "{$table}.{$indexName}(already_exists)";
            return;
        }
        $errors[] = "{$table}.{$indexName}: " . $e->getMessage();
    }
}

function updEnsureUnique(PDO $pdo, string $table, string $indexName, string $definition, array &$migrated, array &$errors): void {
    if (!updTableExists($pdo, $table) || updIndexExists($pdo, $table, $indexName)) {
        return;
    }
    try {
        $pdo->exec("ALTER TABLE `{$table}` ADD UNIQUE KEY `{$indexName}` ({$definition})");
        $migrated[] = "{$table}.{$indexName}";
    } catch (PDOException $e) {
        if (updIsIgnorableSchemaError($e, 'index') || updIndexExists($pdo, $table, $indexName)) {
            $migrated[] = "{$table}.{$indexName}(already_exists)";
            return;
        }
        $errors[] = "{$table}.{$indexName}: " . $e->getMessage();
    }
}

function updSeedSettings(PDO $pdo): void {
    if (!updTableExists($pdo, 'settings')) {
        return;
    }
    $stmt = $pdo->prepare('INSERT INTO settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = COALESCE(NULLIF(key_value, ""), VALUES(key_value))');
    foreach (getProjectDefaultSettings() as $key => $value) {
        $stmt->execute([$key, $value]);
    }
}

function updBackfillData(PDO $pdo, array &$migrated): void {
    if (updTableExists($pdo, 'users') && updColumnExists($pdo, 'users', 'credit_balance')) {
        $pdo->exec('UPDATE users SET credit_balance = 0 WHERE credit_balance IS NULL');
    }

    if (updTableExists($pdo, 'orders')) {
        if (updColumnExists($pdo, 'orders', 'original_price')) {
            $pdo->exec('UPDATE orders SET original_price = price WHERE original_price IS NULL');
        }
        if (updColumnExists($pdo, 'orders', 'trust_discount_amount')) {
            $pdo->exec('UPDATE orders SET trust_discount_amount = 0 WHERE trust_discount_amount IS NULL');
        }
        if (updColumnExists($pdo, 'orders', 'coupon_discount')) {
            $pdo->exec('UPDATE orders SET coupon_discount = 0 WHERE coupon_discount IS NULL');
        }
        if (updColumnExists($pdo, 'orders', 'balance_paid_amount')) {
            $pdo->exec('UPDATE orders SET balance_paid_amount = 0 WHERE balance_paid_amount IS NULL');
        }
        if (updColumnExists($pdo, 'orders', 'external_pay_amount')) {
            $pdo->exec("UPDATE orders SET external_pay_amount = price WHERE external_pay_amount IS NULL AND (payment_method = 'epay' OR trade_no IS NOT NULL)");
            $pdo->exec("UPDATE orders SET external_pay_amount = 0 WHERE external_pay_amount IS NULL");
        }
        if (updTableExists($pdo, 'products')) {
            $snapshotMap = [
                'product_name_snapshot' => 'name',
                'cpu_snapshot' => 'cpu',
                'memory_snapshot' => 'memory',
                'disk_snapshot' => 'disk',
                'bandwidth_snapshot' => 'bandwidth',
                'region_snapshot' => 'region',
                'line_type_snapshot' => 'line_type',
                'os_type_snapshot' => 'os_type',
                'description_snapshot' => 'description',
                'extra_info_snapshot' => 'extra_info',
                'ip_address_snapshot' => 'ip_address',
                'ssh_port_snapshot' => 'ssh_port',
                'ssh_user_snapshot' => 'ssh_user',
                'ssh_password_snapshot' => 'ssh_password',
            ];
            foreach ($snapshotMap as $orderCol => $productCol) {
                if (updColumnExists($pdo, 'orders', $orderCol) && updColumnExists($pdo, 'products', $productCol)) {
                    $pdo->exec("UPDATE orders o INNER JOIN products p ON o.product_id = p.id SET o.`{$orderCol}` = p.`{$productCol}` WHERE (o.`{$orderCol}` IS NULL OR o.`{$orderCol}` = '')");
                }
            }
        }
        if (updColumnExists($pdo, 'orders', 'payment_method')) {
            $pdo->exec("UPDATE orders SET payment_method = CASE
                WHEN payment_method IS NOT NULL AND payment_method <> '' THEN payment_method
                WHEN status = 1 AND trade_no IS NOT NULL AND trade_no <> '' THEN 'epay'
                WHEN status = 1 THEN 'epay'
                ELSE 'pending'
            END");
        }
        if (updColumnExists($pdo, 'orders', 'delivery_status')) {
            $pdo->exec("UPDATE orders SET delivery_status = CASE
                WHEN status = 2 THEN 'refunded'
                WHEN status = 3 THEN 'cancelled'
                WHEN status = 1 AND delivered_at IS NOT NULL THEN 'delivered'
                WHEN status = 1 THEN 'paid_waiting'
                ELSE 'pending'
            END WHERE delivery_status IS NULL OR delivery_status = ''");
        }
        if (updColumnExists($pdo, 'orders', 'delivery_updated_at')) {
            $pdo->exec('UPDATE orders SET delivery_updated_at = COALESCE(delivery_updated_at, paid_at, created_at)');
        }
        if (updColumnExists($pdo, 'orders', 'delivery_info')) {
            $hasIp = updColumnExists($pdo, 'orders', 'ip_address_snapshot');
            $hasPort = updColumnExists($pdo, 'orders', 'ssh_port_snapshot');
            $hasUser = updColumnExists($pdo, 'orders', 'ssh_user_snapshot');
            $hasPass = updColumnExists($pdo, 'orders', 'ssh_password_snapshot');
            if ($hasIp || $hasPort || $hasUser || $hasPass) {
                $rows = $pdo->query('SELECT id, delivery_info'
                    . ($hasIp ? ', ip_address_snapshot' : ', NULL AS ip_address_snapshot')
                    . ($hasPort ? ', ssh_port_snapshot' : ', NULL AS ssh_port_snapshot')
                    . ($hasUser ? ', ssh_user_snapshot' : ', NULL AS ssh_user_snapshot')
                    . ($hasPass ? ', ssh_password_snapshot' : ', NULL AS ssh_password_snapshot')
                    . ' FROM orders')->fetchAll(PDO::FETCH_ASSOC);
                $stmt = $pdo->prepare('UPDATE orders SET delivery_info = ? WHERE id = ?');
                foreach ($rows as $row) {
                    $current = trim((string)($row['delivery_info'] ?? ''));
                    if ($current !== '') {
                        continue;
                    }
                    $lines = [];
                    $ip = trim((string)($row['ip_address_snapshot'] ?? ''));
                    $port = trim((string)($row['ssh_port_snapshot'] ?? ''));
                    $user = trim((string)($row['ssh_user_snapshot'] ?? ''));
                    $pass = trim((string)($row['ssh_password_snapshot'] ?? ''));
                    if ($ip !== '') {
                        $lines[] = 'IP：' . $ip;
                    }
                    if ($port !== '') {
                        $lines[] = '端口：' . $port;
                    }
                    if ($user !== '') {
                        $lines[] = '账号：' . $user;
                    }
                    if ($pass !== '') {
                        $lines[] = '密码：' . $pass;
                    }
                    if ($lines) {
                        $stmt->execute([implode("
", $lines), (int)$row['id']]);
                    }
                }
            }
        }
    }

    if (updTableExists($pdo, 'tickets')) {
        if (updColumnExists($pdo, 'tickets', 'category')) {
            $pdo->exec("UPDATE tickets SET category = 'other' WHERE category IS NULL OR category = ''");
        }
        if (updColumnExists($pdo, 'tickets', 'priority')) {
            $pdo->exec('UPDATE tickets SET priority = 1 WHERE priority IS NULL');
        }
    }

    if (updTableExists($pdo, 'admins') && updColumnExists($pdo, 'admins', 'role')) {
        $superCount = (int)$pdo->query("SELECT COUNT(*) FROM admins WHERE role = 'super'")->fetchColumn();
        if ($superCount === 0) {
            $firstId = (int)$pdo->query('SELECT MIN(id) FROM admins')->fetchColumn();
            if ($firstId > 0) {
                $pdo->exec("UPDATE admins SET role = 'super' WHERE id = {$firstId}");
                $migrated[] = 'admins.first_super';
            }
        }
    }
}

function updCriticalColumnMap(): array {
    return [
        'orders' => [
            'product_name_snapshot', 'cpu_snapshot', 'memory_snapshot', 'disk_snapshot', 'bandwidth_snapshot',
            'region_snapshot', 'line_type_snapshot', 'os_type_snapshot', 'description_snapshot', 'extra_info_snapshot',
            'ip_address_snapshot', 'ssh_port_snapshot', 'ssh_user_snapshot', 'ssh_password_snapshot',
            'original_price', 'payment_method', 'balance_paid_amount', 'external_pay_amount', 'delivery_status', 'delivery_note',
            'delivery_error', 'delivery_updated_at', 'delivery_info', 'handled_admin_id'
        ],
        'users' => ['credit_balance', 'linuxdo_active', 'linuxdo_silenced', 'updated_at'],
        'products' => ['region', 'line_type', 'os_type', 'description', 'template_id', 'sort_order'],
    ];
}

function updCollectMissingCriticalColumns(PDO $pdo): array {
    $missingColumns = [];
    $columnStatus = [];
    foreach (updCriticalColumnMap() as $table => $columns) {
        $columnStatus[$table] = [];
        foreach ($columns as $column) {
            $exists = updTableExists($pdo, $table) && updColumnExists($pdo, $table, $column);
            $columnStatus[$table][$column] = $exists;
            if (!$exists) {
                $missingColumns[] = $table . '.' . $column;
            }
        }
    }
    return ['status' => $columnStatus, 'missing' => $missingColumns];
}

function updMigrate(PDO $pdo): array {
    $created = [];
    $migrated = [];
    $errors = [];

    $definitions = getProjectTableDefinitions();
    $existingTables = [];
    $stmt = $pdo->query('SHOW TABLES');
    while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
        $existingTables[] = $row[0];
    }

    foreach ($definitions as $table => $sql) {
        if (!in_array($table, $existingTables, true)) {
            try {
                $pdo->exec($sql);
                $created[] = $table;
            } catch (PDOException $e) {
                $errors[] = "{$table}: " . $e->getMessage();
            }
        }
    }

    // users
    updEnsureColumn($pdo, 'users', 'linuxdo_active', "`linuxdo_active` TINYINT DEFAULT 1", $migrated, $errors);
    updEnsureColumn($pdo, 'users', 'linuxdo_silenced', "`linuxdo_silenced` TINYINT DEFAULT 0", $migrated, $errors);
    updEnsureColumn($pdo, 'users', 'credit_balance', "`credit_balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00", $migrated, $errors);
    updEnsureColumn($pdo, 'users', 'email_verified', "`email_verified` DATETIME DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'users', 'updated_at', "`updated_at` DATETIME DEFAULT NULL", $migrated, $errors);
    updEnsureIndex($pdo, 'users', 'idx_users_balance', '`credit_balance`', $migrated, $errors);
    updEnsureIndex($pdo, 'users', 'idx_users_linuxdo', '`linuxdo_id`', $migrated, $errors);
    updEnsureUnique($pdo, 'users', 'uniq_users_linuxdo_id', '`linuxdo_id`', $migrated, $errors);
    if (updTableExists($pdo, 'users') && updColumnExists($pdo, 'users', 'password')) {
        try {
            $pdo->exec('ALTER TABLE `users` MODIFY COLUMN `password` VARCHAR(255) DEFAULT NULL');
        } catch (Throwable $e) {
        }
    }

    // products
    updEnsureColumn($pdo, 'products', 'template_id', "`template_id` INT DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'products', 'region', "`region` VARCHAR(100) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'products', 'line_type', "`line_type` VARCHAR(100) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'products', 'os_type', "`os_type` VARCHAR(100) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'products', 'description', "`description` TEXT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'products', 'min_trust_level', "`min_trust_level` TINYINT DEFAULT 0", $migrated, $errors);
    updEnsureColumn($pdo, 'products', 'risk_review_required', "`risk_review_required` TINYINT NOT NULL DEFAULT 0", $migrated, $errors);
    updEnsureColumn($pdo, 'products', 'allow_whitelist_only', "`allow_whitelist_only` TINYINT NOT NULL DEFAULT 0", $migrated, $errors);
    updEnsureColumn($pdo, 'products', 'sort_order', "`sort_order` INT NOT NULL DEFAULT 0", $migrated, $errors);
    updEnsureColumn($pdo, 'products', 'updated_at', "`updated_at` DATETIME NULL", $migrated, $errors);
    updEnsureIndex($pdo, 'products', 'idx_products_status_sort', '`status`, `sort_order`', $migrated, $errors);
    updEnsureIndex($pdo, 'products', 'idx_products_template', '`template_id`', $migrated, $errors);
    updEnsureIndex($pdo, 'products', 'idx_products_trust', '`min_trust_level`, `allow_whitelist_only`', $migrated, $errors);
    if (updTableExists($pdo, 'products') && updColumnExists($pdo, 'products', 'ssh_password')) {
        try {
            $pdo->exec('ALTER TABLE `products` MODIFY COLUMN `ssh_password` VARCHAR(255) NOT NULL');
        } catch (Throwable $e) {
        }
    }

    // orders
    updEnsureColumn($pdo, 'orders', 'original_price', "`original_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'product_name_snapshot', "`product_name_snapshot` VARCHAR(100) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'cpu_snapshot', "`cpu_snapshot` VARCHAR(50) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'memory_snapshot', "`memory_snapshot` VARCHAR(50) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'disk_snapshot', "`disk_snapshot` VARCHAR(50) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'bandwidth_snapshot', "`bandwidth_snapshot` VARCHAR(50) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'region_snapshot', "`region_snapshot` VARCHAR(100) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'line_type_snapshot', "`line_type_snapshot` VARCHAR(100) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'os_type_snapshot', "`os_type_snapshot` VARCHAR(100) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'description_snapshot', "`description_snapshot` TEXT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'extra_info_snapshot', "`extra_info_snapshot` TEXT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'ip_address_snapshot', "`ip_address_snapshot` VARCHAR(50) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'ssh_port_snapshot', "`ssh_port_snapshot` INT DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'ssh_user_snapshot', "`ssh_user_snapshot` VARCHAR(50) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'ssh_password_snapshot', "`ssh_password_snapshot` VARCHAR(255) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'trust_discount_amount', "`trust_discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'trust_level_snapshot', "`trust_level_snapshot` TINYINT DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'payment_method', "`payment_method` VARCHAR(20) NOT NULL DEFAULT 'pending'", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'balance_paid_amount', "`balance_paid_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'external_pay_amount', "`external_pay_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'delivery_status', "`delivery_status` VARCHAR(30) NOT NULL DEFAULT 'pending'", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'delivery_note', "`delivery_note` TEXT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'delivery_error', "`delivery_error` TEXT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'delivery_updated_at', "`delivery_updated_at` DATETIME DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'admin_note', "`admin_note` TEXT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'delivered_at', "`delivered_at` DATETIME DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'delivery_info', "`delivery_info` TEXT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'orders', 'handled_admin_id', "`handled_admin_id` INT DEFAULT NULL", $migrated, $errors);
    updEnsureIndex($pdo, 'orders', 'idx_orders_delivery_status', '`delivery_status`, `status`', $migrated, $errors);
    updEnsureIndex($pdo, 'orders', 'idx_orders_payment_method', '`payment_method`, `status`', $migrated, $errors);
    updEnsureIndex($pdo, 'orders', 'idx_orders_product', '`product_id`', $migrated, $errors);

    // tickets
    updEnsureColumn($pdo, 'tickets', 'priority', "`priority` TINYINT DEFAULT 1", $migrated, $errors);
    updEnsureColumn($pdo, 'tickets', 'tags', "`tags` VARCHAR(255) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'tickets', 'category', "`category` VARCHAR(30) DEFAULT 'other'", $migrated, $errors);
    updEnsureColumn($pdo, 'tickets', 'internal_note', "`internal_note` TEXT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'tickets', 'verified_status', "`verified_status` TINYINT DEFAULT 0", $migrated, $errors);
    updEnsureColumn($pdo, 'tickets', 'refund_allowed', "`refund_allowed` TINYINT DEFAULT 0", $migrated, $errors);
    updEnsureColumn($pdo, 'tickets', 'refund_reason', "`refund_reason` VARCHAR(255) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'tickets', 'refund_target', "`refund_target` VARCHAR(20) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'tickets', 'handled_admin_id', "`handled_admin_id` INT DEFAULT NULL", $migrated, $errors);
    updEnsureIndex($pdo, 'tickets', 'idx_tickets_filters', '`category`, `priority`, `status`', $migrated, $errors);
    updEnsureIndex($pdo, 'tickets', 'idx_tickets_order', '`order_id`', $migrated, $errors);

    // notifications
    updEnsureColumn($pdo, 'notifications', 'related_type', "`related_type` VARCHAR(30) DEFAULT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'notifications', 'channel', "`channel` VARCHAR(20) NOT NULL DEFAULT 'site'", $migrated, $errors);
    updEnsureColumn($pdo, 'notifications', 'extra_data', "`extra_data` LONGTEXT NULL", $migrated, $errors);
    updEnsureColumn($pdo, 'notifications', 'read_at', "`read_at` DATETIME DEFAULT NULL", $migrated, $errors);
    updEnsureIndex($pdo, 'notifications', 'idx_notifications_type', '`type`, `created_at`', $migrated, $errors);

    updSeedSettings($pdo);
    updBackfillData($pdo, $migrated);

    return ['created' => $created, 'migrated' => $migrated, 'errors' => $errors];
}

try {
    switch ($action) {
        case 'check':
            $requiredTables = array_keys(getProjectTableDefinitions());
            $existingTables = [];
            $missingTables = [];
            $stmt = $pdo->query('SHOW TABLES');
            while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
                $existingTables[] = $row[0];
            }
            foreach ($requiredTables as $table) {
                if (!in_array($table, $existingTables, true)) {
                    $missingTables[] = $table;
                }
            }
            $criticalCheck = updCollectMissingCriticalColumns($pdo);
            $columnStatus = $criticalCheck['status'];
            $missingColumns = $criticalCheck['missing'];
            jsonResponse(1, 'ok', [
                'build' => '20260315i',
                'existing' => $existingTables,
                'missing' => $missingTables,
                'all_installed' => empty($missingTables),
                'critical_columns' => $columnStatus,
                'missing_columns' => $missingColumns,
                'all_columns_ready' => empty($missingColumns),
            ]);
            break;

        case 'update':
        case 'migrate_admin_role':
        case 'migrate_linuxdo':
            $beforeCheck = updCollectMissingCriticalColumns($pdo);
            $result = updMigrate($pdo);
            $afterCheck = updCollectMissingCriticalColumns($pdo);
            $result['before_missing_columns'] = $beforeCheck['missing'];
            $result['remaining_missing_columns'] = $afterCheck['missing'];
            $result['remaining_missing_count'] = count($afterCheck['missing']);
            $result['build'] = '20260315i';
            logAudit($pdo, 'db.update', ['action' => $action, 'created' => $result['created'], 'migrated' => $result['migrated'], 'remaining_missing_columns' => $afterCheck['missing']]);
            if (!empty($result['errors'])) {
                jsonResponse(0, '部分更新失败', $result);
            }
            if (!empty($afterCheck['missing'])) {
                jsonResponse(0, '数据库更新后仍有关键列缺失', $result);
            }
            if (empty($result['created']) && empty($result['migrated'])) {
                jsonResponse(1, '数据库已是最新版本，无需更新', $result);
            }
            jsonResponse(1, '数据库更新成功', $result);
            break;

        case 'reset':
            $adminData = [];
            $settingsData = [];
            if (updTableExists($pdo, 'admins')) {
                $adminData = $pdo->query('SELECT * FROM admins')->fetchAll(PDO::FETCH_ASSOC);
            }
            if (updTableExists($pdo, 'settings')) {
                $settingsData = $pdo->query('SELECT * FROM settings')->fetchAll(PDO::FETCH_ASSOC);
            }

            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
            foreach (array_reverse(array_keys(getProjectTableDefinitions())) as $table) {
                try {
                    $pdo->exec("DROP TABLE IF EXISTS `{$table}`");
                } catch (Throwable $e) {
                }
            }
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

            foreach (getProjectTableDefinitions() as $sql) {
                $pdo->exec($sql);
            }
            updSeedSettings($pdo);

            if (!empty($settingsData)) {
                $stmt = $pdo->prepare('INSERT INTO settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = VALUES(key_value)');
                foreach ($settingsData as $row) {
                    $stmt->execute([$row['key_name'], $row['key_value']]);
                }
            }

            if (!empty($adminData)) {
                $stmt = $pdo->prepare('INSERT INTO admins (id, username, password, role, created_at) VALUES (?, ?, ?, ?, ?)');
                foreach ($adminData as $row) {
                    $stmt->execute([
                        $row['id'],
                        $row['username'],
                        $row['password'],
                        $row['role'] ?? 'admin',
                        $row['created_at'] ?? date('Y-m-d H:i:s'),
                    ]);
                }
            }

            logAudit($pdo, 'db.reset', ['admins_restored' => count($adminData), 'settings_restored' => count($settingsData)]);
            jsonResponse(1, '数据库重置成功');
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.update_db', $e->getMessage());
    jsonResponse(0, '数据库更新失败: ' . $e->getMessage());
}
