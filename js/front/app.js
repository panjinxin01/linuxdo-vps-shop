/* =====================================================
   前台启动引导：状态变量 / DOMContentLoaded / bootApp
   来源：js/main.js
   ===================================================== */
// VPS积分商城 - 前端核心逻辑
// 依赖: common.js, ui.js, notifications.js, orders.js
// ==================== 状态变量 ====================
let currentUser = null;
let selectedProduct = null;
let currentCoupon = null;
let isLoginMode = true;
let currentRole = null;
let linuxdoOAuthConfigured = false;
let productCache = {};
let orderPagination = { page: 1, pageSize: 5, total: 0, totalPages: 0 };
let cachedOrderList = null;
// 有效实例（已支付且未退款/取消）。必须独立保存：订单列表是分页的，
// 直接用当前页的 cachedOrderList 会导致超过一页后实例被漏掉。
let cachedPaidOrderList = [];

// ==================== 初始化 ====================
document.addEventListener("DOMContentLoaded", () => {
  initCsrfToken();
  apiFetch("api/check_install.php?_=" + Date.now())
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        renderInstallStateNotice(data.data || {});
      }
      bootApp();
    })
    .catch(() => bootApp());
});

function bootApp() {
  checkLogin();
  loadAnnouncements();
  checkLinuxDOOAuth();
}

window.addEventListener("pageshow", function (event) {
  if (!event.persisted) return;
  currentUser = normalizeCurrentUserValueDeep(currentUser);
  initCsrfToken();
  checkLogin();
});

