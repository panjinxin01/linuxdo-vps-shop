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
  apiFetch("api/check_install.php")
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        if (!data.data.config_ok || !data.data.tables_ok) { window.location.href = "admin/install.html"; return; }
        if (!data.data.admin_ok) { window.location.href = "admin/setup.html"; return; }
      }
      bootApp();
    })
    .catch(() => bootApp());
});

function bootApp() {
  checkLogin();
  loadProducts();
  loadAnnouncements();
  checkLinuxDOOAuth();
}

window.addEventListener("pageshow", function (event) {
  if (!event.persisted) return;
  currentUser = normalizeCurrentUserValueDeep(currentUser);
  initCsrfToken();
  checkLogin();
  loadProducts();
  if (currentRole === "user" || currentUser) {
    loadMyOrders();
    loadCreditSummary();
    loadCreditTransactions();
  }
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
        if (currentRole === "user") { loadMyOrders(); loadMyTickets(); loadCreditSummary(); loadCreditTransactions(); initNotifications(); }
        else { renderAvailableInstances([]); }
      } else {
        currentUser = null; currentRole = null; cachedOrderList = [];
        renderUserArea(); renderAvailableInstances([]); stopNotificationPolling();
      }
    })
    .catch(() => { currentUser = null; currentRole = null; cachedOrderList = []; renderUserArea(); renderAvailableInstances([]); });
}

// ==================== 用户区域渲染 ====================
function renderUserArea() {
  const area = document.getElementById("userArea");
  const sidebarUserArea = document.getElementById("sidebarUserArea");
  const userNavSection = document.getElementById("userNavSection");
  const username = getCurrentUserName();
  const balance = getCurrentBalance();
  if (currentUser) {
    const adminBtn = currentRole === "admin" ? '<a href="admin/index.html" class="nav-link" style="color:var(--primary)">返回后台</a>' : "";
    if (area) area.innerHTML = `<div class="flex items-center gap-4"><span style="color:var(--text-light)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:2px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escapeHtml(username)}</span>${currentRole === "user" ? `<span style="font-size:12px;color:var(--primary)">余额 ${balance.toFixed(2)}</span>` : ""}${adminBtn}<a href="#" class="nav-link" onclick="logout();return false;">退出</a></div>`;
    if (sidebarUserArea) sidebarUserArea.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:4px 0;"><div style="width:36px;height:36px;background:var(--primary-light);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--primary);font-weight:600;">${escapeHtml((username || "?").charAt(0).toUpperCase())}</div><div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:500;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(username)}</div><div style="font-size:12px;color:var(--text-muted);">${currentRole === "admin" ? "管理员" : `普通用户 · 余额 ${balance.toFixed(2)}`}</div></div></div>`;
    if (userNavSection) userNavSection.style.display = currentRole === "user" ? "block" : "none";
  } else {
    if (area) area.innerHTML = '<div class="flex items-center gap-2"><a href="#" class="nav-link" onclick="showLogin();return false;">登录</a><a href="#" class="btn btn-primary" style="padding:6px 16px;font-size:13px" onclick="showRegister();return false;">注册</a></div>';
    if (sidebarUserArea) sidebarUserArea.innerHTML = '<button class="btn btn-primary" style="width:100%;padding:10px;" onclick="showLogin()">登录 / 注册</button>';
    if (userNavSection) userNavSection.style.display = "none";
  }
  updateWelcomeCard();
  updateHomeStats();
}

function updateHomeStats() {
  const s = document.getElementById("statInstances");
  if (s) s.textContent = (currentUser && currentRole === "user") ? (orderPagination.total || "0") : "0";
  updateManageInstances();
}

