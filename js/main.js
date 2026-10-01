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

// ==================== 认证模块 ====================
function checkLinuxDOOAuth() {
  apiFetch("api/oauth.php?action=check").then((r) => r.json())
    .then((data) => { if (data.code === 1 && data.data.configured) linuxdoOAuthConfigured = true; })
    .catch(() => { linuxdoOAuthConfigured = false; });
}
function loginWithLinuxDO() { window.location.href = "api/oauth.php?action=login"; }

function checkLogin() {
  apiFetch("api/user.php?action=check").then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        currentUser = normalizeCurrentUserValueDeep(data.data && data.data.user ? data.data.user : { username: data.data.username || "" });
        currentRole = data.data.role || "user";
        renderUserArea();
        loadProducts();
        if (currentRole === "user") { loadMyOrders(); loadMyTickets(); loadCreditSummary(); loadCreditTransactions(); initNotifications(); }
        else if (currentRole === "admin") { renderAdminFrontendHints(); renderAvailableInstances([]); }
        else { renderAvailableInstances([]); }
      } else {
        currentUser = null; currentRole = null; cachedOrderList = [];
        renderUserArea(); loadProducts(); loadMyOrders(); loadMyTickets(); stopNotificationPolling();
      }
    })
    .catch(() => { currentUser = null; currentRole = null; cachedOrderList = []; renderUserArea(); loadProducts(); loadMyOrders(); loadMyTickets(); });
}

function renderInstallStateNotice(state) {
  if (!state || typeof document === "undefined") return;

  let html = "";
  if (!state.config_ok || !state.tables_ok) {
    html = '<div id="installStateNotice" class="install-state-notice warning">当前站点尚未完成安装，公开前台不再强制跳转后台。请前往 <a href="admin/install.html">安装向导</a> 完成初始化。</div>';
  } else if (!state.admin_ok) {
    html = '<div id="installStateNotice" class="install-state-notice info">数据库已安装，但尚未创建管理员。请按需前往 <a href="admin/setup.html">管理员初始化</a>。</div>';
  }

  const wrapper = document.getElementById("globalNoticeArea");
  const mount = document.getElementById("globalInstallStateNotice");
  if (mount) {
    mount.innerHTML = html;
    if (wrapper) wrapper.classList.toggle("show", !!html);
    return;
  }

  const stale = document.getElementById("installStateNotice");
  if (stale) stale.remove();
  if (!html) return;

  const container =
    document.querySelector(".page-content.active .dashboard-container") ||
    document.querySelector(".page-content.active .container") ||
    document.querySelector(".main-content") ||
    document.querySelector("main") ||
    document.body;
  if (!container) return;
  container.insertAdjacentHTML("afterbegin", html);
}


// ==================== 管理员前台提示 ====================
function renderAdminFrontendHints() {
  const adminHint = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div><p>当前为管理员账号，请前往<a href="admin/index.html" style="color:var(--primary);text-decoration:underline;margin:0 4px">后台管理</a>查看</p></div>';
  const targets = { myTickets: adminHint, myOrders: adminHint, buyProductList: adminHint, productList: adminHint };
  Object.keys(targets).forEach(function(id) { const el = document.getElementById(id); if (el) el.innerHTML = targets[id]; });
}

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

function setGuestHomeInstanceCards() {
  // 新仪表盘：游客态显示提示
  const bal = document.getElementById("dashBalance");
  if (bal) bal.textContent = "登录后查看";
  const tags = document.getElementById("manageInstanceTags");
  const empty = document.getElementById("manageInstanceEmpty");
  if (tags) tags.innerHTML = "";
  if (empty) empty.style.display = "block";

  const manageCard = document.getElementById("manageInstanceCard");
  if (manageCard) {
    if (!manageCard.dataset.originalHtml) manageCard.dataset.originalHtml = manageCard.innerHTML;
    manageCard.innerHTML = '<div class="dash-card-title">实例管理</div><div class="dash-card-body"><div class="dash-empty">登录后查看您的有效实例、连接信息与管理入口 <a href="#" onclick="showLogin();return false;">立即登录 →</a></div></div>';
  }
}

function restoreHomeInstanceCards() {
  const manageCard = document.getElementById("manageInstanceCard");
  if (manageCard && manageCard.dataset.originalHtml && manageCard.innerHTML !== manageCard.dataset.originalHtml) {
    manageCard.innerHTML = manageCard.dataset.originalHtml;
  }
}

function updateHomeStats() {
  if (!currentUser) setGuestHomeInstanceCards();
  else restoreHomeInstanceCards();

  // 仪表盘三统计卡
  const bal = document.getElementById("dashBalance");
  if (bal) bal.textContent = currentUser ? getCurrentBalance().toFixed(2) + " 积分" : "登录后查看";
  const inst = document.getElementById("dashInstances");
  if (inst) inst.textContent = (currentUser && currentRole === "user") ? (orderPagination.total || 0) + " 台" : "0 台";
  updateDashExpiring();

  // 旧的 statInstances 兼容
  const s = document.getElementById("statInstances");
  if (s) s.textContent = (currentUser && currentRole === "user") ? (orderPagination.total || "0") : "0";
  // 首页订单余额卡片在未登录时也做友好提示
  const balSummary = document.getElementById("creditBalanceSummary");
  const balHint = document.getElementById("creditBalanceHint");
  if (!currentUser) {
    if (balSummary) balSummary.textContent = "--";
    if (balHint) balHint.textContent = "登录后查看余额信息";
  }
  updateManageInstances();
}

