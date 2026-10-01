<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';

$action = requestValue('action', 'list');
$pdo = getDB();

$csrfActions = ['create', 'update', 'delete', 'create_from_product'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function tplData(): array {
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
        'extra_info' => normalizeString(requestValue('extra_info', ''), 5000),
        'status' => validateInt(requestValue('status', 1), 0, 1) ?? 1,
        'sort_order' => validateInt(requestValue('sort_order', 0), 0, 999999) ?? 0,
    ];
}

try {
    match ($action) {
        'list'                => handleTplList($pdo),
        'create'              => handleTplCreate($pdo),
        'update'              => handleTplUpdate($pdo),
        'delete'              => handleTplDelete($pdo),
        'create_from_product' => handleTplCreateFromProduct($pdo),
        default               => jsonResponse(0, '未知操作'),
    };
} catch (Throwable $e) {
    logError($pdo, 'api.templates', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

function handleTplList(PDO $pdo): void {
    if (!commerceTableExists($pdo, 'product_templates')) {
        jsonResponse(1, 'ok', []);
    }
    $onlyActive = requestValue('only_active', '0') === '1';
    $sql = 'SELECT * FROM product_templates';
    if ($onlyActive) {
        $sql .= ' WHERE status = 1';
    }
    $sql .= ' ORDER BY sort_order ASC, id DESC';
    $list = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    jsonResponse(1, 'ok', $list);
}

function handleTplCreate(PDO $pdo): void {
    checkAdmin($pdo);
    if (!commerceTableExists($pdo, 'product_templates')) {
        jsonResponse(0, '数据库未升级，请先执行数据库更新');
    }
    $data = tplData();
    if ($data['name'] === '') {
        jsonResponse(0, '模板名称不能为空');
    }
    $stmt = $pdo->prepare('INSERT INTO product_templates (name, cpu, memory, disk, bandwidth, region, line_type, os_type, description, extra_info, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())');
    $stmt->execute([$data['name'], $data['cpu'], $data['memory'], $data['disk'], $data['bandwidth'], $data['region'], $data['line_type'], $data['os_type'], $data['description'], $data['extra_info'], $data['status'], $data['sort_order']]);
    $id = (int)$pdo->lastInsertId();
    logAudit($pdo, 'template.create', ['name' => $data['name']], (string)$id);
    jsonResponse(1, '模板创建成功', ['id' => $id]);
}

function handleTplUpdate(PDO $pdo): void {
    checkAdmin($pdo);
    if (!commerceTableExists($pdo, 'product_templates')) {
        jsonResponse(0, '数据库未升级，请先执行数据库更新');
    }
    $id = validateInt(requestValue('id', null), 1);
    if (!$id) {
        jsonResponse(0, '模板ID无效');
    }
    $data = tplData();
    if ($data['name'] === '') {
        jsonResponse(0, '模板名称不能为空');
    }
    $stmt = $pdo->prepare('UPDATE product_templates SET name=?, cpu=?, memory=?, disk=?, bandwidth=?, region=?, line_type=?, os_type=?, description=?, extra_info=?, status=?, sort_order=?, updated_at=NOW() WHERE id=?');
    $stmt->execute([$data['name'], $data['cpu'], $data['memory'], $data['disk'], $data['bandwidth'], $data['region'], $data['line_type'], $data['os_type'], $data['description'], $data['extra_info'], $data['status'], $data['sort_order'], $id]);
    logAudit($pdo, 'template.update', ['name' => $data['name']], (string)$id);
    jsonResponse(1, '模板更新成功');
}

function handleTplDelete(PDO $pdo): void {
    checkAdmin($pdo);
    if (!commerceTableExists($pdo, 'product_templates')) {
        jsonResponse(0, '数据库未升级，请先执行数据库更新');
    }
    $id = validateInt(requestValue('id', null), 1);
    if (!$id) {
        jsonResponse(0, '模板ID无效');
    }
    if (commerceColumnExists($pdo, 'products', 'template_id')) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM products WHERE template_id = ?');
        $stmt->execute([$id]);
        if ((int)$stmt->fetchColumn() > 0) {
            jsonResponse(0, '仍有商品在使用该模板，请先解除关联');
        }
    }
    $stmt = $pdo->prepare('DELETE FROM product_templates WHERE id = ?');
    $stmt->execute([$id]);
    logAudit($pdo, 'template.delete', [], (string)$id);
    jsonResponse(1, '模板已删除');
}

function handleTplCreateFromProduct(PDO $pdo): void {
    checkAdmin($pdo);
    if (!commerceTableExists($pdo, 'product_templates')) {
        jsonResponse(0, '数据库未升级，请先执行数据库更新');
    }
    $productId = validateInt(requestValue('product_id', null), 1);
    if (!$productId) {
        jsonResponse(0, '商品ID无效');
    }
    $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
    $stmt->execute([$productId]);
    $product = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$product) {
        jsonResponse(0, '商品不存在');
    }
    $stmt = $pdo->prepare('INSERT INTO product_templates (name, cpu, memory, disk, bandwidth, region, line_type, os_type, description, extra_info, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())');
    $stmt->execute([
        $product['name'],
        $product['cpu'] ?? '',
        $product['memory'] ?? '',
        $product['disk'] ?? '',
        $product['bandwidth'] ?? '',
        $product['region'] ?? '',
        $product['line_type'] ?? '',
        $product['os_type'] ?? '',
        $product['description'] ?? '',
        $product['extra_info'] ?? '',
    ]);
    $templateId = (int)$pdo->lastInsertId();
    if (commerceColumnExists($pdo, 'products', 'template_id')) {
        $pdo->prepare('UPDATE products SET template_id = ? WHERE id = ?')->execute([$templateId, $productId]);
    }
    logAudit($pdo, 'template.create_from_product', ['product_id' => $productId], (string)$templateId);
    jsonResponse(1, '已从商品生成模板', ['template_id' => $templateId]);
}
