/* =====================================================
   工单系统 · 共享模块（前台 + 后台通用）
   v20260825 · 页面化视图重构版
   -----------------------------------------------------
   依赖：js/common.js（apiFetch / escapeHtml / showToast /
         formatFileSize / formatRelativeTime）
   职责：
     1. 工单常量映射（状态/优先级/分类）—— 单一数据源
     2. 集中图标库（消除重复内联 SVG）
     3. API 封装（统一错误处理）
     4. 纯渲染函数（前台/后台复用）
        - 列表：整页表格视图（移动端 CSS 降级卡片）
        - 详情：消息卡片流 + 时间线 / 附件折叠面板
        - 新建：Markdown 提示卡 + 格式工具栏 + 图片暂存续传
        - 输入区：字数统计 + 发送 loading 态
     5. 用户侧页面控制器（#ticket-new / #ticket-view 子路由）
     6. 管理侧 tab 内嵌子视图控制器（列表 ⇄ 详情切换）
     7. 兼容旧全局函数名（外部模块零改动）
   ===================================================== */

/* ==================== 1. 常量映射（单一数据源） ==================== */

var TICKET_STATUS = {
  0: { key: "wait", label: "待回复" },
  1: { key: "on", label: "已回复" },
  2: { key: "off", label: "已关闭" }
};

var TICKET_PRIORITY = ["低", "中", "高", "紧急"];
var TICKET_PRIORITY_KEYS = ["low", "normal", "high", "urgent"];

/* 与后端 includes/commerce.php commerceGetTicketCategories() 保持一致 */
var TICKET_CATEGORIES = {
  login_issue: "登录异常",
  credential_error: "凭据错误",
  delivery_issue: "发货异常",
  payment_issue: "支付问题",
  refund_request: "退款申请",
  other: "其他"
};

var TICKET_CATEGORY_ORDER = [
  "login_issue",
  "credential_error",
  "delivery_issue",
  "payment_issue",
  "refund_request",
  "other"
];

/* 回复内容长度上限（与后端校验一致；仅用于前端字数提示） */
var TICKET_REPLY_MAXLEN = 1000;

function ticketStatusLabel(status) {
  var s = TICKET_STATUS[parseInt(status, 10)];
  return s ? s.label : "未知";
}

function ticketStatusKey(status) {
  var s = TICKET_STATUS[parseInt(status, 10)];
  return s ? s.key : "off";
}

function ticketPriorityLabel(priority) {
  return TICKET_PRIORITY[parseInt(priority, 10)] || "中";
}

function ticketPriorityKey(priority) {
  return TICKET_PRIORITY_KEYS[parseInt(priority, 10)] || "normal";
}

function ticketCategoryLabel(category) {
  return TICKET_CATEGORIES[category] || category || "其他";
}

/* ==================== 2. 集中图标库 ==================== */

var TICKET_ICONS = {
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  headset: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  close: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  chevron: '<polyline points="6 9 12 15 18 9"/>'
};

function ticketIcon(name, size, strokeWidth) {
  var s = size || 14;
  var w = strokeWidth || 2;
  return (
    '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s +
    '" fill="none" stroke="currentColor" stroke-width="' + w +
    '" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;flex-shrink:0">' +
    (TICKET_ICONS[name] || "") + "</svg>"
  );
}

/* ==================== 3. 模块状态 ==================== */

var TicketState = {
  myTicketsCache: [],
  ticketCache: {},
  adminFilters: { status: "", category: "", priority: "", keyword: "" },
  templatesCache: null,
  userStats: null,
  currentTextareaId: null,
  currentFileInputId: null,
  userFilterStatus: ""
};

/* ==================== 4. API 封装（统一错误处理） ==================== */

var TicketApi = {
  _base: "api/",

  init: function (base) {
    this._base = base;
  },

  _handle: function (promise) {
    return promise
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || data.code !== 1) {
          throw new Error((data && data.msg) || "请求失败");
        }
        return data;
      });
  },

  myTickets: function () {
    return this._handle(apiFetch(this._base + "tickets.php?action=my"));
  },

  detail: function (id) {
    return this._handle(apiFetch(this._base + "tickets.php?action=detail&id=" + id));
  },

  templates: function () {
    return this._handle(apiFetch(this._base + "tickets.php?action=templates"));
  },

  stats: function () {
    return this._handle(apiFetch(this._base + "tickets.php?action=stats"));
  },

  all: function (filters) {
    var qs = "";
    if (filters) {
      Object.keys(filters).forEach(function (k) {
        var v = filters[k];
        if (v !== "" && v !== undefined && v !== null) {
          qs += "&" + k + "=" + encodeURIComponent(v);
        }
      });
    }
    return this._handle(apiFetch(this._base + "tickets.php?action=all" + qs));
  },

  adminList: function (limit) {
    return this._handle(apiFetch(this._base + "tickets.php?action=admin_list&limit=" + (limit || 5)));
  },

  create: function (fields) {
    var body = new FormData();
    body.append("action", "create");
    Object.keys(fields).forEach(function (k) {
      if (fields[k] !== undefined && fields[k] !== null && fields[k] !== "") {
        body.append(k, fields[k]);
      }
    });
    return this._handle(apiFetch(this._base + "tickets.php", { method: "POST", body: body }));
  },

  reply: function (ticketId, content) {
    var body = new FormData();
    body.append("action", "reply");
    body.append("ticket_id", ticketId);
    body.append("content", content);
    return this._handle(apiFetch(this._base + "tickets.php", { method: "POST", body: body }));
  },

  close: function (ticketId) {
    var body = new FormData();
    body.append("action", "close");
    body.append("ticket_id", ticketId);
    return this._handle(apiFetch(this._base + "tickets.php", { method: "POST", body: body }));
  },

  approveRefund: function (ticketId, target, reason) {
    var body = new FormData();
    body.append("action", "approve_refund");
    body.append("ticket_id", ticketId);
    body.append("refund_target", target);
    body.append("refund_reason", reason);
    return this._handle(apiFetch(this._base + "tickets.php", { method: "POST", body: body }));
  },

  uploadAttachment: function (ticketId, file) {
    var body = new FormData();
    body.append("action", "ticket");
    body.append("ticket_id", ticketId);
    body.append("file", file);
    return this._handle(apiFetch(this._base + "upload.php", { method: "POST", body: body }));
  },

  listAttachments: function (ticketId) {
    return apiFetch(this._base + "upload.php?action=list&ticket_id=" + ticketId)
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        return d && d.code === 1 && d.data ? d.data : [];
      })
      .catch(function () {
        return [];
      });
  }
};

