<?php
require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';

$action = requestValue('action', '');

$csrfActions = ['add', 'edit', 'delete', 'toggle_top', 'toggle_status'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

function hasScheduleFields(PDO $pdo): bool {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `announcements` LIKE 'publish_at'");
        $stmt->execute();
        $cached = (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        $cached = false;
    }
    return $cached;
}

$pdo = getDB();

try {
    switch ($action) {
        case 'list':
            $hasSchedule = hasScheduleFields($pdo);
            if ($hasSchedule) {
                $sql = "SELECT id, title, content, is_top, created_at, publish_at, expires_at
                        FROM announcements
                        WHERE status = 1
                        AND (publish_at IS NULL OR publish_at <= NOW())
                        AND (expires_at IS NULL OR expires_at > NOW())
                        ORDER BY is_top DESC, created_at DESC
                        LIMIT 20";
            } else {
                $sql = "SELECT id, title, content, is_top, created_at
                        FROM announcements
                        WHERE status = 1
                        ORDER BY is_top DESC, created_at DESC
                        LIMIT 20";
            }
            $stmt = $pdo->query($sql);
            jsonResponse(1, 'ok', $stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'detail':
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '公告ID无效');
            }
            $hasSchedule = hasScheduleFields($pdo);
            if ($hasSchedule) {
                $stmt = $pdo->prepare('SELECT * FROM announcements WHERE id = ? AND status = 1 AND (publish_at IS NULL OR publish_at <= NOW()) AND (expires_at IS NULL OR expires_at > NOW())');
            } else {
                $stmt = $pdo->prepare('SELECT * FROM announcements WHERE id = ? AND status = 1');
            }
            $stmt->execute([$id]);
            $announcement = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$announcement) {
                jsonResponse(0, '公告不存在');
            }
            jsonResponse(1, 'ok', $announcement);
            break;

        case 'all':
            checkAdmin($pdo);
            $stmt = $pdo->query('SELECT * FROM announcements ORDER BY is_top DESC, created_at DESC');
            jsonResponse(1, 'ok', $stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        case 'add':
            checkAdmin($pdo);
            $title = normalizeString(requestValue('title', ''), 200);
            $content = normalizeString(requestValue('content', ''));
            $isTop = validateInt(requestValue('is_top', 0), 0, 1) ?? 0;
            $status = validateInt(requestValue('status', 1), 0, 1) ?? 1;
            $publishAt = normalizeString(requestValue('publish_at', ''));
            $expiresAt = normalizeString(requestValue('expires_at', ''));

            if ($title === '' || $content === '') {
                jsonResponse(0, '标题和内容不能为空');
            }
            if (mb_strlen($title, 'UTF-8') > 200) {
                jsonResponse(0, '标题不能超过200字');
            }
            if ($publishAt !== '' && !isValidDateTime($publishAt)) {
                jsonResponse(0, 'publish_at 时间格式不正确');
            }
            if ($expiresAt !== '' && !isValidDateTime($expiresAt)) {
                jsonResponse(0, 'expires_at 时间格式不正确');
            }
            if ($publishAt !== '' && $expiresAt !== '' && strtotime($publishAt) > strtotime($expiresAt)) {
                jsonResponse(0, 'publish_at 不能晚于 expires_at');
            }

            if (hasScheduleFields($pdo)) {
                $stmt = $pdo->prepare('INSERT INTO announcements (title, content, is_top, status, publish_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
                $stmt->execute([
                    $title,
                    $content,
                    $isTop ? 1 : 0,
                    $status ? 1 : 0,
                    $publishAt === '' ? null : $publishAt,
                    $expiresAt === '' ? null : $expiresAt
                ]);
            } else {
                $stmt = $pdo->prepare('INSERT INTO announcements (title, content, is_top, status) VALUES (?, ?, ?, ?)');
                $stmt->execute([$title, $content, $isTop ? 1 : 0, $status ? 1 : 0]);
            }
            $newId = (int)$pdo->lastInsertId();
            logAudit($pdo, 'announcement.add', ['title' => $title], (string)$newId);
            jsonResponse(1, '公告发布成功', ['id' => $newId]);
            break;

        case 'edit':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '公告ID无效');
            }
            $title = normalizeString(requestValue('title', ''), 200);
            $content = normalizeString(requestValue('content', ''));
            $isTop = validateInt(requestValue('is_top', 0), 0, 1) ?? 0;
            $status = validateInt(requestValue('status', 1), 0, 1) ?? 1;
            $publishAt = normalizeString(requestValue('publish_at', ''));
            $expiresAt = normalizeString(requestValue('expires_at', ''));

            if ($title === '' || $content === '') {
                jsonResponse(0, '标题和内容不能为空');
            }
            if ($publishAt !== '' && !isValidDateTime($publishAt)) {
                jsonResponse(0, 'publish_at 时间格式不正确');
            }
            if ($expiresAt !== '' && !isValidDateTime($expiresAt)) {
                jsonResponse(0, 'expires_at 时间格式不正确');
            }
            if ($publishAt !== '' && $expiresAt !== '' && strtotime($publishAt) > strtotime($expiresAt)) {
                jsonResponse(0, 'publish_at 不能晚于 expires_at');
            }

            if (hasScheduleFields($pdo)) {
                $stmt = $pdo->prepare('UPDATE announcements SET title = ?, content = ?, is_top = ?, status = ?, publish_at = ?, expires_at = ? WHERE id = ?');
                $stmt->execute([
                    $title,
                    $content,
                    $isTop ? 1 : 0,
                    $status ? 1 : 0,
                    $publishAt === '' ? null : $publishAt,
                    $expiresAt === '' ? null : $expiresAt,
                    $id
                ]);
            } else {
                $stmt = $pdo->prepare('UPDATE announcements SET title = ?, content = ?, is_top = ?, status = ? WHERE id = ?');
                $stmt->execute([$title, $content, $isTop ? 1 : 0, $status ? 1 : 0, $id]);
            }
            logAudit($pdo, 'announcement.edit', ['title' => $title], (string)$id);
            jsonResponse(1, '公告更新成功');
            break;

        case 'delete':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '公告ID无效');
            }
            $stmt = $pdo->prepare('DELETE FROM announcements WHERE id = ?');
            $stmt->execute([$id]);
            logAudit($pdo, 'announcement.delete', [], (string)$id);
            jsonResponse(1, '公告删除成功');
            break;

        case 'toggle_top':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '公告ID无效');
            }
            $stmt = $pdo->prepare('UPDATE announcements SET is_top = 1 - is_top WHERE id = ?');
            $stmt->execute([$id]);
            logAudit($pdo, 'announcement.toggle_top', [], (string)$id);
            jsonResponse(1, '操作成功');
            break;

        case 'toggle_status':
            checkAdmin($pdo);
            $id = validateInt(requestValue('id', null), 1);
            if (!$id) {
                jsonResponse(0, '公告ID无效');
            }
            $stmt = $pdo->prepare('UPDATE announcements SET status = 1 - status WHERE id = ?');
            $stmt->execute([$id]);
            logAudit($pdo, 'announcement.toggle_status', [], (string)$id);
            jsonResponse(1, '操作成功');
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.announcements', $e->getMessage());
    jsonResponse(0, '服务器错误');
}

