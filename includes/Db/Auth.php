<?php
/**
 * 管理员 / 用户登录态校验
 * 来源：includes/db.php（目录结构拆分，内容零改动）
 */

function checkAdmin(?PDO $pdo = null, bool $requireSuper = false): void {
    if (empty($_SESSION['admin_id'])) {
        jsonResponse(0, '请先登录后台');
    }
    if ($pdo instanceof PDO) {
        // admins.role 是后期迁移加入的列。旧库上直接 SELECT role 会抛出"未知列"，
        // 导致连数据库升级脚本本身都无法进入，因此这里按列存在性动态拼装 SQL。
        static $adminsHasRole = null;
        if ($adminsHasRole === null) {
            try {
                $chk = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
                $chk->execute(['admins', 'role']);
                $adminsHasRole = ((int)$chk->fetchColumn() > 0);
            } catch (Throwable $e) {
                $adminsHasRole = false;
            }
        }
        $stmt = $pdo->prepare($adminsHasRole
            ? 'SELECT id, username, role FROM admins WHERE id = ?'
            : 'SELECT id, username FROM admins WHERE id = ?');
        $stmt->execute([(int)$_SESSION['admin_id']]);
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$admin) {
            unset($_SESSION['admin_id'], $_SESSION['admin_name'], $_SESSION['admin_role']);
            jsonResponse(0, '请先登录后台');
        }
        $_SESSION['admin_name'] = $admin['username'];
        $_SESSION['admin_role'] = $admin['role'] ?? 'admin';
    }
    if ($requireSuper && ($_SESSION['admin_role'] ?? '') !== 'super') {
        jsonResponse(0, '无权限');
    }
}

function checkUser(): void {
    if (empty($_SESSION['user_id'])) {
        jsonResponse(0, '请先登录');
    }
}

