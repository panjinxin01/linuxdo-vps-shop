<?php
/**
 * PDO 单例连接
 * 来源：includes/db.php（目录结构拆分，内容零改动）
 */

function getDB(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    if (!defined('DB_HOST') || !defined('DB_USER') || !defined('DB_NAME')) {
        jsonResponse(0, '数据库配置缺失');
    }
    try {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]
        );
    } catch (PDOException $e) {
        jsonResponse(0, '数据库连接失败');
    }
    return $pdo;
}

