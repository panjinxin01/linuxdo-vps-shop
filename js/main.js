// VPS积分商城 - 前端逻辑
// ==================== 初始化 / 工具函数 ====================
let currentUser = null;
let selectedProduct = null;
let currentCoupon = null; // 当前使用的优惠券
let notificationInterval = null; // 通知轮询定时器
let isLoginMode = true;
let currentRole = null;
let linuxdoOAuthConfigured = false;
let csrfToken = "";

// 存储商品数据用于购买（避免XSS风险）
let productCache = {};

function initCsrfToken() {
  return window
    .fetch("api/csrf.php", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1 && data.data && data.data.token) {
        csrfToken = data.data.token;
      }
    })
    .catch(() => {});
}

function apiFetch(url, options = {}) {
  const opts = { credentials: "same-origin", cache: "no-store", ...options };
  const method = (opts.method || "GET").toUpperCase();
  const ensureToken =
    !csrfToken && method !== "GET" && method !== "HEAD"
      ? initCsrfToken()
      : Promise.resolve();
  return ensureToken.then(() => {
    const headers = new Headers(opts.headers || {});
    if (csrfToken && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrfToken);
    }
    let requestUrl = url;
    if (method === "GET" && typeof requestUrl === "string") {
      requestUrl +=
        (requestUrl.indexOf("?") >= 0 ? "&" : "?") + "_ts=" + Date.now();
    }
    opts.headers = headers;
    return window.fetch(requestUrl, opts);
  });
}

// 分页状态
let orderPagination = { page: 1, pageSize: 5, total: 0, totalPages: 0 };
// 一键复制功能
function copyToClipboard(text, btn) {
  // 使用现代API或降级方案
  const doCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    } else {
      // 降级方案
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return Promise.resolve();
    }
  };

  doCopy()
    .then(() => {
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = "已复制";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove("copied");
        }, 1500);
      }
      showToast("复制成功");
    })
    .catch(() => {
      showToast("复制失败");
    });
}

// 通过data属性复制（避免XSS）
function copyFromData(btn) {
  if (!credentialCopyAllowedFromDom(btn)) {
    showToast("当前订单状态不允许复制连接信息");
    return;
  }
  const text = btn && btn.dataset ? btn.dataset.copy : "";
  if (text) copyToClipboard(text, btn);
}

// 复制全部VPS信息
function copyAllVpsInfo(ip, port, user, pass) {
  const text = `IP: ${ip}\n端口: ${port}\n用户: ${user}\n密码: ${pass}`;
  copyToClipboard(text, null);
}

// 通过data属性复制全部VPS信息（避免XSS）
function copyAllVpsFromData(btn) {
  if (!credentialCopyAllowedFromDom(btn)) {
    showToast("当前订单状态不允许复制连接信息");
    return;
  }
  const ip = btn && btn.dataset ? btn.dataset.ip : "";
  const port = btn && btn.dataset ? btn.dataset.port : "";
  const user = btn && btn.dataset ? btn.dataset.user : "";
  const pass = btn && btn.dataset ? btn.dataset.pass : "";
  const text = `IP: ${ip}
端口: ${port}
用户: ${user}
密码: ${pass}`;
  copyToClipboard(text, null);
}

// Toast提示
function showToast(msg) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

// HTML转义函数，防止XSS
function parseDeliveryCredentials(text) {
  const raw = String(text || "");
  if (!raw) return {};
  const lines = raw
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean);
  const result = {};
  const patterns = [
    {
      key: "ip_address",
      regex: /^(?:ip|ip地址|ipv4|地址|host|主机)\s*[:：]\s*(.+)$/i,
    },
    { key: "ssh_port", regex: /^(?:ssh端口|端口|port)\s*[:：]\s*(.+)$/i },
    {
      key: "ssh_user",
      regex:
        /^(?:ssh账号|ssh用户|用户名|账号|用户|user|username|login)\s*[:：]\s*(.+)$/i,
    },
    {
      key: "ssh_password",
      regex: /^(?:ssh密码|密码|pass|password|pwd)\s*[:：]\s*(.+)$/i,
    },
  ];
  lines.forEach(function (line) {
    patterns.forEach(function (item) {
      if (result[item.key]) return;
      const match = line.match(item.regex);
      if (match && match[1]) result[item.key] = match[1].trim();
    });
  });
  return result;
}

function buildOrderCredentialView(order) {
  if (!orderCredentialsAllowed(order)) {
    return '<div style="margin-top:14px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.04);color:var(--warning)">当前订单状态不允许查看或复制连接信息</div>';
  }
  const parsed = parseDeliveryCredentials(order.delivery_info || "");
  const ip = order.ip_address || parsed.ip_address || "";
  const port = String(order.ssh_port || parsed.ssh_port || "22");
  const user = order.ssh_user || parsed.ssh_user || "root";
  const pass = order.ssh_password || parsed.ssh_password || "";
  const hasCred = !!(ip || user || pass || parsed.ssh_port || order.ssh_port);
  if (!hasCred) {
    return '<div style="margin-top:14px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.04);color:var(--warning)">当前订单暂未写入连接信息</div>';
  }
  return `<div class="vps-info" style="margin-top:14px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">连接信息</div>
        <div class="vps-row"><span>IP地址</span><div class="vps-value"><code>${escapeHtml(ip)}</code><button class="copy-btn" data-copy="${escapeHtml(ip)}" onclick="copyFromData(this)">复制</button></div></div>
        <div class="vps-row"><span>SSH端口</span><div class="vps-value"><code>${escapeHtml(port)}</code><button class="copy-btn" data-copy="${escapeHtml(port)}" onclick="copyFromData(this)">复制</button></div></div>
        <div class="vps-row"><span>用户名</span><div class="vps-value"><code>${escapeHtml(user)}</code><button class="copy-btn" data-copy="${escapeHtml(user)}" onclick="copyFromData(this)">复制</button></div></div>
        <div class="vps-row"><span>密码</span><div class="vps-value"><code>${escapeHtml(pass)}</code><button class="copy-btn" data-copy="${escapeHtml(pass)}" onclick="copyFromData(this)">复制</button></div></div>
        <div class="vps-copy-all"><button class="btn btn-outline" style="width:100%;padding:8px;font-size:12px" data-ip="${escapeHtml(ip)}" data-port="${escapeHtml(port)}" data-user="${escapeHtml(user)}" data-pass="${escapeHtml(pass)}" onclick="copyAllVpsFromData(this)">📋 复制全部信息</button></div>
    </div>`;
}
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  initCsrfToken();
  // 先检查安装状态
  apiFetch("api/check_install.php")
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        if (!data.data.config_ok || !data.data.tables_ok) {
          window.location.href = "admin/install.html";
          return;
        }
        if (!data.data.admin_ok) {
          window.location.href = "admin/setup.html";
          return;
        }
      }
      // 安装完成后正常加载
      checkLogin();
      loadProducts();
      loadAnnouncements();
      checkLinuxDOOAuth();
    })
    .catch(() => {
      checkLogin();
      loadProducts();
      loadAnnouncements();
      checkLinuxDOOAuth();
    });
});

// ==================== 认证模块 ====================
// 检查Linux DO OAuth配置状态
function checkLinuxDOOAuth() {
  apiFetch("api/oauth.php?action=check")
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1 && data.data.configured) {
        linuxdoOAuthConfigured = true;
      }
    })
    .catch(() => {
      linuxdoOAuthConfigured = false;
    });
}
// 使用Linux DO登录
function loginWithLinuxDO() {
  window.location.href = "api/oauth.php?action=login";
}