// ==================== 仪表盘：即将过期统计 ====================
function updateDashExpiring() {
  const el = document.getElementById("dashExpiring");
  if (!el) return;
  const list = currentRole === "user" ? (cachedOrderList || []) : [];
  const count = list.filter((o) => {
    if (parseInt(o.status || 0) !== 1) return false;
    if (!o.expire_at) return false;
    const diff = new Date(o.expire_at.replace(/-/g, "/")).getTime() - Date.now();
    return diff > 0 && diff < 7 * 24 * 3600 * 1000; // 7天内到期
  }).length;
  el.textContent = count + " 台";
}

// ==================== 仪表盘：待办工单表格 ====================
function updateDashTickets(ticketList) {
  const body = document.getElementById("dashTicketBody");
  const empty = document.getElementById("dashTicketEmpty");
  const table = document.querySelector("#dashTicketTable .dash-table");
  if (!body || !empty || !table) return;
  // 进行中的工单 = 状态非关闭的工单（status: 0=待回复 1=已回复/处理中，2=已关闭）
  const list = (Array.isArray(ticketList) ? ticketList : (typeof TicketState !== "undefined" && TicketState.myTicketsCache) || [])
    .filter((t) => parseInt(t.status || 0) !== 2);
  if (!list.length) {
    table.style.display = "none";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  table.style.display = "";
  const stMap = { 0: "待回复", 1: "处理中" };
  body.innerHTML = list.slice(0, 6).map((t) => `<tr onclick="showTicketDetail(${parseInt(t.id)})">
      <td>#${parseInt(t.id)}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title || "-")}</td>
      <td>${escapeHtml((t.created_at || "").slice(0, 16))}</td>
      <td>${escapeHtml((t.updated_at || "-").slice(0, 16))}</td>
      <td>${escapeHtml(stMap[parseInt(t.status)] || "处理中")}</td>
      <td><span style="color:var(--primary)">查看</span></td>
    </tr>`).join("");
}

// ==================== 仪表盘：公告轮播 + 右侧公告列表 ====================
function updateDashAnnouncements(announcements) {
  const swiper = document.getElementById("announcementSwiper");
  const sideList = document.getElementById("dashAnnouncementList");
  const list = Array.isArray(announcements) ? announcements : [];
  if (swiper) {
    if (!list.length) {
      swiper.innerHTML = '<h5 class="swiper-h5">🈚 暂无公告</h5><p class="swiper-p">最近没有啥新鲜事，值得挂在这里。</p>';
    } else {
      // 简易轮播：每 5 秒切换一条
      swiper.dataset.annList = JSON.stringify(list.map((a) => ({ t: a.title, c: (a.content || "").replace(/<[^>]+>/g, "").slice(0, 120) })));
      if (!swiper.dataset.timerSet) {
        swiper.dataset.timerSet = "1";
        let idx = 0;
        setInterval(() => {
          let arr = [];
          try { arr = JSON.parse(swiper.dataset.annList || "[]"); } catch (e) {}
          if (arr.length > 1) {
            idx = (idx + 1) % arr.length;
            swiper.innerHTML = '<h5 class="swiper-h5">📌 ' + escapeHtml(arr[idx].t) + '</h5><p class="swiper-p">' + escapeHtml(arr[idx].c) + "</p>";
          }
        }, 5000);
      }
    }
  }
  if (sideList) {
    if (!list.length) {
      sideList.innerHTML = '<div class="dash-ann-item dash-ann-empty">暂无公告</div>';
    } else {
      sideList.innerHTML = list.slice(0, 5).map((a) => {
        const tagMap = { announcement: "公告", notice: "公告", maintenance: "维护", security: "安全" };
        const tag = tagMap[a.type] || a.type || "公告";
        const date = (a.publish_at || a.created_at || "").slice(5, 10);
        return `<div class="dash-ann-item" onclick="showAnnouncement(${a.id})"><span class="dash-ann-tag">${escapeHtml(tag)}</span><span class="dash-ann-title">${escapeHtml(a.title)}</span><span class="dash-ann-date">${escapeHtml(date)}</span></div>`;
      }).join("");
    }
  }
}

function updateWelcomeCard() {
  currentUser = normalizeCurrentUserValueDeep(currentUser);
  const greeting = document.getElementById("welcomeGreeting");
  const avatar = document.getElementById("welcomeAvatar");
  const quote = document.getElementById("welcomeQuote");
  if (!greeting) return;
  const h = new Date().getHours();
  let tg = "您好";
  if (h >= 5 && h < 12) tg = "早上好"; else if (h >= 12 && h < 14) tg = "中午好";
  else if (h >= 14 && h < 18) tg = "下午好"; else if (h >= 18 && h < 22) tg = "晚上好"; else tg = "夜深了";
  const un = safeUserNameFrom(currentUser);
  greeting.textContent = un ? tg + "！" + un : "欢迎访问";
  if (quote) {
    quote.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;flex-shrink:0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><span>' + (un ? '使用积分兑换高性能VPS云服务器' : '登录后查看并兑换高性能VPS云服务器') + '</span>';
  }
  if (!avatar) return;
  if (un) { avatar.classList.add("has-user"); avatar.innerHTML = '<span style="font-size:24px;font-weight:600;">' + escapeHtml(un.charAt(0).toUpperCase()) + "</span>"; }
  else { avatar.classList.remove("has-user"); avatar.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'; }
}

function updateManageInstances(orderList) {
  const card = document.getElementById("manageInstanceCard");
  if (!card) return;

  if (!currentUser) {
    setGuestHomeInstanceCards();
    renderAvailableInstances([]);
    return;
  }

  restoreHomeInstanceCards();
  const tags = document.getElementById("manageInstanceTags");
  if (!tags) return;

  const list = currentRole === "user"
    ? (orderList || cachedOrderList || []).filter((o) => parseInt(o.status || 0) === 1)
    : [];

  if (!list.length) {
    card.style.display = "none";
    const s = document.getElementById("statInstances");
    if (s) s.textContent = currentRole === "user" ? "0" : s.textContent;
    renderAvailableInstances([]);
    return;
  }
  card.style.display = "block";
  tags.innerHTML = list.slice(0, 8).map((o) => `<span class="instance-tag" onclick="switchPage('instances')"><span class="status-dot"></span>${escapeHtml(o.product_name || "VPS-" + o.id)}</span>`).join("");
  const s = document.getElementById("statInstances"); if (s) s.textContent = String(list.length);
  renderAvailableInstances(list);
}

// ==================== 登录 / 注册（v20260828 起独立页面化：login.html） ====================
// showLogin / showRegister 由原弹窗改为跳转独立登录页，保留函数名以兼容旧调用点。
function showLogin() { window.location.href = "login.html"; }
function showRegister() { window.location.href = "login.html?mode=register"; }
function closeAuth() { window.location.href = "login.html"; }

function doAuth() {
  const username = document.getElementById("authUser").value.trim();
  const password = document.getElementById("authPass").value;
  const email = document.getElementById("authEmail").value.trim();
  if (!username || !password) { alert("请填写用户名和密码"); return; }
  const body = new FormData();
  body.append("action", isLoginMode ? "login" : "register");
  body.append("username", username);
  body.append("password", password);
  if (!isLoginMode && email) body.append("email", email);
  apiFetch("api/user.php", { method: "POST", body }).then((r) => r.json()).then((data) => {
    if (data.code !== 1) { alert(data.msg || "操作失败"); return; }
    closeAuth();
    if (isLoginMode) {
      if (data.data.role === "admin") { window.location.href = "admin/index.html"; return; }
      currentUser = data.data && data.data.user ? data.data.user : { username: data.data.username || username, credit_balance: data.data.credit_balance || 0 };
      currentRole = "user"; renderUserArea(); loadMyOrders(); loadMyTickets(); loadCreditSummary(); loadCreditTransactions(); initNotifications();
    } else { alert("注册成功，请登录"); showLogin(); }
  });
}

function logout() {
  apiFetch("api/user.php", { method: "POST", body: new URLSearchParams({ action: "logout" }) }).then(() => {
    currentUser = null; currentRole = null; cachedOrderList = []; stopNotificationPolling();
    renderUserArea(); loadProducts(); loadMyOrders(); loadMyTickets();
    const ce = document.getElementById("creditTransactions"); if (ce) ce.innerHTML = "暂无流水";
    const bs = document.getElementById("creditBalanceSummary"); if (bs) bs.textContent = "--";
    const bh = document.getElementById("creditBalanceHint"); if (bh) bh.textContent = "登录后查看余额信息";
    initCsrfToken();
  });
}

// ==================== 商品 / 购买 ====================
let currentDetailProduct = null;

function loadProducts() {
  const c = document.getElementById("buyProductList");
  if (!c) return;
  if (!currentUser) {
    c.innerHTML = renderLoginRequired('登录后查看可购买配置', {
      icon: 'cart',
      sub: '请登录后查看并兑换高性能VPS云服务器'
    });
    return;
  }
  apiFetch("api/products.php?action=list").then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !Array.isArray(data.data)) { c.innerHTML = `<p style="color:var(--danger);text-align:center;padding:40px;">${escapeHtml(data.msg || "加载失败")}</p>`; return; }
    productCache = {};
    data.data.forEach((p) => { productCache[p.id] = p; });
    if (!data.data.length) { c.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div><p>暂无可购买配置</p></div>'; return; }
    c.innerHTML = data.data.map((p) => {
      const canBuy = p.can_buy !== 0 && p.can_buy !== false;
      const buyText = canBuy ? "立即购买" : (p.buy_block_reason || "暂不可购");
      const tdh = parseFloat(p.trust_discount_amount || 0) > 0 ? `<div style="font-size:12px;color:var(--success);margin-top:6px">${escapeHtml(p.trust_discount_label || "社区等级优惠")}</div>` : "";
      const tplH = p.template_name ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px">模板：${escapeHtml(p.template_name)}</div>` : "";
      return `<div class="card buy-card" data-id="${p.id}"><h3>${escapeHtml(p.name || "")}</h3>
        <div class="specs"><div class="spec"><small>CPU</small><div class="spec-value">${escapeHtml(p.cpu || "-")}</div></div><div class="spec"><small>内存</small><div class="spec-value">${escapeHtml(p.memory || "-")}</div></div><div class="spec"><small>硬盘</small><div class="spec-value">${escapeHtml(p.disk || "-")}</div></div><div class="spec"><small>带宽</small><div class="spec-value">${escapeHtml(p.bandwidth || "-")}</div></div></div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:12px;line-height:1.8">
          ${p.region ? `<div>地区：${escapeHtml(p.region)}</div>` : ""}${p.line_type ? `<div>线路：${escapeHtml(p.line_type)}</div>` : ""}${p.os_type ? `<div>系统：${escapeHtml(p.os_type)}</div>` : ""}
          ${p.min_trust_level ? `<div>最低信任等级：TL${escapeHtml(String(p.min_trust_level))}</div>` : ""}${p.risk_review ? '<div style="color:var(--warning)">此商品可能进入人工审核</div>' : ""}
          ${p.buy_block_reason && !canBuy ? `<div style="color:var(--danger)">${escapeHtml(p.buy_block_reason)}</div>` : ""}${tplH}${tdh}</div>
        <div class="card-footer"><div><div class="price">${parseFloat(p.price || 0).toFixed(2)}<span>积分/月</span></div>${parseFloat(p.base_price || p.price || 0) > parseFloat(p.price || 0) ? `<div style="font-size:12px;color:var(--text-muted)">原价 ${parseFloat(p.base_price).toFixed(2)}</div>` : ""}</div>
          <div style="display:flex;gap:8px"><button class="btn btn-outline" onclick="showProductDetail(${p.id})">详情</button><button class="btn ${canBuy ? "btn-primary" : "btn-outline"}" ${canBuy ? "" : "disabled"} onclick="buyProductById(${p.id})">${escapeHtml(buyText)}</button></div></div></div>`;
    }).join("");
  }).catch(() => { const c = document.getElementById("buyProductList"); if (c) c.innerHTML = '<p style="color:var(--danger);text-align:center;padding:40px;">加载失败，请刷新重试</p>'; });
}

