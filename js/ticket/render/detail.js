/* =====================================================
   渲染：详情头 / 对话流 / 折叠面板 / 时间线 / 附件 / 回复输入框
   来源：js/tickets.js
   ===================================================== */
function renderTicketHeader(t) {
  var oi = t.order_info || null;
  var html =
    '<div class="ticket-detail-header">' +
      '<div class="ticket-detail-status-row">' +
        renderTicketBadge(t.status);
  if (oi) {
    var orderStatusMap = ["待支付", "已支付", "已退款", "已取消"];
    var refunded = String(oi.delivery_status || "") === "refunded";
    html +=
        '<span class="badge ' + (refunded ? "off" : "on") + '"><span class="bd-dot"></span>' +
          escapeHtml(orderStatusMap[parseInt(oi.status || 0)] || "-") + " / " + escapeHtml(oi.delivery_status || "-") +
        "</span>";
  }
  html += "</div>" +
      '<div class="ticket-detail-meta">' +
        '<div class="ticket-detail-meta-item">' + ticketIcon("inbox", 12) + "分类<span>" + escapeHtml(ticketCategoryLabel(t.category)) + "</span></div>" +
        '<div class="ticket-detail-meta-item">' + ticketIcon("bolt", 12) + "优先级<span>" + escapeHtml(ticketPriorityLabel(t.priority)) + "</span></div>" +
        '<div class="ticket-detail-meta-item">' + ticketIcon("clock", 12) + "更新<span>" + escapeHtml(t.updated_at || "-") + "</span></div>" +
        (t.order_no ? '<div class="ticket-detail-meta-item">订单<code>' + escapeHtml(t.order_no) + "</code></div>" : "");
  if (window.__TK_IS_ADMIN__ && t.username) {
    html += '<div class="ticket-detail-meta-item">用户<span>' + escapeHtml(t.username) + "</span></div>";
  }
  html +=
      "</div>" +
    "</div>";
  return html;
}

/* ---------- IM 气泡对话流 ---------- */

function tkAvatarSvg(isStaff) {
  return ticketIcon(isStaff ? "headset" : "user", 16);
}

/**
 * 渲染 IM 聊天气泡列表。
 * 客服消息（无 user_id）：靠右，品牌色气泡 + 渐变头像；
 * 用户消息：靠左，卡片色气泡 + 素色头像。
 */
function renderTicketReplies(replies, isAdminSide) {
  var list = replies || [];
  if (!list.length) {
    return '<div class="ticket-replies-empty">暂无回复记录</div>';
  }
  var html = "";
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    var isStaff = !r.user_id;
    var author = isStaff
      ? (isAdminSide ? escapeHtml(r.admin_name || "客服 / 管理员") : "客服")
      : escapeHtml(r.username || "用户");
    var timeFull = escapeHtml(r.created_at || "");
    html +=
      '<div class="tk-msg ' + (isStaff ? "is-admin" : "is-user") + '">' +
        '<span class="tk-msg-avatar" aria-hidden="true">' + tkAvatarSvg(isStaff) + "</span>" +
        '<div class="tk-msg-main">' +
          '<div class="tk-msg-meta">' +
            '<span class="tk-msg-name">' + author + "</span>" +
            (isStaff ? '<span class="tk-role-tag">客服</span>' : "") +
          "</div>" +
          '<div class="tk-msg-bubble">' + escapeHtml(r.content || "") + "</div>" +
          '<time class="tk-msg-time" title="' + timeFull + '">' + formatRelativeTime(r.created_at) + "</time>" +
        "</div>" +
      "</div>";
  }
  return '<div class="ticket-replies">' + html + "</div>";
}

/* 折叠面板 */
function tkCollapse(id, label, iconKey, count, inner, openByDefault) {
  return (
    '<div class="tk-collapse' + (openByDefault ? " is-open" : "") + '" id="' + id + '">' +
      '<button type="button" class="tk-collapse-head" aria-expanded="' + (openByDefault ? "true" : "false") + '" aria-controls="' + id + '-body" onclick="tkToggleCollapse(\'' + id + "')\">" +
        '<span class="tk-collapse-label">' + ticketIcon(iconKey, 14) + label + "</span>" +
        (count > 0 ? '<span class="tk-collapse-count">' + count + "</span>" : "") +
        '<span class="tk-collapse-chevron">' + ticketIcon("chevron", 15) + "</span>" +
      "</button>" +
      '<div class="tk-collapse-body" id="' + id + '-body"' + (openByDefault ? "" : ' hidden="hidden"') + ">" +
        inner +
      "</div>" +
    "</div>"
  );
}

function tkToggleCollapse(id) {
  var box = document.getElementById(id);
  if (!box) return;
  var open = !box.classList.contains("is-open");
  box.classList.toggle("is-open", open);
  var body = document.getElementById(id + "-body");
  if (body) body.hidden = !open;
  var head = box.querySelector(".tk-collapse-head");
  if (head) head.setAttribute("aria-expanded", open ? "true" : "false");
}

