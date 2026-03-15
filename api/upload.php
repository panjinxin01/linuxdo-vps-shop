<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';

$action = requestValue('action', '');
$pdo = getDB();

define('UPLOAD_DIR', __DIR__ . '/../uploads');
define('MAX_FILE_SIZE', 5 * 1024 * 1024);
define('ALLOWED_TYPES', ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'text/plain', 'application/pdf']);
define('ALLOWED_EXTENSIONS', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'txt', 'log', 'pdf']);

function ensureUploadDir(): bool {
    if (!is_dir(UPLOAD_DIR)) {
        if (!mkdir(UPLOAD_DIR, 0755, true)) {
            return false;
        }
    }
    $htaccess = UPLOAD_DIR . '/.htaccess';
    if (!file_exists($htaccess)) {
        @file_put_contents($htaccess, "Options -Indexes\n<FilesMatch \"\\.php$\">\n    Order Deny,Allow\n    Deny from all\n</FilesMatch>");
    }
    $index = UPLOAD_DIR . '/index.html';
    if (!file_exists($index)) {
        @file_put_contents($index, '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>403 Forbidden</title></head><body><h1>403 Forbidden</h1></body></html>');
    }
    return true;
}

function tableExists(PDO $pdo, string $table): bool {
    return securityTableExists($pdo, $table);
}

function generateSafeFilename(string $originalName): string {
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    return date('Ymd') . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
}

function validateFile(array $file): array {
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $errors = [
            UPLOAD_ERR_INI_SIZE => '文件超过服务器限制',
            UPLOAD_ERR_FORM_SIZE => '文件超过表单限制',
            UPLOAD_ERR_PARTIAL => '文件上传不完整',
            UPLOAD_ERR_NO_FILE => '没有上传文件',
            UPLOAD_ERR_NO_TMP_DIR => '临时目录不存在',
            UPLOAD_ERR_CANT_WRITE => '无法写入文件'
        ];
        return ['ok' => false, 'msg' => $errors[$file['error']] ?? '上传错误'];
    }

    if ($file['size'] > MAX_FILE_SIZE) {
        return ['ok' => false, 'msg' => '文件大小不能超过5MB'];
    }

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ALLOWED_EXTENSIONS, true)) {
        return ['ok' => false, 'msg' => '不支持的文件类型'];
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mimeType, ALLOWED_TYPES, true)) {
        return ['ok' => false, 'msg' => '文件类型不允许'];
    }

    if (strpos($mimeType, 'image/') === 0) {
        $imageInfo = @getimagesize($file['tmp_name']);
        if ($imageInfo === false) {
            return ['ok' => false, 'msg' => '无效的图片文件'];
        }
    }

    return ['ok' => true, 'mime' => $mimeType, 'ext' => $ext];
}