function showProductDetail(id) {
  const p = productCache[id]; if (!p) return;
  currentDetailProduct = p;
  document.getElementById("productDetailTitle").textContent = p.name;
  document.getElementById("productDetailBody").innerHTML = `<div style="margin-bottom:20px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${[["CPU",p.cpu],["内存",p.memory],["硬盘",p.disk],["带宽",p.bandwidth]].map(([l,v])=>`<div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:var(--radius-md)"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${l}</div><div style="font-size:16px;font-weight:600;color:var(--text-main)">${escapeHtml(v)||"-"}</div></div>`).join("")}</div></div>
    <div style="background:var(--primary-light);padding:16px;border-radius:var(--radius-md);text-align:center"><div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">价格</div><div style="font-size:28px;font-weight:700;color:var(--primary)">${p.price}<span style="font-size:14px;font-weight:400">积分/月</span></div></div>
    <div style="margin-top:16px;padding:12px;background:rgba(0,0,0,0.1);border-radius:var(--radius-md);font-size:13px;color:var(--text-muted);line-height:1.6"><div style="margin-bottom:8px;font-weight:500;color:var(--text-light)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>购买须知</div><ul style="margin:0;padding-left:20px"><li>购买后立即生效，有效期1个月</li><li>支付完成后将获得VPS连接信息</li><li>如有问题请通过工单系统联系客服</li></ul></div>`;
  document.getElementById("productDetailModal").classList.add("show");
}
function closeProductDetail() { document.getElementById("productDetailModal").classList.remove("show"); currentDetailProduct = null; }
function buyFromDetail() { if (currentDetailProduct) { closeProductDetail(); buyProductById(currentDetailProduct.id); } }
function buyProductById(id) { const p = productCache[id]; if (p) buyProduct(p.id, p.name, p.price); }