// 检查登录状态
function checkLogin() {
  apiFetch("api/user.php?action=check")
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data.code === 1) {
        currentUser = normalizeCurrentUserValueDeep(
          data.data && data.data.user
            ? data.data.user
            : { username: data.data.username || "" },
        );
        currentRole = data.data.role || "user";
        renderUserArea();
        if (currentRole === "user") {
          loadMyOrders();
          loadMyTickets();
          loadCreditSummary();
          loadCreditTransactions();
          initNotifications();
        } else {
          renderAvailableInstances([]);
        }
      } else {
        currentUser = null;
        currentRole = null;
        cachedOrderList = [];
        renderUserArea();
        renderAvailableInstances([]);
        stopNotificationPolling();
      }
    })
    .catch(function () {
      currentUser = null;
      currentRole = null;
      cachedOrderList = [];
      renderUserArea();
      renderAvailableInstances([]);
    });
}
// 渲染用户区域
function renderUserArea() {
  const area = document.getElementById("userArea");
  const sidebarUserArea = document.getElementById("sidebarUserArea");
  const userNavSection = document.getElementById("userNavSection");
  const username = getCurrentUserName();
  const balance = getCurrentBalance();
  if (currentUser) {
    const adminBtn =
      currentRole === "admin"
        ? '<a href="admin/index.html" class="nav-link" style="color:var(--primary)">返回后台</a>'
        : "";
    if (area) {
      area.innerHTML = `
                <div class="flex items-center gap-4">
                    <span style="color:var(--text-light)">👤 ${escapeHtml(username)}</span>
                    ${currentRole === "user" ? `<span style="font-size:12px;color:var(--primary)">余额 ${balance.toFixed(2)}</span>` : ""}
                    ${adminBtn}
                    <a href="#" class="nav-link" onclick="logout();return false;">退出</a>
                </div>`;
    }
    if (sidebarUserArea) {
      sidebarUserArea.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;padding:4px 0;">
                    <div style="width:36px;height:36px;background:var(--primary-light);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--primary);font-weight:600;">${escapeHtml((username || "?").charAt(0).toUpperCase())}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:14px;font-weight:500;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(username)}</div>
                        <div style="font-size:12px;color:var(--text-muted);">${currentRole === "admin" ? "管理员" : `普通用户 · 余额 ${balance.toFixed(2)}`}</div>
                    </div>
                </div>`;
    }
    if (userNavSection)
      userNavSection.style.display = currentRole === "user" ? "block" : "none";
  } else {
    if (area) {
      area.innerHTML = `<div class="flex items-center gap-2"><a href="#" class="nav-link" onclick="showLogin();return false;">登录</a><a href="#" class="btn btn-primary" style="padding:6px 16px;font-size:13px" onclick="showRegister();return false;">注册</a></div>`;
    }
    if (sidebarUserArea)
      sidebarUserArea.innerHTML = `<button class="btn btn-primary" style="width:100%;padding:10px;" onclick="showLogin()">登录 / 注册</button>`;
    if (userNavSection) userNavSection.style.display = "none";
  }
  updateWelcomeCard();
  updateHomeStats();
}
// 更新首页统计数据
function updateHomeStats() {
  // 有效实例数量（从订单统计）
  const statInstances = document.getElementById("statInstances");
  if (statInstances) {
    if (currentUser && currentRole === "user") {
      statInstances.textContent = orderPagination.total || "0";
    } else {
      statInstances.textContent = "0";
    }
  }

  // 更新欢迎卡片
  updateWelcomeCard();
  // 更新管理实例区域
  updateManageInstances();
}

// 更新欢迎卡片
function updateWelcomeCard() {
  currentUser = normalizeCurrentUserValueDeep(currentUser);
  const greeting = document.getElementById("welcomeGreeting");
  const avatar = document.getElementById("welcomeAvatar");
  if (!greeting) return;
  const hour = new Date().getHours();
  let timeGreeting = "您好";
  if (hour >= 5 && hour < 12) timeGreeting = "早上好";
  else if (hour >= 12 && hour < 14) timeGreeting = "中午好";
  else if (hour >= 14 && hour < 18) timeGreeting = "下午好";
  else if (hour >= 18 && hour < 22) timeGreeting = "晚上好";
  else timeGreeting = "夜深了";
  const username = safeUserNameFrom(currentUser);
  greeting.textContent = username ? timeGreeting + "！" + username : "欢迎访问";
  if (!avatar) return;
  if (username) {
    avatar.classList.add("has-user");
    avatar.innerHTML =
      '<span style="font-size:24px;font-weight:600;">' +
      escapeHtml(username.charAt(0).toUpperCase()) +
      "</span>";
  } else {
    avatar.classList.remove("has-user");
    avatar.innerHTML =
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  }
}

// 更新管理实例区域（使用已加载的订单数据，避免重复请求）
let cachedOrderList = null;
function updateManageInstances(orderList) {
  const card = document.getElementById("manageInstanceCard");
  const tags = document.getElementById("manageInstanceTags");
  if (!card || !tags) return;
  const list = (orderList || cachedOrderList || []).filter(
    (o) => parseInt(o.status || 0) === 1,
  );
  if (!list.length) {
    card.style.display = "none";
    const statInstances = document.getElementById("statInstances");
    if (statInstances) statInstances.textContent = "0";
    renderAvailableInstances([]);
    return;
  }
  card.style.display = "block";
  tags.innerHTML = list
    .slice(0, 8)
    .map(
      (o) => `
        <span class="instance-tag" onclick="switchPage('instances')">
            <span class="status-dot"></span>${escapeHtml(o.product_name || "VPS-" + o.id)}
        </span>`,
    )
    .join("");
  const statInstances = document.getElementById("statInstances");
  if (statInstances) statInstances.textContent = String(list.length);
  renderAvailableInstances(list);
}
// 显示订单详情
function showOrderDetail(id) {
  // 先从缓存检查状态，退款/取消的订单直接拦截
  const cached = (cachedOrderList || []).find(function (item) {
    return parseInt(item.id || 0) === parseInt(id || 0);
  });
  if (cached) {
    const cachedStatus = parseInt(cached.status || 0);
    const cachedDelivery = String(cached.delivery_status || "");
    if (cachedStatus === 2 || cachedDelivery === "refunded") {
      return alert("当前订单已退款，不可查看详情");
    }
    if (cachedStatus === 3 || cachedDelivery === "cancelled") {
      return alert("当前订单已取消，不可查看详情");
    }
  }
  const order = cached;
  const url =
    order && order.order_no
      ? "api/orders.php?action=detail&order_no=" +
        encodeURIComponent(order.order_no)
      : "api/orders.php?action=detail&id=" + encodeURIComponent(id);
  apiFetch(url)
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data.code !== 1 || !data.data)
        return alert(data.msg || "获取订单详情失败");
      const o = data.data;
      const numericStatus = parseInt(o.status || 0);
      const statusText =
        ["待支付", "已支付", "已退款", "已取消"][numericStatus] || "未知";
      const statusClass =
        numericStatus === 1 ? "on" : numericStatus === 0 ? "wait" : "off";
      const deliveryMap = {
        pending: "待支付",
        paid_waiting: "待开通",
        provisioning: "处理中",
        delivered: "已交付",
        exception: "异常",
        refunded: "已退款",
        cancelled: "已取消",
      };
      const deliveryText = escapeHtml(
        o.delivery_status_text ||
          deliveryMap[o.delivery_status || ""] ||
          o.delivery_status ||
          "-",
      );
      const refundBtn = canRequestRefund(o)
        ? `<button class="btn btn-outline" style="flex:1;min-width:0;white-space:nowrap" onclick="requestRefund(${parseInt(o.id || 0)}, '${escapeHtml(o.order_no || "")}', ${parseFloat(o.refundable_amount || 0)})">申请退款</button>`
        : "";
      const ticketBtn = `<button class="btn btn-outline" style="flex:1;min-width:0;white-space:nowrap" onclick="showCreateTicket(${parseInt(o.id || 0)});closeOrderDetail();">发起工单</button>`;
      document.getElementById("orderDetailTitle").textContent = "订单详情";
      document.getElementById("orderDetailBody").innerHTML = `
                <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
                    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
                        <div>
                            <div style="font-size:18px;font-weight:700;color:var(--text-main)">${escapeHtml(getDisplayProductName(o))}</div>
                            <div style="margin-top:8px;color:var(--text-muted);font-size:13px">订单号：<code>${escapeHtml(o.order_no || "")}</code></div>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap">
                            <span class="badge ${statusClass}">${statusText}</span>
                            <span class="badge ${o.delivery_status === "delivered" ? "on" : o.delivery_status === "exception" ? "off" : "wait"}">${deliveryText}</span>
                        </div>
                    </div>
                </div>
                <div class="order-info-grid">
                    <div class="order-info-item"><strong>支付方式：</strong>${escapeHtml(o.payment_method || "-")}</div>
                    <div class="order-info-item"><strong>金额：</strong>${parseFloat(o.price || 0).toFixed(2)} 积分</div>
                    <div class="order-info-item"><strong>当前可退：</strong>${getRefundAmountText(o)}</div>
                    ${o.remaining_days !== undefined ? `<div class="order-info-item"><strong>剩余时长：</strong>${parseFloat(o.remaining_days || 0).toFixed(2)} 天</div>` : ""}
                    ${o.service_end_at ? `<div class="order-info-item"><strong>预计到期：</strong>${escapeHtml(o.service_end_at)}</div>` : ""}
                    ${o.trade_no ? `<div class="order-info-item"><strong>交易号：</strong>${escapeHtml(o.trade_no)}</div>` : ""}
                    <div class="order-info-item"><strong>交付状态：</strong>${deliveryText}</div>
                    <div class="order-info-item"><strong>创建时间：</strong>${escapeHtml(o.created_at || "")}</div>
                    ${o.paid_at ? `<div class="order-info-item"><strong>支付时间：</strong>${escapeHtml(o.paid_at)}</div>` : ""}
                    ${o.delivery_updated_at ? `<div class="order-info-item"><strong>交付更新时间：</strong>${escapeHtml(o.delivery_updated_at)}</div>` : ""}
                    ${o.refund_at ? `<div class="order-info-item"><strong>退款时间：</strong>${escapeHtml(o.refund_at)}${o.refund_reason ? `（${escapeHtml(o.refund_reason)}）` : ""}</div>` : ""}
                </div>
                ${o.delivery_info ? `<div style="margin-top:16px"><div style="font-weight:600;margin-bottom:8px">交付信息</div><div class="vps-info" style="white-space:pre-wrap;font-family:inherit">${escapeHtml(o.delivery_info)}</div></div>` : ""}
                ${o.delivery_note ? `<div style="margin-top:16px"><div style="font-weight:600;margin-bottom:8px">交付备注</div><div class="vps-info" style="white-space:pre-wrap;font-family:inherit">${escapeHtml(o.delivery_note)}</div></div>` : ""}
                ${o.delivery_error ? `<div style="margin-top:16px"><div style="font-weight:600;margin-bottom:8px">异常说明</div><div class="vps-info" style="white-space:pre-wrap;font-family:inherit">${escapeHtml(o.delivery_error)}</div></div>` : ""}
                ${buildOrderCredentialView(o)}
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">${ticketBtn}${refundBtn}</div>`;
      document.getElementById("orderDetailModal").classList.add("show");
    })
    .catch(function () {
      alert("获取订单详情失败");
    });
}

// ==================== 商品 / 购买 ====================
// 当前查看详情的商品
let currentDetailProduct = null;

