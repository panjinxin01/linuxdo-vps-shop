<?php
require_once __DIR__ . '/../api/config.php';

function startSecureSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (!empty($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
    $params = session_get_cookie_params();
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => $params['path'] ?? '/',
        'domain' => $params['domain'] ?? '',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
}

function ensureCsrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        try {
            $bytes = random_bytes(32);
        } catch (Throwable $e) {
            $bytes = function_exists('openssl_random_pseudo_bytes') ? openssl_random_pseudo_bytes(32) : false;
        }
        if ($bytes === false) {
            $bytes = uniqid('', true);
        }
        $_SESSION['csrf_token'] = bin2hex($bytes);
    }
    return $_SESSION['csrf_token'];
}

function getCsrfTokenFromRequest(): ?string {
    if (!empty($_SERVER['HTTP_X_CSRF_TOKEN'])) {
        return trim($_SERVER['HTTP_X_CSRF_TOKEN']);
    }
    if (!empty($_POST['csrf_token'])) {
        return trim($_POST['csrf_token']);
    }
    if (!empty($_GET['csrf_token'])) {
        return trim($_GET['csrf_token']);
    }
    return null;
}

function verifyCsrfToken(?string $token): bool {
    if (!$token || empty($_SESSION['csrf_token'])) {
        return false;
    }
    return hash_equals($_SESSION['csrf_token'], $token);
}

function requireCsrf(): void {
    $token = getCsrfTokenFromRequest();
    if (!verifyCsrfToken($token)) {
        jsonResponse(0, 'CSRF token invalid');
    }
}

function getClientIp(): string {
    $candidates = [
        $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '',
        $_SERVER['HTTP_X_REAL_IP'] ?? '',
        $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '',
        $_SERVER['REMOTE_ADDR'] ?? ''
    ];
    foreach ($candidates as $candidate) {
        if ($candidate === '') {
            continue;
        }
        if (strpos($candidate, ',') !== false) {
            $parts = explode(',', $candidate);
            $candidate = trim($parts[0]);
        }
        if (filter_var($candidate, FILTER_VALIDATE_IP)) {
            return $candidate;
        }
    }
    return '0.0.0.0';
}

function securityTableExists(PDO $pdo, string $table): bool {
    static $cache = [];
    if (array_key_exists($table, $cache)) {
        return $cache[$table];
    }
    try {
        // 直接尝试查询表，比SHOW TABLES LIKE 更可靠
        $stmt = $pdo->query("SELECT 1 FROM `" . preg_replace('/[^a-zA-Z0-9_]/', '', $table) . "` LIMIT 0");
        $cache[$table] = true;
    } catch (Throwable $e) {
        // 如果表不存在会抛出异常
        $cache[$table] = false;
    }
    return $cache[$table];
}

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

function logAudit(PDO $pdo, string $action, array $details = [], ?string $targetId = null): void {
    if (!isset($_SESSION['admin_id'])) {
        return;
    }
    if (!securityTableExists($pdo, 'audit_logs')) {
        return;
    }
    $detailsJson = $details ? json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
    $stmt = $pdo->prepare("INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, target_id, ip_address, user_agent, details) VALUES ('admin', ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        (int)$_SESSION['admin_id'],
        $_SESSION['admin_name'] ?? '',
        $action,
        $targetId,
        getClientIp(),
        $_SERVER['HTTP_USER_AGENT'] ?? '',
        $detailsJson
    ]);
}

function logError(PDO $pdo, string $context, string $message, array $details = []): void {
    if (!securityTableExists($pdo, 'error_logs')) {
        return;
    }
    $detailsJson = $details ? json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
    $stmt = $pdo->prepare('INSERT INTO error_logs (context, message, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([
        $context,
        $message,
        $detailsJson,
        getClientIp(),
        $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);
}


function httpRequest(string $url, array $options = []): array {
    $method = strtoupper((string)($options['method'] ?? 'GET'));
    $headers = $options['headers'] ?? [];
    $data = $options['data'] ?? null;
    $timeout = max(1, (int)($options['timeout'] ?? 30));

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $options['ssl_verify_peer'] ?? true);
        if (isset($options['ssl_verify_host'])) {
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, (int)$options['ssl_verify_host']);
        }
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($data !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($data) ? http_build_query($data) : (string)$data);
            }
        } elseif ($method !== 'GET') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            if ($data !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($data) ? http_build_query($data) : (string)$data);
            }
        }
        if (!empty($headers)) {
            $formatted = [];
            foreach ($headers as $k => $v) {
                $formatted[] = is_int($k) ? (string)$v : ($k . ': ' . $v);
            }
            curl_setopt($ch, CURLOPT_HTTPHEADER, $formatted);
        }
        $body = curl_exec($ch);
        $error = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return ['ok' => $error === '', 'body' => $body === false ? '' : (string)$body, 'error' => $error, 'status' => $status];
    }

    $headerLines = [];
    foreach ($headers as $k => $v) {
        $headerLines[] = is_int($k) ? (string)$v : ($k . ': ' . $v);
    }
    $content = '';
    if ($data !== null) {
        $content = is_array($data) ? http_build_query($data) : (string)$data;
    }
    if ($content !== '' && !array_filter($headerLines, static fn($line) => stripos($line, 'Content-Type:') === 0)) {
        $headerLines[] = 'Content-Type: application/x-www-form-urlencoded';
    }
    $ctx = stream_context_create([
        'http' => [
            'method' => $method,
            'header' => implode("
", $headerLines),
            'content' => $content,
            'timeout' => $timeout,
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => (bool)($options['ssl_verify_peer'] ?? true),
            'verify_peer_name' => (bool)($options['ssl_verify_peer'] ?? true),
        ]
    ]);
    $body = @file_get_contents($url, false, $ctx);
    $status = 0;
    if (!empty($http_response_header) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m)) {
        $status = (int)$m[1];
    }
    if ($body === false) {
        $err = error_get_last();
        return ['ok' => false, 'body' => '', 'error' => $err['message'] ?? 'request failed', 'status' => $status];
    }
    return ['ok' => true, 'body' => (string)$body, 'error' => '', 'status' => $status];
}

function encryptionKey(): ?string {
    if (!defined('DATA_ENCRYPTION_KEY') || DATA_ENCRYPTION_KEY === '') {
        return null;
    }
    return hash('sha256', DATA_ENCRYPTION_KEY, true);
}

function encryptSensitive(?string $value): ?string {
    if ($value === null || $value === '') {
        return $value;
    }
    if (!function_exists('openssl_encrypt')) {
        return $value;
    }
    $key = encryptionKey();
    if (!$key) {
        return $value;
    }
    try {
        $iv = random_bytes(12);
    } catch (Throwable $e) {
        return $value;
    }
    $tag = '';
    $cipher = openssl_encrypt($value, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) {
        return $value;
    }
    return 'enc:' . base64_encode($iv . $tag . $cipher);
}

function decryptSensitive(?string $value): ?string {
    if ($value === null || $value === '') {
        return $value;
    }
    if (strpos($value, 'enc:') !== 0) {
        return $value;
    }
    if (!function_exists('openssl_decrypt')) {
        return '';
    }
    $key = encryptionKey();
    if (!$key) {
        return '';
    }
    $data = base64_decode(substr($value, 4), true);
    if ($data === false || strlen($data) < 28) {
        return '';
    }
    $iv = substr($data, 0, 12);
    $tag = substr($data, 12, 16);
    $cipher = substr($data, 28);
    $plain = openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    return $plain === false ? '' : $plain;
}