function buyProduct(id, name, price) {
  if (!currentUser) { showLogin(); return; }
  const p = productCache[id] || { id, name, price };
  if (p.can_buy === false || p.can_buy === 0 || p.can_buy === "0") { alert(p.buy_block_reason || "当前商品暂不可购买"); return; }
  selectedProduct = p; currentCoupon = null;
  const ci = document.getElementById("couponCode"), cm = document.getElementById("couponMsg");
  if (ci) ci.value = ""; if (cm) { cm.textContent = ""; cm.className = "coupon-msg"; }
  renderOrderSummary(); loadCreditSummary();
  document.getElementById("buyModal").classList.add("show");
}

function renderOrderSummary() {
  if (!selectedProduct) return;
  const bp = parseFloat(selectedProduct.base_price || selectedProduct.price || 0) || 0;
  const td = parseFloat(selectedProduct.trust_discount_amount || 0) || 0;
  const cd = currentCoupon ? parseFloat(currentCoupon.discount || 0) || 0 : 0;
  const pay = currentCoupon ? parseFloat(currentCoupon.final || 0) || 0 : parseFloat(selectedProduct.price || 0) || 0;
  const bal = getCurrentBalance();
  let h = `<div class="summary-row"><span>商品名称</span><span style="color:var(--text-main)">${escapeHtml(selectedProduct.name || "")}</span></div><div class="summary-row"><span>购买时长</span><span style="color:var(--text-main)">1个月</span></div><div class="summary-row"><span>原价</span><span style="color:var(--text-main)">${bp.toFixed(2)} 积分</span></div>`;
  if (td > 0) h += `<div class="summary-row discount-row"><span>社区等级优惠</span><span>-${td.toFixed(2)} 积分</span></div>`;
  if (cd > 0) h += `<div class="summary-row discount-row"><span>优惠券折扣</span><span>-${cd.toFixed(2)} 积分</span></div>`;
  h += `<div class="summary-row" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)"><span>应付积分</span><span class="final-price">${pay.toFixed(2)}</span></div><div class="summary-row"><span>当前余额</span><span style="color:${bal >= pay ? "var(--success)" : "var(--danger)"}">${bal.toFixed(2)} 积分</span></div>`;
  const el = document.getElementById("orderSummary"); if (el) el.innerHTML = h;
}

