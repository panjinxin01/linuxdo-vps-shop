/* =====================================================
   查看工单页（v20260825 页面化）：消息卡片 / 页面渲染
   来源：js/tickets.js
   ===================================================== */
/* =====================================================
   10. 页面化视图共享渲染器（v20260825）
   ===================================================== */

/* 补充图标（仅新增键，不影响既有） */
TICKET_ICONS.code =
  '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>';
TICKET_ICONS.list =
  '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>';
TICKET_ICONS.link =
  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>';

/* 页面路由查询参数（由 ui.js switchPage 写入） */
if (!window.__ROUTE_QUERY__) window.__ROUTE_QUERY__ = {};

TicketState.pendingNewImages = [];

/* 时间显示：YYYY-MM-DD HH:MM */
function tkFmtTime(s) {
  var v = String(s || "").replace("T", " ");
  return v.length >= 16 ? v.slice(0, 16) : v;
}

/* ---------- 列表页：表格行（移动端经 CSS 降级为卡片） ---------- */
function renderTicketPageRow(t) {
  var tid = parseInt(t.id, 10);
  var sub =
    '<span class="tk-priority ' + ticketPriorityKey(t.priority) + '">' + escapeHtml(ticketPriorityLabel(t.priority)) + "</span>" +
    "<span>" + escapeHtml(ticketCategoryLabel(t.category)) + "</span>" +
    (t.order_no ? "<span>订单 <code>" + escapeHtml(t.order_no) + "</code></span>" : "");
  return (
    '<tr tabindex="0" role="button" aria-label="查看工单 #' + tid + '" onclick="showTicketDetail(' + tid + ')" onkeydown="if(event.key===\'Enter\')showTicketDetail(' + tid + ')">' +
      '<td data-label="编号"><span class="tk-cell-id">#' + tid + "</span></td>" +
      '<td class="tk-col-title"><span class="tk-cell-title">' + escapeHtml(t.title) + '</span><span class="tk-cell-sub">' + sub + "</span></td>" +
      '<td data-label="提交时间"><span class="tk-cell-time">' + escapeHtml(tkFmtTime(t.created_at)) + "</span></td>" +
      '<td data-label="最后回复"><span class="tk-cell-time">' + escapeHtml(tkFmtTime(t.updated_at)) + "</span></td>" +
      '<td data-label="状态">' + renderTicketBadge(t.status) + "</td>" +
      '<td data-label="操作"><button type="button" class="tk-view-btn" onclick="event.stopPropagation();showTicketDetail(' + tid + ')">' + ticketIcon("chat", 13) + "查看</button></td>" +
    "</tr>"
  );
}

function renderTicketPageTable(list) {
  var rows = "";
  for (var i = 0; i < list.length; i++) rows += renderTicketPageRow(list[i]);
  return (
    '<div class="tk-page-table-wrap">' +
      '<table class="tk-page-table">' +
        "<thead><tr>" +
          '<th style="width:64px">编号</th><th>标题</th>' +
          '<th style="width:140px">提交时间</th><th style="width:140px">最后回复</th>' +
          '<th style="width:92px">状态</th><th style="width:82px">操作</th>' +
        "</tr></thead>" +
        "<tbody>" + rows + "</tbody>" +
      "</table>" +
    "</div>"
  );
}

/* ---------- 消息卡片流（查看工单页主体，替代 IM 气泡） ---------- */
function renderMessageCards(replies, isAdminSide) {
  var list = replies || [];
  if (!list.length) return '<div class="ticket-replies-empty">暂无回复记录</div>';
  var html = "";
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    var isStaff = !r.user_id;
    var author = isStaff
      ? (isAdminSide ? escapeHtml(r.admin_name || "客服 / 管理员") : "客服")
      : escapeHtml(r.username || "用户");
    html +=
      '<article class="tk-msg-card ' + (isStaff ? "is-admin" : "is-user") + '">' +
        '<div class="tk-msg-card-head">' +
          '<span class="tk-msg-card-avatar" aria-hidden="true">' + tkAvatarSvg(isStaff) + "</span>" +
          '<span class="tk-msg-card-name">' + author + "</span>" +
          '<span class="tk-msg-card-role">' + (isStaff ? "客服" : "用户") + "</span>" +
          '<time class="tk-msg-card-time" title="' + escapeHtml(r.created_at || "") + '">' + escapeHtml(tkFmtTime(r.created_at)) + "</time>" +
        "</div>" +
        '<div class="tk-msg-card-body">' + escapeHtml(r.content || "") + "</div>" +
      "</article>";
  }
  return '<div class="tk-msg-cards" id="tk-conversation">' + html + "</div>";
}