function updateWelcomeCard() {
  currentUser = normalizeCurrentUserValueDeep(currentUser);
  const greeting = document.getElementById("welcomeGreeting");
  const avatar = document.getElementById("welcomeAvatar");
  if (!greeting) return;
  const h = new Date().getHours();
  let tg = "您好";
  if (h >= 5 && h < 12) tg = "早上好"; else if (h >= 12 && h < 14) tg = "中午好";
  else if (h >= 14 && h < 18) tg = "下午好"; else if (h >= 18 && h < 22) tg = "晚上好"; else tg = "夜深了";
  const un = safeUserNameFrom(currentUser);
  greeting.textContent = un ? tg + "！" + un : "欢迎访问";
  if (!avatar) return;
  if (un) { avatar.classList.add("has-user"); avatar.innerHTML = '<span style="font-size:24px;font-weight:600;">' + escapeHtml(un.charAt(0).toUpperCase()) + "</span>"; }
  else { avatar.classList.remove("has-user"); avatar.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'; }
}

function updateManageInstances(orderList) {
  const card = document.getElementById("manageInstanceCard");
  const tags = document.getElementById("manageInstanceTags");
  if (!card || !tags) return;
  const list = (orderList || cachedOrderList || []).filter((o) => parseInt(o.status || 0) === 1);
  if (!list.length) { card.style.display = "none"; const s = document.getElementById("statInstances"); if (s) s.textContent = "0"; renderAvailableInstances([]); return; }
  card.style.display = "block";
  tags.innerHTML = list.slice(0, 8).map((o) => `<span class="instance-tag" onclick="switchPage('instances')"><span class="status-dot"></span>${escapeHtml(o.product_name || "VPS-" + o.id)}</span>`).join("");
  const s = document.getElementById("statInstances"); if (s) s.textContent = String(list.length);
  renderAvailableInstances(list);
}

// ==================== 登录 / 注册弹窗 ====================
function showLogin() {
  isLoginMode = true;
  document.getElementById("authTitle").textContent = "登录";
  document.getElementById("authBtn").textContent = "登录";
  document.getElementById("emailGroup").style.display = "none";
  document.getElementById("authSwitch").innerHTML = '没有账号？<a href="#" style="color:var(--primary)" onclick="showRegister();return false;">立即注册</a>';
  document.getElementById("authUser").value = "";
  document.getElementById("authPass").value = "";
  const od = document.getElementById("oauthDivider"), lb = document.getElementById("linuxdoLoginBtn");
  if (linuxdoOAuthConfigured) { od.style.display = "flex"; lb.style.display = "flex"; }
  else { od.style.display = "none"; lb.style.display = "none"; }
  document.getElementById("authModal").classList.add("show");
}
function showRegister() {
  isLoginMode = false;
  document.getElementById("authTitle").textContent = "注册";
  document.getElementById("authBtn").textContent = "注册";
  document.getElementById("emailGroup").style.display = "block";
  document.getElementById("authSwitch").innerHTML = '已有账号？<a href="#" style="color:var(--primary)" onclick="showLogin();return false;">立即登录</a>';
  document.getElementById("authUser").value = "";
  document.getElementById("authPass").value = "";
  document.getElementById("authEmail").value = "";
  document.getElementById("authModal").classList.add("show");
}
function closeAuth() { document.getElementById("authModal").classList.remove("show"); }

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
    renderUserArea(); renderAvailableInstances([]); loadProducts(); loadMyTickets();
    const ce = document.getElementById("creditTransactions"); if (ce) ce.innerHTML = "暂无流水";
    initCsrfToken();
  });
}

// ==================== 商品 / 购买 ====================
let currentDetailProduct = null;

