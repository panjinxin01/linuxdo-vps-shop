<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';

$action = requestValue('action', 'summary');
$pdo = getDB();

$csrfActions = ['admin_adjust'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

try {
    switch ($action) {
        case 'summary':
            checkUser();
            $user = commerceGetUserById($pdo, (int)$_SESSION['user_id']);
            if (!$user) {
                jsonResponse(0, '用户不存在');
            }
            $summary = [
                'user_id' => (int)$user['id'],
                'balance' => round((float)($user['credit_balance'] ?? 0), 2),
                'income_total' => 0.0,
                'expense_total' => 0.0,
                'transaction_count' => 0,
            ];
            if (commerceTableExists($pdo, 'credit_transactions')) {
                $stmt = $pdo->prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income_total, COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expense_total FROM credit_transactions WHERE user_id = ?');
                $stmt->execute([(int)$user['id']]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
                $summary['transaction_count'] = (int)($row['cnt'] ?? 0);
                $summary['income_total'] = round((float)($row['income_total'] ?? 0), 2);
                $summary['expense_total'] = round((float)($row['expense_total'] ?? 0), 2);
            }
            jsonResponse(1, 'ok', $summary);
            break;

        case 'my_transactions':
            checkUser();
            $page = validateInt(requestValue('page', 1), 1) ?? 1;
            $pageSize = validateInt(requestValue('page_size', 20), 1, 100) ?? 20;
            $offset = ($page - 1) * $pageSize;
            if (!commerceTableExists($pdo, 'credit_transactions')) {
                jsonResponse(1, 'ok', ['list' => [], 'total' => 0, 'page' => $page, 'page_size' => $pageSize]);
            }
            $userId = (int)$_SESSION['user_id'];
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM credit_transactions WHERE user_id = ?');
            $stmt->execute([$userId]);
            $total = (int)$stmt->fetchColumn();
            $stmt = $pdo->prepare('SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?');
            $stmt->bindValue(1, $userId, PDO::PARAM_INT);
            $stmt->bindValue(2, $pageSize, PDO::PARAM_INT);
            $stmt->bindValue(3, $offset, PDO::PARAM_INT);
            $stmt->execute();
            jsonResponse(1, 'ok', [
                'list' => $stmt->fetchAll(PDO::FETCH_ASSOC),
                'total' => $total,
                'page' => $page,
                'page_size' => $pageSize,
                'total_pages' => $pageSize > 0 ? (int)ceil($total / $pageSize) : 0,
            ]);
            break;

        case 'admin_users':
            checkAdmin($pdo);
            $keyword = normalizeString(requestValue('keyword', ''), 100);
            $page = validateInt(requestValue('page', 1), 1) ?? 1;
            $pageSize = validateInt(requestValue('page_size', 20), 1, 100) ?? 20;
            $offset = ($page - 1) * $pageSize;
            $where = '1=1';
            $params = [];
            if ($keyword !== '') {
                $where .= ' AND (u.username LIKE ? OR u.linuxdo_username LIKE ? OR CAST(u.id AS CHAR) = ? OR CAST(u.linuxdo_id AS CHAR) = ?)';
                $kw = '%' . $keyword . '%';
                $params = [$kw, $kw, $keyword, $keyword];
            }
            $sqlCount = 'SELECT COUNT(*) FROM users u WHERE ' . $where;
            $stmt = $pdo->prepare($sqlCount);
            $stmt->execute($params);
            $total = (int)$stmt->fetchColumn();
            $sql = 'SELECT u.id, u.username, u.email, u.credit_balance, u.linuxdo_id, u.linuxdo_username, u.linuxdo_name, u.linuxdo_trust_level, u.linuxdo_active, u.linuxdo_silenced, u.created_at,
                    (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 1) AS paid_orders,
                    (SELECT COUNT(*) FROM credit_transactions ct WHERE ct.user_id = u.id) AS tx_count
                    FROM users u WHERE ' . $where . ' ORDER BY u.credit_balance DESC, u.id DESC LIMIT ? OFFSET ?';
            $stmt = $pdo->prepare($sql);
            $bind = 1;
            foreach ($params as $value) {
                $stmt->bindValue($bind++, $value);
            }
            $stmt->bindValue($bind++, $pageSize, PDO::PARAM_INT);
            $stmt->bindValue($bind++, $offset, PDO::PARAM_INT);
            $stmt->execute();
            jsonResponse(1, 'ok', [
                'list' => $stmt->fetchAll(PDO::FETCH_ASSOC),
                'total' => $total,
                'page' => $page,
                'page_size' => $pageSize,
                'total_pages' => $pageSize > 0 ? (int)ceil($total / $pageSize) : 0,
            ]);
            break;

        case 'admin_transactions':
            checkAdmin($pdo);
            if (!commerceTableExists($pdo, 'credit_transactions')) {
                jsonResponse(1, 'ok', []);
            }
            $userId = validateInt(requestValue('user_id', null), 1);
            $page = validateInt(requestValue('page', 1), 1) ?? 1;
            $pageSize = validateInt(requestValue('page_size', 50), 1, 100) ?? 50;
            $offset = ($page - 1) * $pageSize;
            if (!$userId) {
                jsonResponse(0, '用户ID无效');
            }
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM credit_transactions WHERE user_id = ?');
            $stmt->execute([$userId]);
            $total = (int)$stmt->fetchColumn();
            $stmt = $pdo->prepare('SELECT ct.*, u.username, a.username AS operator_name FROM credit_transactions ct LEFT JOIN users u ON ct.user_id = u.id LEFT JOIN admins a ON ct.operator_admin_id = a.id WHERE ct.user_id = ? ORDER BY ct.id DESC LIMIT ? OFFSET ?');
            $stmt->bindValue(1, $userId, PDO::PARAM_INT);
            $stmt->bindValue(2, $pageSize, PDO::PARAM_INT);
            $stmt->bindValue(3, $offset, PDO::PARAM_INT);
            $stmt->execute();
            jsonResponse(1, 'ok', [
                'list' => $stmt->fetchAll(PDO::FETCH_ASSOC),
                'total' => $total,
                'page' => $page,
                'page_size' => $pageSize,
                'total_pages' => $pageSize > 0 ? (int)ceil($total / $pageSize) : 0,
            ]);
            break;

        case 'admin_adjust':
            checkAdmin($pdo);
            $userId = validateInt(requestValue('user_id', null), 1);
            $amount = validateFloat(requestValue('amount', null));
            $remark = normalizeString(requestValue('remark', ''), 255);
            if (!$userId || $amount === null || $amount == 0.0) {
                jsonResponse(0, '参数不完整');
            }
            $type = $amount > 0 ? 'admin_add' : 'admin_sub';
            try {
                $pdo->beginTransaction();
                $result = commerceAdjustBalance($pdo, $userId, $type, round($amount, 2), [
                    'remark' => $remark !== '' ? $remark : null,
                ]);
                createNotification(
                    $pdo,
                    $userId,
                    'balance_admin_adjust',
                    '余额已调整',
                    '管理员已调整您的账户余额，变动：' . ($amount > 0 ? '+' : '') . number_format($amount, 2) . ' 积分，当前余额：' . number_format($result['after'], 2) . ' 积分。' . ($remark !== '' ? ('备注：' . $remark) : ''),
                    (string)$result['transaction_id']
                );
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                if ($e->getMessage() === 'insufficient balance') {
                    jsonResponse(0, '用户余额不足，无法扣减');
                }
                logError($pdo, 'credits.admin_adjust', $e->getMessage(), ['user_id' => $userId, 'amount' => $amount]);
                jsonResponse(0, '余额调整失败');
            }
            logAudit($pdo, 'credit.admin_adjust', ['user_id' => $userId, 'amount' => round($amount, 2), 'remark' => $remark], (string)$userId);
            jsonResponse(1, '余额调整成功', $result);
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.credits', $e->getMessage());
    jsonResponse(0, '服务器错误');
}
