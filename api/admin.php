<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

// ============================================================
// 路由分发：match 表达式替代 switch
// ============================================================

$action = requestValue('action', '');

$csrfActions = ['setup', 'login', 'logout', 'change_password', 'add', 'delete', 'promote_user', 'recovery_reset'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

$pdo = getDB();

try {
    match ($action) {
        'setup'           => handleSetup($pdo),
        'recovery_reset'  => handleRecoveryReset($pdo),
        'login'           => handleLogin($pdo),
        'logout'          => handleLogout(),
        'check'           => handleCheck($pdo),
        'change_password' => handleChangePassword($pdo),
        'list'            => handleList($pdo),
        'search_users'    => handleSearchUsers($pdo),
        'promote_user'    => handlePromoteUser($pdo),
        'add'             => handleAdd($pdo),
        'delete'          => handleDelete($pdo),
        default           => jsonResponse(0, '未知操作'),
    };
} catch (Throwable $e) {
    logError($pdo, 'api.admin', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

// ============================================================
// Handler 函数
// ============================================================

function isLocalAddress(string $ip): bool {
    $ip = trim($ip);
    if ($ip === '') {
        return false;
    }
    if ($ip === '::1' || $ip === '0:0:0:0:0:0:0:1') {
        return true;
    }
    if (stripos($ip, '::ffff:') === 0) {
        $ip = substr($ip, 7);
    }
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false && strpos($ip, '127.') === 0;
}

function isLocalRecoveryRequest(): bool {
    if (!isLocalAddress((string)($_SERVER['REMOTE_ADDR'] ?? ''))) {
        return false;
    }
    $forwardedHeaders = [
        (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''),
        (string)($_SERVER['HTTP_X_REAL_IP'] ?? ''),
        (string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''),
    ];
    foreach ($forwardedHeaders as $header) {
        if (trim($header) === '') {
            continue;
        }
        foreach (explode(',', $header) as $candidate) {
            if (trim($candidate) !== '' && !isLocalAddress($candidate)) {
                return false;
            }
        }
    }
    return true;
}

/** 创建首个超级管理员 */
function handleSetup(PDO $pdo): void {
    $count = (int)$pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn();
    if ($count > 0) {
        jsonResponse(0, '管理员已存在，无法重复创建');
    }

    $username = normalizeString(requestValue('username', ''), 50);
    $password = (string)requestValue('password', '');

    rateLimit($pdo, 'admin_setup', $username, 3, 600, 1800);

    if ($username === '' || $password === '') {
        jsonResponse(0, '请填写完整');
    }
    if (strlen($password) < 6) {
        jsonResponse(0, '密码至少6位');
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare("INSERT INTO admins (username, password, role) VALUES (?, ?, 'super')");
    $stmt->execute([$username, $hash]);
    logAudit($pdo, 'admin.setup', ['username' => $username], (string)$pdo->lastInsertId());
    jsonResponse(1, '超级管理员创建成功');
}

/** 管理员恢复模式：清空 admins 表 */
function handleRecoveryReset(PDO $pdo): void {
    rateLimit($pdo, 'admin_recovery_reset', getClientIp(), 3, 1800, 7200);

    if (!defined('ADMIN_RECOVERY_ENABLED') || !ADMIN_RECOVERY_ENABLED) {
        jsonResponse(0, '管理员恢复模式未启用，请先到 /api/config.local.php 中手动开启');
    }
    if (!isLocalRecoveryRequest()) {
        jsonResponse(0, '管理员恢复操作仅允许服务器本机执行');
    }

    $configuredRecoveryKey = defined('ADMIN_RECOVERY_KEY') ? trim((string)ADMIN_RECOVERY_KEY) : '';
    if ($configuredRecoveryKey === '') {
        jsonResponse(0, '管理员恢复密钥未配置，请先到 /api/config.local.php 中设置 ADMIN_RECOVERY_KEY');
    }

    $recoveryKey = normalizeString(requestValue('recovery_key', ''), 200);
    $confirmText = normalizeString(requestValue('confirm_text', ''), 50);
    if ($recoveryKey === '' || $confirmText === '') {
        jsonResponse(0, '请填写恢复密钥和确认文本');
    }
    if ($confirmText !== 'RESET ADMINS') {
        jsonResponse(0, '确认文本错误，请输入 RESET ADMINS');
    }
    if (!hash_equals($configuredRecoveryKey, $recoveryKey)) {
        jsonResponse(0, '恢复密钥错误');
    }

    $adminRows = $pdo->query('SELECT id, username, role FROM admins ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    if (empty($adminRows)) {
        jsonResponse(1, '当前没有管理员数据，无需恢复', ['cleared' => 0]);
    }

    $pdo->beginTransaction();
    $stmt = $pdo->prepare('DELETE FROM admins');
    $stmt->execute();
    $deleted = $stmt->rowCount();
    $pdo->commit();

    if (securityTableExists($pdo, 'error_logs')) {
        logError($pdo, 'admin.recovery_reset', '管理员恢复模式已执行，admins 表已清空', [
            'deleted_count' => $deleted,
            'deleted_admins' => $adminRows,
            'ip' => getClientIp(),
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
        ]);
    }

    unset($_SESSION['admin_id'], $_SESSION['admin_name'], $_SESSION['admin_role']);
    jsonResponse(1, '管理员数据已清空，请立即返回创建页面重新设置首个管理员', ['cleared' => $deleted]);
}

/** 管理员登录 */
function handleLogin(PDO $pdo): void {
    $username = normalizeString(requestValue('username', ''), 50);
    $password = (string)requestValue('password', '');

    rateLimit($pdo, 'admin_login', $username, 5, 300, 900);

    if ($username === '' || $password === '') {
        jsonResponse(0, '请填写完整');
    }

    $stmt = $pdo->prepare('SELECT id, username, password, role FROM admins WHERE username = ?');
    $stmt->execute([$username]);
    $admin = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$admin || !password_verify($password, $admin['password'])) {
        jsonResponse(0, '用户名或密码错误');
    }

    $_SESSION['admin_id'] = $admin['id'];
    $_SESSION['admin_name'] = $admin['username'];
    $_SESSION['admin_role'] = $admin['role'] ?? 'admin';
    jsonResponse(1, '登录成功', [
        'id' => $admin['id'],
        'username' => $admin['username'],
        'role' => $admin['role'] ?? 'admin',
    ]);
}

/** 管理员退出 */
function handleLogout(): void {
    unset($_SESSION['admin_id'], $_SESSION['admin_name'], $_SESSION['admin_role']);
    jsonResponse(1, '已退出');
}

/** 检查登录状态 */
function handleCheck(PDO $pdo): void {
    if (empty($_SESSION['admin_id'])) {
        jsonResponse(0, '未登录');
    }

    $stmt = $pdo->prepare('SELECT username, role FROM admins WHERE id = ?');
    $stmt->execute([(int)$_SESSION['admin_id']]);
    $admin = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$admin) {
        unset($_SESSION['admin_id'], $_SESSION['admin_name'], $_SESSION['admin_role']);
        jsonResponse(0, '未登录');
    }

    $_SESSION['admin_name'] = $admin['username'];
    $_SESSION['admin_role'] = $admin['role'] ?? 'admin';
    jsonResponse(1, '已登录', [
        'id' => (int)$_SESSION['admin_id'],
        'username' => $admin['username'],
        'role' => $admin['role'] ?? 'admin',
    ]);
}

/** 修改当前管理员密码 */
function handleChangePassword(PDO $pdo): void {
    checkAdmin($pdo);
    $old = (string)requestValue('old_password', '');
    $new = (string)requestValue('new_password', '');
    if (strlen($new) < 6) {
        jsonResponse(0, '新密码至少6位');
    }
    $stmt = $pdo->prepare('SELECT password FROM admins WHERE id = ?');
    $stmt->execute([(int)$_SESSION['admin_id']]);
    $admin = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$admin || !password_verify($old, $admin['password'])) {
        jsonResponse(0, '原密码错误');
    }
    $hash = password_hash($new, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare('UPDATE admins SET password = ? WHERE id = ?');
    $stmt->execute([$hash, (int)$_SESSION['admin_id']]);
    logAudit($pdo, 'admin.change_password', [], (string)$_SESSION['admin_id']);
    jsonResponse(1, '密码修改成功');
}

/** 列出所有管理员 */
function handleList(PDO $pdo): void {
    checkAdmin($pdo, true);
    $stmt = $pdo->query('SELECT id, username, role, created_at FROM admins ORDER BY id');
    jsonResponse(1, '', $stmt->fetchAll(PDO::FETCH_ASSOC));
}

/** 搜索用户（用于提权） */
function handleSearchUsers(PDO $pdo): void {
    checkAdmin($pdo, true);
    $keyword = normalizeString(requestValue('keyword', ''), 100);
    $limit = validateInt(requestValue('limit', 20), 1, 50) ?? 20;
    $where = '1=1';
    $params = [];
    if ($keyword !== '') {
        $where .= ' AND (u.username LIKE ? OR u.email LIKE ? OR u.linuxdo_username LIKE ? OR CAST(u.id AS CHAR) = ?)';
        $kw = '%' . $keyword . '%';
        $params = [$kw, $kw, $kw, $keyword];
    }
    // 不读取 password 哈希明文到应用层，直接用 SQL 计算 has_password
    $sql = 'SELECT u.id, u.username, u.email, u.linuxdo_username, u.created_at,
                   CASE WHEN u.password IS NOT NULL AND u.password <> \'\' THEN 1 ELSE 0 END AS has_password,
                   a.id AS admin_id, a.role AS admin_role
            FROM users u
            LEFT JOIN admins a ON a.username = u.username
            WHERE ' . $where . ' ORDER BY u.id DESC LIMIT ?';
    $stmt = $pdo->prepare($sql);
    $bind = 1;
    foreach ($params as $value) {
        $stmt->bindValue($bind++, $value);
    }
    $stmt->bindValue($bind++, $limit, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    jsonResponse(1, 'ok', $rows);
}

/** 将普通用户提权为管理员 */
function handlePromoteUser(PDO $pdo): void {
    checkAdmin($pdo, true);
    $input = requestJson();
    if (!$input) {
        $input = $_POST;
    }
    $userId = validateInt($input['user_id'] ?? null, 1);
    $role = (string)($input['role'] ?? 'admin');
    $password = (string)($input['password'] ?? '');
    if (!$userId) {
        jsonResponse(0, '用户ID无效');
    }
    if (!in_array($role, ['admin', 'super'], true)) {
        $role = 'admin';
    }
    $stmt = $pdo->prepare('SELECT id, username, password FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        jsonResponse(0, '用户不存在');
    }
    $stmt = $pdo->prepare('SELECT id FROM admins WHERE username = ?');
    $stmt->execute([$user['username']]);
    if ($stmt->fetchColumn()) {
        jsonResponse(0, '该用户已是管理员');
    }
    $hash = '';
    if (!empty($password)) {
        if (strlen($password) < 6) {
            jsonResponse(0, '管理员密码至少6位');
        }
        $hash = password_hash($password, PASSWORD_DEFAULT);
    } elseif (!empty($user['password'])) {
        $hash = (string)$user['password'];
    } else {
        jsonResponse(0, '该用户没有本地密码，请为管理员权限单独设置一个密码');
    }
    $stmt = $pdo->prepare('INSERT INTO admins (username, password, role) VALUES (?, ?, ?)');
    $stmt->execute([$user['username'], $hash, $role]);
    logAudit($pdo, 'admin.promote_user', ['username' => $user['username'], 'source_user_id' => $userId, 'role' => $role], (string)$pdo->lastInsertId());
    jsonResponse(1, '提权成功');
}

/** 新增管理员 */
function handleAdd(PDO $pdo): void {
    checkAdmin($pdo, true);
    $input = requestJson();
    $username = normalizeString($input['username'] ?? '', 50);
    $password = (string)($input['password'] ?? '');
    $role = (string)($input['role'] ?? 'admin');

    if ($username === '' || $password === '') {
        jsonResponse(0, '请填写完整');
    }
    if (strlen($password) < 6) {
        jsonResponse(0, '密码至少6位');
    }
    if (!in_array($role, ['admin', 'super'], true)) {
        $role = 'admin';
    }

    $stmt = $pdo->prepare('SELECT id FROM admins WHERE username = ?');
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        jsonResponse(0, '用户名已存在');
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare('INSERT INTO admins (username, password, role) VALUES (?, ?, ?)');
    $stmt->execute([$username, $hash, $role]);
    logAudit($pdo, 'admin.add', ['username' => $username, 'role' => $role], (string)$pdo->lastInsertId());
    jsonResponse(1, '管理员添加成功');
}

/** 删除管理员 */
function handleDelete(PDO $pdo): void {
    checkAdmin($pdo, true);
    $input = requestJson();
    $id = validateInt($input['id'] ?? null, 1);
    if (!$id) {
        jsonResponse(0, '参数错误');
    }
    if ($id === (int)$_SESSION['admin_id']) {
        jsonResponse(0, '不能删除自己');
    }

    $stmt = $pdo->prepare('SELECT username, role FROM admins WHERE id = ?');
    $stmt->execute([$id]);
    $admin = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$admin) {
        jsonResponse(0, '管理员不存在');
    }
    if (($admin['role'] ?? '') === 'super') {
        jsonResponse(0, '不能删除超级管理员');
    }

    $stmt = $pdo->prepare('DELETE FROM admins WHERE id = ?');
    $stmt->execute([$id]);
    logAudit($pdo, 'admin.delete', ['username' => $admin['username']], (string)$id);
    jsonResponse(1, '删除成功');
}