// 加载商品
function loadProducts() {
  apiFetch("api/products.php?action=list")
    .then((r) => r.json())
    .then((data) => {
      const buyContainer = document.getElementById("buyProductList");
      if (!buyContainer) return;
      if (data.code !== 1 || !Array.isArray(data.data)) {
        buyContainer.innerHTML = `<p style="color:var(--danger);text-align:center;padding:40px;">${escapeHtml(data.msg || "加载失败，请刷新重试")}</p>`;
        return;
      }
      productCache = {};
      data.data.forEach((p) => {
        productCache[p.id] = p;
      });
      if (!data.data.length) {
        buyContainer.innerHTML =
          '<div class="empty-state"><div class="empty-icon">📦</div><p>暂无可购买配置</p></div>';
        return;
      }
      const renderCard = (p) => {
        const canBuy = p.can_buy !== 0 && p.can_buy !== false;
        const buyText = canBuy ? "立即购买" : p.buy_block_reason || "暂不可购";
        const trustDiscountHtml =
          parseFloat(p.trust_discount_amount || 0) > 0
            ? `<div style="font-size:12px;color:var(--success);margin-top:6px">${escapeHtml(p.trust_discount_label || "社区等级优惠")}</div>`
            : "";
        const templateHtml = p.template_name
          ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px">模板：${escapeHtml(p.template_name)}</div>`
          : "";
        return `
                    <div class="card buy-card" data-id="${p.id}">
                        <h3>${escapeHtml(p.name || "")}</h3>
                        <div class="specs">
                            <div class="spec"><small>CPU</small><div class="spec-value">${escapeHtml(p.cpu || "-")}</div></div>
                            <div class="spec"><small>内存</small><div class="spec-value">${escapeHtml(p.memory || "-")}</div></div>
                            <div class="spec"><small>硬盘</small><div class="spec-value">${escapeHtml(p.disk || "-")}</div></div>
                            <div class="spec"><small>带宽</small><div class="spec-value">${escapeHtml(p.bandwidth || "-")}</div></div>
                        </div>
                        <div style="font-size:13px;color:var(--text-muted);margin-top:12px;line-height:1.8">
                            ${p.region ? `<div>地区：${escapeHtml(p.region)}</div>` : ""}
                            ${p.line_type ? `<div>线路：${escapeHtml(p.line_type)}</div>` : ""}
                            ${p.os_type ? `<div>系统：${escapeHtml(p.os_type)}</div>` : ""}
                            ${p.min_trust_level ? `<div>最低信任等级：TL${escapeHtml(String(p.min_trust_level))}</div>` : ""}
                            ${p.risk_review ? `<div style="color:var(--warning)">此商品可能进入人工审核</div>` : ""}
                            ${p.buy_block_reason && !canBuy ? `<div style="color:var(--danger)">${escapeHtml(p.buy_block_reason)}</div>` : ""}
                            ${templateHtml}
                            ${trustDiscountHtml}
                        </div>
                        <div class="card-footer">
                            <div>
                                <div class="price">${parseFloat(p.price || 0).toFixed(2)}<span>积分/月</span></div>
                                ${parseFloat(p.base_price || p.price || 0) > parseFloat(p.price || 0) ? `<div style="font-size:12px;color:var(--text-muted)">原价 ${parseFloat(p.base_price).toFixed(2)}</div>` : ""}
                            </div>
                            <div style="display:flex;gap:8px">
                                <button class="btn btn-outline" onclick="showProductDetail(${p.id})">详情</button>
                                <button class="btn ${canBuy ? "btn-primary" : "btn-outline"}" ${canBuy ? "" : "disabled"} onclick="buyProductById(${p.id})">${escapeHtml(buyText)}</button>
                            </div>
                        </div>
                    </div>`;
      };
      buyContainer.innerHTML = data.data.map(renderCard).join("");
    })
    .catch(() => {
      const buyContainer = document.getElementById("buyProductList");
      if (buyContainer)
        buyContainer.innerHTML =
          '<p style="color:var(--danger);text-align:center;padding:40px;">加载失败，请刷新重试</p>';
    });
}

// 显示商品详情弹窗
function showProductDetail(id) {
  const p = productCache[id];
  if (!p) return;

  currentDetailProduct = p;
  document.getElementById("productDetailTitle").textContent = p.name;
  document.getElementById("productDetailBody").innerHTML = `
        <div style="margin-bottom:20px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:var(--radius-md)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">CPU</div>
                    <div style="font-size:16px;font-weight:600;color:var(--text-main)">${escapeHtml(p.cpu) || "-"}</div>
                </div>
                <div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:var(--radius-md)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">内存</div>
                    <div style="font-size:16px;font-weight:600;color:var(--text-main)">${escapeHtml(p.memory) || "-"}</div>
                </div>
                <div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:var(--radius-md)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">硬盘</div>
                    <div style="font-size:16px;font-weight:600;color:var(--text-main)">${escapeHtml(p.disk) || "-"}</div>
                </div>
                <div style="background:rgba(0,0,0,0.2);padding:16px;border-radius:var(--radius-md)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">带宽</div>
                    <div style="font-size:16px;font-weight:600;color:var(--text-main)">${escapeHtml(p.bandwidth) || "-"}</div>
                </div>
            </div>
        </div>
        <div style="background:var(--primary-light);padding:16px;border-radius:var(--radius-md);text-align:center">
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">价格</div>
            <div style="font-size:28px;font-weight:700;color:var(--primary)">${p.price}<span style="font-size:14px;font-weight:400">积分/月</span></div>
        </div><div style="margin-top:16px;padding:12px;background:rgba(0,0,0,0.1);border-radius:var(--radius-md);font-size:13px;color:var(--text-muted);line-height:1.6">
            <div style="margin-bottom:8px;font-weight:500;color:var(--text-light)">📋购买须知</div>
            <ul style="margin:0;padding-left:20px">
                <li>购买后立即生效，有效期1个月</li>
                <li>支付完成后将获得VPS连接信息</li>
                <li>如有问题请通过工单系统联系客服</li>
            </ul>
        </div>
    `;
  document.getElementById("productDetailModal").classList.add("show");
}

// 关闭商品详情弹窗
function closeProductDetail() {
  document.getElementById("productDetailModal").classList.remove("show");
  currentDetailProduct = null;
}
// 从详情弹窗购买
function buyFromDetail() {
  if (currentDetailProduct) {
    closeProductDetail();
    buyProductById(currentDetailProduct.id);
  }
}

// 显示登录
function showLogin() {
  isLoginMode = true;
  document.getElementById("authTitle").textContent = "登录";
  document.getElementById("authBtn").textContent = "登录";
  document.getElementById("emailGroup").style.display = "none";
  document.getElementById("authSwitch").innerHTML =
    '没有账号？<a href="#" style="color:var(--primary)" onclick="showRegister();return false;">立即注册</a>';
  document.getElementById("authUser").value = "";
  document.getElementById("authPass").value = "";
  // 根据OAuth配置状态显示Linux DO登录按钮
  const oauthDivider = document.getElementById("oauthDivider");
  const linuxdoBtn = document.getElementById("linuxdoLoginBtn");
  if (linuxdoOAuthConfigured) {
    oauthDivider.style.display = "flex";
    linuxdoBtn.style.display = "flex";
  } else {
    oauthDivider.style.display = "none";
    linuxdoBtn.style.display = "none";
  }
  document.getElementById("authModal").classList.add("show");
}

// 显示注册
function showRegister() {
  isLoginMode = false;
  document.getElementById("authTitle").textContent = "注册";
  document.getElementById("authBtn").textContent = "注册";
  document.getElementById("emailGroup").style.display = "block";
  document.getElementById("authSwitch").innerHTML =
    '已有账号？<a href="#" style="color:var(--primary)" onclick="showLogin();return false;">立即登录</a>';
  document.getElementById("authUser").value = "";
  document.getElementById("authPass").value = "";
  document.getElementById("authEmail").value = "";
  document.getElementById("authModal").classList.add("show");
}

function closeAuth() {
  document.getElementById("authModal").classList.remove("show");
}

// 登录/注册
function doAuth() {
  const username = document.getElementById("authUser").value.trim();
  const password = document.getElementById("authPass").value;
  const email = document.getElementById("authEmail").value.trim();
  if (!username || !password) {
    alert("请填写用户名和密码");
    return;
  }
  const action = isLoginMode ? "login" : "register";
  const body = new FormData();
  body.append("action", action);
  body.append("username", username);
  body.append("password", password);
  if (!isLoginMode && email) body.append("email", email);
  apiFetch("api/user.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code !== 1) {
        alert(data.msg || "操作失败");
        return;
      }
      closeAuth();
      if (isLoginMode) {
        if (data.data.role === "admin") {
          window.location.href = "admin/index.html";
          return;
        }
        currentUser =
          data.data && data.data.user
            ? data.data.user
            : {
                username: data.data.username || username,
                credit_balance: data.data.credit_balance || 0,
              };
        currentRole = "user";
        renderUserArea();
        loadMyOrders();
        loadMyTickets();
        loadCreditSummary();
        loadCreditTransactions();
        initNotifications();
      } else {
        alert("注册成功，请登录");
        showLogin();
      }
    });
}

// 退出
function logout() {
  apiFetch("api/user.php", {
    method: "POST",
    body: new URLSearchParams({ action: "logout" }),
  }).then(() => {
    currentUser = null;
    currentRole = null;
    cachedOrderList = [];
    stopNotificationPolling();
    renderUserArea();
    renderAvailableInstances([]);
    const orderEl = document.getElementById("myOrders");
    const ticketEl = document.getElementById("myTickets");
    const creditEl = document.getElementById("creditTransactions");
    if (orderEl) orderEl.innerHTML = "";
    if (ticketEl) ticketEl.innerHTML = "";
    if (creditEl) creditEl.innerHTML = "暂无流水";
    initCsrfToken();
  });
}