/* 自动识别前台/后台并初始化 API 基路径 */
(function () {
  var isAdminPage = /\/admin\/[^/]*\.html$/.test(window.location.pathname);
  TicketApi.init(isAdminPage ? "../api/" : "api/");
})();

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

function renderTicketSkeletonList(count) {
  var n = count || 4;
  var html = "";
  for (var i = 0; i < n; i++) {
    html +=
      '<div class="tk-skeleton-card">' +
        '<div class="tk-skeleton tk-skeleton-line w60"></div>' +
        '<div class="tk-skeleton tk-skeleton-line w40"></div>' +
      "</div>";
  }
  return html;
}

/* 详情骨架：模拟 IM 头像+气泡布局，加载时不跳动 */
function renderTicketSkeletonDetail() {
  var line = function (w) {
    return '<div class="tk-skeleton tk-skeleton-line ' + w + '"></div>';
  };
  var msgLeft = function (w) {
    return (
      '<div class="tk-skeleton-msg">' +
        '<div class="tk-skeleton tk-skeleton-avatar"></div>' +
        '<div style="flex:1;max-width:70%;display:flex;flex-direction:column;gap:6px">' + line(w) + "</div>" +
      "</div>"
    );
  };
  var msgRight = function (w) {
    return (
      '<div class="tk-skeleton-msg is-right">' +
        '<div class="tk-skeleton tk-skeleton-avatar"></div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;width:55%">' + line(w) + "</div>" +
      "</div>"
    );
  };
  return (
    '<div style="display:flex;flex-direction:column;gap:16px;padding:8px 0">' +
      line("w40 tall") +
      msgLeft("w80") +
      msgRight("w60") +
      msgLeft("w80") +
      msgRight("w40") +
    "</div>"
  );
}

function renderTicketErrorState(containerId, message) {
  return (
    '<div class="tk-state is-error">' +
      '<span class="tk-state-icon">' + ticketIcon("alert", 24, 1.5) + "</span>" +
      "<p>" + escapeHtml(message || "加载失败，请检查网络后重试") + "</p>" +
      '<button class="tk-state-retry" onclick="' + containerId + 'Retry()">重试</button>' +
    "</div>"
  );
}

/* 插画化空状态：信封 + 对话气泡组合图形（纯 SVG，随主题着色） */
function renderTkEmptyArt(opts) {
  var o = opts || {};
  var art =
    '<svg class="tk-empty-art" viewBox="0 0 128 92" fill="none" aria-hidden="true">' +
      /* 背景装饰气泡 */
      '<rect class="art-soft" x="78" y="8" width="42" height="26" rx="8"/>' +
      '<circle class="art-soft" cx="90" cy="21" r="2.4" fill="currentColor"/>' +
      '<circle class="art-soft" cx="99" cy="21" r="2.4" fill="currentColor"/>' +
      '<circle class="art-soft" cx="108" cy="21" r="2.4" fill="currentColor"/>' +
      /* 信封主体 */
      '<rect x="18" y="30" width="72" height="48" rx="8" fill="none" stroke="currentColor" stroke-width="2.5"/>' +
      '<path class="art-accent" d="M20 36 L54 58 L88 36" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      /* 前景小气泡（品牌色点缀） */
      '<rect class="art-accent" x="86" y="52" width="34" height="22" rx="7" fill="currentColor" opacity="0.18"/>' +
      '<path class="art-accent" d="M96 74 L92 82 L102 76 Z" fill="currentColor"/>' +
    "</svg>";
  return (
    '<div class="tk-empty">' +
      art +
      '<p class="tk-empty-title">' + escapeHtml(o.title || "暂无内容") + "</p>" +
      '<p class="tk-empty-sub">' + escapeHtml(o.sub || "") + "</p>" +
      (o.actionHtml || "") +
    "</div>"
  );
}

/* ==================== 6. 通用控制器辅助 ==================== */

window.__TK_IS_ADMIN__ = /\/admin\//.test(window.location.pathname);

function tkOpenModal(id) {
  var m = document.getElementById(id);
  if (m) m.classList.add("show");
}
function tkCloseModal(id) {
  var m = document.getElementById(id);
  if (m) m.classList.remove("show");
}

/* 字数统计（near/max 两档高亮） */
function tkUpdateComposerCount(textarea, countElId) {
  var el = countElId ? document.getElementById(countElId) : null;
  if (!el) return;
  var len = textarea ? (textarea.value || "").length : 0;
  el.textContent = len + "/" + TICKET_REPLY_MAXLEN;
  el.classList.toggle("is-near", len >= TICKET_REPLY_MAXLEN * 0.85 && len < TICKET_REPLY_MAXLEN);
  el.classList.toggle("is-max", len >= TICKET_REPLY_MAXLEN);
}

/* 发送按钮 loading 态切换（spinner + 文案 + 禁用） */
function tkSetSending(btn, sending, sendingText, normalHtml) {
  if (!btn) return;
  if (sending) {
    if (!btn.dataset.normalHtml) btn.dataset.normalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="tk-spinner"></span> ' + (sendingText || "发送中...");
    btn.classList.add("is-sending");
    btn.setAttribute("aria-busy", "true");
  } else {
    btn.innerHTML = normalHtml || btn.dataset.normalHtml || btn.innerHTML;
    btn.classList.remove("is-sending");
    btn.removeAttribute("aria-busy");
  }
}

/* 对话流滚动到最新一条（渲染完成后调用） */
function tkScrollConversationToEnd() {
  var wrap = document.getElementById("tk-conversation");
  if (!wrap) return;
  try {
    wrap.scrollIntoView({ block: "end" });
  } catch (e) {
    wrap.scrollIntoView();
  }
}

/* 快捷回复模板（带缓存的懒加载；失败静默降级为无模板） */
function getTicketTemplates() {
  if (!TicketState.templatesCache) {
    TicketState.templatesCache = TicketApi.templates()
      .then(function (d) { return d.data || []; })
      .catch(function () { return []; });
  }
  return TicketState.templatesCache;
}

