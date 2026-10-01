/* =====================================================
   认证模块：登录态 / OAuth / 安装态提示 / 登录注册登出
   来源：js/main.js
   ===================================================== */
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
        currentUser = null; currentRole = null; cachedOrderList = []; cachedPaidOrderList = [];
        renderUserArea(); loadProducts(); loadMyOrders(); loadMyTickets(); stopNotificationPolling();
      }
    })
    .catch(() => { currentUser = null; currentRole = null; cachedOrderList = []; cachedPaidOrderList = []; renderUserArea(); loadProducts(); loadMyOrders(); loadMyTickets(); });
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
    currentUser = null; currentRole = null; cachedOrderList = []; cachedPaidOrderList = []; stopNotificationPolling();
    renderUserArea(); loadProducts(); loadMyOrders(); loadMyTickets();
    const ce = document.getElementById("creditTransactions"); if (ce) ce.innerHTML = "暂无流水";
    const bs = document.getElementById("creditBalanceSummary"); if (bs) bs.textContent = "--";
    const bh = document.getElementById("creditBalanceHint"); if (bh) bh.textContent = "登录后查看余额信息";
    initCsrfToken();
  });
}

