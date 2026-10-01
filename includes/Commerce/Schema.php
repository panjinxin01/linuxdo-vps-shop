<?php
/**
 * 表 / 字段存在性检测（带静态缓存）
 * 来源：includes/commerce.php（目录结构拆分，内容零改动）
 */


function commerceTableExists(PDO $pdo, string $table): bool {
    return securityTableExists($pdo, $table);
}

function commerceColumnExists(PDO $pdo, string $table, string $column): bool {
    static $cache = [];
    $key = $table . '.' . $column;
    if (($cache[$key] ?? false) === true) {
        return true;
    }
    try {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
        $stmt->execute([$table, $column]);
        $exists = ((int)$stmt->fetchColumn() > 0);
        if ($exists) {
            $cache[$key] = true;
        }
        return $exists;
    } catch (Throwable $e) {
        try {
            $safeTable = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
            $stmt = $pdo->query("SHOW COLUMNS FROM `{$safeTable}`");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                if (isset($row['Field']) && (string)$row['Field'] === $column) {
                    $cache[$key] = true;
                    return true;
                }
            }
        } catch (Throwable $inner) {
        }
    }
    return false;
}