function applyReplyTemplate(id) {
  getTicketTemplates().then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (parseInt(list[i].id, 10) === parseInt(id, 10)) {
        var ta =
          document.getElementById(TicketState.currentTextareaId || "") ||
          document.getElementById(window.__TK_IS_ADMIN__ ? "adminReplyContent" : "replyContent");
        if (ta) {
          ta.value = list[i].content || "";
          tkUpdateComposerCount(ta, ta.id + "Count");
          ta.focus();
        }
        break;
      }
    }
  });
}

function handleComposeKeydown(e, tid) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    if (window.__TK_IS_ADMIN__) adminReplyTicket(tid);
    else replyTicket(tid);
  }
}

function handleTicketFileChange(input, labelId, nameId) {
  var label = document.getElementById(labelId);
  var nameEl = document.getElementById(nameId);
  if (!label || !nameEl) return;
  if (input.files && input.files[0]) {
    label.classList.add("has-file");
    label.innerHTML = ticketIcon("clip", 12) + "已选择";
    nameEl.textContent = input.files[0].name;
  } else {
    label.classList.remove("has-file");
    label.innerHTML = ticketIcon("clip", 12) + "选择附件";
    nameEl.textContent = "";
  }
}

function uploadAttachmentToTicket(tid, fileId) {
  var fi = document.getElementById(fileId);
  if (!fi || !fi.files || !fi.files[0]) { showToast("请先选择文件"); return; }
  if (fi.files[0].size > 5 * 1024 * 1024) { showToast("文件大小不能超过5MB"); return; }
  /* 上传按钮进入 loading 态 */
  var btn = document.getElementById(fileId + "UploadBtn");
  tkSetSending(btn, true, "上传中...", null);
  TicketApi.uploadAttachment(tid, fi.files[0])
    .then(function () {
      showToast("附件上传成功");
      fi.value = "";
      handleTicketFileChange({ files: null }, fileId + "Label", fileId + "Name");
      /* v20260825：页面化后按侧别就地刷新详情视图 */
      if (window.__TK_IS_ADMIN__) refreshAdminTicketView(tid);
      else refreshTicketView(tid);
    })
    .catch(function (err) { showToast((err && err.message) || "上传请求失败"); })
    .finally(function () { tkSetSending(btn, false, "", null); });
}

/* 对话流组装（IM 气泡 + 时间线 + 附件折叠面板 + 输入区），前台后台共用 */
function buildConversationHtml(t, att, isAdminSide, withComposer, templates) {
  var h = renderTicketReplies(t.replies, isAdminSide);
  var tl = renderTicketTimeline(t.events || []);
  if (tl) h += tl;
  var at = renderTicketAttachments(att || [], TicketApi._base);
  if (at) h += at;
  if (withComposer) {
    h += renderReplyComposer({
      ticketId: t.id,
      textareaId: isAdminSide ? "adminReplyContent" : "replyContent",
      fileId: isAdminSide ? "adminTicketFile" : "ticketFile",
      templates: isAdminSide ? (templates || null) : null
    });
  }
  return h;
}

/* ==================== 7. 用户侧控制器（前台） ==================== */

/* 前台概览 chips 点击 → 本地过滤工单列表 */
function filterMyTickets(status) {
  TicketState.userFilterStatus = String(status);
  var c = document.getElementById("myTickets");
  if (!c) return;
  renderMyTicketsInto(c);
}

function renderMyTicketsInto(c) {
  var list = TicketState.myTicketsCache || [];
  var f = TicketState.userFilterStatus;

  function chip(cls, label, val, stVal, active) {
    var act = active ? " is-active" : "";
    return (
      '<button type="button" class="tk-overview-item ' + cls + act + '" aria-pressed="' + (active ? "true" : "false") + '" onclick="filterMyTickets(\'' + stVal + "')\">" +
        label + "<strong>" + val + "</strong>" +
      "</button>"
    );
  }

  var n = { 0: 0, 1: 0, 2: 0 };
  for (var i = 0; i < list.length; i++) {
    var k = parseInt(list[i].status, 10);
    if (n[k] !== undefined) n[k]++;
  }

  var html =
    '<div class="tk-overview">' +
      chip("", "全部", list.length, "", f === "") +
      chip("is-wait", "待回复", n[0], "0", f === "0") +
      chip("is-on", "已回复", n[1], "1", f === "1") +
      chip("is-off", "已关闭", n[2], "2", f === "2") +
    "</div>";

  var shown = list;
  if (f !== "") {
    shown = list.filter(function (t) { return parseInt(t.status, 10) === parseInt(f, 10); });
  }
  if (!shown.length) {
    html += renderTkEmptyArt({
      title: "暂无符合条件的工单",
      sub: "遇到问题？随时提交工单，我们会尽快处理。",
      actionHtml:
        '<button type="button" class="btn btn-primary" onclick="showCreateTicket()">+ 发起新工单</button>'
    });
  } else {
    html += renderTicketPageTable(shown);
  }
  c.innerHTML = html;
}

function loadMyTickets() {
  var c = document.getElementById("myTickets"); if (!c) return;
  if (typeof currentUser === "undefined" || !currentUser) {
    c.innerHTML = renderLoginRequired("登录后查看工单记录", {
      icon: "ticket",
      sub: "提交问题反馈、查看处理进度，获取技术支持"
    });
    return;
  }
  /* 骨架屏 */
  c.innerHTML = renderTicketPageTable([]).replace("<tbody></tbody>", "<tbody><tr><td colspan='6' style='border:none'><div class=\"tk-skeleton-card\"><div class=\"tk-skeleton tk-skeleton-line w60\"></div><div class=\"tk-skeleton tk-skeleton-line w40\"></div></div></td></tr></tbody>");
  TicketState.userFilterStatus = "";
  TicketApi.myTickets()
    .then(function (data) {
      var list = data.data || [];
      TicketState.myTicketsCache = list;
      if (typeof updateDashTickets === "function") { try { updateDashTickets(list); } catch (e) {} }
      if (!list.length) {
        c.innerHTML = renderTkEmptyArt({
          title: "暂无工单记录",
          sub: "提交问题反馈、查看处理进度，获取技术支持。",
          actionHtml:
            '<button type="button" class="btn btn-primary" onclick="showCreateTicket()">+ 发起新工单</button>'
        });
        return;
      }
      renderMyTicketsInto(c);
    })
    .catch(function (err) {
      c.innerHTML = renderTicketErrorState("myTickets", (err && err.message) || "工单列表加载失败");
    });
}
function myTicketsRetry() { loadMyTickets(); }

