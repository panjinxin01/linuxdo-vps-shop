// ==================== 前台 UI 控制模块（重构版 v20260403） ====================
// 侧边栏、主题切换、Hash 路由、页面数据刷新、头部面包屑联动

// ---------- 侧边栏 ----------
function toggleSidebar() {
  document.body.classList.toggle("sidebar-collapsed");
  localStorage.setItem(
    "sidebarCollapsed",
    document.body.classList.contains("sidebar-collapsed"),
  );
}
function openSidebar() {
  document.body.classList.add("sidebar-open");
}
function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}

// ---------- 页面标题表 ----------
var PAGE_TITLES = {
  home: "面板主页",
  instances: "可用实例",
  buy: "新建实例",
  orders: "我的账户",
  tickets: "我的工单",
  "ticket-new": "发起新工单",
  "ticket-view": "查看工单",
  announcements: "系统公告",
  notifications: "通知中心",
};

// 工单子页（带父级「我的工单」三级面包屑）
var TK_SUB_PAGES = { "ticket-new": 1, "ticket-view": 1 };

// ---------- Hash 参数解析（#ticket-view?id=5 → { page, query }） ----------
function parseRouteHash() {
  var h = (window.location.hash || "").replace(/^#\/?/, "");
  var qi = h.indexOf("?");
  var page = qi >= 0 ? h.slice(0, qi) : h;
  var query = {};
  if (qi >= 0) {
    h.slice(qi + 1)
      .split("&")
      .forEach(function (kv) {
        if (!kv) return;
        var eq = kv.indexOf("=");
        var k = eq >= 0 ? kv.slice(0, eq) : kv;
        var v = eq >= 0 ? kv.slice(eq + 1) : "";
        try {
          query[decodeURIComponent(k)] = decodeURIComponent(v);
        } catch (e) {
          query[k] = v;
        }
      });
  }
  return { page: page, query: query };
}

// ---------- 页面切换（核心） ----------
function switchPage(pageName) {
  // 写入当前路由查询参数（供工单子页读取 id / order）
  try {
    var routeInfo = parseRouteHash();
    window.__ROUTE_QUERY__ = routeInfo.query;
  } catch (e) {}
  if (!document.getElementById("page-" + pageName)) {
    pageName = "home";
  }
  document.querySelectorAll(".nav-item").forEach(function (item) {
    // 注意：此处不能写 item.classList.toggle("active", cond,) 这种带尾参的形式——
    // 部分移动端内核（如实测的 Chromium 120 / X5）在显式传 undefined 时会把
    // force 误判为真，导致不存在 active 的项也被加上类（首次进入全部高亮的 bug）。
    // 改用显式 add/remove，行为在任何引擎下都一致。
    var isActive =
      item.dataset.page === pageName ||
      (TK_SUB_PAGES[pageName] && item.dataset.page === "tickets");
    if (isActive) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
  document.querySelectorAll(".page-content").forEach(function (page) {
    page.classList.toggle("active", page.id === "page-" + pageName);
  });
  var headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = PAGE_TITLES[pageName] || "面板主页";
  // 头部面包屑联动：主页单层模式（仅标题），其余页显示「控制台 › 当前页」
  // 工单子页显示三级：「控制台 › 我的工单 › 发起新工单 / 查看工单」
  var breadcrumb = document.getElementById("breadcrumb");
  if (breadcrumb) breadcrumb.classList.toggle("single", pageName === "home");
  var oldMid = document.getElementById("crumbTkMid");
  if (oldMid) {
    var sep = oldMid.nextElementSibling;
    if (sep && sep.classList && sep.classList.contains("crumb-sep")) sep.remove();
    oldMid.remove();
  }
  if (TK_SUB_PAGES[pageName] && headerTitle) {
    headerTitle.insertAdjacentHTML(
      "beforebegin",
      '<a href="#tickets" class="crumb crumb-link" id="crumbTkMid">我的工单</a><svg class="crumb-sep" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>',
    );
  }
  // 同步地址栏 hash（replaceState 不触发 hashchange，避免循环）
  try {
    var targetHash =
      pageName === "home"
        ? ""
        : "#" +
          pageName +
          (TK_SUB_PAGES[pageName] && window.__ROUTE_QUERY__
            ? "?" +
              Object.keys(window.__ROUTE_QUERY__)
                .map(function (k) {
                  return (
                    encodeURIComponent(k) +
                    "=" +
                    encodeURIComponent(window.__ROUTE_QUERY__[k])
                  );
                })
                .join("&")
            : "");
    if ((window.location.hash || "") !== targetHash) {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search + targetHash,
      );
    }
  } catch (e) {}
  closeSidebar();
  window.scrollTo(0, 0);
  refreshPageData(pageName);
}

// 页面级数据刷新（登录/未登录均安全）
function refreshPageData(pageName) {
  var isAdmin = typeof currentRole !== "undefined" && currentRole === "admin";

  if (pageName === "notifications") {
    if (typeof loadNotificationPage === "function") loadNotificationPage();
  }

  // 管理员在前台只看提示，不拉取业务列表
  if (isAdmin) {
    if (
      pageName === "tickets" ||
      TK_SUB_PAGES[pageName] ||
      pageName === "orders" ||
      pageName === "instances" ||
      pageName === "buy"
    ) {
      if (typeof renderAdminFrontendHints === "function") renderAdminFrontendHints();
    }
    return;
  }

  if (pageName === "tickets" && typeof loadMyTickets === "function") loadMyTickets();
  if (pageName === "ticket-new" && typeof openTicketNewPage === "function")
    openTicketNewPage((window.__ROUTE_QUERY__ || {}).order || 0);
  if (pageName === "ticket-view" && typeof openTicketView === "function")
    openTicketView((window.__ROUTE_QUERY__ || {}).id || 0);
  if (pageName === "orders" && typeof loadMyOrders === "function") loadMyOrders();
  if (pageName === "instances" && typeof updateManageInstances === "function")
    updateManageInstances();
}

// ---------- Hash 路由 ----------
// 支持 #home / #buy / #orders / #ticket-view?id=5 ... 刷新与前进后退保持页面
// 查询串由 parseRouteHash 剥离（switchPage 只接收纯页面名，参数经 __ROUTE_QUERY__ 传递）
function applyRouteFromHash() {
  var page = parseRouteHash().page.trim();
  switchPage(page || "home");
}
window.addEventListener("hashchange", applyRouteFromHash);

// ---------- 主题切换 ----------
function toggleTheme() {
  var isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  updateThemeIcon(isDark);
}
function updateThemeIcon(isDark) {
  var icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.innerHTML = isDark
    ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
    : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
}

// ---------- 初始化 ----------
(function initUI() {
  // 恢复侧边栏折叠状态
  if (localStorage.getItem("sidebarCollapsed") === "true") {
    document.body.classList.add("sidebar-collapsed");
  }
  // 恢复主题（默认深色；index.html 头部脚本已提前处理防闪烁）
  var saved = localStorage.getItem("theme");
  var isDark = saved !== "light";
  document.documentElement.classList.toggle("dark", isDark);
  updateThemeIcon(isDark);

  // 初始路由：按 hash 恢复页面
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyRouteFromHash);
  } else {
    applyRouteFromHash();
  }

  // 滚动监听：头部阴影
  window.addEventListener(
    "scroll",
    function () {
      var header = document.querySelector(".header");
      if (header) header.classList.toggle("scrolled", window.scrollY > 20);
    },
    { passive: true },
  );

  // ESC 关闭弹窗 / 抽屉
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    // ticketModal / ticketDetailModal 已随 v20260825 页面化移除
    ["authModal", "buyModal", "successModal", "refundModal", "productDetailModal", "orderDetailModal", "announcementModal"].forEach(function (id) {
      var m = document.getElementById(id);
      if (m && m.classList.contains("show")) m.classList.remove("show");
    });
    closeNotificationPanel();
    closeSidebar();
  });
})();