function validateCoupon() {
  if (!selectedProduct) return;
  const ci = document.getElementById("couponCode"), me = document.getElementById("couponMsg"), code = ci.value.trim();
  if (!code) { me.textContent = "请输入优惠券码"; me.className = "coupon-msg error"; return; }
  const body = new FormData(); body.append("action", "validate"); body.append("coupon_code", code); body.append("product_id", selectedProduct.id);
  me.textContent = "验证中..."; me.className = "coupon-msg";
  apiFetch("api/coupons.php", { method: "POST", body }).then((r) => r.json()).then((data) => {
    if (data.code === 1) { currentCoupon = { code, discount: data.data.discount, final: data.data.final }; me.textContent = `验证成功：优惠 ${data.data.discount} 积分`; me.className = "coupon-msg success"; }
    else { currentCoupon = null; me.textContent = data.msg; me.className = "coupon-msg error"; }
    renderOrderSummary();
  }).catch(() => { me.textContent = "验证失败，请重试"; me.className = "coupon-msg error"; });
}

function closeBuy() { document.getElementById("buyModal").classList.remove("show"); selectedProduct = null; currentCoupon = null; }

function confirmBuy(method = "epay") {
  if (!selectedProduct) return;
  const body = new FormData(); body.append("action", "create"); body.append("product_id", selectedProduct.id);
  if (currentCoupon) body.append("coupon_code", currentCoupon.code);
  apiFetch("api/orders.php", { method: "POST", body }).then((r) => r.json()).then((data) => {
    if (data.code !== 1) { alert(data.msg || "创建订单失败"); return; }
    const orderNo = data.data.order_no;
    if (method === "balance") {
      const pb = new FormData(); pb.append("action", "pay_balance"); pb.append("order_no", orderNo);
      apiFetch("api/orders.php", { method: "POST", body: pb }).then((r) => r.json()).then((pd) => {
        if (pd.code === 1) { showToast("余额支付成功"); closeBuy(); loadCreditSummary(); loadCreditTransactions(); loadMyOrders(); loadProducts(); switchPage("orders"); }
        else { alert(pd.msg || "余额支付失败"); }
      }); return;
    }
    closeBuy(); window.location.href = "api/pay.php?order_no=" + encodeURIComponent(orderNo);
  });
}
function closeSuccess() { document.getElementById("successModal").classList.remove("show"); loadProducts(); loadMyOrders(); }

