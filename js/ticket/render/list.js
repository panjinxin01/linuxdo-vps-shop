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
      "<td>#" + t.id + "</td>" +
      '<td><span style="font-weight:600;color:var(--text-main)">' + escapeHtml(t.title) + "</span>" +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<span class="tk-priority ' + ticketPriorityKey(t.priority) + '">' + escapeHtml(ticketPriorityLabel(t.priority)) + "</span>" +
          '<span>' + escapeHtml(ticketCategoryLabel(t.category)) + "</span>" +
        "</div></td>" +
      "<td>" + escapeHtml(t.username || "-") + "</td>" +
      "<td>" + (t.order_no ? '<code style="font-family:var(--font-mono);font-size:12px;color:var(--primary)">' + escapeHtml(t.order_no) + "</code>" : "-") + "</td>" +
      "<td>" + renderTicketBadge(t.status) + "</td>" +
      '<td style="color:var(--text-muted);font-size:12px">' + escapeHtml(t.updated_at || "") + "</td>" +
      '<td><button class="action-btn edit" onclick="showAdminTicketDetail(' + t.id + ')">查看</button></td>' +
    "</tr>"
  );
}