function loadProducts() {
  const c = document.getElementById("buyProductList");
  if (!c) return;
  if (!currentUser) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div><p>登录后查看可购买配置</p></div>';
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
  if (p.can_buy === false) { alert(p.buy_block_reason || "当前商品暂不可购买"); return; }
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
  if (container) container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">加载中...</p>';
  apiFetch("api/orders.php?action=my&page=" + page + "&page_size=" + orderPagination.pageSize).then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !data.data) { if (container) container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">' + escapeHtml(data.msg || "加载失败") + "</p>"; renderAvailableInstances([]); return; }
    orderPagination.total = parseInt(data.data.total || 0);
    orderPagination.totalPages = parseInt(data.data.total_pages || 0);
    const orders = Array.isArray(data.data.list) ? data.data.list : [];
    cachedOrderList = orders;
    updateManageInstances(orders);
    if (!container) return;
    if (!orders.length) { container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div><p>暂无订单记录</p></div>'; return; }
    const pmMap = { pending: "待支付", balance: "余额支付", epay: "EasyPay" };
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
      removePaginationWidget("orderPagination");
      const anchor = container.closest(".page-content") || container.parentNode;
      renderPaginationWidget("orderPagination", page, orderPagination.totalPages, "loadMyOrders", anchor, orderPagination.total);
    } else { removePaginationWidget("orderPagination"); }
  }).catch(() => { if (container) container.innerHTML = '<p style="color:var(--danger);text-align:center;padding:20px;">加载订单失败</p>'; });
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
    if (data.code !== 1 || !data.data || data.data.length === 0) {
      if (container) container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div><p>暂无公告</p></div>';
      if (scrollList) scrollList.innerHTML = '<div class="announcement-scroll-empty">暂无公告</div>';
      return;
    }
    if (container) container.innerHTML = data.data.map((a) => `<div class="announcement-item ${a.is_top == 1 ? "top" : ""}" onclick="showAnnouncement(${a.id})">${a.is_top == 1 ? '<span class="announcement-tag">置顶</span>' : ""}<span class="announcement-title">${escapeHtml(a.title)}</span><span class="announcement-date">${escapeHtml((a.publish_at || a.created_at)?.split(" ")[0] || "")}</span></div>`).join("");
    if (scrollList) scrollList.innerHTML = data.data.map((a) => `<div class="announcement-scroll-item" onclick="showAnnouncement(${a.id})"><div class="announcement-scroll-title">${a.is_top == 1 ? '<span class="tag">置顶</span>' : "<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:2px"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>"} ${escapeHtml(a.title)}</div><div class="announcement-scroll-desc">${escapeHtml((a.content || "").substring(0, 100))}</div><a href="#" class="announcement-scroll-link" onclick="event.stopPropagation();showAnnouncement(${a.id})">详情及修复办法</a></div>`).join("");
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

// ==================== 工单模块 ====================
function loadMyTickets() {
  const c = document.getElementById("myTickets"); if (!c) return;
  if (!currentUser) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div><p>登录后查看工单记录</p></div>';
    return;
  }
  apiFetch("api/tickets.php?action=my").then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !data.data || data.data.length === 0) { c.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div><p>暂无工单记录</p></div>'; return; }
    const pMap = ["低", "中", "高", "紧急"];
    c.innerHTML = data.data.map((t) => {
      const sc = t.status == 0 ? "wait" : t.status == 1 ? "on" : "off";
      const st = t.status == 0 ? "待回复" : t.status == 1 ? "已回复" : "已关闭";
      return `<div class="order-item" onclick="showTicketDetail(${t.id})" style="cursor:pointer"><div class="order-header"><span style="font-weight:600">${escapeHtml(t.title)}</span><span class="badge ${sc}">${st}</span></div>
        <div style="font-size:13px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div>工单ID：<code style="color:var(--text-light)">#${t.id}</code>${t.order_no ? `<span style="margin:0 8px">|</span>关联订单：${escapeHtml(t.order_no)}` : ""}</div><div>分类：${escapeHtml(t.category || "other")} · 优先级：${pMap[parseInt(t.priority || 1)] || "中"}</div><div>${escapeHtml(t.updated_at)}</div></div></div>`;
    }).join("");
  });
}