/* v20260825：showCreateTicket / closeTicketModal 已在文末第 14 章重定义为页面版实现 */
function submitTicket() { showCreateTicket(); }

function uploadUserTicketAttachment(ticketId) {
  uploadAttachmentToTicket(ticketId, "ticketFile");
}
/* v20260825：showTicketDetail / replyTicket / closeTicket 已在文末第 14 章重定义为页面版实现 */
function ticketDetailBodyRetry() {
  if (TicketState.currentUserDetailId) showTicketDetail(TicketState.currentUserDetailId);
}
function closeTicketDetail() { window.location.hash = "#tickets"; }

/* ==================== 8. 管理侧控制器（后台） ==================== */

/* 后台分段式状态筛选（与原 select 双向兼容） */
function setAdminTicketStatusFilter(v) {
  v = String(v);
  TicketState.adminFilters.status = v;
  var sel = document.getElementById("tkFilterStatus");
  if (sel) sel.value = v;
  var group = document.getElementById("tkSegStatus");
  if (group) {
    var btns = group.querySelectorAll(".tk-seg-btn");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-value") === v;
      btns[i].classList.toggle("is-active", on);
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  loadTickets();
}

function loadTicketStats() {
  var ids = { pending: "statTicketPending", replied: "statTicketReplied", closed: "statTicketClosed", total: "statTicketTotal" };
  TicketApi.stats()
    .then(function (res) {
      var d = res.data || {};
      Object.keys(ids).forEach(function (k) {
        var el = document.getElementById(ids[k]);
        if (el) el.textContent = d[k] !== undefined ? d[k] : "-";
      });
      /* v20260825：侧边栏「工单管理」角标与统计卡联动（展示待回复数，>99 显示 99+） */
      var bd = document.getElementById("ticketBadge");
      if (bd) {
        var p = parseInt(d.pending, 10) || 0;
        bd.textContent = p > 99 ? "99+" : String(p);
        bd.style.display = p > 0 ? "" : "none";
      }
    })
    .catch(function () {});
}

function loadTickets() {
  var tbody = document.getElementById("ticketTable");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7"><div style="padding:10px 0">' + renderTicketSkeletonList(3) + "</div></td></tr>";
  TicketApi.all(TicketState.adminFilters)
    .then(function (data) {
      var list = data.data || [];
      TicketState.ticketCache = {};
      list.forEach(function (t) { TicketState.ticketCache[t.id] = t; });
      if (!list.length) {
        var hasFilter =
          TicketState.adminFilters.status !== "" ||
          TicketState.adminFilters.category !== "" ||
          TicketState.adminFilters.priority !== "" ||
          TicketState.adminFilters.keyword !== "";
        var cell = document.createElement("td");
        cell.colSpan = 7;
        if (hasFilter) {
          cell.style.padding = "10px 0";
          cell.innerHTML = renderTkEmptyArt({
            title: "没有符合条件的工单",
            sub: "可调整筛选条件后重试"
          });
        } else {
          cell.style.padding = "10px 0";
          cell.innerHTML = renderTkEmptyArt({
            title: "暂无工单",
            sub: "用户提交的工单将显示在这里"
          });
        }
        var tr = document.createElement("tr");
        tr.appendChild(cell);
        tbody.innerHTML = "";
        tbody.appendChild(tr);
        return;
      }
      var html = "";
      for (var i = 0; i < list.length; i++) html += renderTicketRow(list[i], TicketApi._base);
      tbody.innerHTML = html;
    })
    .catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">' + escapeHtml((err && err.message) || "工单加载失败") + "</td></tr>";
    });
}