// 通过ID购买商品（避免XSS风险）
function buyProductById(id) {
  const p = productCache[id];
  if (p) {
    buyProduct(p.id, p.name, p.price);
  }
}
// 购买商品
function buyProduct(id, name, price) {
  if (!currentUser) {
    showLogin();
    return;
  }
  const p = productCache[id] || { id, name, price };
  if (p.can_buy === false) {
    alert(p.buy_block_reason || "当前商品暂不可购买");
    return;
  }
  selectedProduct = p;
  currentCoupon = null;
  const couponInput = document.getElementById("couponCode");
  const couponMsg = document.getElementById("couponMsg");
  if (couponInput) couponInput.value = "";
  if (couponMsg) {
    couponMsg.textContent = "";
    couponMsg.className = "coupon-msg";
  }
  renderOrderSummary();
  loadCreditSummary();
  document.getElementById("buyModal").classList.add("show");
}

// 渲染订单摘要
function renderOrderSummary() {
  if (!selectedProduct) return;
  const basePrice =
    parseFloat(selectedProduct.base_price || selectedProduct.price || 0) || 0;
  const trustDiscount =
    parseFloat(selectedProduct.trust_discount_amount || 0) || 0;
  const couponDiscount = currentCoupon
    ? parseFloat(currentCoupon.discount || 0) || 0
    : 0;
  const payable = currentCoupon
    ? parseFloat(currentCoupon.final || 0) || 0
    : parseFloat(selectedProduct.price || 0) || 0;
  const balance = getCurrentBalance();
  let html = `
        <div class="summary-row"><span>商品名称</span><span style="color:var(--text-main)">${escapeHtml(selectedProduct.name || "")}</span></div>
        <div class="summary-row"><span>购买时长</span><span style="color:var(--text-main)">1个月</span></div>
        <div class="summary-row"><span>原价</span><span style="color:var(--text-main)">${basePrice.toFixed(2)} 积分</span></div>
    `;
  if (trustDiscount > 0)
    html += `<div class="summary-row discount-row"><span>社区等级优惠</span><span>-${trustDiscount.toFixed(2)} 积分</span></div>`;
  if (couponDiscount > 0)
    html += `<div class="summary-row discount-row"><span>优惠券折扣</span><span>-${couponDiscount.toFixed(2)} 积分</span></div>`;
  html += `
        <div class="summary-row" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
            <span>应付积分</span>
            <span class="final-price">${payable.toFixed(2)}</span>
        </div>
        <div class="summary-row"><span>当前余额</span><span style="color:${balance >= payable ? "var(--success)" : "var(--danger)"}">${balance.toFixed(2)} 积分</span></div>
    `;
  const orderSummary = document.getElementById("orderSummary");
  if (orderSummary) orderSummary.innerHTML = html;
}

// 验证优惠券
function validateCoupon() {
  if (!selectedProduct) return;

  const codeInput = document.getElementById("couponCode");
  const msgEl = document.getElementById("couponMsg");
  const code = codeInput.value.trim();

  if (!code) {
    msgEl.textContent = "请输入优惠券码";
    msgEl.className = "coupon-msg error";
    return;
  }

  const body = new FormData();
  body.append("action", "validate");
  body.append("coupon_code", code);
  body.append("product_id", selectedProduct.id);

  msgEl.textContent = "验证中...";
  msgEl.className = "coupon-msg";

  apiFetch("api/coupons.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        currentCoupon = {
          code: code,
          discount: data.data.discount,
          final: data.data.final,
        };
        msgEl.textContent = `验证成功：优惠 ${data.data.discount} 积分`;
        msgEl.className = "coupon-msg success";
        renderOrderSummary();
      } else {
        currentCoupon = null;
        msgEl.textContent = data.msg;
        msgEl.className = "coupon-msg error";
        renderOrderSummary();
      }
    })
    .catch(() => {
      msgEl.textContent = "验证失败，请重试";
      msgEl.className = "coupon-msg error";
    });
}

function closeBuy() {
  document.getElementById("buyModal").classList.remove("show");
  selectedProduct = null;
  currentCoupon = null;
}

// 确认购买
function confirmBuy(method = "epay") {
  if (!selectedProduct) return;
  const body = new FormData();
  body.append("action", "create");
  body.append("product_id", selectedProduct.id);
  if (currentCoupon) body.append("coupon_code", currentCoupon.code);
  apiFetch("api/orders.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code !== 1) {
        alert(data.msg || "创建订单失败");
        return;
      }
      const orderNo = data.data.order_no;
      if (method === "balance") {
        const payBody = new FormData();
        payBody.append("action", "pay_balance");
        payBody.append("order_no", orderNo);
        apiFetch("api/orders.php", { method: "POST", body: payBody })
          .then((r) => r.json())
          .then((payData) => {
            if (payData.code === 1) {
              showToast("余额支付成功");
              closeBuy();
              loadCreditSummary();
              loadCreditTransactions();
              loadMyOrders();
              loadProducts();
              switchPage("orders");
            } else {
              alert(payData.msg || "余额支付失败");
            }
          });
        return;
      }
      closeBuy();
      window.location.href =
        "api/pay.php?order_no=" + encodeURIComponent(orderNo);
    });
}
// 加载我的订单（支持分页）

// ==================== 订单模块 ====================
function loadMyOrders(page = 1) {
  orderPagination.page = page;
  const container = document.getElementById("myOrders");
  if (container)
    container.innerHTML =
      '<p style="color:var(--text-muted);text-align:center;padding:20px;">加载中...</p>';
  apiFetch(
    "api/orders.php?action=my&page=" +
      page +
      "&page_size=" +
      orderPagination.pageSize,
  )
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data.code !== 1 || !data.data) {
        if (container)
          container.innerHTML =
            '<p style="color:var(--text-muted);text-align:center;padding:20px;">' +
            escapeHtml(data.msg || "加载失败") +
            "</p>";
        renderAvailableInstances([]);
        return;
      }
      orderPagination.total = parseInt(data.data.total || 0);
      orderPagination.totalPages = parseInt(data.data.total_pages || 0);
      const orders = Array.isArray(data.data.list) ? data.data.list : [];
      cachedOrderList = orders;
      updateManageInstances(orders);
      if (!container) return;
      if (!orders.length) {
        container.innerHTML =
          '<div class="empty-state"><div class="empty-icon">📋</div><p>暂无订单记录</p></div>';
        return;
      }
      const payMethodMap = {
        pending: "待支付",
        balance: "余额支付",
        epay: "EasyPay",
      };
      const deliveryMap = {
        pending: "待支付",
        paid_waiting: "待开通",
        provisioning: "处理中",
        delivered: "已交付",
        exception: "异常",
        refunded: "已退款",
        cancelled: "已取消",
      };
      const html = orders
        .map(function (o) {
          const numericStatus = parseInt(o.status || 0);
          const statusText =
            ["待支付", "已支付", "已退款", "已取消"][numericStatus] || "未知";
          const statusClass =
            numericStatus === 1 ? "on" : numericStatus === 0 ? "wait" : "off";
          const deliveryKey =
            o.delivery_status ||
            (numericStatus === 1
              ? "paid_waiting"
              : numericStatus === 0
                ? "pending"
                : numericStatus === 2
                  ? "refunded"
                  : "cancelled");
          const deliveryText = escapeHtml(
            o.delivery_status_text || deliveryMap[deliveryKey] || deliveryKey,
          );
          const rawPayMethod =
            o.payment_method ||
            (numericStatus === 1 && parseFloat(o.balance_paid_amount || 0) > 0
              ? "balance"
              : numericStatus === 1
                ? "epay"
                : "pending");
          const payMethod = escapeHtml(
            payMethodMap[rawPayMethod] || rawPayMethod || "-",
          );
          const title = escapeHtml(getDisplayProductName(o));
          const createTicketBtn = `<button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="event.stopPropagation();showCreateTicket(${parseInt(o.id)});">发起工单</button>`;
          const refundBtn = canRequestRefund(o)
            ? `<button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="event.stopPropagation();requestRefund(${parseInt(o.id || 0)}, '${escapeHtml(o.order_no || "")}', ${parseFloat(o.price || 0)});">申请退款</button>`
            : "";
          const payBtn =
            numericStatus === 0
              ? `<button class="btn btn-primary" style="padding:4px 10px;font-size:12px" onclick="event.stopPropagation();window.location.href='api/pay.php?order_no=${encodeURIComponent(o.order_no)}'">去支付</button>`
              : "";
          return `
                    <div class="order-item" onclick="showOrderDetail(${parseInt(o.id)})" style="cursor:pointer">
                        <div class="order-header">
                            <span style="font-weight:600">${title}</span>
                            <span class="badge ${statusClass}">${statusText}</span>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:13px;color:var(--text-muted)">
                            <div>订单号：<code>${escapeHtml(o.order_no || "")}</code></div>
                            <div>支付方式：${payMethod}</div>
                            <div>交付状态：${deliveryText}</div>
                            <div>创建时间：${escapeHtml(o.created_at || "")}</div>
                        </div>
                        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">${createTicketBtn}${refundBtn}${payBtn}</div>
                    </div>`;
        })
        .join("");
      container.innerHTML = html;
      renderAvailableInstances(orders);
      if (typeof renderPagination === "function") renderPagination();
    })
    .catch(function () {
      if (container)
        container.innerHTML =
          '<p style="color:var(--danger);text-align:center;padding:20px;">加载订单失败</p>';
    });
}

