<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';

$action = requestValue('action', '');

switch ($action) {
    case 'login':
        if (empty(LINUXDO_CLIENT_ID) || empty(LINUXDO_REDIRECT_URI)) {
            outputNotConfigured();
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
        if ($state === '' || $expectedState === '' || !hash_equals($expectedState, $state)) {
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
    $apiKey = (string)($userInfo['api_key'] ?? '');
    $externalIds = !empty($userInfo['external_ids']) ? json_encode($userInfo['external_ids'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
    $avatar = '';
    if (!empty($userInfo['avatar_template'])) {
        $avatar = str_replace('{size}', '120', (string)$userInfo['avatar_template']);
        if (strpos($avatar, 'http') !== 0) {
            $avatar = 'https://linux.do' . $avatar;
        }
    }

    $hasLinuxdoId = commerceColumnExists($pdo, 'users', 'linuxdo_id');
    $lookupSql = $hasLinuxdoId ? 'SELECT id, username FROM users WHERE linuxdo_id = ?' : 'SELECT id, username FROM users WHERE username = ?';
    $stmt = $pdo->prepare($lookupSql);
    $stmt->execute([$hasLinuxdoId ? $linuxdoId : ($username !== '' ? $username : ('user_' . $linuxdoId))]);
    $existingUser = $stmt->fetch(PDO::FETCH_ASSOC);

    // Define all OAuth fields to sync
    $oauthFields = [
        'linuxdo_username' => $username,
        'linuxdo_name' => $name,
        'linuxdo_trust_level' => $trustLevel,
        'linuxdo_active' => $active,
        'linuxdo_silenced' => $silenced,
        'linuxdo_avatar' => $avatar,
        'linuxdo_api_key' => $apiKey,
        'linuxdo_external_ids' => $externalIds,
    ];

    if ($existingUser) {
        $setParts = [];
        $params = [];
        foreach ($oauthFields as $column => $value) {
            if (commerceColumnExists($pdo, 'users', $column)) {
                $setParts[] = $column . ' = ?';
                $params[] = $value;
            }
        }
        if (commerceColumnExists($pdo, 'users', 'updated_at')) {
            $setParts[] = 'updated_at = NOW()';
        }
        if ($setParts) {
            $params[] = $existingUser['id'];
            $stmt = $pdo->prepare('UPDATE users SET ' . implode(', ', $setParts) . ' WHERE id = ?');
            $stmt->execute($params);
        }
        $_SESSION['user_id'] = $existingUser['id'];
        $_SESSION['username'] = $existingUser['username'];
        return [
            'success' => true,
            'username' => $existingUser['username'],
            'isNew' => false
        ];
    }

    $finalUsername = $username !== '' ? $username : ('user_' . $linuxdoId);

    // 并发安全的新用户插入：先直接 INSERT
    // 若 linuxdo_id 有自增带带自增，连续请求可能同时走这里。
    // 用 try-catch 捕获唯一键冲突，冲突后 SELECT 已存在的用户
    $columns = ['username'];
    $values = [$finalUsername];
    if (commerceColumnExists($pdo, 'users', 'linuxdo_id')) {
        $columns[] = 'linuxdo_id';
        $values[] = $linuxdoId;
    }
    foreach ($oauthFields as $column => $value) {
        if ($column !== 'linuxdo_id' && commerceColumnExists($pdo, 'users', $column)) {
            $columns[] = $column;
            $values[] = $value;
        }
    }
    $hasUpdatedAt = commerceColumnExists($pdo, 'users', 'updated_at');
    $sqlCols = implode(', ', $columns) . ', created_at' . ($hasUpdatedAt ? ', updated_at' : '');
    $sqlVals = implode(', ', array_fill(0, count($values), '?')) . ', NOW()' . ($hasUpdatedAt ? ', NOW()' : '');
    try {
        $stmt = $pdo->prepare('INSERT INTO users (' . $sqlCols . ') VALUES (' . $sqlVals . ')');
        $stmt->execute($values);
        $userId = (int)$pdo->lastInsertId();
        // 插入成功的唯一出口
        $_SESSION['user_id'] = $userId;
        $_SESSION['username'] = $finalUsername;
        return [
            'success' => true,
            'username' => $finalUsername,
            'isNew' => true
        ];
    } catch (Throwable $e) {
        // 唯一键冲突（linuxdo_id 或 username），另一请求已插入该用户
        // 使用 linuxdo_id 查找已有用户，找到后直接走登录流程
        if ($hasLinuxdoId) {
            $stmt = $pdo->prepare('SELECT id, username FROM users WHERE linuxdo_id = ? LIMIT 1');
            $stmt->execute([$linuxdoId]);
            $existing = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                // 同步最新 OAuth 信息（另一请求可能未写入完整字段）
                $setParts = [];
                $updateParams = [];
                foreach ($oauthFields as $col => $val) {
                    if (commerceColumnExists($pdo, 'users', $col)) {
                        $setParts[] = $col . ' = ?';
                        $updateParams[] = $val;
                    }
                }
                if ($setParts) {
                    $updateParams[] = $existing['id'];
                    $pdo->prepare('UPDATE users SET ' . implode(', ', $setParts) . ' WHERE id = ?')->execute($updateParams);
                }
                $_SESSION['user_id'] = $existing['id'];
                $_SESSION['username'] = $existing['username'];
                return [
                    'success' => true,
                    'username' => $existing['username'],
                    'isNew' => false
                ];
            }
        }
        // 没有 linuxdo_id 列时 username 冲突，追加后缀重试（退化情况）
        $baseUsername = $finalUsername;
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $altUsername = $baseUsername . '_ld' . $linuxdoId . ($attempt > 0 ? '_' . bin2hex(random_bytes(2)) : '');
            $values[0] = $altUsername;
            try {
                $stmt = $pdo->prepare('INSERT INTO users (' . $sqlCols . ') VALUES (' . $sqlVals . ')');
                $stmt->execute($values);
                $userId = (int)$pdo->lastInsertId();
                $_SESSION['user_id'] = $userId;
                $_SESSION['username'] = $altUsername;
                return [
                    'success' => true,
                    'username' => $altUsername,
                    'isNew' => true
                ];
            } catch (Throwable $e2) {
                continue;
            }
        }
        return ['success' => false, 'message' => '创建用户失败，请稍后重试'];
    }
}

function outputSuccess(string $username, bool $isNew): void {
    header('Content-Type: text/html; charset=utf-8');
    $message = $isNew ? '欢迎加入' : '欢迎回来';
    $safeUsername = htmlspecialchars($username, ENT_QUOTES, 'UTF-8');

    $icon = '<svg class="status-icon success-icon" viewBox="0 0 52 52" aria-hidden="true">'
        . '<circle cx="26" cy="26" r="24" fill="none"/>'
        . '<path fill="none" d="M14.5 27.5l7.5 7.5L37.5 19" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    $body = '<div class="status-icon-wrap success-glow">' . $icon . '</div>'
        . '<h1 class="card-title">' . $message . '</h1>'
        . '<p class="card-desc">已成功登录，正在为您准备控制台</p>'
        . '<div class="username-chip"><span class="username-dot"></span><span>' . $safeUsername . '</span></div>'
        . '<div class="redirect-line"><span class="breath-dot"></span><span>正在跳转…</span></div>';

    $script = 'setTimeout(function(){ window.location.href = "../index.html"; }, 1500);';

    echo renderOAuthPage('登录成功', $body, $script);
    exit;
}

function outputError(string $message): void {
    header('Content-Type: text/html; charset=utf-8');
    $safeMessage = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');

    $icon = '<svg class="status-icon error-icon" viewBox="0 0 52 52" aria-hidden="true">'
        . '<circle cx="26" cy="26" r="24" fill="none"/>'
        . '<path fill="none" d="M17 17l18 18" stroke-linecap="round"/>'
        . '<path fill="none" d="M35 17l-18 18" stroke-linecap="round"/></svg>';

    $body = '<div class="status-icon-wrap error-glow">' . $icon . '</div>'
        . '<h1 class="card-title">登录失败</h1>'
        . '<p class="card-desc">登录过程中遇到问题，请重试或返回首页</p>'
        . '<div class="error-detail"><span class="error-label">错误详情</span>'
        . '<p class="error-text">' . $safeMessage . '</p></div>'
        . '<div class="btn-row">'
        . '<a class="btn-primary-pill" href="../api/oauth.php?action=login">重新登录</a>'
        . '<a class="btn-ghost-pill" href="../index.html">返回首页</a>'
        . '</div>';

    echo renderOAuthPage('登录失败', $body);
    exit;
}

/**
 * 输出「OAuth2 未配置」提示页（替代原裸文本 exit）
 */
function outputNotConfigured(): void {
    header('Content-Type: text/html; charset=utf-8');

    $icon = '<svg class="status-icon warn-icon" viewBox="0 0 52 52" aria-hidden="true">'
        . '<path fill="none" stroke-linejoin="round" d="M26 6l18 8v12c0 11-7.7 18.6-18 21C15.7 44.6 8 37 8 26V14z"/>'
        . '<path fill="none" stroke-linecap="round" d="M26 19v10"/>'
        . '<circle cx="26" cy="35" r="1.6"/></svg>';

    $body = '<div class="status-icon-wrap warn-glow">' . $icon . '</div>'
        . '<h1 class="card-title">无法发起登录</h1>'
        . '<p class="card-desc">OAuth2 配置未完成，请联系站点管理员</p>'
        . '<div class="error-detail"><span class="error-label">可能的原因</span>'
        . '<p class="error-text">站点尚未完成 Linux DO Connect 的 Client ID / 回调地址配置，暂时无法使用 OAuth 登录。</p></div>'
        . '<div class="btn-row"><a class="btn-primary-pill" href="../index.html">返回首页</a></div>';

    echo renderOAuthPage('无法发起登录', $body);
    exit;
}

/**
 * 登录回调页共享外壳（自包含 HTML，零外部依赖）
 *
 * @param string $title  页面标题
 * @param string $body   卡片主体 HTML（调用方负责转义动态内容）
 * @param string $script 附加脚本（不含 <script> 标签）
 * @return string 完整 HTML
 */
function renderOAuthPage(string $title, string $body, string $script = ''): string {
    $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');

    return <<<HTML
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>{$safeTitle}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Roboto,sans-serif;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  background:#0b1026;
  overflow-x:hidden;
}
/* === 动态背景：深靛夜空 + 缓慢漂移光晕 === */
.bg{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.bg::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 120%,rgba(67,97,238,.18),transparent 55%)}
.orb{position:absolute;border-radius:50%;filter:blur(70px);opacity:.5;will-change:transform}
.orb-1{width:420px;height:420px;top:-120px;left:-100px;background:radial-gradient(circle,rgba(99,102,241,.55),transparent 70%);animation:drift1 26s ease-in-out infinite alternate}
.orb-2{width:380px;height:380px;bottom:-140px;right:-80px;background:radial-gradient(circle,rgba(139,92,246,.5),transparent 70%);animation:drift2 22s ease-in-out infinite alternate}
.orb-3{width:300px;height:300px;top:40%;left:55%;background:radial-gradient(circle,rgba(14,165,233,.35),transparent 70%);animation:drift3 30s ease-in-out infinite alternate}
@keyframes drift1{from{transform:translate(0,0) scale(1)}to{transform:translate(70px,50px) scale(1.12)}}
@keyframes drift2{from{transform:translate(0,0) scale(1)}to{transform:translate(-60px,-45px) scale(1.08)}}
@keyframes drift3{from{transform:translate(0,0) scale(1)}to{transform:translate(-50px,40px) scale(.92)}}

/* === 毛玻璃卡片 === */
.card{
  position:relative;z-index:1;width:100%;max-width:400px;text-align:center;
  background:rgba(17,24,52,.62);
  -webkit-backdrop-filter:blur(22px) saturate(150%);
  backdrop-filter:blur(22px) saturate(150%);
  border:1px solid rgba(255,255,255,.1);
  border-radius:24px;padding:44px 36px 36px;
  box-shadow:0 24px 70px -18px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);
  animation:card-in .55s cubic-bezier(.34,1.4,.64,1) both;
}
@keyframes card-in{from{opacity:0;transform:translateY(18px) scale(.96)}}
.card-title{font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:.01em;margin-bottom:8px}
.card-desc{font-size:14px;color:rgba(203,213,225,.75);margin-bottom:22px;line-height:1.7}