function applyTicketFilters() {
  TicketState.adminFilters.status = (document.getElementById("tkFilterStatus") || {}).value || "";
  TicketState.adminFilters.category = (document.getElementById("tkFilterCategory") || {}).value || "";
  TicketState.adminFilters.priority = (document.getElementById("tkFilterPriority") || {}).value || "";
  TicketState.adminFilters.keyword = ((document.getElementById("tkFilterKeyword") || {}).value || "").trim();
  /* 同步分段按钮高亮（若存在） */
  var group = document.getElementById("tkSegStatus");
  if (group) {
    var btns = group.querySelectorAll(".tk-seg-btn");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-value") === String(TicketState.adminFilters.status);
      btns[i].classList.toggle("is-active", on);
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  loadTickets();
}

function resetTicketFilters() {
  ["tkFilterStatus", "tkFilterCategory", "tkFilterPriority"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
  var kw = document.getElementById("tkFilterKeyword");
  if (kw) kw.value = "";
  applyTicketFilters();
}

/* v20260825：showAdminTicketDetail / closeAdminTicketDetail 已在文末第 14 章重定义（tab 内嵌子视图） */
function adminTicketBodyRetry() {
  if (TicketState.currentAdminDetailId) showAdminTicketDetail(TicketState.currentAdminDetailId);
}

function renderAdminRefundCard(t) {
  var oi = t.order_info || null;
  var tgt = t.refund_target === "balance" ? "退回站内余额" : t.refund_target === "original" ? "原路退回" : "-";
  var h =
    '<div class="refund-admin-card">' +
      '<div class="refund-admin-card-header">' +
        "<div>" +
          '<div class="refund-admin-card-title">' + ticketIcon("refresh", 16) + "退款审批</div>" +
          '<div class="refund-admin-card-subtitle">用户提交时选择：' + escapeHtml(tgt) + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="refund-admin-grid">' +
        '<div class="refund-admin-item"><label>关联订单</label><div>' + escapeHtml(t.order_no || "-") + "</div></div>" +
        '<div class="refund-admin-item"><label>退款金额</label><div>' + (oi ? parseFloat(oi.price || 0).toFixed(2) + " 积分" : "-") + "</div></div>" +
        '<div class="refund-admin-item"><label>提交原因</label><div>' + escapeHtml(t.refund_reason || "-") + "</div></div>" +
        '<div class="refund-admin-item"><label>处理管理员</label><div>' + escapeHtml(t.handled_admin_name || "-") + "</div></div>" +
      "</div>";
  if (parseInt(t.status, 10) !== 2) {
    h +=
      '<div class="refund-approve-section">' +
        '<div class="refund-admin-grid">' +
          '<div class="refund-admin-item"><label>审批退款方式</label><select id="approveRefundTarget">' +
            '<option value="original"' + (t.refund_target === "original" ? " selected" : "") + ">原路退回</option>" +
            '<option value="balance"' + (t.refund_target === "balance" ? " selected" : "") + ">退回站内余额</option>" +
          "</select></div>" +
          '<div class="refund-admin-item" style="grid-column:1/-1"><label>审批备注</label>' +
            '<textarea id="approveRefundReason" rows="2" placeholder="会写入退款记录与工单回复">' + escapeHtml(t.refund_reason || "工单退款") + "</textarea>" +
          "</div>" +
        "</div>" +
      "</div>";
  }
  h += "</div>";
  return h;
}
function adminReplyTicket(tid) {
  var ta = document.getElementById("adminReplyContent");
  var content = ta ? (ta.value || "").trim() : "";
  if (!content) { showToast("请输入回复内容"); if (ta) ta.focus(); return; }
  if (TicketState.replying) return;
  TicketState.replying = true;
  tkSetSending(document.getElementById("adminReplySendBtn"), true, "发送中...", null);
  TicketApi.reply(tid, content)
    .then(function () {
      TicketState.replying = false;
      showToast("回复成功");
      loadTickets();
      loadTicketStats();
      return refreshAdminTicketView(tid);
    })
    .catch(function (err) {
      TicketState.replying = false;
      showToast((err && err.message) || "回复失败");
    })
    .finally(function () {
      tkSetSending(document.getElementById("adminReplySendBtn"), false, "", ticketIcon("send", 14) + "发送回复");
    });
}

/* v20260825：adminCloseTicket / approveRefundTicket 已在文末第 14 章重定义（去重，仅保留一份） */

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

/* =====================================================
   11. Markdown 工具栏 + 图床式图片暂存（v20260825）
   ===================================================== */

/* 选区包裹（B / I / 行内代码） */
function tkMdWrap(taId, before, after) {
  var ta = document.getElementById(taId);
  if (!ta) return;
  var s = ta.selectionStart, e = ta.selectionEnd;
  var sel = ta.value.substring(s, e) || "文本";
  ta.value = ta.value.substring(0, s) + before + sel + after + ta.value.substring(e);
  ta.focus();
  var pos = s + before.length + sel.length + after.length;
  try { ta.setSelectionRange(pos, pos); } catch (err) {}
  if (taId === "tkNewContent") tkNewUpdateCount();
}

/* 行前缀（引用 / 列表）：对选中行逐行添加前缀 */
function tkMdLines(taId, prefix) {
  var ta = document.getElementById(taId);
  if (!ta) return;
  var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
  var ls = v.lastIndexOf("\n", Math.max(s - 1, 0)) + 1;
  var le = v.indexOf("\n", e);
  if (le === -1) le = v.length;
  var block = v.substring(ls, le) || "列表项";
  var lined = block.split("\n").map(function (l) { return prefix + l.replace(/^(- |\> )+/, ""); }).join("\n");
  ta.value = v.substring(0, ls) + lined + v.substring(le);
  ta.focus();
  var pos = ls + lined.length;
  try { ta.setSelectionRange(pos, pos); } catch (err) {}
  if (taId === "tkNewContent") tkNewUpdateCount();
}

/* 插入链接 */
function tkMdInsertLink() {
  var url = prompt("请输入链接地址：", "https://");
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  tkMdWrap("tkNewContent", "[", "](" + url + ")");
}

/* 图片按钮：选择文件 → 暂存 + 在光标处插入占位标记（提交工单后自动上传） */
function tkNewImagePick() {
  var fi = document.getElementById("tkNewImageFile");
  if (!fi) return;
  fi.value = "";
  fi.click();
}

function tkNewImageSelected(input) {
  var f = input.files && input.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { showToast("图片大小不能超过 5MB"); return; }
  if (!TicketState.pendingNewImages) TicketState.pendingNewImages = [];
  if (TicketState.pendingNewImages.length >= 9) { showToast("最多随工单附带 9 张图片"); return; }
  TicketState.pendingNewImages.push(f);
  var ta = document.getElementById("tkNewContent");
  if (ta) {
    var mark = "[图片:" + f.name + "]";
    var s = ta.selectionStart, e = ta.selectionEnd;
    var head = ta.value.substring(0, s);
    var needNl = head && head.charAt(head.length - 1) !== "\n" ? "\n" : "";
    ta.value = head + needNl + mark + "\n" + ta.value.substring(e);
    ta.focus();
    tkNewUpdateCount();
  }
  tkUpdateImageButton();
  showToast("已添加待上传图片：" + f.name);
}

function tkUpdateImageButton() {
  var b = document.getElementById("tkNewImageBtn");
  if (!b) return;
  var n = (TicketState.pendingNewImages || []).length;
  b.classList.toggle("is-image-pending", n > 0);
  b.innerHTML = ticketIcon("clip", 13) + " 图片" + (n ? " (" + n + ")" : "");
}

function tkNewUpdateCount() {
  var ta = document.getElementById("tkNewContent");
  var el = document.getElementById("tkNewCount");
  if (ta && el) el.textContent = (ta.value || "").length + " 字";
}

/* 紧急勾选 → 强制优先级为「紧急」并锁定下拉 */
function tkToggleUrgent(cb) {
  var pri = document.getElementById("tkNewPriority");
  if (!pri) return;
  if (cb.checked) { pri.value = "3"; pri.disabled = true; }
  else { pri.disabled = false; }
}

/* 提交后按顺序续传暂存图片（单个失败不阻断，最后汇总提示） */
function tkUploadPendingImages(tid) {
  var files = (TicketState.pendingNewImages || []).slice();
  if (!tid || !files.length) return Promise.resolve();
  var failed = 0;
  var chain = Promise.resolve();
  files.forEach(function (f) {
    chain = chain.then(function () {
      return TicketApi.uploadAttachment(tid, f).catch(function () { failed++; });
    });
  });
  return chain.then(function () {
    if (failed) showToast(failed + " 张图片上传失败，可稍后在工单内重新上传");
  });
}

/* =====================================================
   12. 用户侧页面控制器（前台 #ticket-new / #ticket-view）
   ===================================================== */

/* 订单选项加载（新建页关联订单下拉） */
function tkLoadOrderOptions(sel, orderId) {
  if (!sel) return;
  sel.innerHTML = '<option value="">加载订单中...</option>';
  apiFetch(TicketApi._base + "orders.php?action=my&page_size=100")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      sel.innerHTML = '<option value="">不关联订单</option>';
      if (data.code === 1 && data.data && data.data.list) {
        data.data.list.forEach(function (o) {
          var opt = document.createElement("option");
          opt.value = o.id;
          opt.textContent = (o.order_no || "订单#" + o.id) + " - " + (o.product_name || "商品已删除");
          sel.appendChild(opt);
        });
      }
      if (orderId) sel.value = String(orderId);
    })
    .catch(function () { sel.innerHTML = '<option value="">不关联订单</option>'; });
}

