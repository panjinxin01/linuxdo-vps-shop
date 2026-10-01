<?php
/**
 * CSRF Token 生成 / 读取 / 校验
 * 来源：includes/security.php（目录结构拆分，内容零改动）
 */

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
        jsonResponse(0, '安全验证失败（CSRF Token 无效或已过期），请刷新页面后重试');
    }
}

