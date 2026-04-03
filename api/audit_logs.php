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
            $pg = paginateParams();
            $total = (int)$pdo->query('SELECT COUNT(*) FROM audit_logs')->fetchColumn();
            $stmt = $pdo->prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?');
            $stmt->bindValue(1, $pg['page_size'], PDO::PARAM_INT);
            $stmt->bindValue(2, $pg['offset'], PDO::PARAM_INT);
            $stmt->execute();
            jsonResponse(1, '', paginateResponse($stmt->fetchAll(PDO::FETCH_ASSOC), $total, $pg));
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