/* 发起新工单页 */
function renderTicketNewFormHtml() {
  var cats = "", pris = "";
  for (var i = 0; i < TICKET_CATEGORY_ORDER.length; i++) {
    var k = TICKET_CATEGORY_ORDER[i];
    cats += '<option value="' + k + '"' + (k === "other" ? " selected" : "") + ">" + escapeHtml(TICKET_CATEGORIES[k]) + "</option>";
  }
  for (var p = 0; p < TICKET_PRIORITY.length; p++) {
    pris += '<option value="' + p + '"' + (p === 1 ? " selected" : "") + ">" + TICKET_PRIORITY[p] + "</option>";
  }
  return (
    '<div class="tk-new-form">' +
      '<button type="button" class="tk-back-link" onclick="location.hash=\'#tickets\'">← 返回工单列表</button>' +
      '<div class="tk-md-hint">' + ticketIcon("file", 18, 1.6) +
        "<div><strong>支持 Markdown 排版：</strong>可用 <code>**加粗**</code>、<code>*斜体*</code>、<code>`代码`</code>、<code>&gt; 引用</code>、<code>- 列表</code>；点击工具栏「图片」可附上截图，随工单提交后自动保存为附件。</div>" +
      "</div>" +
      '<div class="card" style="padding:22px;display:flex;flex-direction:column;gap:16px">' +
        '<div class="form-group" style="margin:0"><label for="tkNewTitle">标题 <span style="color:var(--danger)">*</span></label>' +
          '<input type="text" id="tkNewTitle" placeholder="简要概括你遇到的问题" /></div>' +
        '<div class="form-row-2col" style="margin:0">' +
          '<div class="form-group" style="margin:0"><label for="tkNewCategory">分类</label><select id="tkNewCategory">' + cats + "</select></div>" +
          '<div class="form-group" style="margin:0"><label for="tkNewPriority">优先级</label><select id="tkNewPriority">' + pris + "</select></div>" +
        "</div>" +
        '<div class="form-group" style="margin:0"><label for="tkNewOrder">关联订单（可选）</label><select id="tkNewOrder"><option value="">不关联订单</option></select></div>' +
        '<label class="tk-check-urgent"><input type="checkbox" id="tkNewUrgent" onchange="tkToggleUrgent(this)" /><span>标记为紧急（服务完全不可用等严重故障）</span></label>' +
        '<div class="tk-compose-stack">' +
          '<div class="tk-toolbar" role="toolbar" aria-label="内容格式工具栏">' +
            '<button type="button" class="tk-tool-btn" title="加粗" aria-label="加粗" onclick="tkMdWrap(\'tkNewContent\',\'**\',\'**\')"><b>B</b></button>' +
            '<button type="button" class="tk-tool-btn" title="斜体" aria-label="斜体" onclick="tkMdWrap(\'tkNewContent\',\'*\',\'*\')"><i>I</i></button>' +
            '<button type="button" class="tk-tool-btn" title="行内代码" aria-label="行内代码" onclick="tkMdWrap(\'tkNewContent\',\'`\',\'`\')">' + ticketIcon("code", 13) + "</button>" +
            '<span class="tk-tool-sep"></span>' +
            '<button type="button" class="tk-tool-btn" title="引用" aria-label="引用" onclick="tkMdLines(\'tkNewContent\',\'> \')">❝</button>' +
            '<button type="button" class="tk-tool-btn" title="无序列表" aria-label="无序列表" onclick="tkMdLines(\'tkNewContent\',\'- \')">' + ticketIcon("list", 13) + "</button>" +
            '<span class="tk-tool-sep"></span>' +
            '<button type="button" class="tk-tool-btn" title="插入链接" aria-label="插入链接" onclick="tkMdInsertLink()">' + ticketIcon("link", 13) + "</button>" +
            '<button type="button" class="tk-tool-btn" id="tkNewImageBtn" title="上传图片（随工单提交）" onclick="tkNewImagePick()">' + ticketIcon("clip", 13) + " 图片</button>" +
            '<input type="file" id="tkNewImageFile" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none" onchange="tkNewImageSelected(this)" />' +
          "</div>" +
          '<textarea id="tkNewContent" rows="8" placeholder="请详细描述遇到的问题：复现步骤、报错信息、期望结果等…" aria-label="问题描述" oninput="tkNewUpdateCount()"></textarea>' +
        "</div>" +
        '<div class="tk-page-head-actions" style="justify-content:flex-end">' +
          '<span class="ticket-compose-count" id="tkNewCount" style="margin-right:auto">0 字</span>' +
          '<button type="button" class="btn btn-outline" onclick="location.hash=\'#tickets\'">取消</button>' +
          '<button type="button" class="btn btn-primary" id="tkNewSubmitBtn" onclick="submitTicketPage()">' + ticketIcon("send", 14) + " 提交工单</button>" +
        "</div>" +
      "</div>" +
    "</div>"
  );
}

