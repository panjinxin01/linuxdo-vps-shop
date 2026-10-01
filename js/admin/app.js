/* =====================================================
   后台启动引导：API 基址 / 标题表 / 侧边栏 / tab / 初始化 / 数据库检测
   来源：js/admin.js
   ===================================================== */
// 管理后台逻辑 - 模块化版
// 依赖: common.js（apiFetch, escapeHtml, showToast, renderPaginationWidget, removePaginationWidget, formatFileSize）
// API 前缀设置
window.__apiBase = "../";

let productCache = {};
let adminOrderPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };
let auditPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };
let currentAdminInfo = { id: 0, username: "", role: "admin" };

const tabTitles = { dashboard: "仪表盘", products: "商品管理", templates: "商品模板", credits: "积分管理", community: "社区规则", reports: "统计报表", orders: "订单管理", coupons: "优惠券管理", tickets: "工单管理", announcements: "公告管理", admins: "管理员管理", audit_logs: "操作日志", settings: "系统设置" };

// ==================== 侧边栏 / UI ====================
function toggleSidebar() { document.getElementById("sidebar").classList.toggle("open"); document.getElementById("sidebarOverlay").classList.toggle("show"); }
function closeSidebar() { document.getElementById("sidebar").classList.remove("open"); document.getElementById("sidebarOverlay").classList.remove("show"); }
function toggleUserMenu(event) { if (event) event.stopPropagation(); const m = document.getElementById("userMenu"); if (m) m.classList.toggle("show"); }
function closeUserMenu() { const m = document.getElementById("userMenu"); if (m) m.classList.remove("show"); }

function switchTab(tab) {
  document.querySelectorAll(".menu-item").forEach((x) => x.classList.remove("active"));
  const t = document.querySelector(`.menu-item[data-tab="${tab}"]`); if (t) t.classList.add("active");
  document.querySelectorAll(".tab-content").forEach((x) => x.classList.remove("active"));
  const currentTab = document.getElementById(tab);
  if (currentTab) currentTab.classList.add("active");
  const bc = document.getElementById("breadcrumbCurrent"); if (bc) bc.textContent = tabTitles[tab] || tab;
  const main = document.querySelector(".main-content");
  if (main) main.scrollTop = 0;
  document.querySelectorAll(".settings-scroll-container").forEach((el) => { el.scrollTop = 0; });
  /* v20260825：离开工单 tab 时复位详情子视图（避免返回时停留在过期详情/面包屑不一致） */
  if (tab !== "tickets") {
    const tav = document.getElementById("ticketAdminView");
    const tlw = document.getElementById("tkAdminListWrap");
    if (tav && tav.style.display !== "none") {
      tav.style.display = "none";
      if (tlw) tlw.style.display = "";
    }
  }
  if (window.innerWidth <= 768) closeSidebar();
}

function refreshAll() { init(); showToast("数据已刷新"); }

// ==================== 初始化 ====================
document.addEventListener("DOMContentLoaded", () => {
  initCsrfToken("../");
  apiFetch("../api/admin.php?action=check").then((r) => r.json()).then((data) => {
    if (data.code !== 1) window.location.href = "login.html";
    else { if (data.data) { currentAdminInfo = data.data; updateAdminUI(); } init(); }
  });
  document.querySelectorAll(".menu a[data-tab]").forEach((a) => { a.addEventListener("click", (e) => { e.preventDefault(); switchTab(a.dataset.tab); }); });
  document.addEventListener("click", (e) => { const m = document.getElementById("userMenu"), t = document.getElementById("userMenuBtn"); if (!m || !t) return; if (!m.contains(e.target) && !t.contains(e.target)) { m.classList.remove("show"); t.classList.remove("open"); } });
});

function updateAdminUI() {
  const av = document.getElementById("adminAvatar"), nm = document.getElementById("adminName"), rl = document.getElementById("adminRole");
  if (av && currentAdminInfo.username) av.textContent = currentAdminInfo.username.charAt(0).toUpperCase();
  if (nm) nm.textContent = currentAdminInfo.username || "管理员";
  if (rl) rl.textContent = currentAdminInfo.role === "super" ? "超级管理员" : "管理员";
}

function init() {
loadStats(); loadProducts(); loadOrders(); loadCoupons(); loadSettings(); loadLdcPaySettings(); loadOAuthSettings();
loadSmtpSettings(); loadNotificationSettings(); loadCacheStats(); loadTickets(); loadAnnouncements();
loadTicketStats(); loadRecentOrders(); loadRecentTickets(); loadAdmins(); loadAuditLogs();
loadTemplateList(); loadProductTemplateOptions(); loadCreditAdminUsers(); renderCreditTxnPlaceholder();
loadCommunityOverview(); loadReportDashboard(); loadAiSettings(); checkDbMissing();
}

// ==================== 数据库检测 ====================
function checkDbMissing() {
  if (sessionStorage.getItem("dbUpdateDismissed")) return;
  apiFetch("../api/update_db.php?action=check").then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data && !data.data.all_installed && data.data.missing && data.data.missing.length > 0) {
      var el = document.getElementById("dbMissingTables");
      if (el) el.innerHTML = data.data.missing.map((t) => '<code style="background:rgba(0,0,0,0.2);padding:2px 8px;border-radius:4px;margin:2px 4px;display:inline-block">' + escapeHtml(t) + "</code>").join(" ");
      var modal = document.getElementById("dbUpdateModal"); if (modal) modal.classList.add("show");
    }
  }).catch(() => {});
}
function closeDbUpdateModal() { var m = document.getElementById("dbUpdateModal"); if (m) m.classList.remove("show"); sessionStorage.setItem("dbUpdateDismissed", "1"); }