/* ---------- 查看工单页组装（前台 / 后台共用） ---------- */
function buildTicketViewPageHtml(t, att, opts) {
  var o = opts || {};
  var adminSide = !!o.isAdminSide;
  var open = parseInt(t.status, 10) !== 2;
  var sendFn = adminSide ? "adminReplyTicket" : "replyTicket";
  var closeFn = adminSide ? "adminCloseTicket" : "closeTicket";
  var sendBtnId = adminSide ? "adminReplySendBtn" : "replySendBtn";

  /* 头部：标题 + 元信息 + 右侧操作 */
  var acts = "";
  if (open) {
    acts +=
      '<button type="button" class="btn btn-outline" onclick="' + closeFn + "(" + t.id + ')">' + ticketIcon("close", 14) + "关闭工单</button>";
    if (adminSide && t.category === "refund_request") {
      acts +=
        '<button type="button" class="btn btn-danger" onclick="approveRefundTicket(' + t.id + ')">' + ticketIcon("refresh", 14) + "同意退款</button>";
    }
  }
  var h =
    '<div class="tk-view-header">' +
      '<div class="tk-view-header-info">' +
        '<h2 class="tk-view-title"><span class="tk-cell-id">#' + t.id + "</span>" + escapeHtml(t.title || "") + "</h2>" +
        '<div class="tk-view-meta">' +
          renderTicketBadge(t.status) +
          '<span class="badge off"><span class="bd-dot"></span>' + escapeHtml(ticketCategoryLabel(t.category)) + "</span>" +
          '<span class="tk-priority ' + ticketPriorityKey(t.priority) + '">' + escapeHtml(ticketPriorityLabel(t.priority)) + "</span>" +
          (t.order_no
            ? '<span style="font-size:12px;color:var(--text-muted)">订单 <code style="font-family:var(--font-mono);font-size:12px;color:var(--primary)">' + escapeHtml(t.order_no) + "</code></span>"
            : "") +
          (adminSide && t.username
            ? '<span class="badge off"><span class="bd-dot"></span>用户：' + escapeHtml(t.username) + "</span>"
            : "") +
          '<span style="font-size:12px;color:var(--text-muted)">更新 ' + escapeHtml(tkFmtTime(t.updated_at)) + "</span>" +
        "</div>" +
      "</div>" +
      (acts ? '<div class="tk-page-head-actions">' + acts + "</div>" : "") +
    "</div>";

  /* 已关闭警示条（红色） */
  if (!open) {
    h +=
      '<div class="tk-alert-closed">' + ticketIcon("alert", 16) +
        "<div><strong>此工单已关闭。</strong>关闭后无法继续回复；如仍有问题，请返回列表发起新工单。</div>" +
      "</div>";
  }

  /* 后台退款审批卡（退款类工单） */
  if (adminSide && t.category === "refund_request") {
    h += '<hr class="ticket-detail-section-divider">' + renderAdminRefundCard(t);
  }

  /* 消息卡片流 + 时间线 + 附件 */
  h += renderMessageCards(t.replies, adminSide);
  var tl = renderTicketTimeline(t.events || []);
  if (tl) h += tl;
  var at = renderTicketAttachments(att || [], TicketApi._base);
  if (at) h += at;

  /* 底部回复区（未关闭时） */
  if (open) {
    h += renderReplyComposer({
      ticketId: t.id,
      textareaId: adminSide ? "adminReplyContent" : "replyContent",
      fileId: adminSide ? "adminTicketFile" : "ticketFile",
      templates: adminSide ? (o.templates || null) : null
    });
    h +=
      '<div class="tk-page-head-actions" style="justify-content:flex-end;margin-top:12px">' +
        '<button type="button" class="btn btn-primary btn-send" id="' + sendBtnId + '" onclick="' + sendFn + "(" + t.id + ')">' + ticketIcon("send", 14) + "发送回复</button>" +
      "</div>";
  }
  return h;
}