try {
    switch ($action) {
        case 'ticket':
            if (!isset($_SESSION['user_id']) && !isset($_SESSION['admin_id'])) {
                jsonResponse(0, '请先登录');
            }
            requireCsrf();
            if (!tableExists($pdo, 'ticket_attachments')) {
                jsonResponse(0, '功能未启用，请先执行数据库更新');
            }

            $ticketId = validateInt(requestValue('ticket_id', null), 1);
            $replyId = validateInt(requestValue('reply_id', 0), 0) ?? 0;
            if (!$ticketId) {
                jsonResponse(0, '工单ID无效');
            }

            $stmt = $pdo->prepare('SELECT user_id, status FROM tickets WHERE id = ?');
            $stmt->execute([$ticketId]);
            $ticket = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$ticket) {
                jsonResponse(0, '工单不存在');
            }
            $isAdmin = isset($_SESSION['admin_id']);
            $isOwner = isset($_SESSION['user_id']) && (int)$_SESSION['user_id'] === (int)$ticket['user_id'];
            if (!$isAdmin && !$isOwner) {
                jsonResponse(0, '无权操作此工单');
            }
            if ((int)$ticket['status'] === 2 && !$isAdmin) {
                jsonResponse(0, '工单已关闭');
            }

            $stmt = $pdo->prepare('SELECT COUNT(*) FROM ticket_attachments WHERE ticket_id = ?');
            $stmt->execute([$ticketId]);
            if ((int)$stmt->fetchColumn() >= 10) {
                jsonResponse(0, '此工单附件数量已达上限(10个)');
            }

            if (!isset($_FILES['file'])) {
                jsonResponse(0, '请选择文件');
            }
            $validation = validateFile($_FILES['file']);
            if (!$validation['ok']) {
                jsonResponse(0, $validation['msg']);
            }
            if (!ensureUploadDir()) {
                jsonResponse(0, '创建上传目录失败');
            }

            $subDir = UPLOAD_DIR . '/tickets/' . date('Ym');
            if (!is_dir($subDir)) {
                mkdir($subDir, 0755, true);
            }

            $safeName = generateSafeFilename($_FILES['file']['name']);
            $destPath = $subDir . '/' . $safeName;
            $relativePath = 'uploads/tickets/' . date('Ym') . '/' . $safeName;

            if (!move_uploaded_file($_FILES['file']['tmp_name'], $destPath)) {
                jsonResponse(0, '保存文件失败');
            }

            $uploaderType = $isAdmin ? 'admin' : 'user';
            $uploaderId = $isAdmin ? (int)$_SESSION['admin_id'] : (int)$_SESSION['user_id'];
            $stmt = $pdo->prepare('INSERT INTO ticket_attachments (ticket_id, reply_id, uploader_type, uploader_id, original_name, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $ticketId,
                $replyId ?: null,
                $uploaderType,
                $uploaderId,
                $_FILES['file']['name'],
                $relativePath,
                $_FILES['file']['size'],
                $validation['mime']
            ]);

            $attachmentId = (int)$pdo->lastInsertId();
            commerceRecordTicketEvent($pdo, $ticketId, 'attachment_upload', '上传了附件：' . $_FILES['file']['name'], ['attachment_id' => $attachmentId], $isAdmin);
            logAudit($pdo, 'attachment.upload', ['ticket_id' => $ticketId, 'name' => $_FILES['file']['name'], 'size' => (int)$_FILES['file']['size']], (string)$attachmentId);
            jsonResponse(1, '上传成功', [
                'id' => $attachmentId,
                'name' => $_FILES['file']['name'],
                'path' => $relativePath,
                'size' => $_FILES['file']['size']
            ]);
            break;

        case 'list':
            if (!isset($_SESSION['user_id']) && !isset($_SESSION['admin_id'])) {
                jsonResponse(0, '请先登录');
            }
            if (!tableExists($pdo, 'ticket_attachments')) {
                jsonResponse(1, '', []);
            }
            $ticketId = validateInt(requestValue('ticket_id', null), 1);
            if (!$ticketId) {
                jsonResponse(0, '工单ID无效');
            }
            $stmt = $pdo->prepare('SELECT user_id FROM tickets WHERE id = ?');
            $stmt->execute([$ticketId]);
            $ticket = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$ticket) {
                jsonResponse(0, '工单不存在');
            }
            $isAdmin = isset($_SESSION['admin_id']);
            $isOwner = isset($_SESSION['user_id']) && (int)$_SESSION['user_id'] === (int)$ticket['user_id'];
            if (!$isAdmin && !$isOwner) {
                jsonResponse(0, '无权访问');
            }
            $stmt = $pdo->prepare('SELECT id, reply_id, uploader_type, original_name, file_path, file_size, mime_type, created_at FROM ticket_attachments WHERE ticket_id = ? ORDER BY id ASC');
            $stmt->execute([$ticketId]);
            jsonResponse(1, '', $stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'delete':
            checkAdmin($pdo);
            requireCsrf();
            if (!tableExists($pdo, 'ticket_attachments')) {
                jsonResponse(0, '功能未启用');
            }
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '附件ID无效');
            }
            $stmt = $pdo->prepare('SELECT file_path FROM ticket_attachments WHERE id = ?');
            $stmt->execute([$id]);
            $attachment = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$attachment) {
                jsonResponse(0, '附件不存在');
            }
            $fullPath = realpath(__DIR__ . '/../' . $attachment['file_path']);
            $uploadRoot = realpath(UPLOAD_DIR);
            if ($fullPath && $uploadRoot && strpos($fullPath, $uploadRoot) === 0 && file_exists($fullPath)) {
                @unlink($fullPath);
            }
            $stmt = $pdo->prepare('DELETE FROM ticket_attachments WHERE id = ?');
            $stmt->execute([$id]);
            logAudit($pdo, 'attachment.delete', ['path' => $attachment['file_path']], (string)$id);
            jsonResponse(1, '删除成功');
            break;

        case 'download':
            if (!isset($_SESSION['user_id']) && !isset($_SESSION['admin_id'])) {
                header('HTTP/1.1 401 Unauthorized');
                exit('请先登录');
            }
            if (!tableExists($pdo, 'ticket_attachments')) {
                header('HTTP/1.1 404 Not Found');
                exit('功能未启用');
            }
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                header('HTTP/1.1 400 Bad Request');
                exit('参数错误');
            }
            $stmt = $pdo->prepare('SELECT ta.*, t.user_id FROM ticket_attachments ta JOIN tickets t ON ta.ticket_id = t.id WHERE ta.id = ?');
            $stmt->execute([$id]);
            $attachment = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$attachment) {
                header('HTTP/1.1 404 Not Found');
                exit('附件不存在');
            }
            $isAdmin = isset($_SESSION['admin_id']);
            $isOwner = isset($_SESSION['user_id']) && (int)$_SESSION['user_id'] === (int)$attachment['user_id'];
            if (!$isAdmin && !$isOwner) {
                header('HTTP/1.1 403 Forbidden');
                exit('无权访问');
            }
            $fullPath = realpath(__DIR__ . '/../' . $attachment['file_path']);
            $uploadRoot = realpath(UPLOAD_DIR);
            if (!$fullPath || !$uploadRoot || strpos($fullPath, $uploadRoot) !== 0 || !file_exists($fullPath)) {
                header('HTTP/1.1 404 Not Found');
                exit('文件不存在');
            }
            $mimeType = $attachment['mime_type'] ?: 'application/octet-stream';
            $isImage = strpos($mimeType, 'image/') === 0;
            $disposition = $isImage ? 'inline' : 'attachment';
            $filename = $attachment['original_name'] ?: 'attachment';
            $filenameSafe = str_replace(["\r", "\n", '"'], '', $filename);
            $encodedName = rawurlencode($filenameSafe);
            header('Content-Type: ' . $mimeType);
            header('Content-Disposition: ' . $disposition . '; filename="' . basename($filenameSafe) . '"; filename*=UTF-8\'\'' . $encodedName);
            header('Content-Length: ' . filesize($fullPath));
            header('Cache-Control: no-cache');
            readfile($fullPath);
            exit;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.upload', $e->getMessage());
    jsonResponse(0, '服务器错误');
}
