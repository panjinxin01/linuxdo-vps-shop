<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';

$action = requestValue('action', '');
$pdo = getDB();

$csrfActions = ['register', 'login', 'logout'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function userSelectFields(PDO $pdo, array $map): string {
    $fields = [];
    foreach ($map as $column => $fallback) {
        if (commerceColumnExists($pdo, 'users', $column)) {
            $fields[] = $column;
        } else {
            $fields[] = $fallback . ' AS ' . $column;
        }
    }
    return implode(', ', $fields);
}

try {
    switch ($action) {
        case 'register':
            $username = normalizeString(requestValue('username', ''), 20);
            $password = (string)requestValue('password', '');
            $email = normalizeString(requestValue('email', ''), 100);

            rateLimit($pdo, 'user_register', $username, 5, 600, 1800);

            if ($username === '' || $password === '') {
                jsonResponse(0, '用户名和密码不能为空');
            }
            if (strlen($username) < 3 || strlen($username) > 20) {
                jsonResponse(0, '用户名长度3-20位');
            }
            if (strlen($password) < 6) {
                jsonResponse(0, '密码至少6位');
            }

            $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ?');
            $stmt->execute([$username]);
            if ($stmt->fetch()) {
                jsonResponse(0, '用户名已存在');
            }

            $hash = password_hash($password, PASSWORD_DEFAULT);
            $columns = ['username', 'password'];
            $values = [$username, $hash];
            if (commerceColumnExists($pdo, 'users', 'email')) {
                $columns[] = 'email';
                $values[] = $email;
            }
            $stmt = $pdo->prepare('INSERT INTO users (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_fill(0, count($values), '?')) . ')');
            $stmt->execute($values);
            jsonResponse(1, '注册成功');
            break;

        case 'login':
            $username = normalizeString(requestValue('username', ''), 50);
            $password = (string)requestValue('password', '');
            rateLimit($pdo, 'user_login', $username, 5, 300, 900);
            if ($username === '' || $password === '') {
                jsonResponse(0, '请填写完整');
            }

            $stmt = $pdo->prepare('SELECT id, username, password, role FROM admins WHERE username = ?');
            $stmt->execute([$username]);
            $admin = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($admin && password_verify($password, $admin['password'])) {
                $_SESSION['admin_id'] = $admin['id'];
                $_SESSION['admin_name'] = $admin['username'];
                $_SESSION['admin_role'] = $admin['role'] ?? 'admin';
                jsonResponse(1, '登录成功', ['username' => $admin['username'], 'role' => 'admin']);
            }

            $fieldSql = userSelectFields($pdo, [
                'id' => '0',
                'username' => 'NULL',
                'password' => 'NULL',
                'credit_balance' => '0',
                'linuxdo_id' => 'NULL',
                'linuxdo_username' => 'NULL',
                'linuxdo_trust_level' => '0',
                'linuxdo_active' => '1',
                'linuxdo_silenced' => '0',
            ]);
            $stmt = $pdo->prepare('SELECT ' . $fieldSql . ' FROM users WHERE username = ?');
            $stmt->execute([$username]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user && password_verify($password, (string)$user['password'])) {
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['username'] = $user['username'];
                jsonResponse(1, '登录成功', ['username' => $user['username'], 'role' => 'user', 'user' => $user]);
            }

            jsonResponse(0, '用户名或密码错误');
            break;

        case 'logout':
            unset($_SESSION['user_id'], $_SESSION['username'], $_SESSION['admin_id'], $_SESSION['admin_name'], $_SESSION['admin_role']);
            jsonResponse(1, '已退出');
            break;

        case 'check':
            if (isset($_SESSION['admin_id'])) {
                jsonResponse(1, '已登录', ['username' => $_SESSION['admin_name'], 'role' => 'admin']);
            }
            if (isset($_SESSION['user_id'])) {
                $fieldSql = userSelectFields($pdo, [
                    'id' => '0',
                    'username' => 'NULL',
                    'email' => 'NULL',
                    'credit_balance' => '0',
                    'linuxdo_id' => 'NULL',
                    'linuxdo_username' => 'NULL',
                    'linuxdo_name' => 'NULL',
                    'linuxdo_trust_level' => '0',
                    'linuxdo_active' => '1',
                    'linuxdo_silenced' => '0',
                    'linuxdo_avatar' => 'NULL',
                ]);
                $stmt = $pdo->prepare('SELECT ' . $fieldSql . ' FROM users WHERE id = ?');
                $stmt->execute([(int)$_SESSION['user_id']]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($user) {
                    $_SESSION['username'] = $user['username'];
                    jsonResponse(1, '已登录', ['username' => $user['username'], 'role' => 'user', 'user' => $user]);
                }
                unset($_SESSION['user_id'], $_SESSION['username']);
            }
            jsonResponse(0, '未登录');
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.user', $e->getMessage());
    jsonResponse(0, '服务器错误');
}
