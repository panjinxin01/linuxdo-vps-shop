<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$action = requestValue('action', 'list');
$pdo = getDB();


$csrfActions = ['clear'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

try {
    switch ($action) {
        case 'list':
            checkAdmin($pdo);
            if (!securityTableExists($pdo, 'audit_logs')) {
                jsonResponse(0, 'audit_logs table missing');
            }
            $page = validateInt(requestValue('page', 1), 1) ?? 1;
            $pageSize = validateInt(requestValue('page_size', 20), 1, 100) ?? 20;
            $offset = ($page - 1) * $pageSize;

            $total = (int)$pdo->query('SELECT COUNT(*) FROM audit_logs')->fetchColumn();
            $stmt = $pdo->prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?');
            $stmt->bindValue(1, $pageSize, PDO::PARAM_INT);
            $stmt->bindValue(2, $offset, PDO::PARAM_INT);
            $stmt->execute();
            $list = $stmt->fetchAll(PDO::FETCH_ASSOC);

            jsonResponse(1, '', [
                'list' => $list,
                'total' => $total,
                'page' => $page,
                'page_size' => $pageSize,
                'total_pages' => $pageSize > 0 ? ceil($total / $pageSize) : 0
            ]);
            break;


        case 'clear':
            checkAdmin($pdo, true);
            $password = (string)requestValue('password', '');
            if ($password === '') {
                jsonResponse(0, '请填写当前管理员密码');
            }
            $stmt = $pdo->prepare('SELECT password FROM admins WHERE id = ?');
            $stmt->execute([(int)$_SESSION['admin_id']]);
            $hash = $stmt->fetchColumn();
            if (!$hash || !password_verify($password, (string)$hash)) {
                jsonResponse(0, '密码验证失败');
            }
            $pdo->exec('DELETE FROM audit_logs');
            jsonResponse(1, '操作日志已清空');
            break;

        default:
            jsonResponse(0, 'Unknown action');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.audit_logs', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

