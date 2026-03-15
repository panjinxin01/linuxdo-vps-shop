<?php
require_once __DIR__ . '/../api/config.php';

function jsonResponse(int $code, string $msg = '', $data = null, int $httpStatus = 200): void {
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code($httpStatus);
    }
    $payload = [
        'code' => (int)$code,
        'msg' => (string)$msg,
        'data' => $data
    ];
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requestJson(): array {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return $cached = [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $cached = [];
    }
    return $cached = $decoded;
}

function requestValue(string $key, $default = null) {
    if (array_key_exists($key, $_POST)) {
        return $_POST[$key];
    }
    if (array_key_exists($key, $_GET)) {
        return $_GET[$key];
    }
    $json = requestJson();
    if (array_key_exists($key, $json)) {
        return $json[$key];
    }
    return $default;
}


function utf8Length(?string $value): int {
    $value = (string)($value ?? '');
    if ($value === '') {
        return 0;
    }
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }
    if (function_exists('iconv_strlen')) {
        $len = @iconv_strlen($value, 'UTF-8');
        if ($len !== false) {
            return (int)$len;
        }
    }
    if (preg_match_all('/./us', $value, $m)) {
        return count($m[0]);
    }
    return strlen($value);
}

function utf8Substr(string $value, int $start, ?int $length = null): string {
    if (function_exists('mb_substr')) {
        return $length === null
            ? mb_substr($value, $start, null, 'UTF-8')
            : mb_substr($value, $start, $length, 'UTF-8');
    }
    if (function_exists('iconv_substr')) {
        $res = $length === null
            ? @iconv_substr($value, $start, iconv_strlen($value, 'UTF-8'), 'UTF-8')
            : @iconv_substr($value, $start, $length, 'UTF-8');
        if ($res !== false) {
            return (string)$res;
        }
    }
    if (preg_match_all('/./us', $value, $m)) {
        $slice = array_slice($m[0], $start, $length);
        return implode('', $slice);
    }
    return $length === null ? substr($value, $start) : substr($value, $start, $length);
}

function normalizeString($value, ?int $maxLen = null): string {
    $value = is_string($value) ? trim($value) : '';
    if ($maxLen !== null && $maxLen > 0) {
        $value = utf8Substr($value, 0, $maxLen);
    }
    return $value;
}

function validateInt($value, ?int $min = null, ?int $max = null): ?int {
    if ($value === null || $value === '') {
        return null;
    }
    if (is_string($value)) {
        $value = trim($value);
    }
    if (!is_numeric($value) || (string)(int)$value !== (string)$value && !is_int($value)) {
        return null;
    }
    $intValue = (int)$value;
    if ($min !== null && $intValue < $min) {
        return null;
    }
    if ($max !== null && $intValue > $max) {
        return null;
    }
    return $intValue;
}

function validateFloat($value, ?float $min = null, ?float $max = null): ?float {
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    $floatValue = (float)$value;
    if ($min !== null && $floatValue < $min) {
        return null;
    }
    if ($max !== null && $floatValue > $max) {
        return null;
    }
    return $floatValue;
}

function isValidDateTime(string $value): bool {
    $value = trim($value);
    if ($value === '') {
        return false;
    }
    $ts = strtotime($value);
    return $ts !== false;
}

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

function checkAdmin(?PDO $pdo = null, bool $requireSuper = false): void {
    if (empty($_SESSION['admin_id'])) {
        jsonResponse(0, '请先登录后台');
    }
    if ($pdo instanceof PDO) {
        $stmt = $pdo->prepare('SELECT id, username, role FROM admins WHERE id = ?');
        $stmt->execute([(int)$_SESSION['admin_id']]);
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$admin) {
            unset($_SESSION['admin_id'], $_SESSION['admin_name'], $_SESSION['admin_role']);
            jsonResponse(0, '请先登录后台');
        }
        $_SESSION['admin_name'] = $admin['username'];
        $_SESSION['admin_role'] = $admin['role'] ?? 'admin';
    }
    if ($requireSuper && ($_SESSION['admin_role'] ?? '') !== 'super') {
        jsonResponse(0, '无权限');
    }
}

function checkUser(): void {
    if (empty($_SESSION['user_id'])) {
        jsonResponse(0, '请先登录');
    }
}