function showCreateTicket(orderId = null) {
  if (!currentUser) { showLogin(); return; }
  apiFetch("api/orders.php?action=my&page_size=100").then((r) => r.json()).then((data) => {
    const sel = document.getElementById("ticketOrder"); if (!sel) return;
    sel.innerHTML = '<option value="">不关联订单</option>';
    if (data.code === 1 && data.data && data.data.list) data.data.list.forEach((o) => { sel.innerHTML += `<option value="${o.id}">${escapeHtml(o.order_no)} - ${escapeHtml(o.product_name || "商品已删除")}</option>`; });
    if (orderId) sel.value = String(orderId);
  });
  document.getElementById("ticketTitle").value = "";
  document.getElementById("ticketContent").value = "";
  const cat = document.getElementById("ticketCategory"), pri = document.getElementById("ticketPriority");
  if (cat) cat.value = "other"; if (pri) pri.value = "1";
  document.getElementById("ticketModal").classList.add("show");
}
function closeTicketModal() { document.getElementById("ticketModal").classList.remove("show"); }

function submitTicket() {
  const title = document.getElementById("ticketTitle").value.trim(), content = document.getElementById("ticketContent").value.trim();
  const orderId = document.getElementById("ticketOrder").value;
  const category = document.getElementById("ticketCategory") ? document.getElementById("ticketCategory").value : "other";
  const priority = document.getElementById("ticketPriority") ? document.getElementById("ticketPriority").value : "1";
  if (!title || !content) { alert("请填写标题和问题描述"); return; }
  const body = new FormData(); body.append("action", "create"); body.append("title", title); body.append("content", content); body.append("category", category); body.append("priority", priority);
  if (orderId) body.append("order_id", orderId);
  apiFetch("api/tickets.php", { method: "POST", body }).then((r) => r.json()).then((data) => {
    if (data.code === 1) { showToast("工单提交成功"); closeTicketModal(); loadMyTickets(); } else { alert(data.msg || "提交失败"); }
  });
}