// 渲染分页控件
function renderPagination(current, total, callback) {
  let pages = [];
  const delta = 2;
  const left = current - delta;
  const right = current + delta;

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= left && i <= right)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  let html = '<div class="pagination">';
  html += `<button class="page-btn" ${current <= 1 ? "disabled" : ""} onclick="${callback}(${current - 1})">‹</button>`;

  pages.forEach((p) => {
    if (p === "...") {
      html += '<span class="page-dots">...</span>';
    } else {
      html += `<button class="page-btn ${p === current ? "active" : ""}" onclick="${callback}(${p})">${p}</button>`;
    }
  });

  html += `<button class="page-btn" ${current >= total ? "disabled" : ""} onclick="${callback}(${current + 1})">›</button>`;
  html += "</div>";
  return html;
}
function closeSuccess() {
  document.getElementById("successModal").classList.remove("show");
  loadProducts();
  loadMyOrders();
}

// ==================== 公告模块 ====================
// 加载公告
function loadAnnouncements() {
  apiFetch("api/announcements.php?action=list")
    .then((r) => r.json())
    .then((data) => {
      const container = document.getElementById("announcementList");
      const scrollList = document.getElementById("announcementScrollList");

      if (data.code !== 1 || !data.data || data.data.length === 0) {
        if (container)
          container.innerHTML =
            '<div class="empty-state"><div class="empty-icon">📢</div><p>暂无公告</p></div>';
        if (scrollList)
          scrollList.innerHTML =
            '<div class="announcement-scroll-empty">暂无公告</div>';
        return;
      }

      // 公告页面列表
      const announcementHtml = data.data
        .map(
          (a) => `
                <div class="announcement-item ${a.is_top == 1 ? "top" : ""}" onclick="showAnnouncement(${a.id})">
                    ${a.is_top == 1 ? '<span class="announcement-tag">置顶</span>' : ""}
                    <span class="announcement-title">${escapeHtml(a.title)}</span>
                    <span class="announcement-date">${escapeHtml((a.publish_at || a.created_at)?.split(" ")[0] || "")}</span>
                </div>
            `,
        )
        .join("");

      if (container) container.innerHTML = announcementHtml;

      // 首页滚动公告列表
      if (scrollList) {
        scrollList.innerHTML = data.data
          .map(
            (a) => `
                    <div class="announcement-scroll-item" onclick="showAnnouncement(${a.id})">
                        <div class="announcement-scroll-title">
                            ${a.is_top == 1 ? '<span class="tag">置顶</span>' : "🔔"}
                            ${escapeHtml(a.title)}
                        </div>
                        <div class="announcement-scroll-desc">${escapeHtml((a.content || "").substring(0, 100))}</div><a href="#" class="announcement-scroll-link" onclick="event.stopPropagation();showAnnouncement(${a.id})">详情及修复办法</a>
                    </div>
                `,
          )
          .join("");
      }
    })
    .catch(() => {
      const container = document.getElementById("announcementList");
      if (container)
        container.innerHTML =
          '<div class="empty-state"><div class="empty-icon">❌</div><p>加载失败</p></div>';
    });
}
// 显示公告详情
function showAnnouncement(id) {
  apiFetch("api/announcements.php?action=detail&id=" + id)
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1 && data.data) {
        document.getElementById("announcementTitle").textContent =
          data.data.title;
        document.getElementById("announcementBody").innerHTML = `
                    <div style="color:var(--text-muted);font-size:13px;margin-bottom:16px">
                        发布时间：${escapeHtml(data.data.publish_at || data.data.created_at)}
                    </div>
                    <div style="line-height:1.8;white-space:pre-wrap">${escapeHtml(data.data.content)}</div>
                `;
        document.getElementById("announcementModal").classList.add("show");
      }
    });
}

function closeAnnouncementModal() {
  document.getElementById("announcementModal").classList.remove("show");
}

// ==================== 工单模块 ====================
// 加载我的工单
function loadMyTickets() {
  apiFetch("api/tickets.php?action=my")
    .then((r) => r.json())
    .then((data) => {
      const container = document.getElementById("myTickets");
      if (!container) return;
      if (data.code !== 1 || !data.data || data.data.length === 0) {
        container.innerHTML =
          '<p style="color:var(--text-muted);text-align:center;padding:20px;">暂无工单记录</p>';
        return;
      }
      container.innerHTML = data.data
        .map((t) => {
          const statusClass =
            t.status == 0 ? "wait" : t.status == 1 ? "on" : "off";
          const statusText =
            t.status == 0 ? "待回复" : t.status == 1 ? "已回复" : "已关闭";
          const priorityMap = ["低", "中", "高", "紧急"];
          return `
                    <div class="order-item" onclick="showTicketDetail(${t.id})" style="cursor:pointer">
                        <div class="order-header">
                            <span style="font-weight:600">${escapeHtml(t.title)}</span>
                            <span class="badge ${statusClass}">${statusText}</span>
                        </div>
                        <div style="font-size:13px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
                            <div>工单ID：<code style="color:var(--text-light)">#${t.id}</code>${t.order_no ? `<span style="margin:0 8px">|</span>关联订单：${escapeHtml(t.order_no)}` : ""}</div>
                            <div>分类：${escapeHtml(t.category || "other")} · 优先级：${priorityMap[parseInt(t.priority || 1)] || "中"}</div>
                            <div>${escapeHtml(t.updated_at)}</div>
                        </div>
                    </div>`;
        })
        .join("");
    });
}

// 显示创建工单弹窗
function showCreateTicket(orderId = null) {
  if (!currentUser) {
    showLogin();
    return;
  }
  apiFetch("api/orders.php?action=my&page_size=100")
    .then((r) => r.json())
    .then((data) => {
      const select = document.getElementById("ticketOrder");
      if (!select) return;
      select.innerHTML = '<option value="">不关联订单</option>';
      if (data.code === 1 && data.data && data.data.list) {
        data.data.list.forEach((o) => {
          select.innerHTML += `<option value="${o.id}">${escapeHtml(o.order_no)} - ${escapeHtml(o.product_name || "商品已删除")}</option>`;
        });
      }
      if (orderId) select.value = String(orderId);
    });
  document.getElementById("ticketTitle").value = "";
  document.getElementById("ticketContent").value = "";
  const category = document.getElementById("ticketCategory");
  const priority = document.getElementById("ticketPriority");
  if (category) category.value = "other";
  if (priority) priority.value = "1";
  document.getElementById("ticketModal").classList.add("show");
}

function closeTicketModal() {
  document.getElementById("ticketModal").classList.remove("show");
}

// 提交工单
function submitTicket() {
  const title = document.getElementById("ticketTitle").value.trim();
  const content = document.getElementById("ticketContent").value.trim();
  const orderId = document.getElementById("ticketOrder").value;
  const category = document.getElementById("ticketCategory")
    ? document.getElementById("ticketCategory").value
    : "other";
  const priority = document.getElementById("ticketPriority")
    ? document.getElementById("ticketPriority").value
    : "1";
  if (!title || !content) {
    alert("请填写标题和问题描述");
    return;
  }
  const body = new FormData();
  body.append("action", "create");
  body.append("title", title);
  body.append("content", content);
  body.append("category", category);
  body.append("priority", priority);
  if (orderId) body.append("order_id", orderId);
  apiFetch("api/tickets.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        showToast("工单提交成功");
        closeTicketModal();
        loadMyTickets();
      } else {
        alert(data.msg || "提交失败");
      }
    });
}