// ==================== 订单列表 ====================
function loadMyOrders(page = 1) {
  orderPagination.page = page;
  const container = document.getElementById("myOrders");
  if (!currentUser) {
    if (container) container.innerHTML = renderLoginRequired('登录后查看订单记录', {
      icon: 'order',
      sub: '管理您的VPS订单、查看交付状态与余额流水'
    });
    renderAvailableInstances([]);
    return;
  }
  if (container) container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">加载中...</p>';
  apiFetch("api/orders.php?action=my&page=" + page + "&page_size=" + orderPagination.pageSize).then((r) => r.json()).then((data) => {
    removePaginationWidget("orderPagination");
    if (data.code !== 1 || !data.data) { if (container) container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">' + escapeHtml(data.msg || "加载失败") + "</p>"; renderAvailableInstances([]); return; }
    orderPagination.total = parseInt(data.data.total || 0);
    orderPagination.totalPages = parseInt(data.data.total_pages || 0);
    const orders = Array.isArray(data.data.list) ? data.data.list : [];
    cachedOrderList = orders;
    updateManageInstances(orders);
    if (!container) return;
    if (!orders.length) { container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div><p>暂无订单记录</p></div>'; return; }
    const pmMap = { pending: "待支付", balance: "余额支付", epay: "Linux DO Credit", ldcpay: "Linux DO Credit" };
    const dmMap = { pending: "待支付", paid_waiting: "待开通", provisioning: "处理中", delivered: "已交付", exception: "异常", refunded: "已退款", cancelled: "已取消" };
    container.innerHTML = orders.map((o) => {
      const ns = parseInt(o.status || 0);
      const st = ["待支付", "已支付", "已退款", "已取消"][ns] || "未知";
      const sc = ns === 1 ? "on" : ns === 0 ? "wait" : "off";
      const dk = o.delivery_status || (ns === 1 ? "paid_waiting" : ns === 0 ? "pending" : ns === 2 ? "refunded" : "cancelled");
      const dt = escapeHtml(o.delivery_status_text || dmMap[dk] || dk);
      const rpm = o.payment_method || (ns === 1 && parseFloat(o.balance_paid_amount || 0) > 0 ? "balance" : ns === 1 ? "epay" : "pending");
      const pm = escapeHtml(pmMap[rpm] || rpm || "-");
      const title = escapeHtml(getDisplayProductName(o));
      const ctBtn = `<button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="event.stopPropagation();showCreateTicket(${parseInt(o.id)});">发起工单</button>`;
      const rfBtn = canRequestRefund(o) ? `<button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="event.stopPropagation();requestRefund(${parseInt(o.id || 0)}, '${escapeHtml(o.order_no || "")}', ${parseFloat(o.price || 0)});">申请退款</button>` : "";
      const pyBtn = ns === 0 ? `<button class="btn btn-primary" style="padding:4px 10px;font-size:12px" onclick="event.stopPropagation();window.location.href='api/pay.php?order_no=${encodeURIComponent(o.order_no)}'">去支付</button>` : "";
      return `<div class="order-item" onclick="showOrderDetail(${parseInt(o.id)})" style="cursor:pointer"><div class="order-header"><span style="font-weight:600">${title}</span><span class="badge ${sc}">${st}</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:13px;color:var(--text-muted)"><div>订单号：<code>${escapeHtml(o.order_no || "")}</code></div><div>支付方式：${pm}</div><div>交付状态：${dt}</div><div>创建时间：${escapeHtml(o.created_at || "")}</div></div>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">${ctBtn}${rfBtn}${pyBtn}</div></div>`;
    }).join("");
    renderAvailableInstances(orders);
    if (orderPagination.totalPages > 1) {
      renderPaginationWidget("orderPagination", page, orderPagination.totalPages, "loadMyOrders", container, orderPagination.total);
    }
  }).catch(() => { removePaginationWidget("orderPagination"); if (container) container.innerHTML = '<p style="color:var(--danger);text-align:center;padding:20px;">加载订单失败</p>'; });
}

// ==================== 订单详情弹窗 ====================
function showOrderDetail(id) {
  const cached = (cachedOrderList || []).find((item) => parseInt(item.id || 0) === parseInt(id || 0));
  if (cached) {
    const cs = parseInt(cached.status || 0), cd = String(cached.delivery_status || "");
    if (cs === 2 || cd === "refunded") return alert("当前订单已退款，不可查看详情");
    if (cs === 3 || cd === "cancelled") return alert("当前订单已取消，不可查看详情");
  }
  const url = cached && cached.order_no ? "api/orders.php?action=detail&order_no=" + encodeURIComponent(cached.order_no) : "api/orders.php?action=detail&id=" + encodeURIComponent(id);
  apiFetch(url).then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !data.data) return alert(data.msg || "获取订单详情失败");
    const o = data.data, ns = parseInt(o.status || 0);
    const st = ["待支付", "已支付", "已退款", "已取消"][ns] || "未知";
    const sc = ns === 1 ? "on" : ns === 0 ? "wait" : "off";
    const dMap = { pending: "待支付", paid_waiting: "待开通", provisioning: "处理中", delivered: "已交付", exception: "异常", refunded: "已退款", cancelled: "已取消" };
    const dt = escapeHtml(o.delivery_status_text || dMap[o.delivery_status || ""] || o.delivery_status || "-");
    const rfBtn = canRequestRefund(o) ? `<button class="btn btn-outline" style="flex:1;min-width:0;white-space:nowrap" onclick="requestRefund(${parseInt(o.id || 0)}, '${escapeHtml(o.order_no || "")}', ${parseFloat(o.refundable_amount || 0)})">申请退款</button>` : "";
    const tkBtn = `<button class="btn btn-outline" style="flex:1;min-width:0;white-space:nowrap" onclick="showCreateTicket(${parseInt(o.id || 0)});closeOrderDetail();">发起工单</button>`;
    document.getElementById("orderDetailTitle").textContent = "订单详情";
    document.getElementById("orderDetailBody").innerHTML = `
      <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:18px;font-weight:700;color:var(--text-main)">${escapeHtml(getDisplayProductName(o))}</div><div style="margin-top:8px;color:var(--text-muted);font-size:13px">订单号：<code>${escapeHtml(o.order_no || "")}</code></div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><span class="badge ${sc}">${st}</span><span class="badge ${o.delivery_status === "delivered" ? "on" : o.delivery_status === "exception" ? "off" : "wait"}">${dt}</span></div></div></div>
      <div class="order-info-grid">
        <div class="order-info-item"><strong>支付方式：</strong>${escapeHtml(o.payment_method || "-")}</div>
        <div class="order-info-item"><strong>金额：</strong>${parseFloat(o.price || 0).toFixed(2)} 积分</div>
        <div class="order-info-item"><strong>当前可退：</strong>${getRefundAmountText(o)}</div>
        ${o.remaining_days !== undefined ? `<div class="order-info-item"><strong>剩余时长：</strong>${parseFloat(o.remaining_days || 0).toFixed(2)} 天</div>` : ""}
        ${o.service_end_at ? `<div class="order-info-item"><strong>预计到期：</strong>${escapeHtml(o.service_end_at)}</div>` : ""}
        ${o.trade_no ? `<div class="order-info-item"><strong>交易号：</strong>${escapeHtml(o.trade_no)}</div>` : ""}
        <div class="order-info-item"><strong>交付状态：</strong>${dt}</div>
        <div class="order-info-item"><strong>创建时间：</strong>${escapeHtml(o.created_at || "")}</div>
        ${o.paid_at ? `<div class="order-info-item"><strong>支付时间：</strong>${escapeHtml(o.paid_at)}</div>` : ""}
        ${o.delivery_updated_at ? `<div class="order-info-item"><strong>交付更新时间：</strong>${escapeHtml(o.delivery_updated_at)}</div>` : ""}
        ${o.refund_at ? `<div class="order-info-item"><strong>退款时间：</strong>${escapeHtml(o.refund_at)}${o.refund_reason ? `（${escapeHtml(o.refund_reason)}）` : ""}</div>` : ""}
      </div>
      ${o.delivery_info ? `<div style="margin-top:16px"><div style="font-weight:600;margin-bottom:8px">交付信息</div><div class="vps-info" style="white-space:pre-wrap;font-family:inherit">${escapeHtml(o.delivery_info)}</div></div>` : ""}
      ${o.delivery_note ? `<div style="margin-top:16px"><div style="font-weight:600;margin-bottom:8px">交付备注</div><div class="vps-info" style="white-space:pre-wrap;font-family:inherit">${escapeHtml(o.delivery_note)}</div></div>` : ""}
      ${o.delivery_error ? `<div style="margin-top:16px"><div style="font-weight:600;margin-bottom:8px">异常说明</div><div class="vps-info" style="white-space:pre-wrap;font-family:inherit">${escapeHtml(o.delivery_error)}</div></div>` : ""}
      ${buildOrderCredentialView(o)}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">${tkBtn}${rfBtn}</div>`;
    document.getElementById("orderDetailModal").classList.add("show");
  }).catch(() => alert("获取订单详情失败"));
}

