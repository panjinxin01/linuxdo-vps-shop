<?php
/**
 * 工单 API · 瘦路由入口（v20260823 重构）
 * ---------------------------------------------------------
 * 仅负责：会话启动 / 依赖加载 / CSRF 白名单 / 分发到
 * TicketService / 全局异常兜底。
 * 业务逻辑全部位于 includes/TicketService.php。
 * 所有响应 JSON 结构（code/msg/data）与重构前完全一致。
 */

require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';
require_once __DIR__ . '/../includes/TicketService.php';

$action = requestValue('action', '');
$pdo = getDB();

$csrfActions = ['create', 'create_refund_request', 'reply', 'close', 'assign', 'approve_refund'];
if (in_array($action, $csrfActions, true)) {
    requireCsrf();
}

try {
    switch ($action) {
        case 'create':                TicketService::create($pdo); break;
        case 'create_refund_request': TicketService::createRefundRequest($pdo); break;
        case 'my':                    TicketService::listMine($pdo); break;
        case 'detail':                TicketService::detail($pdo); break;
        case 'reply':                 TicketService::reply($pdo); break;
        case 'close':                 TicketService::close($pdo); break;
        case 'all':                   TicketService::listAll($pdo); break;
        case 'stats':                 TicketService::stats($pdo); break;
        case 'admin_list':            TicketService::adminList($pdo); break;
        case 'assign':                TicketService::assign($pdo); break;
        case 'approve_refund':        TicketService::approveRefund($pdo); break;
        case 'templates':             TicketService::templates($pdo); break;
        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.tickets', $e->getMessage());
    jsonResponse(0, '服务器错误');
}