function showTicketDetail(id) {
  Promise.all([
    apiFetch("api/tickets.php?action=detail&id=" + id).then((r) => r.json()),
    apiFetch("api/upload.php?action=list&ticket_id=" + id).then((r) => r.json()).catch(() => ({ code: 0, data: [] })),
  ]).then(([tRes, aRes]) => {
    if (tRes.code !== 1 || !tRes.data) { alert("获取工单详情失败"); return; }
    const t = tRes.data, att = aRes.code === 1 ? aRes.data : [];
    const sc = t.status == 0 ? "wait" : t.status == 1 ? "on" : "off";
    const st = t.status == 0 ? "待回复" : t.status == 1 ? "已回复" : "已关闭";
    document.getElementById("ticketDetailTitle").textContent = t.title;
    const rHtml = (t.replies || []).map((r) => `<div class="ticket-reply ${r.user_id ? "user" : "admin"}"><div class="reply-header"><span class="reply-author">${r.user_id ? escapeHtml(r.username || "用户") : "客服"}</span><span class="reply-time">${escapeHtml(r.created_at)}</span></div><div class="reply-content">${escapeHtml(r.content)}</div></div>`).join("");
    const evHtml = (t.events || []).length ? `<div style="margin:18px 0 10px;font-weight:600">处理时间线</div>` + t.events.map((e) => `<div style="padding:8px 0;border-bottom:1px dashed var(--border);font-size:12px;color:var(--text-muted)"><strong style="color:var(--text-main)">${escapeHtml(e.event_type || "event")}</strong> · ${escapeHtml(e.content || "")}<div style="margin-top:4px">${escapeHtml(e.created_at || "")}</div></div>`).join("") : "";
    let atHtml = "";
    if (att.length > 0) {
      atHtml = `<div class="ticket-attachments"><div class="ticket-attachments-title"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> 附件 (${att.length})</div><div class="ticket-attachments-grid">` + att.map((a) => {
        const u = `api/upload.php?action=download&id=${a.id}`, n = escapeHtml(a.original_name || "附件");
        return (a.mime_type || "").startsWith("image/") ? `<a class="ticket-attachment image" href="${u}" target="_blank"><img src="${u}" alt="${n}"><span class="ticket-attachment-name">${n}</span></a>` : `<a class="ticket-attachment file" href="${u}" target="_blank"><span class="ticket-attachment-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span><span class="ticket-attachment-name">${n}</span></a>`;
      }).join("") + "</div></div>";
    }
    document.getElementById("ticketDetailBody").innerHTML = `<div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)"><span class="badge ${sc}" style="margin-right:12px">${st}</span>${t.order_no ? `<span style="color:var(--text-muted);font-size:13px">关联订单：${escapeHtml(t.order_no)}</span>` : ""}<div style="margin-top:8px;font-size:12px;color:var(--text-muted)">分类：${escapeHtml(t.category || "other")} · 优先级：${escapeHtml(String(t.priority ?? "1"))} · 更新时间：${escapeHtml(t.updated_at || "")}</div></div><div class="ticket-replies">${rHtml}</div>${evHtml}${atHtml}${t.status != 2 ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)"><textarea id="replyContent" rows="3" placeholder="输入回复内容..." style="width:100%;resize:vertical"></textarea><div style="margin-top:8px;display:flex;align-items:center;gap:10px"><input type="file" id="ticketFile" accept="image/*,.txt,.log,.pdf" style="font-size:12px"><button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="uploadUserTicketAttachment(${t.id})">上传</button></div></div>` : ""}`;
    document.getElementById("ticketDetailFoot").innerHTML = t.status != 2 ? `<button class="btn btn-outline" style="flex:1" onclick="closeTicket(${t.id})">关闭工单</button><button class="btn btn-primary" style="flex:1" onclick="replyTicket(${t.id})">发送回复</button>` : `<button class="btn btn-primary" style="width:100%" onclick="closeTicketDetail()">关闭</button>`;
    document.getElementById("ticketDetailModal").classList.add("show");
  });
}
function closeTicketDetail() { document.getElementById("ticketDetailModal").classList.remove("show"); }

function replyTicket(ticketId) {
  const content = document.getElementById("replyContent").value.trim();
  if (!content) { alert("请输入回复内容"); return; }
  const body = new FormData(); body.append("action", "reply"); body.append("ticket_id", ticketId); body.append("content", content);
  apiFetch("api/tickets.php", { method: "POST", body }).then((r) => r.json()).then((data) => { if (data.code === 1) { showTicketDetail(ticketId); loadMyTickets(); } else { alert(data.msg); } });
}

function uploadUserTicketAttachment(ticketId) {
  const fi = document.getElementById("ticketFile");
  if (!fi || !fi.files || !fi.files[0]) { alert("请选择文件"); return; }
  const file = fi.files[0]; if (file.size > 5 * 1024 * 1024) { alert("文件大小不能超过5MB"); return; }
  const body = new FormData(); body.append("action", "ticket"); body.append("ticket_id", ticketId); body.append("file", file);
  apiFetch("api/upload.php", { method: "POST", body }).then((r) => r.json()).then((data) => { if (data.code === 1) { alert("附件上传成功"); fi.value = ""; showTicketDetail(ticketId); } else { alert(data.msg || "上传失败"); } }).catch(() => alert("上传请求失败"));
}

function closeTicket(ticketId) {
  if (!confirm("确定要关闭此工单吗？关闭后无法再回复。")) return;
  const body = new FormData(); body.append("action", "close"); body.append("ticket_id", ticketId);
  apiFetch("api/tickets.php", { method: "POST", body }).then((r) => r.json()).then((data) => { if (data.code === 1) { closeTicketDetail(); loadMyTickets(); } else { alert(data.msg); } });
}

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
    container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div><p>登录后查看您的实例</p></div>';
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