// 显示工单详情（含附件）
function showTicketDetail(id) {
  Promise.all([
    apiFetch("api/tickets.php?action=detail&id=" + id).then((r) => r.json()),
    apiFetch("api/upload.php?action=list&ticket_id=" + id)
      .then((r) => r.json())
      .catch(() => ({ code: 0, data: [] })),
  ]).then(([ticketRes, attachRes]) => {
    if (ticketRes.code !== 1 || !ticketRes.data) {
      alert("获取工单详情失败");
      return;
    }
    const ticket = ticketRes.data;
    const attachments = attachRes.code === 1 ? attachRes.data : [];
    const statusClass =
      ticket.status == 0 ? "wait" : ticket.status == 1 ? "on" : "off";
    const statusText =
      ticket.status == 0 ? "待回复" : ticket.status == 1 ? "已回复" : "已关闭";
    document.getElementById("ticketDetailTitle").textContent = ticket.title;
    const repliesHtml = (ticket.replies || [])
      .map(
        (r) => `
            <div class="ticket-reply ${r.user_id ? "user" : "admin"}">
                <div class="reply-header"><span class="reply-author">${r.user_id ? escapeHtml(r.username || "用户") : "客服"}</span><span class="reply-time">${escapeHtml(r.created_at)}</span></div>
                <div class="reply-content">${escapeHtml(r.content)}</div>
            </div>`,
      )
      .join("");
    const eventsHtml = (ticket.events || []).length
      ? `<div style="margin:18px 0 10px;font-weight:600">处理时间线</div>` +
        ticket.events
          .map(
            (evt) =>
              `<div style="padding:8px 0;border-bottom:1px dashed var(--border);font-size:12px;color:var(--text-muted)"><strong style="color:var(--text-main)">${escapeHtml(evt.event_type || "event")}</strong> · ${escapeHtml(evt.content || "")}<div style="margin-top:4px">${escapeHtml(evt.created_at || "")}</div></div>`,
          )
          .join("")
      : "";
    let attachHtml = "";
    if (attachments.length > 0) {
      attachHtml =
        `<div class="ticket-attachments"><div class="ticket-attachments-title">📎 附件 (${attachments.length})</div><div class="ticket-attachments-grid">` +
        attachments
          .map((a) => {
            const fileUrl = `api/upload.php?action=download&id=${a.id}`;
            const fileName = escapeHtml(a.original_name || "附件");
            if ((a.mime_type || "").startsWith("image/")) {
              return `<a class="ticket-attachment image" href="${fileUrl}" target="_blank"><img src="${fileUrl}" alt="${fileName}"><span class="ticket-attachment-name">${fileName}</span></a>`;
            }
            return `<a class="ticket-attachment file" href="${fileUrl}" target="_blank"><span class="ticket-attachment-icon">📄</span><span class="ticket-attachment-name">${fileName}</span></a>`;
          })
          .join("") +
        "</div></div>";
    }
    document.getElementById("ticketDetailBody").innerHTML = `
            <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
                <span class="badge ${statusClass}" style="margin-right:12px">${statusText}</span>
                ${ticket.order_no ? `<span style="color:var(--text-muted);font-size:13px">关联订单：${escapeHtml(ticket.order_no)}</span>` : ""}
                <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">分类：${escapeHtml(ticket.category || "other")} · 优先级：${escapeHtml(String(ticket.priority ?? "1"))} · 更新时间：${escapeHtml(ticket.updated_at || "")}</div>
            </div>
            <div class="ticket-replies">${repliesHtml}</div>
            ${eventsHtml}
            ${attachHtml}
            ${ticket.status != 2 ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)"><textarea id="replyContent" rows="3" placeholder="输入回复内容..." style="width:100%;resize:vertical"></textarea><div style="margin-top:8px;display:flex;align-items:center;gap:10px"><input type="file" id="ticketFile" accept="image/*,.txt,.log,.pdf" style="font-size:12px"><button class="btn btn-outline" style="padding:4px 10px;font-size:12px" onclick="uploadUserTicketAttachment(${ticket.id})">上传</button></div></div>` : ""}
        `;
    document.getElementById("ticketDetailFoot").innerHTML =
      ticket.status != 2
        ? `<button class="btn btn-outline" style="flex:1" onclick="closeTicket(${ticket.id})">关闭工单</button><button class="btn btn-primary" style="flex:1" onclick="replyTicket(${ticket.id})">发送回复</button>`
        : `<button class="btn btn-primary" style="width:100%" onclick="closeTicketDetail()">关闭</button>`;
    document.getElementById("ticketDetailModal").classList.add("show");
  });
}

function closeTicketDetail() {
  document.getElementById("ticketDetailModal").classList.remove("show");
}

// 回复工单
function replyTicket(ticketId) {
  const content = document.getElementById("replyContent").value.trim();
  if (!content) {
    alert("请输入回复内容");
    return;
  }

  const body = new FormData();
  body.append("action", "reply");
  body.append("ticket_id", ticketId);
  body.append("content", content);

  apiFetch("api/tickets.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        showTicketDetail(ticketId); // 刷新详情
        loadMyTickets();
      } else {
        alert(data.msg);
      }
    });
}

// 用户上传工单附件
function uploadUserTicketAttachment(ticketId) {
  const fileInput = document.getElementById("ticketFile");
  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    alert("请选择文件");
    return;
  }
  const file = fileInput.files[0];
  if (file.size > 5 * 1024 * 1024) {
    alert("文件大小不能超过5MB");
    return;
  }
  const body = new FormData();
  body.append("action", "ticket");
  body.append("ticket_id", ticketId);
  body.append("file", file);

  apiFetch("api/upload.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        alert("附件上传成功");
        fileInput.value = "";
        showTicketDetail(ticketId);
      } else {
        alert(data.msg || "上传失败");
      }
    })
    .catch(() => alert("上传请求失败"));
}

// 关闭工单
function closeTicket(ticketId) {
  if (!confirm("确定要关闭此工单吗？关闭后无法再回复。")) return;

  const body = new FormData();
  body.append("action", "close");
  body.append("ticket_id", ticketId);
  apiFetch("api/tickets.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        closeTicketDetail();
        loadMyTickets();
      } else {
        alert(data.msg);
      }
    });
}

//========== 通知系统 ==========

// 初始化通知系统

// ==================== 通知模块 ====================
function initNotifications() {
  // 显示通知按钮和面板内容（已登录状态）
  const wrapper = document.getElementById("notificationWrapper");
  const list = document.getElementById("notificationList");
  const footer = document.getElementById("notificationFooter");
  const markAll = document.getElementById("notificationMarkAll");
  const loginPrompt = document.getElementById("notificationLoginPrompt");

  if (wrapper) wrapper.style.display = "block";
  if (list) list.style.display = "block";
  if (footer) footer.style.display = "block";
  if (markAll) markAll.style.display = "block";
  if (loginPrompt) loginPrompt.style.display = "none";

  // 立即加载一次
  loadNotificationCount();

  // 开启轮询（每30秒检查一次）
  startNotificationPolling();

  // 点击其他区域关闭面板
  document.addEventListener("click", handleNotificationOutsideClick);
}

// 开始通知轮询
function startNotificationPolling() {
  if (notificationInterval) {
    clearInterval(notificationInterval);
    notificationInterval = null;
  }
  notificationInterval = setInterval(loadNotificationCount, 30000);
}

// 停止通知轮询（未登录状态）
function stopNotificationPolling() {
  if (notificationInterval) {
    clearInterval(notificationInterval);
    notificationInterval = null;
  }
  // 切换到未登录提示状态
  const list = document.getElementById("notificationList");
  const footer = document.getElementById("notificationFooter");
  const markAll = document.getElementById("notificationMarkAll");
  const loginPrompt = document.getElementById("notificationLoginPrompt");

  if (list) list.style.display = "none";
  if (footer) footer.style.display = "none";
  if (markAll) markAll.style.display = "none";
  if (loginPrompt) loginPrompt.style.display = "block";
}

// 加载未读通知数量
function loadNotificationCount() {
  apiFetch("api/notifications.php?action=unread_count")
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        updateNotificationBadge(data.data.count);
      }
    })
    .catch(() => {});
}

// 更新通知徽章
function updateNotificationBadge(count) {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "block";
  } else {
    badge.style.display = "none";
  }
}

// 切换通知面板
function toggleNotificationPanel(e) {
  e.stopPropagation();
  const panel = document.getElementById("notificationPanel");
  if (!panel) return;

  if (panel.classList.contains("show")) {
    closeNotificationPanel();
  } else {
    openNotificationPanel();
  }
}

// 打开通知面板
function openNotificationPanel() {
  const panel = document.getElementById("notificationPanel");
  if (panel) {
    panel.classList.add("show");
    loadNotifications();
  }
}

// 关闭通知面板
function closeNotificationPanel() {
  const panel = document.getElementById("notificationPanel");
  if (panel) {
    panel.classList.remove("show");
  }
}

// 处理点击外部关闭
function handleNotificationOutsideClick(e) {
  const wrapper = document.getElementById("notificationWrapper");
  if (wrapper && !wrapper.contains(e.target)) {
    closeNotificationPanel();
  }
}

//加载通知列表
function loadNotifications() {
  const list = document.getElementById("notificationList");
  if (!list) return;

  list.innerHTML = '<div class="notification-empty">加载中...</div>';

  apiFetch("api/notifications.php?action=list&page_size=10")
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        renderNotificationList(data.data.list);
        updateNotificationBadge(data.data.unread);
      } else {
        list.innerHTML = '<div class="notification-empty">加载失败</div>';
      }
    })
    .catch(() => {
      list.innerHTML = '<div class="notification-empty">网络错误</div>';
    });
}

// 渲染通知列表
function renderNotificationList(notifications) {
  const list = document.getElementById("notificationList");
  if (!list) return;

  if (!notifications || notifications.length === 0) {
    list.innerHTML = '<div class="notification-empty">暂无通知</div>';
    return;
  }

  const html = notifications
    .map((n) => {
      const iconClass = getNotificationIconClass(n.type);
      const iconSvg = getNotificationIcon(n.type);
      const timeStr = formatNotificationTime(n.created_at);
      const unreadClass = n.is_read == 0 ? "unread" : "";

      return `
            <div class="notification-item ${unreadClass}" data-notif-id="${n.id}" onclick="handleNotificationClick(${n.id}, '${escapeHtml(n.type)}', '${escapeHtml(n.related_id || "")}')">
                <div class="notification-icon ${iconClass}">${iconSvg}</div>
                <div class="notification-content">
                    <div class="notification-content-title">${escapeHtml(n.title)}</div>
                    <div class="notification-content-text">${escapeHtml(n.content)}</div>
                    <div class="notification-time">${timeStr}</div>
                </div>
            </div>
        `;
    })
    .join("");

  list.innerHTML = html;
}

// 获取通知图标样式类
function getNotificationIconClass(type) {
  switch (type) {
    case "payment":
      return "success";
    case "ticket":
      return "warning";
    case "system":
      return "";
    default:
      return "";
  }
}

// 获取通知图标SVG
function getNotificationIcon(type) {
  switch (type) {
    case "payment":
      return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    case "ticket":
      return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    case "system":
    default:
      return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }
}

// 格式化通知时间
function formatNotificationTime(datetime) {
  if (!datetime) return "";

  const date = new Date(datetime);
  const now = new Date();
  const diff = (now - date) / 1000; // 秒

  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + "分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + "小时前";
  if (diff < 604800) return Math.floor(diff / 86400) + "天前";

  return date.toLocaleDateString();
}

// 处理通知点击
function handleNotificationClick(id, type, relatedId) {
  // 标记为已读
  markNotificationRead(id);

  // 根据类型跳转
  closeNotificationPanel();

  // 订单相关通知
  if ((type.startsWith("order_") || type === "payment") && relatedId) {
    switchPage("orders");
    return;
  }

  // 工单相关通知
  if ((type.startsWith("ticket_") || type === "ticket") && relatedId) {
    switchPage("tickets");
    // 尝试打开工单详情
    setTimeout(() => showTicketDetail(parseInt(relatedId)), 300);
    return;
  }
}

// 标记单条通知已读
function markNotificationRead(id) {
  const body = new URLSearchParams();
  body.append("action", "mark_read");
  body.append("id", id);

  apiFetch("api/notifications.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        loadNotificationCount();
        // 更新列表中的样式
        const items = document.querySelectorAll(".notification-item");
        items.forEach((item) => {
          if (item.dataset.notifId === String(id)) {
            item.classList.remove("unread");
          }
        });
      }
    });
}

// 标记全部已读
function markAllNotificationsRead() {
  const body = new URLSearchParams();
  body.append("action", "mark_all_read");

  apiFetch("api/notifications.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        showToast("已全部标记为已读");
        loadNotifications();
        updateNotificationBadge(0);
      }
    });
}

//========== 通知中心全页面 ==========
let notifPageFilter = "all";
let notifPageCurrent = 1;
const NOTIF_PAGE_SIZE = 20;

function loadNotificationPage(filter, page) {
  if (filter) notifPageFilter = filter;
  if (page) notifPageCurrent = page;
  else if (filter) notifPageCurrent = 1;

  // 更新筛选按钮状态
  const btnAll = document.getElementById("notifFilterAll");
  const btnUnread = document.getElementById("notifFilterUnread");
  if (btnAll) btnAll.style.opacity = notifPageFilter === "all" ? "1" : "0.5";
  if (btnUnread)
    btnUnread.style.opacity = notifPageFilter === "unread" ? "1" : "0.5";

  const listEl = document.getElementById("notificationPageList");
  if (!listEl) return;
  listEl.innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--text-muted)">加载中...</div>';

  const onlyUnread = notifPageFilter === "unread" ? "&only_unread=1" : "";
  apiFetch(
    `api/notifications.php?action=list&page=${notifPageCurrent}&page_size=${NOTIF_PAGE_SIZE}${onlyUnread}`,
  )
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        renderNotificationPage(data.data);
      } else {
        listEl.innerHTML =
          '<div style="text-align:center;padding:40px;color:var(--text-muted)">加载失败</div>';
      }
    })
    .catch(() => {
      listEl.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--text-muted)">网络错误</div>';
    });
}

function renderNotificationPage(data) {
  const listEl = document.getElementById("notificationPageList");
  const pagEl = document.getElementById("notificationPagePagination");
  if (!listEl) return;

  const list = data.list || [];
  if (list.length === 0) {
    listEl.innerHTML =
      '<div style="text-align:center;padding:60px 20px;color:var(--text-muted)"><div style="font-size:48px;margin-bottom:16px">🔔</div><div>暂无通知</div></div>';
    if (pagEl) pagEl.innerHTML = "";
    return;
  }

  listEl.innerHTML = list
    .map((n) => {
      const iconClass = getNotificationIconClass(n.type);
      const iconSvg = getNotificationIcon(n.type);
      const timeStr = formatNotificationTime(n.created_at);
      const unread = n.is_read == 0;
      return (
        '<div class="notification-item ' +
        (unread ? "unread" : "") +
        '" style="cursor:pointer;position:relative;border-radius:12px;margin-bottom:8px;background:var(--bg-card);border:1px solid var(--border)" onclick="handleNotifPageClick(' +
        n.id +
        ",'" +
        escapeHtml(n.type) +
        "','" +
        escapeHtml(n.related_id || "") +
        "')\">" +
        '<div class="notification-icon ' +
        iconClass +
        '">' +
        iconSvg +
        "</div>" +
        '<div class="notification-content" style="flex:1;min-width:0">' +
        '<div class="notification-content-title">' +
        escapeHtml(n.title) +
        "</div>" +
        '<div class="notification-content-text">' +
        escapeHtml(n.content) +
        "</div>" +
        '<div class="notification-time">' +
        timeStr +
        "</div>" +
        "</div>" +
        (unread
          ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary);flex-shrink:0;align-self:center"></span>'
          : "") +
        "</div>"
      );
    })
    .join("");

  // 分页
  if (pagEl) {
    const totalPages = Math.ceil((data.total || 0) / NOTIF_PAGE_SIZE);
    if (totalPages <= 1) {
      pagEl.innerHTML = "";
      return;
    }
    let html = "";
    for (let i = 1; i <= totalPages; i++) {
      const active =
        i === notifPageCurrent ? "background:var(--primary);color:#fff;" : "";
      html +=
        '<button onclick="loadNotificationPage(null,' +
        i +
        ')" style="margin:0 4px;padding:6px 12px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:13px;' +
        active +
        '">' +
        i +
        "</button>";
    }
    pagEl.innerHTML = html;
  }

  updateNotificationBadge(data.unread || 0);
}

function handleNotifPageClick(id, type, relatedId) {
  markNotificationRead(id);
  setTimeout(() => loadNotificationPage(), 300);
  if ((type.startsWith("order_") || type === "payment") && relatedId) {
    switchPage("orders");
    return;
  }
  if ((type.startsWith("ticket_") || type === "ticket") && relatedId) {
    switchPage("tickets");
    setTimeout(() => showTicketDetail(parseInt(relatedId)), 300);
    return;
  }
}

function markAllNotificationsReadPage() {
  const body = new URLSearchParams();
  body.append("action", "mark_all_read");
  apiFetch("api/notifications.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        showToast("已全部标记为已读");
        loadNotificationPage();
        updateNotificationBadge(0);
      }
    });
}

// ==================== 用户余额 / 资料汇总 ====================
function getCurrentUserName() {
  currentUser = normalizeCurrentUserValueDeep(currentUser);
  return safeUserNameFrom(currentUser);
}

function getCurrentBalance() {
  if (!currentUser || typeof currentUser !== "object") return 0;
  return parseFloat(currentUser.credit_balance || 0) || 0;
}

function loadCreditSummary() {
  if (!currentUser || currentRole !== "user") return;
  apiFetch("api/credits.php?action=summary")
    .then((r) => r.json())
    .then((data) => {
      if (data.code !== 1 || !data.data) return;
      if (typeof currentUser === "object")
        currentUser.credit_balance = data.data.balance;
      const amountEl = document.getElementById("creditBalanceSummary");
      const hintEl = document.getElementById("creditBalanceHint");
      const buyEl = document.getElementById("buyBalanceAmount");
      if (amountEl)
        amountEl.textContent =
          (parseFloat(data.data.balance) || 0).toFixed(2) + " 积分";
      if (hintEl)
        hintEl.textContent =
          "最近变动：" + (data.data.last_change_at || "暂无");
      if (buyEl)
        buyEl.textContent =
          (parseFloat(data.data.balance) || 0).toFixed(2) + " 积分";
      renderUserArea();
    });
}

function loadCreditTransactions() {
  if (!currentUser || currentRole !== "user") return;
  apiFetch("api/credits.php?action=my_transactions&page_size=5")
    .then((r) => r.json())
    .then((data) => {
      const box = document.getElementById("creditTransactions");
      if (!box) return;
      if (
        data.code !== 1 ||
        !data.data ||
        !data.data.list ||
        data.data.list.length === 0
      ) {
        box.innerHTML = '<div style="color:var(--text-muted)">暂无流水</div>';
        return;
      }
      box.innerHTML = data.data.list
        .map(
          (item) => `
                <div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
                    <div>
                        <div style="color:var(--text-main)">${escapeHtml(item.type || "adjust")}</div>
                        <div style="color:var(--text-muted)">${escapeHtml(item.remark || "-")}</div>
                    </div>
                    <div style="text-align:right">
                        <div style="color:${parseFloat(item.amount) >= 0 ? "var(--success)" : "var(--danger)"}">${parseFloat(item.amount) >= 0 ? "+" : ""}${parseFloat(item.amount).toFixed(2)}</div>
                        <div style="color:var(--text-muted)">${escapeHtml(item.created_at || "")}</div>
                    </div>
                </div>
            `,
        )
        .join("");
    });
}

function renderAvailableInstances(orderList) {
  const container = document.getElementById("productList");
  if (!container) return original(orderList);
  if (!currentUser || currentRole !== "user") return original(orderList);
  const list = (orderList || cachedOrderList || []).filter(function (o) {
    const status = parseInt(o.status || 0);
    const delivery = String(o.delivery_status || "");
    return status === 1 && delivery !== "refunded" && delivery !== "cancelled";
  });
  if (!list.length) return original(orderList);
  container.innerHTML = list
    .map(function (o) {
      const deliveryText = escapeHtml(
        o.delivery_status_text || o.delivery_status || "-",
      );
      const statusClass =
        o.delivery_status === "delivered"
          ? "on"
          : o.delivery_status === "exception"
            ? "off"
            : "wait";
      const hasCred = !!(o.ip_address || o.ssh_user || o.ssh_password);
      const refundBtn = canRequestRefund(o)
        ? `<button class="btn btn-outline" onclick="event.stopPropagation();requestRefund(${parseInt(o.id || 0)}, '${escapeHtml(o.order_no || "")}', ${parseFloat(o.price || 0)})">申请退款</button>`
        : "";
      return `
                <div class="card" data-order-no="${escapeHtml(o.order_no || "")}">
                    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:12px">
                        <div>
                            <h3 style="margin-bottom:6px">${escapeHtml(getDisplayProductName(o))}</h3>
                            <div style="font-size:12px;color:var(--text-muted)">订单号：<code>${escapeHtml(o.order_no || "")}</code></div>
                        </div>
                        <span class="badge ${statusClass}">${deliveryText}</span>
                    </div>
                    <div class="specs">
                        <div class="spec"><small>CPU</small><div class="spec-value">${escapeHtml(o.cpu || "-")}</div></div>
                        <div class="spec"><small>内存</small><div class="spec-value">${escapeHtml(o.memory || "-")}</div></div>
                        <div class="spec"><small>硬盘</small><div class="spec-value">${escapeHtml(o.disk || "-")}</div></div>
                        <div class="spec"><small>带宽</small><div class="spec-value">${escapeHtml(o.bandwidth || "-")}</div></div>
                    </div>
                    <div style="font-size:13px;color:var(--text-muted);margin-top:14px;line-height:1.8">
                        <div>交付状态：${deliveryText}</div>
                        <div>创建时间：${escapeHtml(o.created_at || "")}</div>
                        ${o.delivery_note ? `<div>备注：${escapeHtml(o.delivery_note)}</div>` : ""}
                        ${hasCred ? `<div style="margin-top:8px;padding:10px;border-radius:10px;background:rgba(255,255,255,0.04)"><div>IP：<code>${escapeHtml(o.ip_address || "-")}</code></div><div>端口：<code>${escapeHtml(String(o.ssh_port || "22"))}</code></div><div>用户：<code>${escapeHtml(o.ssh_user || "root")}</code></div></div>` : '<div style="margin-top:8px;color:var(--warning)">实例凭据将在交付完成后显示</div>'}
                    </div>
                    <div class="card-footer" style="margin-top:14px">
                        <div class="price">${parseFloat(o.price || 0).toFixed(2)}<span>积分</span></div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap">
                            ${hasCred ? `<button class="btn btn-outline" data-ip="${escapeHtml(o.ip_address || "")}" data-port="${escapeHtml(String(o.ssh_port || "22"))}" data-user="${escapeHtml(o.ssh_user || "root")}" data-pass="${escapeHtml(o.ssh_password || "")}" onclick="copyAllVpsFromData(this)">复制全部</button>` : ""}
                            ${refundBtn}
                            <button class="btn btn-primary" onclick="showOrderDetail(${parseInt(o.id || 0)})">订单详情</button>
                        </div>
                    </div>
                </div>`;
    })
    .join("");
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

function normalizeCurrentUserValueDeep(value) {
  if (!value) return null;
  if (typeof value === "string") return { username: value, credit_balance: 0 };
  if (typeof value === "object") {
    if (value.user && typeof value.user === "object")
      return normalizeCurrentUserValueDeep(value.user);
    if (value.username && typeof value.username === "object")
      return normalizeCurrentUserValueDeep(value.username);
    return value;
  }
  return { username: String(value), credit_balance: 0 };
}

function safeUserNameFrom(value) {
  const u = normalizeCurrentUserValueDeep(value);
  if (!u) return "";
  const candidates = [u.username, u.linuxdo_username, u.name, u.linuxdo_name];
  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    if (typeof item === "string" && item.trim() !== "") return item.trim();
  }
  return "";
}

function getDisplayProductName(order) {
  return (
    order.product_name ||
    order.product_name_snapshot ||
    (order.product_id ? "商品#" + order.product_id : "历史订单")
  );
}

function getOrderSpecHtml(order) {
  const specPairs = [
    ["CPU", order.cpu],
    ["内存", order.memory],
    ["硬盘", order.disk],
    ["带宽", order.bandwidth],
    ["地区", order.region],
    ["线路", order.line_type],
    ["系统", order.os_type],
  ].filter(function (row) {
    return row[1];
  });
  if (!specPairs.length) {
    return '<div style="margin-top:12px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.04);color:var(--text-muted)">该订单暂未记录规格快照。常见原因是下单时数据库还没补齐快照字段，或原商品已被删除。部署本次修复后，先在后台执行一次数据库更新，之后新订单会自动保留规格与连接快照。</div>';
  }
  return (
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:14px">' +
    specPairs
      .map(function (row) {
        return (
          '<div style="padding:12px;border-radius:12px;background:rgba(255,255,255,0.04)"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">' +
          row[0] +
          '</div><div style="font-weight:600;color:var(--text-main)">' +
          escapeHtml(String(row[1])) +
          "</div></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function closeOrderDetail() {
  const modal = document.getElementById("orderDetailModal");
  if (modal) modal.classList.remove("show");
}

// ==================== 退款模块 ====================
function canRequestRefund(order) {
  if (!order) return false;
  const numericStatus = parseInt(order.status || 0);
  const delivery = String(order.delivery_status || "");
  const refundable = parseFloat(order.refundable_amount || 0);
  return (
    numericStatus === 1 &&
    !["refunded", "cancelled"].includes(delivery) &&
    refundable > 0
  );
}

function requestRefund(orderId, orderNo, amount) {
  openRefundModal(orderId, orderNo, amount);
}

function openRefundModal(orderId, orderNo, amount) {
  if (!currentUser) {
    showLogin();
    return;
  }
  const order =
    (cachedOrderList || []).find(function (item) {
      return (
        parseInt(item.id || 0) === parseInt(orderId || 0) ||
        String(item.order_no || "") === String(orderNo || "")
      );
    }) || null;
  const computedAmount = order
    ? parseFloat(order.refundable_amount || amount || 0)
    : parseFloat(amount || 0);
  if (!(computedAmount > 0)) {
    alert("当前订单剩余时长为 0，可退金额为 0");
    return;
  }
  const modal = document.getElementById("refundModal");
  if (!modal) {
    const refundTarget =
      (
        prompt(
          "请选择退款方式：\noriginal = 原路退回\nbalance = 退回站内余额",
          "original",
        ) || "original"
      )
        .trim()
        .toLowerCase() === "balance"
        ? "balance"
        : "original";
    const refundReason = (
      prompt("请输入退款原因", "无法登录 / 交付异常") || ""
    ).trim();
    if (!refundReason) return;
    const extra = (prompt("补充说明（可留空）", "") || "").trim();
    const body = new FormData();
    body.append("action", "create_refund_request");
    body.append("order_id", String(orderId || ""));
    body.append("refund_target", refundTarget);
    body.append("refund_reason", refundReason);
    body.append("content", extra);
    apiFetch("api/tickets.php", {
      method: "POST",
      body,
      credentials: "same-origin",
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.code === 1) {
          alert("退款申请已提交，管理员同意后会自动退款");
          loadMyTickets();
          loadMyOrders(orderPagination.page || 1);
        } else {
          alert(data.msg || "退款申请提交失败");
        }
      })
      .catch(function () {
        alert("退款申请提交失败");
      });
    return;
  }
  const idEl = document.getElementById("refundOrderId");
  const noEl = document.getElementById("refundModalOrderNo");
  const amountEl = document.getElementById("refundModalAmount");
  const reasonEl = document.getElementById("refundReason");
  const contentEl = document.getElementById("refundContent");
  if (idEl) idEl.value = String(orderId || "");
  if (noEl) noEl.textContent = orderNo || "-";
  if (amountEl) {
    const remainingText =
      order && order.remaining_days !== undefined
        ? "（剩余 " + parseFloat(order.remaining_days || 0).toFixed(2) + " 天）"
        : "";
    amountEl.textContent = computedAmount.toFixed(2) + " 积分 " + remainingText;
  }
  if (reasonEl) reasonEl.value = "";
  if (contentEl) contentEl.value = "";
  const defaultRadio = document.querySelector(
    'input[name="refundTarget"][value="original"]',
  );
  if (defaultRadio) defaultRadio.checked = true;
  modal.classList.add("show");
}

function closeRefundModal() {
  const modal = document.getElementById("refundModal");
  if (modal) modal.classList.remove("show");
}

function submitRefundRequest() {
  if (!currentUser) {
    showLogin();
    return;
  }
  const orderId = parseInt(
    document.getElementById("refundOrderId")?.value || "0",
  );
  const refundTarget =
    document.querySelector('input[name="refundTarget"]:checked')?.value ||
    "original";
  const refundReason = (
    document.getElementById("refundReason")?.value || ""
  ).trim();
  const extra = (document.getElementById("refundContent")?.value || "").trim();
  if (!orderId) {
    alert("订单信息缺失");
    return;
  }
  if (!refundReason) {
    alert("请填写退款原因");
    return;
  }
  const body = new FormData();
  body.append("action", "create_refund_request");
  body.append("order_id", String(orderId));
  body.append("refund_target", refundTarget);
  body.append("refund_reason", refundReason);
  body.append("content", extra);
  apiFetch("api/tickets.php", {
    method: "POST",
    body,
    credentials: "same-origin",
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (data.code === 1) {
        closeRefundModal();
        alert("退款申请已提交，管理员同意后会自动退款");
        loadMyTickets();
        loadMyOrders(orderPagination.page || 1);
      } else {
        alert(data.msg || "退款申请提交失败");
      }
    })
    .catch(function () {
      alert("退款申请提交失败");
    });
}

function orderCredentialsAllowed(order) {
  if (!order) return false;
  const numericStatus = parseInt(order.status || 0);
  const delivery = String(order.delivery_status || "");
  return (
    numericStatus === 1 &&
    !["refunded", "cancelled", "exception"].includes(delivery)
  );
}

function getRefundAmountText(order) {
  const amount = parseFloat((order && order.refundable_amount) || 0);
  if (!(amount > 0)) return "0.00 积分";
  return amount.toFixed(2) + " 积分";
}

function credentialCopyAllowedFromDom(btn) {
  if (!btn) return true;
  const wrap = btn.closest(
    "#orderDetailBody, .card, .order-item, [data-order-no]",
  );
  if (!wrap) return true;
  const text = (wrap.textContent || "").replace(/\s+/g, " ");
  if (text.indexOf("已退款") !== -1) {
    alert("当前订单已退款，不可复制连接信息");
    return false;
  }
  if (text.indexOf("已取消") !== -1) {
    alert("当前订单已取消，不可复制连接信息");
    return false;
  }
  return true;
}
