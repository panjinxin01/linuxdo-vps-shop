<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$action = requestValue('action', '');

switch ($action) {
    case 'login':
        if (empty(LINUXDO_CLIENT_ID) || empty(LINUXDO_REDIRECT_URI)) {
            exit('OAuth2配置未完成，请联系管理员');
        }
        try {
            $state = bin2hex(random_bytes(16));
        } catch (Throwable $e) {
            $state = bin2hex(uniqid('', true));
        }
        $_SESSION['oauth_state'] = $state;
        $params = http_build_query([
            'client_id' => LINUXDO_CLIENT_ID,
            'redirect_uri' => LINUXDO_REDIRECT_URI,
            'response_type' => 'code',
            'scope' => 'user',
            'state' => $state
        ]);
        header('Location: ' . LINUXDO_AUTH_URL . '?' . $params);
        exit;

    case 'callback':
        header('Content-Type: text/html; charset=utf-8');
        $state = (string)requestValue('state', '');
        $expectedState = (string)($_SESSION['oauth_state'] ?? '');
        if ($state === '' || $state !== $expectedState) {
            if (!empty($_SESSION['user_id'])) {
                outputSuccess((string)($_SESSION['username'] ?? '用户'), false);
            }
            outputError('安全验证失败，请重新发起登录');
        }
        unset($_SESSION['oauth_state']);

        $code = (string)requestValue('code', '');
        if ($code === '') {
            $error = (string)requestValue('error', '授权失败');
            $errorDesc = (string)requestValue('error_description', '用户取消授权或发生错误');
            outputError($error . ': ' . $errorDesc);
        }

        $tokenData = getAccessToken($code);
        if (!$tokenData || !isset($tokenData['access_token'])) {
            outputError('获取访问令牌失败');
        }

        $userInfo = getUserInfo($tokenData['access_token']);
        if (!$userInfo || !isset($userInfo['id'])) {
            outputError('获取用户信息失败');
        }

        $result = handleUserLogin($userInfo);
        if ($result['success']) {
            outputSuccess($result['username'], $result['isNew']);
        }
        outputError($result['message'] ?? '登录失败');
        break;

    case 'check':
        $configured = !empty(LINUXDO_CLIENT_ID) && !empty(LINUXDO_CLIENT_SECRET) && !empty(LINUXDO_REDIRECT_URI);
        jsonResponse(1, '', ['configured' => $configured]);
        break;

    default:
        jsonResponse(0, '未知操作');
}

function getAccessToken(string $code): ?array {
    $data = [
        'client_id' => LINUXDO_CLIENT_ID,
        'client_secret' => LINUXDO_CLIENT_SECRET,
        'code' => $code,
        'redirect_uri' => LINUXDO_REDIRECT_URI,
        'grant_type' => 'authorization_code'
    ];

    $response = httpRequest(LINUXDO_TOKEN_URL, [
        'method' => 'POST',
        'data' => $data,
        'headers' => [
            'Content-Type' => 'application/x-www-form-urlencoded',
            'Accept' => 'application/json'
        ],
        'timeout' => 30,
        'ssl_verify_peer' => true
    ]);
    if (!$response['ok']) {
        return null;
    }
    $decoded = json_decode((string)$response['body'], true);
    return is_array($decoded) ? $decoded : null;
}

function getUserInfo(string $accessToken): ?array {
    $response = httpRequest(LINUXDO_USER_URL, [
        'method' => 'GET',
        'headers' => [
            'Authorization' => 'Bearer ' . $accessToken,
            'Accept' => 'application/json'
        ],
        'timeout' => 30,
        'ssl_verify_peer' => true
    ]);
    if (!$response['ok']) {
        return null;
    }
    $decoded = json_decode((string)$response['body'], true);
    return is_array($decoded) ? $decoded : null;
}

