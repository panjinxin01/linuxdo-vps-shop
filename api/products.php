<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';

$action = requestValue('action', 'list');
$pdo = getDB();

$csrfActions = ['add', 'edit', 'delete', 'toggle'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function productInput(PDO $pdo): array {
    return [
        'name' => normalizeString(requestValue('name', ''), 100),
        'cpu' => normalizeString(requestValue('cpu', ''), 50),
        'memory' => normalizeString(requestValue('memory', ''), 50),
        'disk' => normalizeString(requestValue('disk', ''), 50),
        'bandwidth' => normalizeString(requestValue('bandwidth', ''), 50),
        'region' => normalizeString(requestValue('region', ''), 100),
        'line_type' => normalizeString(requestValue('line_type', ''), 100),
        'os_type' => normalizeString(requestValue('os_type', ''), 100),
        'description' => normalizeString(requestValue('description', ''), 5000),
        'price' => validateFloat(requestValue('price', null), 0.01),
        'ip_address' => normalizeString(requestValue('ip_address', ''), 50),
        'ssh_port' => validateInt(requestValue('ssh_port', 22), 1, 65535) ?? 22,
        'ssh_user' => normalizeString(requestValue('ssh_user', 'root'), 50),
        'ssh_password' => normalizeString(requestValue('ssh_password', ''), 255),
        'extra_info' => normalizeString(requestValue('extra_info', ''), 5000),
        'template_id' => validateInt(requestValue('template_id', 0), 0) ?? 0,
        'min_trust_level' => validateInt(requestValue('min_trust_level', 0), 0, 4) ?? 0,
        'risk_review_required' => validateInt(requestValue('risk_review_required', 0), 0, 1) ?? 0,
        'allow_whitelist_only' => validateInt(requestValue('allow_whitelist_only', 0), 0, 1) ?? 0,
        'status' => validateInt(requestValue('status', 1), 0, 1) ?? 1,
    ];
}

function productEffectiveRow(PDO $pdo, array $product, ?array $currentUser = null): array {
    $template = commerceGetProductTemplate($pdo, isset($product['template_id']) ? (int)$product['template_id'] : 0);
    $product = commerceApplyTemplateToProduct($product, $template);
    if (!isset($product['template_name']) && $template) {
        $product['template_name'] = $template['name'];
    }
    $basePrice = round((float)($product['price'] ?? 0), 2);
    $product['base_price'] = $basePrice;
    if ($currentUser) {
        $trust = (int)($currentUser['linuxdo_trust_level'] ?? 0);
        $discount = commerceGetTrustDiscount($pdo, (int)$product['id'], $trust, $basePrice);
        $product['trust_discount_amount'] = $discount['discount_amount'];
        $product['trust_discount_label'] = $discount['label'];
        $product['price'] = round(max(0, $basePrice - $discount['discount_amount']), 2);
        $access = commerceCheckProductAccess($pdo, $currentUser, $product);
        $product['can_buy'] = $access['ok'] ? 1 : 0;
        $product['buy_block_reason'] = $access['msg'];
        $product['risk_review'] = !empty($access['risk_review']) ? 1 : 0;
    } else {
        $product['trust_discount_amount'] = 0;
        $product['trust_discount_label'] = '';
        $product['can_buy'] = 1;
        $product['buy_block_reason'] = '';
        $product['risk_review'] = (int)($product['risk_review_required'] ?? 0);
    }
    return $product;
}


function productSelectSql(PDO $pdo, bool $withTemplate = true): string {
    $fields = ['p.*'];
    if ($withTemplate && commerceTableExists($pdo, 'product_templates')) {
        $fields[] = 't.name AS template_name';
        $join = ' LEFT JOIN product_templates t ON p.template_id = t.id';
    } else {
        $join = '';
    }
    $orderBy = commerceColumnExists($pdo, 'products', 'sort_order') ? ' ORDER BY p.sort_order DESC, p.id DESC' : ' ORDER BY p.id DESC';
    return 'SELECT ' . implode(', ', $fields) . ' FROM products p' . $join . $orderBy;
}

try {
    switch ($action) {
        case 'list':
            $sql = productSelectSql($pdo, true);
            $sql = preg_replace('/ ORDER BY .*$/', ' WHERE p.status = 1' . (commerceColumnExists($pdo, 'products', 'sort_order') ? ' ORDER BY p.sort_order DESC, p.id DESC' : ' ORDER BY p.id DESC'), $sql);
            $stmt = $pdo->query($sql);
            $list = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $currentUser = null;
            if (!empty($_SESSION['user_id'])) {
                $currentUser = commerceGetUserById($pdo, (int)$_SESSION['user_id']);
            }
            $list = array_map(static function (array $row) use ($pdo, $currentUser) {
                unset($row['ssh_password'], $row['ip_address'], $row['ssh_user']);
                return productEffectiveRow($pdo, $row, $currentUser);
            }, $list);
            jsonResponse(1, '', $list);
            break;

        case 'all':
            checkAdmin($pdo);
            $stmt = $pdo->query(productSelectSql($pdo, true));
            $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($products as &$product) {
                if (isset($product['ssh_password'])) {
                    $product['ssh_password'] = decryptSensitive($product['ssh_password']);
                }
                $product = productEffectiveRow($pdo, $product, null);
            }
            unset($product);
            jsonResponse(1, '', $products);
            break;

        case 'add':
            checkAdmin($pdo);
            $data = productInput($pdo);
            if ($data['name'] === '' || $data['price'] === null || $data['ip_address'] === '' || $data['ssh_password'] === '') {
                jsonResponse(0, '名称、价格、IP、密码必填');
            }
            $encryptedPassword = encryptSensitive($data['ssh_password']);
            $stmt = $pdo->prepare('INSERT INTO products (name, cpu, memory, disk, bandwidth, region, line_type, os_type, description, price, ip_address, ssh_port, ssh_user, ssh_password, extra_info, template_id, min_trust_level, risk_review_required, allow_whitelist_only, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
            $stmt->execute([
                $data['name'], $data['cpu'], $data['memory'], $data['disk'], $data['bandwidth'],
                $data['region'], $data['line_type'], $data['os_type'], $data['description'], round($data['price'], 2),
                $data['ip_address'], $data['ssh_port'], $data['ssh_user'], $encryptedPassword, $data['extra_info'],
                $data['template_id'] ?: null, $data['min_trust_level'], $data['risk_review_required'], $data['allow_whitelist_only'], $data['status']
            ]);
            $id = (int)$pdo->lastInsertId();
            logAudit($pdo, 'product.add', ['name' => $data['name'], 'price' => $data['price'], 'template_id' => $data['template_id']], (string)$id);
            jsonResponse(1, '添加成功', ['id' => $id]);
            break;

        case 'edit':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '无效ID');
            }
            $data = productInput($pdo);
            if ($data['name'] === '' || $data['price'] === null || $data['ip_address'] === '' || $data['ssh_password'] === '') {
                jsonResponse(0, '名称、价格、IP、密码必填');
            }
            $encryptedPassword = encryptSensitive($data['ssh_password']);
            $stmt = $pdo->prepare('UPDATE products SET name=?, cpu=?, memory=?, disk=?, bandwidth=?, region=?, line_type=?, os_type=?, description=?, price=?, ip_address=?, ssh_port=?, ssh_user=?, ssh_password=?, extra_info=?, template_id=?, min_trust_level=?, risk_review_required=?, allow_whitelist_only=?, status=? WHERE id=?');
            $stmt->execute([
                $data['name'], $data['cpu'], $data['memory'], $data['disk'], $data['bandwidth'],
                $data['region'], $data['line_type'], $data['os_type'], $data['description'], round($data['price'], 2),
                $data['ip_address'], $data['ssh_port'], $data['ssh_user'], $encryptedPassword, $data['extra_info'],
                $data['template_id'] ?: null, $data['min_trust_level'], $data['risk_review_required'], $data['allow_whitelist_only'], $data['status'], $id
            ]);
            logAudit($pdo, 'product.edit', ['name' => $data['name'], 'price' => $data['price'], 'template_id' => $data['template_id']], (string)$id);
            jsonResponse(1, '修改成功');
            break;

        case 'delete':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '无效ID');
            }
            $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
            $stmt->execute([$id]);
            $product = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$product) {
                jsonResponse(0, '商品不存在');
            }
            $snapshotMap = [
                'product_name_snapshot' => $product['name'] ?? null,
                'cpu_snapshot' => $product['cpu'] ?? null,
                'memory_snapshot' => $product['memory'] ?? null,
                'disk_snapshot' => $product['disk'] ?? null,
                'bandwidth_snapshot' => $product['bandwidth'] ?? null,
                'region_snapshot' => $product['region'] ?? null,
                'line_type_snapshot' => $product['line_type'] ?? null,
                'os_type_snapshot' => $product['os_type'] ?? null,
                'description_snapshot' => $product['description'] ?? null,
                'extra_info_snapshot' => $product['extra_info'] ?? null,
                'ip_address_snapshot' => $product['ip_address'] ?? null,
                'ssh_port_snapshot' => $product['ssh_port'] ?? null,
                'ssh_user_snapshot' => $product['ssh_user'] ?? null,
                'ssh_password_snapshot' => $product['ssh_password'] ?? null,
            ];
            $setParts = [];
            $params = [];
            foreach ($snapshotMap as $column => $value) {
                if (commerceColumnExists($pdo, 'orders', $column)) {
                    $setParts[] = "`{$column}` = COALESCE(NULLIF(`{$column}`, ''), ?)";
                    $params[] = $value;
                }
            }
            if ($setParts) {
                $params[] = $id;
                $pdo->prepare('UPDATE orders SET ' . implode(', ', $setParts) . ' WHERE product_id = ?')->execute($params);
            }
            $pdo->prepare('DELETE FROM products WHERE id = ?')->execute([$id]);
            logAudit($pdo, 'product.delete', ['snapshots_preserved' => !empty($setParts)], (string)$id);
            jsonResponse(1, '删除成功');
            break;

        case 'toggle':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            $status = validateInt(requestValue('status', 0), 0, 1);
            if (!$id || $status === null) {
                jsonResponse(0, '无效ID');
            }
            $pdo->prepare('UPDATE products SET status = ? WHERE id = ?')->execute([$status, $id]);
            logAudit($pdo, 'product.toggle', ['status' => $status], (string)$id);
            jsonResponse(1, '状态已更新');
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.products', $e->getMessage());
    jsonResponse(0, '服务器错误');
}
