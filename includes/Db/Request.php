<?php
/**
 * JSON 响应与请求体解析
 * 来源：includes/db.php（目录结构拆分，内容零改动）
 */


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


