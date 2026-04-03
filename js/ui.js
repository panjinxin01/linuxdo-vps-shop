// ==================== 前台 UI 控制模块 ====================
// 侧边栏、主题切换、页面路由、滚动监听

// 侧边栏控制
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

// 页面切换
function switchPage(pageName) {
  if (!document.getElementById("page-" + pageName)) {
    pageName = "home";
  }
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageName);
  });
  document.querySelectorAll(".page-content").forEach((page) => {
    page.classList.toggle("active", page.id === "page-" + pageName);
  });
  const titles = {
    home: "首页",
    instances: "可用实例",
    buy: "新建实例",
    orders: "我的订单",
    tickets: "我的工单",
    announcements: "系统公告",
    notifications: "通知中心",
  };
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = titles[pageName] || "首页";
  closeSidebar();
  window.scrollTo(0, 0);
  if (pageName === "notifications" && typeof loadNotificationPage === "function") {
    loadNotificationPage();
  }
  if (pageName === "tickets" && typeof loadMyTickets === "function") {
    loadMyTickets();
  }
  if (pageName === "orders" && typeof loadMyOrders === "function") {
    loadMyOrders();
  }
  if (pageName === "instances" && typeof updateManageInstances === "function") {
    updateManageInstances();
  }
}

// 主题切换
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  updateThemeIcon(isDark);
}
function updateThemeIcon(isDark) {
  var icon = document.getElementById("themeIcon");
  if (!icon) return;
  if (isDark) {
    icon.innerHTML =
      '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else {
    icon.innerHTML =
      '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
}

// 初始化：恢复侧边栏 + 主题 + 滚动监听
(function initUI() {
  // 恢复侧边栏折叠状态
  if (localStorage.getItem("sidebarCollapsed") === "true") {
    document.body.classList.add("sidebar-collapsed");
  }
  // 恢复主题（默认深色）
  var saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.documentElement.classList.remove("dark");
    updateThemeIcon(false);
  } else {
    document.documentElement.classList.add("dark");
    updateThemeIcon(true);
  }
  // 滚动监听
  window.addEventListener("scroll", function () {
    var header = document.querySelector(".header");
    if (header) {
      header.classList.toggle("scrolled", window.scrollY > 20);
    }
  });
})();
