/* =====================================================
   工单常量映射与集中图标库（单一数据源）
   来源：js/tickets.js
   ===================================================== */
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

