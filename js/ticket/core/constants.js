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
  tech: "技术支持",
  delivery: "开通交付",
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
  clock: APP_ICONS.clock,
  user: APP_ICONS.user,
  headset: APP_ICONS.headset,
  bolt: APP_ICONS.bolt,
  clip: APP_ICONS.clip,
  file: APP_ICONS.file,
  close: APP_ICONS["x-circle"],
  send: APP_ICONS.send,
  refresh: APP_ICONS["rotate-cw"],
  chat: APP_ICONS.chat,
  alert: APP_ICONS["alert-triangle"],
  inbox: APP_ICONS.inbox,
  chevron: APP_ICONS["chevron-down"],
  code: APP_ICONS.code,
  list: APP_ICONS.list,
  link: APP_ICONS.link,
  quote: APP_ICONS.quote,
  image: APP_ICONS.image
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