function renderTicketTimeline(events) {
  var list = events || [];
  if (!list.length) return "";
  var inner = "";
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    inner +=
      '<div class="ticket-timeline-item">' +
        '<div class="ticket-timeline-dot"></div>' +
        '<div class="ticket-timeline-content">' +
          "<strong>" + escapeHtml(e.event_type || "event") + "</strong>" +
          (e.content ? "<span>" + escapeHtml(e.content) + "</span>" : "") +
          "<time>" + escapeHtml(e.created_at || "") + "</time>" +
        "</div>" +
      "</div>";
  }
  /* 时间线默认收起，减少视觉噪音 */
  return tkCollapse("tk-timeline-panel", "处理时间线", "clock", list.length, '<div class="ticket-timeline">' + inner + "</div>", false);
}

function renderTicketAttachments(list, apiBase) {
  var att = list || [];
  if (!att.length) return "";
  var base = apiBase !== undefined ? apiBase : TicketApi._base;
  var inner = "";
  for (var i = 0; i < att.length; i++) {
    var a = att[i];
    var u = base + "upload.php?action=download&id=" + a.id;
    var n = escapeHtml(a.original_name || "附件");
    var m = a.file_size ? "(" + formatFileSize(a.file_size) + ")" : "";
    if ((a.mime_type || "").indexOf("image/") === 0) {
      inner +=
        '<a class="ticket-attachment image" href="' + u + '" target="_blank" rel="noopener">' +
          '<img src="' + u + '" alt="' + n + '" loading="lazy">' +
          '<span class="ticket-attachment-name">' + n + "</span>" +
          '<span class="ticket-attachment-meta">' + m + "</span>" +
        "</a>";
    } else {
      inner +=
        '<a class="ticket-attachment file" href="' + u + '" target="_blank" rel="noopener">' +
          '<span class="ticket-attachment-icon">' + ticketIcon("file", 16) + "</span>" +
          '<span><span class="ticket-attachment-name">' + n + "</span>" +
          '<span class="ticket-attachment-meta">' + m + "</span></span>" +
        "</a>";
    }
  }
  /* 有附件时默认展开，方便直接查看 */
  return tkCollapse("tk-attach-panel", "附件", "clip", att.length, '<div class="ticket-attachments"><div class="ticket-attachments-grid">' + inner + "</div></div>", true);
}

function renderTemplateChips(templates) {
  if (!templates || !templates.length) return "";
  var html =
    '<div class="tk-template-chips">' +
      '<span class="tk-template-chips-label">快捷回复</span>';
  for (var i = 0; i < Math.min(templates.length, 6); i++) {
    var tp = templates[i];
    html += '<button type="button" class="tk-template-chip" onclick="applyReplyTemplate(\'' + parseInt(tp.id, 10) + '\')">' + escapeHtml(tp.title || "模板") + "</button>";
  }
  html += "</div>";
  return html;
}

function renderReplyComposer(opts) {
  var o = opts || {};
  var tid = o.ticketId;
  var taId = o.textareaId || "replyContent";
  var fileId = o.fileId || "ticketFile";
  var chips = o.templates ? renderTemplateChips(o.templates) : "";
  var hint =
    '<span class="ticket-compose-hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> 发送</span>';
  var count =
    '<span class="ticket-compose-count" id="' + taId + 'Count">0/' + TICKET_REPLY_MAXLEN + "</span>";
  return (
    '<div class="ticket-reply-compose">' +
      chips +
      '<textarea id="' + taId + '" rows="3" maxlength="' + TICKET_REPLY_MAXLEN + '" aria-label="回复内容输入框" placeholder="输入回复内容..." onkeydown="handleComposeKeydown(event,' + tid + ')" oninput="tkUpdateComposerCount(this,\'' + taId + 'Count\')"></textarea>' +
      '<div class="ticket-reply-compose-actions">' +
        '<input type="file" id="' + fileId + '" accept="image/*,.txt,.log,.pdf" onchange="handleTicketFileChange(this,\'' + fileId + 'Label\',\'' + fileId + 'Name\')">' +
        '<label for="' + fileId + '" class="ticket-upload-btn" id="' + fileId + 'Label">' + ticketIcon("clip", 12) + "选择附件</label>" +
        '<span class="ticket-file-name" id="' + fileId + 'Name"></span>' +
        '<button type="button" class="btn btn-outline btn-send" style="padding:7px 14px;font-size:12px" id="' + fileId + 'UploadBtn" onclick="uploadAttachmentToTicket(' + tid + ',\'' + fileId + '\')" aria-label="上传附件">' + ticketIcon("clip", 12) + "上传附件</button>" +
        hint +
        count +
      "</div>" +
    "</div>"
  );
}

