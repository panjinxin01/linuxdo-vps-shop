<?php
/**
 * LDC Pay 平台接口（依据《LD支付文档》实现）
 *
 * 提供文档中此前缺失的公共接口能力：
 *   - action=query          订单查询   (文档 3.1: GET /epay/api.php)
 *   - action=distribute     商户分发   (文档 3.4: POST /lpay/distribute, Basic Auth)
 *   - action=balance_stats  平台用户余额统计 (文档 3.5: GET /api/v1/dashboard/stats/user-balance)
 *
 * 全部为管理员专用操作，均记录审计日志。
 */

require_once __DIR__ . '/../includes/security.php';
startSecureSession();
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/commerce.php';
require_once __DIR__ . '/../includes/ldcpay.php';

$pdo = getDB();
$action = requestValue('action', '');
checkAdmin($pdo);

// 管理员写操作需要 CSRF 校验
if ($action === 'distribute') {
    requireCsrf();
}

try {
    switch ($action) {
        case 'query':
            handleLdcPayQuery($pdo);
            break;

        case 'distribute':
            handleLdcPayDistribute($pdo);
            break;

        case 'balance_stats':
            handleLdcPayBalanceStats($pdo);
            break;

        default:
            jsonResponse(0, '未知操作');
    }
} catch (Throwable $e) {
    logError($pdo, 'api.ldcpay', $e->getMessage(), ['action' => $action]);
    jsonResponse(0, '服务器错误');
}

/**
 * 订单查询（文档 3.1）
 * GET: out_trade_no 必填
 */
function handleLdcPayQuery(PDO $pdo): void {
    $outTradeNo = normalizeString(requestValue('out_trade_no', ''), 100);
    if ($outTradeNo === '') {
        jsonResponse(0, '业务单号不能为空');
    }

    $result = epay_query_order($pdo, $outTradeNo);

    // 文档 3.1: status 1=成功，0=失败/处理中；不存在返回 code=-1
    if ((int)($result['code'] ?? 0) === 1) {
        logAudit($pdo, 'ldcpay.query_order', [
            'out_trade_no' => $outTradeNo,
            'trade_no' => (string)($result['trade_no'] ?? ''),
            'status' => (int)($result['status'] ?? 0),
        ]);
        jsonResponse(1, (string)($result['msg'] ?? '查询成功'), $result);
    }
    jsonResponse(0, (string)($result['msg'] ?? '查询失败'), $result);
}

/**
 * 商户分发（文档 3.4）
 * POST: user_id + username + amount 必填；out_trade_no / remark 可选
 * 成功响应映射: {code:1, data:{trade_no, out_trade_no}}
 */
function handleLdcPayDistribute(PDO $pdo): void {
    $userId = (int)(validateInt(requestValue('user_id', 0), 1, PHP_INT_MAX) ?? 0);
    $username = normalizeString(requestValue('username', ''), 100);
    $amount = round((float)requestValue('amount', 0), 2);
    $outTradeNo = normalizeString(requestValue('out_trade_no', ''), 80);
    $remark = normalizeString(requestValue('remark', ''), 255);

    if ($userId <= 0 || $username === '') {
        jsonResponse(0, '请提供收款人用户 ID 和用户名');
    }
    if ($amount <= 0) {
        jsonResponse(0, '分发积分数量必须大于 0');
    }

    // 商户自定义单号缺省时自动生成
    if ($outTradeNo === '') {
        try {
            $outTradeNo = 'DIST' . date('YmdHis') . strtoupper(bin2hex(random_bytes(3)));
        } catch (Throwable $e) {
            $outTradeNo = 'DIST' . date('YmdHis') . strtoupper(substr(md5(uniqid('', true)), 0, 6));
        }
    }

    $result = epay_distribute($pdo, $userId, $username, $amount, $outTradeNo, $remark);

    if ((int)($result['code'] ?? 0) === 1) {
        // 同步站内余额流水记录（分发即给站内用户加余额）
        try {
            $balanceResult = commerceAdjustBalance($pdo, $userId, 'distribute', $amount, [
                'related_order_no' => (string)($result['data']['trade_no'] ?? $outTradeNo),
                'remark' => $remark !== '' ? ('平台积分分发：' . $remark) : '平台积分分发',
                'operator_admin_id' => !empty($_SESSION['admin_id']) ? (int)$_SESSION['admin_id'] : null,
                'notify' => true,
                'notify_type' => 'balance_distribute',
                'notify_title' => '积分分发到账',
                'notify_content' => '平台向您分发了 ' . number_format($amount, 2) . ' 积分，请注意查收。',
            ]);
            $result['local_balance'] = $balanceResult;
        } catch (Throwable $e) {
            // 平台侧已分发成功但本地记账失败时，明确提示人工核对
            logError($pdo, 'ldcpay.distribute.local_balance', $e->getMessage(), ['user_id' => $userId]);
            $result['local_balance_warning'] = '平台分发成功，但站内余额记账失败，请人工核对余额流水';
        }

        logAudit($pdo, 'ldcpay.distribute', [
            'user_id' => $userId,
            'username' => $username,
            'amount' => $amount,
            'out_trade_no' => $outTradeNo,
            'trade_no' => (string)($result['data']['trade_no'] ?? ''),
        ]);
        jsonResponse(1, '分发成功', $result);
    }
    jsonResponse(0, (string)($result['msg'] ?? '分发失败'), $result);
}

/**
 * 平台用户余额统计（文档 3.5）
 * GET — 无需平台鉴权（公开接口），结果有缓存
 */
function handleLdcPayBalanceStats(PDO $pdo): void {
    $result = epay_user_balance_stats();
    if (($result['error_msg'] ?? '') === '' && isset($result['data'])) {
        jsonResponse(1, '', $result['data']);
    }
    jsonResponse(0, (string)($result['error_msg'] ?? '获取失败'));
}