function openTicketNewPage(orderId) {
  /* 守卫：仅已登录普通用户可进入发起工单页（管理员请走后台） */
  if (typeof currentUser === "undefined" || !currentUser) {
    if (typeof showLogin === "function") showLogin();
    window.location.hash = "#tickets";
    return;
  }
  if (typeof currentRole !== "undefined" && currentRole === "admin") {
    if (typeof showToast === "function") showToast("管理员请前往后台处理工单");
    window.location.hash = "#tickets";
    return;
  }
  orderId = parseInt(orderId, 10) || 0;
  TicketState.pendingNewImages = [];
  var c = document.getElementById("ticketNewBody");
  if (!c) return;
  c.innerHTML = renderTicketNewFormHtml();
  tkLoadOrderOptions(document.getElementById("tkNewOrder"), orderId);
  tkUpdateImageButton();
  window.scrollTo(0, 0);
}
function ticketNewBodyRetry() { openTicketNewPage((window.__ROUTE_QUERY__ || {}).order || 0); }

/* 提交工单（创建 → 续传图片 → 跳转详情页） */
function submitTicketPage() {
  if (TicketState.submitting) return;
  var title = ((document.getElementById("tkNewTitle") || {}).value || "").trim();
  var content = ((document.getElementById("tkNewContent") || {}).value || "").trim();
  var category = (document.getElementById("tkNewCategory") || {}).value || "other";
  var urgent = !!(document.getElementById("tkNewUrgent") || {}).checked;
  var priority = urgent ? "3" : ((document.getElementById("tkNewPriority") || {}).value || "1");
  var orderId = (document.getElementById("tkNewOrder") || {}).value || "";
  if (!title) { showToast("请填写工单标题"); var t1 = document.getElementById("tkNewTitle"); if (t1) t1.focus(); return; }
  if (!content) { showToast("请填写问题描述"); var t2 = document.getElementById("tkNewContent"); if (t2) t2.focus(); return; }
  TicketState.submitting = true;
  var btn = document.getElementById("tkNewSubmitBtn");
  tkSetSending(btn, true, "提交中...", null);
  var payload = { title: title, content: content, category: category, priority: priority };
  if (orderId) payload.order_id = orderId;
  TicketApi.create(payload)
    .then(function (res) {
      var tid = res.data && res.data.ticket_id ? parseInt(res.data.ticket_id, 10) : 0;
      return tkUploadPendingImages(tid).then(function () { return tid; });
    })
    .then(function (tid) {
      TicketState.submitting = false;
      TicketState.pendingNewImages = [];
      showToast("工单提交成功");
      if (tid) {
        window.location.hash = "#ticket-view?id=" + tid;
      } else {
        window.location.hash = "#tickets";
      }
    })
    .catch(function (err) {
      TicketState.submitting = false;
      tkSetSending(btn, false, "", ticketIcon("send", 14) + " 提交工单");
      showToast((err && err.message) || "提交失败");
    });
}

/* 查看工单页 */
function openTicketView(id) {
  id = parseInt(id, 10); if (!id) return;
  TicketState.currentUserDetailId = id;
  var c = document.getElementById("ticketViewBody");
  if (!c) return;
  c.innerHTML = renderTicketSkeletonDetail();
  TicketApi.detail(id)
    .then(function (res) {
      var t = res.data;
      TicketState.ticketCache[id] = t;
      return TicketApi.listAttachments(id).then(function (att) {
        c.innerHTML = tkTicketViewShellHtml(t, att, false);
        tkScrollConversationToEnd();
      });
    })
    .catch(function (err) {
      c.innerHTML =
        '<button type="button" class="tk-back-link" onclick="location.hash=\'#tickets\'">← 返回工单列表</button>' +
        '<div style="margin-top:12px">' + renderTicketErrorState("ticketViewBody", (err && err.message) || "获取工单详情失败") + "</div>";
    });
}

/* 详情外壳（返回链接 + 卡片容器），刷新时复用以保持结构一致 */
function tkTicketViewShellHtml(t, att) {
  return (
    '<button type="button" class="tk-back-link" onclick="location.hash=\'#tickets\'">← 返回工单列表</button>' +
    '<div class="card" style="padding:22px;margin-top:12px">' +
      buildTicketViewPageHtml(t, att, { isAdminSide: false }) +
    "</div>"
  );
}

/* 局部刷新（回复 / 关闭 / 上传附件后），保留草稿与滚动位置 */
function refreshTicketView(id) {
  return TicketApi.detail(id)
    .then(function (res) {
      var t = res.data;
      TicketState.ticketCache[id] = t;
      return TicketApi.listAttachments(id).then(function (att) {
        var c = document.getElementById("ticketViewBody");
        if (!c) return;
        var ta = document.getElementById("replyContent");
        var draft = ta ? ta.value : "";
        c.innerHTML = tkTicketViewShellHtml(t, att);
        if (draft) {
          var ta2 = document.getElementById("replyContent");
          if (ta2) { ta2.value = draft; tkUpdateComposerCount(ta2, "replyContentCount"); }
        }
        tkScrollConversationToEnd();
      });
    })
    .catch(function () { openTicketView(id); });
}
function ticketViewBodyRetry() { openTicketView(TicketState.currentUserDetailId || 0); }

/* =====================================================
   13. 管理侧页面控制器（后台 tab 内嵌子视图）
   ===================================================== */

function openAdminTicketView(id) {
  id = parseInt(id, 10); if (!id) return;
  TicketState.currentAdminDetailId = id;
  var listWrap = document.getElementById("tkAdminListWrap");
  var view = document.getElementById("ticketAdminView");
  var body = document.getElementById("ticketAdminViewBody");
  if (!view || !body) return;
  if (listWrap) listWrap.style.display = "none";
  view.style.display = "";
  var bc = document.getElementById("breadcrumbCurrent");
  if (bc) bc.textContent = "工单 #" + id;
  var main = document.querySelector(".main-content");
  if (main) main.scrollTop = 0;
  body.innerHTML = renderTicketSkeletonDetail();
  Promise.all([TicketApi.detail(id), TicketApi.listAttachments(id), getTicketTemplates()])
    .then(function (rs) {
      var t = rs[0].data;
      TicketState.ticketCache[id] = t;
      if (bc) bc.textContent = "工单 #" + id + (t.title ? " · " + t.title : "");
      body.innerHTML = buildTicketViewPageHtml(t, rs[1] || [], { isAdminSide: true, templates: rs[2] || [] });
      tkScrollConversationToEnd();
    })
    .catch(function (err) {
      body.innerHTML = renderTicketErrorState("ticketAdminViewBody", (err && err.message) || "获取工单详情失败");
    });
}

