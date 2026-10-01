<?php
/**
 * 操作审计日志与错误日志
 * 来源：includes/security.php（目录结构拆分，内容零改动）
 */

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


