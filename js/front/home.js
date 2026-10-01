/* =====================================================
   首页实例区：游客态卡片 / 统计 / 可用实例渲染
   来源：js/main.js
   ===================================================== */
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
  // 注意：这里统计的是"有效实例数"，不能直接用 orderPagination.total
  // （那是订单总数，含待支付/已取消/已退款），否则数字会明显偏大。
  const activeCount = (currentUser && currentRole === "user") ? (cachedPaidOrderList || []).length : 0;
  const inst = document.getElementById("dashInstances");
  if (inst) inst.textContent = activeCount + " 台";
  updateDashExpiring();

  // 旧的 statInstances 兼容
  const s = document.getElementById("statInstances");
  if (s) s.textContent = String(activeCount);
  // 首页订单余额卡片在未登录时也做友好提示
  const balSummary = document.getElementById("creditBalanceSummary");
  const balHint = document.getElementById("creditBalanceHint");
  if (!currentUser) {
    if (balSummary) balSummary.textContent = "--";
    if (balHint) balHint.textContent = "登录后查看余额信息";
  }
  updateManageInstances();
}

// 拉取"有效实例"完整列表。
// 订单列表接口是分页的（订单页每页仅 5 条），若直接用当前页数据渲染实例，
// 订单超过一页后其余实例就会消失，因此这里单独取一份较大的列表。
function loadPaidInstances() {
  if (!currentUser || currentRole !== "user") {
    cachedPaidOrderList = [];
    updateManageInstances([]);
    return Promise.resolve();
  }
  return apiFetch("api/orders.php?action=my&page=1&page_size=50").then((r) => r.json()).then((data) => {
    const list = (data && data.code === 1 && data.data && Array.isArray(data.data.list)) ? data.data.list : [];
    cachedPaidOrderList = list.filter((o) => {
      const s = parseInt(o.status || 0), d = String(o.delivery_status || "");
      return s === 1 && d !== "refunded" && d !== "cancelled";
    });
    updateManageInstances(cachedPaidOrderList);
    updateHomeStats();
  }).catch(() => {
    cachedPaidOrderList = [];
    updateManageInstances([]);
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
  const list = (orderList || cachedPaidOrderList || cachedOrderList || []).filter((o) => { const s = parseInt(o.status || 0), d = String(o.delivery_status || ""); return s === 1 && d !== "refunded" && d !== "cancelled"; });
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