// ==================== 公告模块 ====================
function loadAnnouncements() {
  apiFetch("api/announcements.php?action=list").then((r) => r.json()).then((data) => {
    const container = document.getElementById("announcementList");
    const scrollList = document.getElementById("announcementScrollList");
    const hasData = data.code === 1 && data.data && data.data.length > 0;
    updateDashAnnouncements(hasData ? data.data : []);
    if (!hasData) {
      if (container) container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div><p>暂无公告</p></div>';
      if (scrollList) scrollList.innerHTML = '<div class="announcement-scroll-empty">暂无公告</div>';
      return;
    }
    if (container) container.innerHTML = data.data.map((a) => `<div class="announcement-item ${a.is_top == 1 ? "top" : ""}" onclick="showAnnouncement(${a.id})">${a.is_top == 1 ? '<span class="announcement-tag">置顶</span>' : ""}<span class="announcement-title">${escapeHtml(a.title)}</span><span class="announcement-date">${escapeHtml((a.publish_at || a.created_at)?.split(" ")[0] || "")}</span></div>`).join("");
    if (scrollList) scrollList.innerHTML = data.data.map((a) => {
      const iconHtml = a.is_top == 1
        ? '<span class="tag">置顶</span>'
        : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:2px"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
      return `<div class="announcement-scroll-item" onclick="showAnnouncement(${a.id})"><div class="announcement-scroll-title">${iconHtml} ${escapeHtml(a.title)}</div><div class="announcement-scroll-desc">${escapeHtml((a.content || "").substring(0, 100))}</div><a href="#" class="announcement-scroll-link" onclick="event.stopPropagation();showAnnouncement(${a.id})">详情及修复办法</a></div>`;
    }).join("");
  }).catch(() => { const c = document.getElementById("announcementList"); if (c) c.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div><p>加载失败</p></div>'; });
}

function showAnnouncement(id) {
  apiFetch("api/announcements.php?action=detail&id=" + id).then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) {
      document.getElementById("announcementTitle").textContent = data.data.title;
      document.getElementById("announcementBody").innerHTML = `<div style="color:var(--text-muted);font-size:13px;margin-bottom:16px">发布时间：${escapeHtml(data.data.publish_at || data.data.created_at)}</div><div style="line-height:1.8;white-space:pre-wrap">${escapeHtml(data.data.content)}</div>`;
      document.getElementById("announcementModal").classList.add("show");
    }
  });
}
function closeAnnouncementModal() { document.getElementById("announcementModal").classList.remove("show"); }


// ==================== 余额 / 资料 ====================
function getCurrentUserName() { currentUser = normalizeCurrentUserValueDeep(currentUser); return safeUserNameFrom(currentUser); }
function getCurrentBalance() { if (!currentUser || typeof currentUser !== "object") return 0; return parseFloat(currentUser.credit_balance || 0) || 0; }

function loadCreditSummary() {
  if (!currentUser || currentRole !== "user") return;
  apiFetch("api/credits.php?action=summary").then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !data.data) return;
    if (typeof currentUser === "object") currentUser.credit_balance = data.data.balance;
    const ae = document.getElementById("creditBalanceSummary"), he = document.getElementById("creditBalanceHint"), be = document.getElementById("buyBalanceAmount");
    const bal = (parseFloat(data.data.balance) || 0).toFixed(2);
    if (ae) ae.textContent = bal + " 积分";
    if (he) he.textContent = "最近变动：" + (data.data.last_change_at || "暂无");
    if (be) be.textContent = bal + " 积分";
    // 局部更新 sidebar 和 header 中的余额文字，避免整体重渲染
    document.querySelectorAll("[data-role='user-balance']").forEach((el) => { el.textContent = bal; });
  });
}