function closeAdminTicketView() {
  var view = document.getElementById("ticketAdminView");
  var listWrap = document.getElementById("tkAdminListWrap");
  if (view) view.style.display = "none";
  if (listWrap) listWrap.style.display = "";
  var bc = document.getElementById("breadcrumbCurrent");
  if (bc) bc.textContent = "工单管理";
  loadTickets();
  loadTicketStats();
}

function refreshAdminTicketView(tid) {
  return Promise.all([TicketApi.detail(tid), TicketApi.listAttachments(tid), getTicketTemplates()])
    .then(function (rs) {
      var t = rs[0].data;
      TicketState.ticketCache[tid] = t;
      var body = document.getElementById("ticketAdminViewBody");
      if (!body) return;
      var ta = document.getElementById("adminReplyContent");
      var draft = ta ? ta.value : "";
      var sel = document.getElementById("approveRefundTarget");
      var selVal = sel ? sel.value : null;
      body.innerHTML = buildTicketViewPageHtml(t, rs[1] || [], { isAdminSide: true, templates: rs[2] || [] });
      if (draft) {
        var ta2 = document.getElementById("adminReplyContent");
        if (ta2) { ta2.value = draft; tkUpdateComposerCount(ta2, "adminReplyContentCount"); }
      }
      if (selVal && document.getElementById("approveRefundTarget")) {
        document.getElementById("approveRefundTarget").value = selVal;
      }
      tkScrollConversationToEnd();
    })
    .catch(function () { openAdminTicketView(tid); });
}
function ticketAdminViewBodyRetry() { openAdminTicketView(TicketState.currentAdminDetailId || 0); }

/* =====================================================
   14. 兼容别名 / 重定向（外部模块零改动）
   外部调用点：
   - js/notifications.js: showTicketDetail / switchPage("tickets")
   - js/main.js + 订单详情: showCreateTicket(orderId)
   - 后台仪表盘/列表: showAdminTicketDetail / closeAdminTicketDetail
   - 旧弹窗入口（showCreateTicket / showTicketDetail / replyTicket /
     closeTicket 等）在本章统一定义为页面版实现，全文件仅此一份
   ===================================================== */

/* 前台：发起工单 → 子路由 #ticket-new[?order=x] */
function showCreateTicket(orderId) {
  if (typeof currentUser === "undefined" || !currentUser) {
    if (typeof showLogin === "function") showLogin();
    return;
  }
  var oid = parseInt(orderId, 10) || 0;
  var target = oid ? "#ticket-new?order=" + oid : "#ticket-new";
  if ((window.location.hash || "") === target) openTicketNewPage(oid);
  else {
    try { window.location.hash = target; }
    catch (e) { openTicketNewPage(oid); }
  }
}
function closeTicketModal() { window.location.hash = "#tickets"; }

/* 前台：查看工单 → 子路由 #ticket-view?id=x */
function showTicketDetail(id) {
  id = parseInt(id, 10); if (!id) return;
  var target = "#ticket-view?id=" + id;
  if ((window.location.hash || "") === target) openTicketView(id);
  else {
    try { window.location.hash = target; }
    catch (e) { openTicketView(id); }
  }
}
function closeTicketDetail() { window.location.hash = "#tickets"; }

/* 前台：回复（页面版，回复后局部刷新） */
function replyTicket(ticketId) {
  var ta = document.getElementById("replyContent");
  var content = ta ? (ta.value || "").trim() : "";
  if (!content) { showToast("请输入回复内容"); if (ta) ta.focus(); return; }
  if (TicketState.replying) return;
  TicketState.replying = true;
  tkSetSending(document.getElementById("replySendBtn"), true, "发送中...", null);
  TicketApi.reply(ticketId, content)
    .then(function () {
      TicketState.replying = false;
      showToast("回复成功");
      loadMyTickets();
      return refreshTicketView(ticketId);
    })
    .catch(function (err) {
      TicketState.replying = false;
      showToast((err && err.message) || "回复失败");
    })
    .finally(function () {
      tkSetSending(document.getElementById("replySendBtn"), false, "", ticketIcon("send", 14) + "发送回复");
    });
}

/* 前台：关闭工单（页面版，关闭后就地呈现警示条） */
function closeTicket(ticketId) {
  if (!confirm("确定要关闭此工单吗？关闭后无法再回复。")) return;
  TicketApi.close(ticketId)
    .then(function () {
      showToast("工单已关闭");
      loadMyTickets();
      return refreshTicketView(ticketId);
    })
    .catch(function (err) { showToast((err && err.message) || "操作失败"); });
}

/* 后台：详情入口 → 内嵌子视图（原弹窗废弃） */
function showAdminTicketDetail(id) { openAdminTicketView(id); }
function closeAdminTicketDetail() { closeAdminTicketView(); }

/* 后台：关闭工单（页面版） */
function adminCloseTicket(tid) {
  if (!confirm("确定要关闭此工单吗？")) return;
  TicketApi.close(tid)
    .then(function () {
      showToast("工单已关闭");
      loadTickets();
      loadTicketStats();
      return refreshAdminTicketView(tid);
    })
    .catch(function (err) { showToast((err && err.message) || "操作失败"); });
}

/* 后台：同意退款（页面版，完成后就地刷新审批卡状态） */
function approveRefundTicket(tid) {
  if (!confirm("确认同意该退款申请并立即执行退款吗？")) return;
  var target = (document.getElementById("approveRefundTarget") || {}).value || "original";
  var reason = (((document.getElementById("approveRefundReason") || {}).value || "").trim()) || "工单退款";
  if (TicketState.refunding) return;
  TicketState.refunding = true;
  TicketApi.approveRefund(tid, target, reason)
    .then(function () {
      TicketState.refunding = false;
      showToast("退款已完成");
      loadTickets();
      loadTicketStats();
      if (typeof loadOrders === "function") loadOrders(typeof adminOrderPagination !== "undefined" ? adminOrderPagination.page || 1 : 1);
      return refreshAdminTicketView(tid);
    })
    .catch(function (err) {
      TicketState.refunding = false;
      showToast((err && err.message) || "退款失败");
    });
}

/* ==================== 15. 后台遗留别名（外部模块零改动） ==================== */

function uploadTicketAttachment(tid) {
  uploadAttachmentToTicket(tid, "adminTicketFile");
}
