/* =====================================================
   渲染：状态徽章 / 列表卡片 / 表格行
   来源：js/tickets.js
   ===================================================== */
/* ==================== 5. 纯渲染函数（返回 HTML 字符串） ==================== */

/* 徽章（带状态圆点，色彩不是唯一指示） */
function renderTicketBadge(status) {
  return '<span class="badge ' + ticketStatusKey(status) + '"><span class="bd-dot"></span>' + ticketStatusLabel(status) + "</span>";
}

function renderTicketCard(t) {
  var sc = ticketStatusKey(t.status);
  var cat = ticketCategoryLabel(t.category);
  var pri = ticketPriorityLabel(t.priority);
  var timeText = escapeHtml(t.updated_at || t.created_at || "");
  return (
    '<div class="ticket-item st-' + sc + '" tabindex="0" role="button" aria-label="查看工单：' + escapeHtml(t.title) + '" onclick="showTicketDetail(' + t.id + ')" onkeydown="if(event.key===\'Enter\')showTicketDetail(' + t.id + ')">' +
      '<div class="ticket-header">' +
        '<span class="ticket-title">#' + t.id + " " + escapeHtml(t.title) + "</span>" +
        renderTicketBadge(t.status) +
      "</div>" +
      '<div class="ticket-meta">' +
        '<span title="' + timeText + '">' + ticketIcon("clock", 12) + formatRelativeTime(t.updated_at || t.created_at) + "</span>" +
        '<span>' + ticketIcon("inbox", 12) + escapeHtml(cat) + "</span>" +
        '<span class="tk-priority ' + ticketPriorityKey(t.priority) + '">' + escapeHtml(pri) + "</span>" +
        (t.order_no ? '<span>订单：<code>' + escapeHtml(t.order_no) + "</code></span>" : "") +
      "</div>" +
    "</div>"
  );
}

function renderTicketRow(t, apiBase) {
  var sc = ticketStatusKey(t.status);
  return (
    "<tr>" +
      '<td data-label="编号"><span class="tk-cell-id">#' + t.id + "</span></td>" +
      '<td class="tk-admin-col-title"><span class="tk-admin-row-title">' + escapeHtml(t.title) + "</span>" +
        '<div class="tk-admin-row-sub">' +
          '<span class="tk-priority ' + ticketPriorityKey(t.priority) + '">' + escapeHtml(ticketPriorityLabel(t.priority)) + "</span>" +
          '<span>' + escapeHtml(ticketCategoryLabel(t.category)) + "</span>" +
        "</div></td>" +
      '<td data-label="用户">' + escapeHtml(t.username || "-") + "</td>" +
      '<td data-label="关联订单">' + (t.order_no ? '<code class="tk-order-code">' + escapeHtml(t.order_no) + "</code>" : "-") + "</td>" +
      '<td data-label="状态">' + renderTicketBadge(t.status) + "</td>" +
      '<td data-label="更新时间" style="color:var(--text-muted);font-size:12px">' + escapeHtml(t.updated_at || "") + "</td>" +
      '<td data-label="操作"><button class="action-btn edit" onclick="showAdminTicketDetail(' + t.id + ')">查看</button></td>' +
    "</tr>"
  );
}