function loadCreditTransactions() {
  if (!currentUser || currentRole !== "user") return;
  apiFetch("api/credits.php?action=my_transactions&page_size=5").then((r) => r.json()).then((data) => {
    const box = document.getElementById("creditTransactions"); if (!box) return;
    if (data.code !== 1 || !data.data || !data.data.list || data.data.list.length === 0) { box.innerHTML = '<div style="color:var(--text-muted)">暂无流水</div>'; return; }
    box.innerHTML = data.data.list.map((i) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px"><div><div style="color:var(--text-main)">${escapeHtml(i.type || "adjust")}</div><div style="color:var(--text-muted)">${escapeHtml(i.remark || "-")}</div></div><div style="text-align:right"><div style="color:${parseFloat(i.amount) >= 0 ? "var(--success)" : "var(--danger)"}">${parseFloat(i.amount) >= 0 ? "+" : ""}${parseFloat(i.amount).toFixed(2)}</div><div style="color:var(--text-muted)">${escapeHtml(i.created_at || "")}</div></div></div>`).join("");
  });
}

// ==================== 可用实例渲染 ====================
function renderAvailableInstances(orderList) {
  const container = document.getElementById("productList");
  if (!container) return;
  if (!currentUser || currentRole !== "user") {
    container.innerHTML = renderLoginRequired('登录后查看您的实例', {
      icon: 'server',
      sub: '登录账户即可管理已开通的VPS实例与连接信息'
    });
    return;
  }
  const list = (orderList || cachedOrderList || []).filter((o) => { const s = parseInt(o.status || 0), d = String(o.delivery_status || ""); return s === 1 && d !== "refunded" && d !== "cancelled"; });
  if (!list.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div><p>暂无可用实例，前往<a href="#" onclick="switchPage(\'buy\');return false" style="color:var(--primary);margin:0 4px">新建实例</a>开始使用</p></div>';
    return;
  }
  container.innerHTML = list.map((o) => {
    const dt = escapeHtml(o.delivery_status_text || o.delivery_status || "-");
    const sc = o.delivery_status === "delivered" ? "on" : o.delivery_status === "exception" ? "off" : "wait";
    const hc = !!(o.ip_address || o.ssh_user || o.ssh_password);
    const rfBtn = canRequestRefund(o) ? `<button class="btn btn-outline" onclick="event.stopPropagation();requestRefund(${parseInt(o.id || 0)}, '${escapeHtml(o.order_no || "")}', ${parseFloat(o.price || 0)})">申请退款</button>` : "";
    return `<div class="card" data-order-no="${escapeHtml(o.order_no || "")}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:12px"><div><h3 style="margin-bottom:6px">${escapeHtml(getDisplayProductName(o))}</h3><div style="font-size:12px;color:var(--text-muted)">订单号：<code>${escapeHtml(o.order_no || "")}</code></div></div><span class="badge ${sc}">${dt}</span></div>
      <div class="specs"><div class="spec"><small>CPU</small><div class="spec-value">${escapeHtml(o.cpu || "-")}</div></div><div class="spec"><small>内存</small><div class="spec-value">${escapeHtml(o.memory || "-")}</div></div><div class="spec"><small>硬盘</small><div class="spec-value">${escapeHtml(o.disk || "-")}</div></div><div class="spec"><small>带宽</small><div class="spec-value">${escapeHtml(o.bandwidth || "-")}</div></div></div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:14px;line-height:1.8"><div>交付状态：${dt}</div><div>创建时间：${escapeHtml(o.created_at || "")}</div>${o.delivery_note ? `<div>备注：${escapeHtml(o.delivery_note)}</div>` : ""}${hc ? `<div style="margin-top:8px;padding:10px;border-radius:10px;background:rgba(255,255,255,0.04)"><div>IP：<code>${escapeHtml(o.ip_address || "-")}</code></div><div>端口：<code>${escapeHtml(String(o.ssh_port || "22"))}</code></div><div>用户：<code>${escapeHtml(o.ssh_user || "root")}</code></div></div>` : '<div style="margin-top:8px;color:var(--warning)">实例凭据将在交付完成后显示</div>'}</div>
      <div class="card-footer" style="margin-top:14px"><div class="price">${parseFloat(o.price || 0).toFixed(2)}<span>积分</span></div><div style="display:flex;gap:8px;flex-wrap:wrap">${hc ? `<button class="btn btn-outline" data-ip="${escapeHtml(o.ip_address || "")}" data-port="${escapeHtml(String(o.ssh_port || "22"))}" data-user="${escapeHtml(o.ssh_user || "root")}" data-pass="${escapeHtml(o.ssh_password || "")}" onclick="copyAllVpsFromData(this)">复制全部</button>` : ""}${rfBtn}<button class="btn btn-primary" onclick="showOrderDetail(${parseInt(o.id || 0)})">订单详情</button></div></div></div>`;
  }).join("");
}

// ==================== 工具函数 ====================
function normalizeCurrentUserValueDeep(value) {
  if (!value) return null;
  if (typeof value === "string") return { username: value, credit_balance: 0 };
  if (typeof value === "object") {
    if (value.user && typeof value.user === "object") return normalizeCurrentUserValueDeep(value.user);
    if (value.username && typeof value.username === "object") return normalizeCurrentUserValueDeep(value.username);
    return value;
  }
  return { username: String(value), credit_balance: 0 };
}

function safeUserNameFrom(value) {
  const u = normalizeCurrentUserValueDeep(value);
  if (!u) return "";
  const candidates = [u.username, u.linuxdo_username, u.name, u.linuxdo_name];
  for (let i = 0; i < candidates.length; i++) { const item = candidates[i]; if (typeof item === "string" && item.trim() !== "") return item.trim(); }
  return "";
}