/* === 状态图标 === */
.status-icon-wrap{width:84px;height:84px;margin:0 auto 22px;border-radius:26px;display:flex;align-items:center;justify-content:center;position:relative}
.status-icon{width:46px;height:46px}
.success-glow{background:rgba(16,185,129,.12);box-shadow:0 0 0 1px rgba(16,185,129,.25),0 10px 32px -8px rgba(16,185,129,.45)}
.success-icon circle{stroke:#34d399;stroke-width:3;stroke-dasharray:151;stroke-dashoffset:151;animation:draw .7s ease-out forwards}
.success-icon path{stroke:#34d399;stroke-width:4;stroke-dasharray:48;stroke-dashoffset:48;animation:draw .5s ease-out .45s forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.error-glow{background:rgba(239,68,68,.1);box-shadow:0 0 0 1px rgba(239,68,68,.28),0 10px 32px -8px rgba(239,68,68,.4)}
.error-icon circle{stroke:#f87171;stroke-width:3;stroke-dasharray:151;stroke-dashoffset:151;animation:draw .7s ease-out forwards}
.error-icon path{stroke:#f87171;stroke-width:4;stroke-linecap:round;stroke-dasharray:26;stroke-dashoffset:26;animation:draw .35s ease-out .5s forwards}
.warn-glow{background:rgba(245,158,11,.12);box-shadow:0 0 24px rgba(245,158,11,.28),0 0 0 1px rgba(245,158,11,.3)}
.warn-icon{stroke:#fbbf24;stroke-width:3;stroke-linecap:round}
.username-chip{
  display:inline-flex;align-items:center;gap:8px;margin:0 auto 22px;padding:9px 18px;border-radius:999px;
  background:rgba(99,131,255,.12);border:1px solid rgba(99,131,255,.28);
  font-size:15px;font-weight:600;color:#a5b4fc;max-width:100%;
}
.username-chip>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.username-dot{width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 8px rgba(52,211,153,.8);flex-shrink:0}
.redirect-line{display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:rgba(148,163,184,.85)}
.breath-dot{width:8px;height:8px;border-radius:50%;background:#6383ff;animation:breath 1.2s ease-in-out infinite}
@keyframes breath{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}

/* === 错误详情 === */
.error-detail{
  text-align:left;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);
  border-radius:14px;padding:14px 16px;margin-bottom:24px;
}
.error-label{display:block;font-size:11px;font-weight:600;letter-spacing:.08em;color:rgba(248,113,113,.9);margin-bottom:5px}
.error-text{font-size:13.5px;color:rgba(226,232,240,.92);line-height:1.7;word-break:break-word;overflow-wrap:anywhere}

/* === 按钮 === */
.btn-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn-primary-pill,.btn-ghost-pill{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:12px 26px;border-radius:999px;font-size:14px;font-weight:600;
  text-decoration:none;transition:all .22s cubic-bezier(.4,0,.2,1);white-space:nowrap;
}
.btn-primary-pill{
  background:linear-gradient(135deg,#4361ee 0%,#7c3aed 100%);color:#fff;
  box-shadow:0 6px 18px -4px rgba(79,70,229,.55);
}
.btn-primary-pill:hover{transform:translateY(-2px);box-shadow:0 10px 26px -6px rgba(79,70,229,.7);filter:brightness(1.08)}
.btn-primary-pill:active{transform:translateY(0);filter:brightness(.96)}
.btn-ghost-pill{
  background:rgba(255,255,255,.06);color:#cbd5e1;border:1px solid rgba(255,255,255,.14);
}
.btn-ghost-pill:hover{background:rgba(255,255,255,.11);color:#f1f5f9;border-color:rgba(255,255,255,.24)}
.btn-ghost-pill:active{transform:translateY(1px)}

/* === 响应式 === */
@media (max-width:480px){
  body{padding:16px;padding-top:12vh}
  .card{padding:36px 24px 28px;border-radius:22px}
  .status-icon-wrap{width:72px;height:72px;margin-bottom:18px}
  .status-icon{width:40px;height:40px}
  .card-title{font-size:20px}
  .btn-row{flex-direction:column}
  .btn-row a{width:100%}
}
@media (prefers-reduced-motion:reduce){
  .orb,.breath-dot{animation:none}
  .card{animation:none}
  .success-icon circle,.success-icon path,.error-icon circle,.error-icon path{animation:none;stroke-dashoffset:0}
}
</style>
</head>
<body>
<div class="bg" aria-hidden="true">
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
</div>
<div class="card" role="status">
{$body}
</div>
<script>{$script}</script>
</body>
</html>
HTML;
}
