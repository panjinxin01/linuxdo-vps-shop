/* =====================================================
   用户区域渲染：头像胶囊 / 下拉菜单 / 工单入口可见性
   来源：js/main.js
   ===================================================== */
// ==================== 用户区域渲染 ====================
function renderUserArea() {
  const area = document.getElementById("userArea");
  const sidebarUserArea = document.getElementById("sidebarUserArea");
  const userNavSection = document.getElementById("userNavSection");
  const username = getCurrentUserName();
  const balance = getCurrentBalance();
  if (currentUser) {
    const initial = escapeHtml((username || "?").charAt(0).toUpperCase());
    const isAdmin = currentRole === "admin";
    // 顶栏：头像胶囊 + 下拉菜单
    if (area) {
      const metaHtml = isAdmin
        ? `<span class="name">${escapeHtml(username)}</span><span class="balance">管理员</span>`
        : `<span class="name">${escapeHtml(username)}</span><span class="balance"><span data-role="user-balance">${balance.toFixed(2)}</span> 积分</span>`;
      const menuItems = [
        isAdmin ? '<a href="admin/index.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>返回后台</a>' : "",
        '<a href="#" onclick="switchPage(\'orders\');return false;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>我的账户</a>',
        '<div class="user-dropdown-divider"></div>',
        '<a href="#" class="danger" onclick="logout();return false;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>退出登录</a>',
      ].join("");
      area.innerHTML = `<div class="user-area-wrap" id="userMenuWrap">
        <button type="button" class="user-menu-btn" id="userMenuBtn" onclick="toggleUserMenu(event)" aria-haspopup="true">
          <span class="avatar">${initial}</span>
          <span class="meta">${metaHtml}</span>
          <svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="user-dropdown" id="userDropdown">${menuItems}</div>
      </div>`;
    }
    // 侧边栏底部用户卡片
    if (sidebarUserArea) {
      sidebarUserArea.innerHTML = `<div class="sidebar-user-card">
        <div class="avatar">${initial}</div>
        <div class="info">
          <div class="name">${escapeHtml(username)}</div>
          <div class="sub">${isAdmin ? "管理员" : `普通用户 · 余额 ${balance.toFixed(2)}`}</div>
        </div>
      </div>`;
    }
    if (userNavSection) userNavSection.style.display = !isAdmin ? "block" : "none";
  } else {
    if (area)
      area.innerHTML =
        '<div class="flex items-center gap-2"><a href="#" class="btn btn-primary btn-sm" style="padding:8px 18px;font-size:13px" onclick="showLogin();return false;">登录</a></div>';
    if (sidebarUserArea)
      sidebarUserArea.innerHTML =
        '<button class="btn btn-primary" style="width:100%;padding:10px;" onclick="showLogin()">登录</button>';
    if (userNavSection) userNavSection.style.display = "none";
  }
  updateWelcomeCard();
  updateHomeStats();
  updateTicketEntryVisibility();
}

/* ==================== 「发起新工单」按钮可见性控制 ====================
 * 修复：未登录用户和管理员账号在前台也能看到 + 发起新工单 按钮的问题。
 * 规则：仅普通用户（已登录且 role === "user"）可见。
 */
function updateTicketEntryVisibility() {
  const btn = document.getElementById("tkNewEntryBtn");
  if (!btn) return;
  const visible = !!currentUser && currentRole !== "admin";
  btn.style.display = visible ? "" : "none";
}

// 用户下拉菜单开关
function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  const wrap = document.getElementById("userMenuWrap");
  const dd = document.getElementById("userDropdown");
  if (!wrap || !dd) return;
  const open = dd.classList.toggle("show");
  const btn = document.getElementById("userMenuBtn");
  if (btn) btn.classList.toggle("open", open);
}
document.addEventListener("click", function (e) {
  const wrap = document.getElementById("userMenuWrap");
  if (wrap && !wrap.contains(e.target)) {
    const dd = document.getElementById("userDropdown");
    const btn = document.getElementById("userMenuBtn");
    if (dd) dd.classList.remove("show");
    if (btn) btn.classList.remove("open");
  }
});