function handleUserLogin(array $userInfo): array {
    $pdo = getDB();
    $linuxdoId = (int)$userInfo['id'];
    $username = (string)($userInfo['username'] ?? '');
    $name = (string)($userInfo['name'] ?? $username);
    $trustLevel = (int)($userInfo['trust_level'] ?? 0);
    $active = array_key_exists('active', $userInfo) ? (int)((bool)$userInfo['active']) : 1;
    $silenced = array_key_exists('silenced', $userInfo) ? (int)((bool)$userInfo['silenced']) : 0;
    $avatar = '';
    if (!empty($userInfo['avatar_template'])) {
        $avatar = str_replace('{size}', '120', (string)$userInfo['avatar_template']);
        if (strpos($avatar, 'http') !== 0) {
            $avatar = 'https://linux.do' . $avatar;
        }
    }

    $stmt = $pdo->prepare('SELECT id, username FROM users WHERE linuxdo_id = ?');
    $stmt->execute([$linuxdoId]);
    $existingUser = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($existingUser) {
        $stmt = $pdo->prepare('UPDATE users SET linuxdo_username = ?, linuxdo_name = ?, linuxdo_trust_level = ?, linuxdo_active = ?, linuxdo_silenced = ?, linuxdo_avatar = ?, updated_at = NOW() WHERE id = ?');
        $stmt->execute([$username, $name, $trustLevel, $active, $silenced, $avatar, $existingUser['id']]);
        $_SESSION['user_id'] = $existingUser['id'];
        $_SESSION['username'] = $existingUser['username'];
        return [
            'success' => true,
            'username' => $existingUser['username'],
            'isNew' => false
        ];
    }

    $finalUsername = $username !== '' ? $username : ('user_' . $linuxdoId);
    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute([$finalUsername]);
    if ($stmt->fetch()) {
        $finalUsername = $finalUsername . '_ld' . $linuxdoId;
    }

    $stmt = $pdo->prepare('INSERT INTO users (username, linuxdo_id, linuxdo_username, linuxdo_name, linuxdo_trust_level, linuxdo_active, linuxdo_silenced, linuxdo_avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())');
    $stmt->execute([$finalUsername, $linuxdoId, $username, $name, $trustLevel, $active, $silenced, $avatar]);
    $userId = (int)$pdo->lastInsertId();

    $_SESSION['user_id'] = $userId;
    $_SESSION['username'] = $finalUsername;
    return [
        'success' => true,
        'username' => $finalUsername,
        'isNew' => true
    ];
}

function outputSuccess(string $username, bool $isNew): void {
    $message = $isNew ? '欢迎加入' : '欢迎回来';
    $safeUsername = htmlspecialchars($username, ENT_QUOTES, 'UTF-8');
    echo <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>登录成功</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .card { background: white; padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 400px; }
        .success-icon { font-size: 64px; margin-bottom: 20px; }
        h2 { color: #333; margin: 0 0 10px 0; }
        p { color: #666; margin: 0 0 20px 0; }
        .username { color: #667eea; font-weight: 600; }
        .redirect { font-size: 14px; color: #999; }
    </style>
</head>
<body>
    <div class="card">
        <div class="success-icon">🎉</div>
        <h2>{$message}</h2>
        <p><span class="username">{$safeUsername}</span></p>
        <p class="redirect">正在跳转...</p>
    </div>
    <script>
        setTimeout(function() {
            window.location.href = '../index.html';
        }, 1500);
    </script>
</body>
</html>
HTML;
    exit;
}

function outputError(string $message): void {
    $safeMessage = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    echo <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>登录失败</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .card { background: white; padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 400px; }
        .error-icon { font-size: 64px; margin-bottom: 20px; }
        h2 { color: #e53e3e; margin: 0 0 10px 0; }
        p { color: #666; margin: 0 0 20px 0; word-break: break-all; }
        .btn { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; }
        .btn:hover { background: #5a67d8; }
    </style>
</head>
<body>
    <div class="card">
        <div class="error-icon">😥</div>
        <h2>登录失败</h2>
        <p>{$safeMessage}</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
            <a href="../api/oauth.php?action=login" class="btn">重新登录</a>
            <a href="../index.html" class="btn" style="background:#718096;">返回首页</a>
        </div>
    </div>
</body>
</html>
HTML;
    exit;
}

