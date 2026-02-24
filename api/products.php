<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$action = requestValue('action', 'list');
$pdo = getDB();

$csrfActions = ['add', 'edit', 'delete', 'toggle'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

try {
    switch ($action) {
        case 'list':
            $stmt = $pdo->query('SELECT id, name, cpu, memory, disk, bandwidth, price, status FROM products WHERE status = 1 ORDER BY id DESC');
            jsonResponse(1, '', $stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'all':
            checkAdmin($pdo);
            $stmt = $pdo->query('SELECT * FROM products ORDER BY id DESC');
            $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($products as &$product) {
                if (isset($product['ssh_password'])) {
                    $product['ssh_password'] = decryptSensitive($product['ssh_password']);
                }
            }
            unset($product);
            jsonResponse(1, '', $products);
            break;

        case 'add':
            checkAdmin($pdo);
            $name = normalizeString(requestValue('name', ''), 100);
            $price = validateFloat(requestValue('price', 0), 0.01);
            $ip = normalizeString(requestValue('ip_address', ''), 50);
            $password = normalizeString(requestValue('ssh_password', ''), 255);

            if ($name === '' || $price === null || $ip === '' || $password === '') {
                jsonResponse(0, '名称、价格、IP、密码必填');
            }

            $encryptedPassword = encryptSensitive($password);
            $stmt = $pdo->prepare('INSERT INTO products (name, cpu, memory, disk, bandwidth, price, ip_address, ssh_port, ssh_user, ssh_password, extra_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $name,
                normalizeString(requestValue('cpu', ''), 50),
                normalizeString(requestValue('memory', ''), 50),
                normalizeString(requestValue('disk', ''), 50),
                normalizeString(requestValue('bandwidth', ''), 50),
                round($price, 2),
                $ip,
                validateInt(requestValue('ssh_port', 22), 1, 65535) ?? 22,
                normalizeString(requestValue('ssh_user', 'root'), 50),
                $encryptedPassword,
                normalizeString(requestValue('extra_info', ''), 5000)
            ]);
            logAudit($pdo, 'product.add', ['name' => $name, 'price' => $price], (string)$pdo->lastInsertId());
            jsonResponse(1, '添加成功');
            break;

        case 'edit':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '无效ID');
            }

            $name = normalizeString(requestValue('name', ''), 100);
            $price = validateFloat(requestValue('price', 0), 0.01);
            $ip = normalizeString(requestValue('ip_address', ''), 50);
            $password = normalizeString(requestValue('ssh_password', ''), 255);
            if ($name === '' || $price === null || $ip === '' || $password === '') {
                jsonResponse(0, '名称、价格、IP、密码必填');
            }

            $encryptedPassword = encryptSensitive($password);
            $stmt = $pdo->prepare('UPDATE products SET name=?, cpu=?, memory=?, disk=?, bandwidth=?, price=?, ip_address=?, ssh_port=?, ssh_user=?, ssh_password=?, extra_info=? WHERE id=?');
            $stmt->execute([
                $name,
                normalizeString(requestValue('cpu', ''), 50),
                normalizeString(requestValue('memory', ''), 50),
                normalizeString(requestValue('disk', ''), 50),
                normalizeString(requestValue('bandwidth', ''), 50),
                round($price, 2),
                $ip,
                validateInt(requestValue('ssh_port', 22), 1, 65535) ?? 22,
                normalizeString(requestValue('ssh_user', 'root'), 50),
                $encryptedPassword,
                normalizeString(requestValue('extra_info', ''), 5000),
                $id
            ]);
            logAudit($pdo, 'product.edit', ['name' => $name, 'price' => $price], (string)$id);
            jsonResponse(1, '修改成功');
            break;

        case 'delete':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '无效ID');
            }
            $pdo->prepare('DELETE FROM products WHERE id = ?')->execute([$id]);
            logAudit($pdo, 'product.delete', [], (string)$id);
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

