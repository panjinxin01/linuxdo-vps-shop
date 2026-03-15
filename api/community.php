<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';

$action = requestValue('action', 'overview');
$pdo = getDB();

$csrfActions = ['save_rule', 'delete_rule', 'save_discount', 'delete_discount', 'save_settings'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

try {
    switch ($action) {
        case 'overview':
            checkAdmin($pdo);
            $settings = [
                'linuxdo_silenced_order_mode' => commerceGetSetting($pdo, 'linuxdo_silenced_order_mode', 'review'),
            ];
            $stats = [
                'oauth_users' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE linuxdo_id IS NOT NULL')->fetchColumn(),
                'silenced_users' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE COALESCE(linuxdo_silenced,0) = 1')->fetchColumn(),
                'inactive_users' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE COALESCE(linuxdo_active,1) = 0')->fetchColumn(),
                'trust0' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE COALESCE(linuxdo_trust_level,0) = 0')->fetchColumn(),
                'trust3plus' => (int)$pdo->query('SELECT COUNT(*) FROM users WHERE COALESCE(linuxdo_trust_level,0) >= 3')->fetchColumn(),
            ];
            jsonResponse(1, 'ok', ['settings' => $settings, 'stats' => $stats]);
            break;

        case 'users':
            checkAdmin($pdo);
            $page = validateInt(requestValue('page', 1), 1) ?? 1;
            $pageSize = validateInt(requestValue('page_size', 20), 1, 100) ?? 20;
            $offset = ($page - 1) * $pageSize;
            $keyword = normalizeString(requestValue('keyword', ''), 100);
            $where = '1=1';
            $params = [];
            if ($keyword !== '') {
                $where .= ' AND (username LIKE ? OR linuxdo_username LIKE ? OR linuxdo_name LIKE ? OR CAST(linuxdo_id AS CHAR) = ?)';
                $kw = '%' . $keyword . '%';
                $params = [$kw, $kw, $kw, $keyword];
            }
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE ' . $where);
            $stmt->execute($params);
            $total = (int)$stmt->fetchColumn();
            $stmt = $pdo->prepare('SELECT id, username, linuxdo_id, linuxdo_username, linuxdo_name, linuxdo_trust_level, linuxdo_active, linuxdo_silenced, credit_balance, created_at FROM users WHERE ' . $where . ' ORDER BY id DESC LIMIT ? OFFSET ?');
            $i = 1;
            foreach ($params as $param) {
                $stmt->bindValue($i++, $param);
            }
            $stmt->bindValue($i++, $pageSize, PDO::PARAM_INT);
            $stmt->bindValue($i++, $offset, PDO::PARAM_INT);
            $stmt->execute();
            jsonResponse(1, 'ok', [
                'list' => $stmt->fetchAll(PDO::FETCH_ASSOC),
                'total' => $total,
                'page' => $page,
                'page_size' => $pageSize,
                'total_pages' => $pageSize > 0 ? (int)ceil($total / $pageSize) : 0,
            ]);
            break;

        case 'rules':
            checkAdmin($pdo);
            if (!commerceTableExists($pdo, 'linuxdo_user_access_rules')) {
                jsonResponse(1, 'ok', []);
            }
            $stmt = $pdo->query('SELECT r.*, p.name AS product_name, u.username FROM linuxdo_user_access_rules r LEFT JOIN products p ON r.product_id = p.id LEFT JOIN users u ON r.user_id = u.id ORDER BY r.id DESC');
            jsonResponse(1, 'ok', $stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'save_rule':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', 0), 0) ?? 0;
            $ruleType = normalizeString(requestValue('rule_type', 'whitelist'), 20);
            $productId = validateInt(requestValue('product_id', 0), 0) ?? 0;
            $linuxdoId = validateInt(requestValue('linuxdo_id', 0), 0) ?? 0;
            $userId = validateInt(requestValue('user_id', 0), 0) ?? 0;
            $reason = normalizeString(requestValue('reason', ''), 255);
            $status = validateInt(requestValue('status', 1), 0, 1) ?? 1;
            if (!in_array($ruleType, ['whitelist', 'blacklist'], true)) {
                jsonResponse(0, '规则类型无效');
            }
            if ($linuxdoId <= 0 && $userId <= 0) {
                jsonResponse(0, '至少填写 user_id 或 linuxdo_id');
            }
            if ($id > 0) {
                $stmt = $pdo->prepare('UPDATE linuxdo_user_access_rules SET product_id=?, user_id=?, linuxdo_id=?, rule_type=?, reason=?, status=?, updated_at=NOW() WHERE id=?');
                $stmt->execute([$productId ?: null, $userId ?: null, $linuxdoId ?: null, $ruleType, $reason ?: null, $status, $id]);
                logAudit($pdo, 'community.rule_update', ['rule_type' => $ruleType], (string)$id);
                jsonResponse(1, '规则已更新');
            }
            $stmt = $pdo->prepare('INSERT INTO linuxdo_user_access_rules (product_id, user_id, linuxdo_id, rule_type, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())');
            $stmt->execute([$productId ?: null, $userId ?: null, $linuxdoId ?: null, $ruleType, $reason ?: null, $status]);
            $newId = (int)$pdo->lastInsertId();
            logAudit($pdo, 'community.rule_create', ['rule_type' => $ruleType], (string)$newId);
            jsonResponse(1, '规则已创建', ['id' => $newId]);
            break;

        case 'delete_rule':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '规则ID无效');
            }
            $pdo->prepare('DELETE FROM linuxdo_user_access_rules WHERE id = ?')->execute([$id]);
            logAudit($pdo, 'community.rule_delete', [], (string)$id);
            jsonResponse(1, '规则已删除');
            break;

        case 'discounts':
            checkAdmin($pdo);
            if (!commerceTableExists($pdo, 'trust_level_discounts')) {
                jsonResponse(1, 'ok', []);
            }
            $stmt = $pdo->query('SELECT d.*, p.name AS product_name FROM trust_level_discounts d LEFT JOIN products p ON d.product_id = p.id ORDER BY d.product_id DESC, d.trust_level ASC, d.id DESC');
            jsonResponse(1, 'ok', $stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'save_discount':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', 0), 0) ?? 0;
            $productId = validateInt(requestValue('product_id', 0), 0) ?? 0;
            $trustLevel = validateInt(requestValue('trust_level', null), 0, 4);
            $discountType = normalizeString(requestValue('discount_type', 'percent'), 20);
            $discountValue = validateFloat(requestValue('discount_value', null), 0);
            $status = validateInt(requestValue('status', 1), 0, 1) ?? 1;
            if ($trustLevel === null || $discountValue === null) {
                jsonResponse(0, '参数无效');
            }
            if (!in_array($discountType, ['percent', 'fixed'], true)) {
                jsonResponse(0, '折扣类型无效');
            }
            if ($id > 0) {
                $stmt = $pdo->prepare('UPDATE trust_level_discounts SET product_id=?, trust_level=?, discount_type=?, discount_value=?, status=?, updated_at=NOW() WHERE id=?');
                $stmt->execute([$productId ?: null, $trustLevel, $discountType, round($discountValue, 2), $status, $id]);
                logAudit($pdo, 'community.discount_update', ['trust_level' => $trustLevel], (string)$id);
                jsonResponse(1, '折扣规则已更新');
            }
            $stmt = $pdo->prepare('INSERT INTO trust_level_discounts (product_id, trust_level, discount_type, discount_value, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())');
            $stmt->execute([$productId ?: null, $trustLevel, $discountType, round($discountValue, 2), $status]);
            $newId = (int)$pdo->lastInsertId();
            logAudit($pdo, 'community.discount_create', ['trust_level' => $trustLevel], (string)$newId);
            jsonResponse(1, '折扣规则已创建', ['id' => $newId]);
            break;

        case 'delete_discount':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '折扣规则ID无效');
            }
            $pdo->prepare('DELETE FROM trust_level_discounts WHERE id = ?')->execute([$id]);
            logAudit($pdo, 'community.discount_delete', [], (string)$id);
            jsonResponse(1, '折扣规则已删除');
            break;

        case 'save_settings':
            checkAdmin($pdo);
            $mode = normalizeString(requestValue('linuxdo_silenced_order_mode', 'review'), 20);
            if (!in_array($mode, ['review', 'block'], true)) {
                $mode = 'review';
            }
            commerceSetSetting($pdo, 'linuxdo_silenced_order_mode', $mode);
            logAudit($pdo, 'community.settings_save', ['linuxdo_silenced_order_mode' => $mode]);
            jsonResponse(1, '社区规则设置已保存');
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.community', $e->getMessage());
    jsonResponse(0, '服务器错误');
}
