// 管理后台逻辑 - 模块化版
// 依赖: common.js（apiFetch, escapeHtml, showToast, renderPaginationWidget, removePaginationWidget, formatFileSize）
// API 前缀设置
window.__apiBase = "../";

let productCache = {};
let adminOrderPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };
let auditPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };
let currentAdminInfo = { id: 0, username: "", role: "admin" };

const tabTitles = { dashboard: "仪表盘", products: "商品管理", orders: "订单管理", coupons: "优惠券管理", tickets: "工单管理", announcements: "公告管理", admins: "管理员管理", audit_logs: "操作日志", settings: "系统设置" };

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
  document.addEventListener("click", (e) => { const m = document.getElementById("userMenu"), t = document.querySelector(".user-dropdown"); if (!m || !t) return; if (!m.contains(e.target) && !t.contains(e.target)) m.classList.remove("show"); });
});

function updateAdminUI() {
  const av = document.getElementById("adminAvatar"), nm = document.getElementById("adminName"), rl = document.getElementById("adminRole");
  if (av && currentAdminInfo.username) av.textContent = currentAdminInfo.username.charAt(0).toUpperCase();
  if (nm) nm.textContent = currentAdminInfo.username || "管理员";
  if (rl) rl.textContent = currentAdminInfo.role === "super" ? "超级管理员" : "管理员";
}

function init() {
  loadStats(); loadProducts(); loadOrders(); loadCoupons(); loadSettings(); loadOAuthSettings();
  loadSmtpSettings(); loadNotificationSettings(); loadCacheStats(); loadTickets(); loadAnnouncements();
  loadTicketStats(); loadRecentOrders(); loadRecentTickets(); loadAdmins(); loadAuditLogs();
  loadTemplateList(); loadProductTemplateOptions(); loadCreditAdminUsers(); loadCreditTransactionList();
  loadCommunityOverview(); loadReportDashboard(); checkDbMissing();
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

// ==================== 仪表盘 ====================
function loadStats() {
  Promise.all([
    apiFetch("../api/orders.php?action=stats").then((r) => r.json()),
    apiFetch("../api/dashboard.php?action=summary").then((r) => r.json()).catch(() => ({ code: 0, data: {} })),
  ]).then(([os, db]) => {
    if (os.code === 1) { ["statProducts","statUsers","statPending","statPaid","statIncome"].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = os.data[id.replace("stat","").toLowerCase()] || 0; }); document.getElementById("statProducts").textContent = os.data.products; document.getElementById("statUsers").textContent = os.data.users; document.getElementById("statPending").textContent = os.data.pending; document.getElementById("statPaid").textContent = os.data.paid; document.getElementById("statIncome").textContent = os.data.income; }
  });
}

// ==================== 商品模块 ====================
function loadProducts() {
  apiFetch("../api/products.php?action=all").then((r) => r.json()).then((data) => {
    const tbody = document.getElementById("productTable");
    if (data.code !== 1 || !data.data || data.data.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无商品</td></tr>'; return; }
    productCache = {}; data.data.forEach((p) => { productCache[p.id] = p; });
    tbody.innerHTML = data.data.map((p) => `<tr><td>${p.id}</td><td><span style="font-weight:600;color:var(--text-main)">${escapeHtml(p.name)}</span><div style="font-size:12px;color:var(--text-muted)">${escapeHtml(p.template_name || "")}</div></td><td>${escapeHtml(p.cpu) || "-"}/${escapeHtml(p.memory) || "-"}/${escapeHtml(p.disk) || "-"}<div style="font-size:12px;color:var(--text-muted)">${escapeHtml(p.region || "-")} · TL${parseInt(p.min_trust_level || 0)}</div></td><td>${parseFloat(p.price || 0).toFixed(2)}积分</td><td>${escapeHtml(p.ip_address || "-")}</td><td><span class="badge ${p.status == 1 ? "on" : "off"}">${p.status == 1 ? "在售" : "已售"}</span></td><td><button class="action-btn edit" onclick="editProductById(${p.id})">编辑</button><button class="action-btn del" onclick="deleteProduct(${p.id})">删除</button></td></tr>`).join("");
  });
}

function showAddProduct() {
  document.getElementById("productModalTitle").textContent = "添加商品";
  ["pId","pName","pCpu","pMem","pDisk","pBw","pPrice","pIp","pPort","pUser","pPass","pExtra","pRegion","pLineType","pOsType","pDescription"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("pPort").value = "22"; document.getElementById("pUser").value = "root";
  document.getElementById("pTemplate").value = ""; document.getElementById("pMinTrustLevel").value = "0";
  document.getElementById("pRiskReviewRequired").checked = false; document.getElementById("pAllowWhitelistOnly").checked = false;
  loadProductTemplateOptions(); document.getElementById("productModal").classList.add("show");
}

function editProduct(p) {
  document.getElementById("productModalTitle").textContent = "编辑商品";
  const fields = {pId:"id",pName:"name",pCpu:"cpu",pMem:"memory",pDisk:"disk",pBw:"bandwidth",pPrice:"price",pIp:"ip_address",pPort:"ssh_port",pUser:"ssh_user",pPass:"ssh_password",pExtra:"extra_info",pRegion:"region",pLineType:"line_type",pOsType:"os_type",pDescription:"description"};
  Object.entries(fields).forEach(([elId,key]) => { document.getElementById(elId).value = p[key] || (key==="ssh_port"?22:key==="ssh_user"?"root":""); });
  document.getElementById("pMinTrustLevel").value = p.min_trust_level || 0;
  document.getElementById("pRiskReviewRequired").checked = parseInt(p.risk_review_required || 0) === 1;
  document.getElementById("pAllowWhitelistOnly").checked = parseInt(p.allow_whitelist_only || 0) === 1;
  loadProductTemplateOptions(p.template_id || ""); document.getElementById("productModal").classList.add("show");
}
function editProductById(id) { const p = productCache[id]; if (p) editProduct(p); }
function closeProductModal() { document.getElementById("productModal").classList.remove("show"); }

function saveProduct() {
  const body = new FormData(), id = document.getElementById("pId").value;
  body.append("action", id ? "edit" : "add"); if (id) body.append("id", id);
  "name:pName,cpu:pCpu,memory:pMem,disk:pDisk,bandwidth:pBw,price:pPrice,ip_address:pIp,ssh_port:pPort,ssh_user:pUser,ssh_password:pPass,extra_info:pExtra,region:pRegion,line_type:pLineType,os_type:pOsType,description:pDescription,template_id:pTemplate,min_trust_level:pMinTrustLevel".split(",").forEach((pair) => { const [k, elId] = pair.split(":"); const el = document.getElementById(elId); body.append(k, el ? el.value : ""); });
  body.append("risk_review_required", document.getElementById("pRiskReviewRequired").checked ? "1" : "0");
  body.append("allow_whitelist_only", document.getElementById("pAllowWhitelistOnly").checked ? "1" : "0");
  apiFetch("../api/products.php", { method: "POST", body }).then((r) => r.json()).then((data) => { if (data.code === 1) { showToast("保存成功"); closeProductModal(); loadProducts(); } else { alert(data.msg || "保存失败"); } });
}

function deleteProduct(id) {
  if (!confirm("确定删除该商品？")) return;
  const body = new FormData(); body.append("action", "delete"); body.append("id", id);
  apiFetch("../api/products.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); loadProducts(); loadStats(); });
}

function logout() { apiFetch("../api/admin.php", { method: "POST", body: new URLSearchParams({ action: "logout" }) }).then(() => (window.location.href = "login.html")); }

// ==================== 订单模块 ====================
function loadOrders(page = 1) {
  adminOrderPagination.page = page;
  const tbody = document.getElementById("orderTable"); if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="empty">加载中...</td></tr>';
  apiFetch("../api/orders.php?action=all&page=" + page + "&page_size=" + adminOrderPagination.pageSize).then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !data.data || !data.data.list) { tbody.innerHTML = '<tr><td colspan="7" class="empty">加载失败</td></tr>'; return; }
    const list = data.data.list || [];
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无订单</td></tr>'; return; }
    tbody.innerHTML = list.map((o) => {
      const ns = parseInt(o.status || 0), pt = ["待支付","已支付","已退款","已取消"][ns] || "未知";
      const dt = escapeHtml(o.delivery_status_text || o.delivery_status || "-");
      let ah = `<div class="admin-inline-actions"><button class="action-btn edit" onclick="showOrderDetail('${escapeHtml(o.order_no)}')">查看</button>`;
      if (ns === 1) ah += `<button class="action-btn del" onclick="refundOrder('${escapeHtml(o.order_no)}', ${parseFloat(o.price || 0).toFixed(2)})">退款</button>`;
      if (ns !== 1) ah += `<button class="action-btn del" onclick="deleteOrder('${escapeHtml(o.order_no)}')">删除</button>`;
      ah += "</div>";
      return `<tr><td><code>${escapeHtml(o.order_no || "")}</code></td><td>${escapeHtml(o.product_name || "商品已删除")}<div class="compact-meta">${dt}</div></td><td>${escapeHtml(o.username || "-")}</td><td>${parseFloat(o.price || 0).toFixed(2)}<div class="compact-meta">${escapeHtml(o.payment_method || "-")}</div></td><td><span class="badge ${ns === 1 ? "on" : ns === 0 ? "wait" : "off"}">${pt}</span></td><td>${escapeHtml(o.created_at || "")}</td><td>${ah}</td></tr>`;
    }).join("");
    const container = tbody?.closest(".table-wrapper")?.parentNode;
    if (container && data.data.total_pages > 1) { removePaginationWidget("orderPagination"); renderPaginationWidget("orderPagination", page, data.data.total_pages, "loadOrders", container); }
    else { removePaginationWidget("orderPagination"); }
  });
}

function deleteOrder(orderNo) {
  if (!confirm(`确定要删除订单 ${orderNo} 吗？\n\n此操作不可恢复。`)) return;
  const body = new FormData(); body.append("action", "delete"); body.append("order_no", orderNo);
  apiFetch("../api/orders.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); if (data.code === 1) { loadOrders(); loadStats(); } }).catch(() => alert("删除请求失败"));
}

function batchDeleteOrders(type) {
  let tt = type === "expired" ? "已取消/超时" : type === "refunded" ? "已退款" : "待支付";
  if (!confirm(`确定要删除所有"${tt}"的订单吗？\n\n此操作不可恢复。`)) return;
  const body = new FormData(); body.append("action", "batch_delete"); body.append("type", type);
  apiFetch("../api/orders.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); if (data.code === 1) { loadOrders(); loadStats(); } }).catch(() => alert("批量删除请求失败"));
}

function exportData(type) { window.open("../api/export.php?type=" + type, "_blank"); }

// ==================== 订单详情 / 退款 ====================
function showOrderDetail(orderNo) {
  apiFetch("../api/orders.php?action=detail&order_no=" + encodeURIComponent(orderNo)).then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !data.data) { alert(data.msg || "获取订单详情失败"); return; }
    const o = data.data, pt = ["待支付","已支付","已退款","已取消"][parseInt(o.status || 0)] || "未知";
    const dt = escapeHtml(o.delivery_status_text || o.delivery_status || "-");
    const statuses = { pending:"待支付", paid_waiting:"待开通", provisioning:"处理中", delivered:"已交付", exception:"异常", refunded:"已退款", cancelled:"已取消" };
    const canRefund = parseInt(o.status || 0) === 1 && !["refunded","cancelled"].includes(String(o.delivery_status || ""));
    document.getElementById("adminTicketTitle").textContent = "订单详情";
    document.getElementById("adminTicketBody").innerHTML = `<div style="display:grid;gap:12px">
      <div><strong>订单号：</strong>${escapeHtml(o.order_no)}</div><div><strong>商品：</strong>${escapeHtml(o.product_name || "已删除")}</div><div><strong>用户：</strong>${escapeHtml(o.username || "-")}</div><div><strong>支付状态：</strong>${pt}</div><div><strong>交付状态：</strong>${dt}</div>
      <div><strong>金额：</strong>${parseFloat(o.price || 0).toFixed(2)} 积分（余额 ${parseFloat(o.balance_paid_amount || 0).toFixed(2)} / 外部 ${parseFloat(o.external_pay_amount || 0).toFixed(2)}）</div>
      <div><strong>支付方式：</strong>${escapeHtml(o.payment_method || "-")}</div>
      ${o.trade_no ? `<div><strong>交易号：</strong>${escapeHtml(o.trade_no)}</div>` : ""}
      ${o.refund_at ? `<div><strong>退款时间：</strong>${escapeHtml(o.refund_at)}${o.refund_reason ? `（${escapeHtml(o.refund_reason)}）` : ""}</div>` : ""}
      ${o.delivery_info ? `<div><strong>交付信息：</strong><span style="white-space:pre-wrap">${escapeHtml(o.delivery_info)}</span></div>` : ""}
      ${o.delivery_note ? `<div><strong>交付备注：</strong><span style="white-space:pre-wrap">${escapeHtml(o.delivery_note)}</span></div>` : ""}
      ${o.delivery_error ? `<div><strong>异常说明：</strong><span style="white-space:pre-wrap">${escapeHtml(o.delivery_error)}</span></div>` : ""}
      <div><strong>创建时间：</strong>${escapeHtml(o.created_at || "")}</div>${o.paid_at ? `<div><strong>支付时间：</strong>${escapeHtml(o.paid_at)}</div>` : ""}${o.delivery_updated_at ? `<div><strong>交付更新时间：</strong>${escapeHtml(o.delivery_updated_at)}</div>` : ""}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <div class="form-group"><label>交付状态</label><select id="orderDeliveryStatus">${Object.keys(statuses).map((k) => `<option value="${k}" ${o.delivery_status === k ? "selected" : ""}>${statuses[k]}</option>`).join("")}</select></div>
        <div class="form-group"><label>交付信息</label><textarea id="orderDeliveryInfo" rows="4" placeholder="填写登录地址、面板地址、到期时间、补充说明等">${escapeHtml(o.delivery_info || "")}</textarea></div>
        <div class="form-group"><label>交付备注</label><textarea id="orderDeliveryNote" rows="2">${escapeHtml(o.delivery_note || "")}</textarea></div>
        <div class="form-group"><label>异常原因</label><textarea id="orderDeliveryError" rows="2">${escapeHtml(o.delivery_error || "")}</textarea></div>
        <div class="admin-inline-actions"><button class="btn btn-primary" onclick="saveOrderDeliveryStatus('${escapeHtml(o.order_no)}')">保存交付状态</button>${canRefund ? `<button class="btn btn-danger" onclick="refundOrder('${escapeHtml(o.order_no)}', ${parseFloat(o.price || 0).toFixed(2)})">立即退款</button>` : ""}</div>
      </div></div>`;
    document.getElementById("adminTicketFoot").innerHTML = `<button class="btn btn-primary" onclick="closeAdminTicketDetail()">关闭</button>`;
    document.getElementById("ticketDetailModal").classList.add("show");
  });
}

function saveOrderDeliveryStatus(orderNo) {
  const se = document.getElementById("orderDeliveryStatus"), info = (document.getElementById("orderDeliveryInfo")?.value || "").trim();
  let status = se ? se.value : "paid_waiting";
  if (info && ["pending","paid_waiting","provisioning"].includes(status)) { status = "delivered"; if (se) se.value = status; }
  const body = new FormData(); body.append("action", "update_delivery_status"); body.append("order_no", orderNo); body.append("delivery_status", status);
  body.append("delivery_info", info); body.append("delivery_note", document.getElementById("orderDeliveryNote")?.value || ""); body.append("delivery_error", document.getElementById("orderDeliveryError")?.value || "");
  apiFetch("../api/orders.php", { method: "POST", body }).then((r) => r.json()).then((data) => { if (data.code === 1) { showToast("交付状态已更新"); loadOrders(adminOrderPagination.page || 1); showOrderDetail(orderNo); } else { alert(data.msg || "更新失败"); } });
}

function saveOrderNote(orderNo) {
  const note = document.getElementById("orderAdminNote").value;
  const body = new FormData(); body.append("action", "update_note"); body.append("order_no", orderNo); body.append("admin_note", note);
  apiFetch("../api/orders.php", { method: "POST", body }).then((r) => r.json()).then((data) => { if (data.code === 1) showToast("备注已保存"); else alert(data.msg || "保存失败"); });
}

function markOrderDelivered(orderNo) {
  const info = document.getElementById("orderDeliveryInfo").value;
  const body = new FormData(); body.append("action", "mark_delivered"); body.append("order_no", orderNo); body.append("delivery_info", info);
  apiFetch("../api/orders.php", { method: "POST", body }).then((r) => r.json()).then((data) => { if (data.code === 1) { showToast("已标记交付"); showOrderDetail(orderNo); } else { alert(data.msg || "操作失败"); } });
}

function refundOrder(orderNo, price) {
  const choice = prompt(`确定要对订单 ${orderNo} 进行退款吗？\n退款金额：${price}积分\n\n请输入退款方式：\noriginal = 原路退回支付账户\nbalance = 退回站内余额`, "original");
  if (choice === null) return;
  const mode = String(choice).trim().toLowerCase() === "balance" ? "balance" : "original";
  const reason = prompt("请输入退款原因（会留痕记录）", "人工退款") || "人工退款";
  const body = new FormData(); body.append("action", "refund"); body.append("order_no", orderNo); body.append("refund_target", mode); body.append("refund_reason", reason);
  apiFetch("../api/orders.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg || (data.code === 1 ? "退款成功" : "退款失败")); if (data.code === 1) { closeAdminTicketDetail(); loadOrders(); loadStats(); } }).catch(() => alert("退款请求失败"));
}

// ==================== 设置模块 ====================
function loadSettings() {
  apiFetch("../api/settings.php?action=get").then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) { ["cfgPid:epay_pid","cfgKey:epay_key","cfgNotify:notify_url","cfgReturn:return_url"].forEach((p) => { const [id,k] = p.split(":"); document.getElementById(id).value = data.data[k] || ""; }); }
  });
}
function savePaySettings() {
  const body = new FormData(); body.append("action", "save");
  ["epay_pid:cfgPid","epay_key:cfgKey","notify_url:cfgNotify","return_url:cfgReturn"].forEach((p) => { const [k,id] = p.split(":"); body.append(k, document.getElementById(id).value); });
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => alert(data.msg));
}
function loadOAuthSettings() {
  apiFetch("../api/settings.php?action=get_oauth").then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) { document.getElementById("cfgOAuthClientId").value = data.data.client_id || ""; document.getElementById("cfgOAuthClientSecret").value = data.data.client_secret || ""; document.getElementById("cfgOAuthRedirectUri").value = data.data.redirect_uri || ""; }
  });
}
function saveOAuthSettings() {
  const body = new FormData(); body.append("action", "save_oauth");
  body.append("client_id", document.getElementById("cfgOAuthClientId").value); body.append("client_secret", document.getElementById("cfgOAuthClientSecret").value); body.append("redirect_uri", document.getElementById("cfgOAuthRedirectUri").value);
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => alert(data.msg));
}
function migrateLinuxDOFields() {
  if (!confirm("确定要执行数据库迁移吗？\n\n这将为users表添加Linux DO OAuth所需的字段。")) return;
  apiFetch("../api/update_db.php?action=migrate_linuxdo").then((r) => r.json()).then((data) => { alert(data.msg + (data.data && data.data.added ? "\n\n添加的字段: " + data.data.added.join(", ") : "")); }).catch(() => alert("迁移请求失败"));
}
function changePassword() {
  const body = new FormData(); body.append("action", "change_password"); body.append("old_password", document.getElementById("oldPass").value); body.append("new_password", document.getElementById("newPass").value);
  apiFetch("../api/admin.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); if (data.code === 1) { document.getElementById("oldPass").value = ""; document.getElementById("newPass").value = ""; } });
}
function loadSmtpSettings() {
  apiFetch("../api/settings.php?action=get_smtp").then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) { ["cfgSmtpHost:smtp_host","cfgSmtpPort:smtp_port","cfgSmtpUser:smtp_user","cfgSmtpPass:smtp_pass","cfgSmtpFrom:smtp_from","cfgSmtpName:smtp_name","cfgSmtpSecure:smtp_secure"].forEach((p) => { const [id,k] = p.split(":"); document.getElementById(id).value = data.data[k] || (k==="smtp_port"?"587":k==="smtp_secure"?"tls":""); }); }
  }).catch(() => {});
}
function saveSmtpSettings() {
  const body = new FormData(); body.append("action", "save_smtp");
  ["smtp_host:cfgSmtpHost","smtp_port:cfgSmtpPort","smtp_user:cfgSmtpUser","smtp_pass:cfgSmtpPass","smtp_from:cfgSmtpFrom","smtp_name:cfgSmtpName","smtp_secure:cfgSmtpSecure"].forEach((p) => { const [k,id] = p.split(":"); body.append(k, document.getElementById(id).value); });
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => alert(data.msg));
}
function testSmtpSettings() {
  const email = prompt("请输入测试邮箱地址："); if (!email) return;
  const body = new FormData(); body.append("action", "test_smtp"); body.append("email", email);
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => alert(data.msg));
}
function loadCacheStats() {
  apiFetch("../api/cache.php?action=stats").then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) { document.getElementById("cacheCount").textContent = data.data.count || 0; document.getElementById("cacheSize").textContent = data.data.size_human || "0 B"; document.getElementById("cacheExpired").textContent = data.data.expired || 0; }
  }).catch(() => {});
}
function cleanupCache() { const body = new FormData(); body.append("action", "cleanup"); apiFetch("../api/cache.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); loadCacheStats(); }); }
function clearAllCache() { if (!confirm("确定要清空所有缓存吗？")) return; const body = new FormData(); body.append("action", "clear"); apiFetch("../api/cache.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); loadCacheStats(); }); }
function loadNotificationSettings() {
  apiFetch("../api/settings.php?action=get_notification").then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !data.data) return; const d = data.data;
    if (document.getElementById("cfgNotifEmail")) document.getElementById("cfgNotifEmail").checked = parseInt(d.notification_email_enabled || 0) === 1;
    if (document.getElementById("cfgNotifWebhook")) document.getElementById("cfgNotifWebhook").checked = parseInt(d.notification_webhook_enabled || 0) === 1;
    if (document.getElementById("cfgNotifWebhookUrl")) document.getElementById("cfgNotifWebhookUrl").value = d.notification_webhook_url || "";
    if (document.getElementById("cfgSilencedOrderMode")) document.getElementById("cfgSilencedOrderMode").value = d.linuxdo_silenced_order_mode || "review";
  });
}
function saveNotificationSettings() {
  const body = new FormData(); body.append("action", "save_notification");
  body.append("notification_email_enabled", document.getElementById("cfgNotifEmail").checked ? "1" : "0");
  body.append("notification_webhook_enabled", document.getElementById("cfgNotifWebhook").checked ? "1" : "0");
  body.append("notification_webhook_url", document.getElementById("cfgNotifWebhookUrl").value);
  body.append("linuxdo_silenced_order_mode", document.getElementById("cfgSilencedOrderMode").value);
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => { if (data.code === 1) showToast("通知配置已保存"); else alert(data.msg || "保存失败"); });
}

// ==================== 优惠券管理 ====================
let couponCache = {};
function loadCoupons() {
  apiFetch("../api/coupons.php?action=all").then((r) => r.json()).then((data) => {
    const tbody = document.getElementById("couponTable");
    if (data.code !== 1 || !data.data || !data.data.list || data.data.list.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="empty">暂无优惠券</td></tr>'; return; }
    couponCache = {}; data.data.list.forEach((c) => { couponCache[c.id] = c; });
    tbody.innerHTML = data.data.list.map((c) => {
      const isExp = c.ends_at && new Date(c.ends_at) < new Date();
      const sc = c.status == 1 ? (isExp ? "wait" : "on") : "off", st = c.status == 1 ? (isExp ? "已过期" : "有效") : "停用";
      const tt = c.type === "fixed" ? "减免" : "折扣", vt = c.type === "fixed" ? c.value + "积分" : c.value + "%";
      return `<tr><td><code style="color:var(--primary)">${escapeHtml(c.code)}</code></td><td>${escapeHtml(c.name)}</td><td>${tt}</td><td style="font-weight:600">${vt}</td><td>${c.used_count} / ${c.max_uses == 0 ? "∞" : c.max_uses}</td><td style="font-size:12px;color:var(--text-muted)">${c.starts_at ? c.starts_at.substring(0, 10) : "即时"}<br>${c.ends_at ? c.ends_at.substring(0, 10) : "永久"}</td><td><span class="badge ${sc}">${st}</span></td><td><button class="action-btn edit" onclick="editCouponById(${c.id})">编辑</button><button class="action-btn" onclick="toggleCouponStatus(${c.id}, ${c.status})">${c.status == 1 ? "停用" : "启用"}</button><button class="action-btn del" onclick="deleteCoupon(${c.id})">删除</button></td></tr>`;
    }).join("");
  });
}
function showAddCoupon() {
  document.getElementById("couponModalTitle").textContent = "创建优惠券";
  ["cId","cCode","cName","cValue","cMaxDiscount","cStartsAt","cEndsAt"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("cCode").disabled = false; document.getElementById("cType").value = "fixed";
  document.getElementById("cMinAmount").value = "0"; document.getElementById("cMaxUses").value = "0"; document.getElementById("cPerUserLimit").value = "1";
  document.getElementById("cStatus").checked = true; toggleCouponType(); document.getElementById("couponModal").classList.add("show");
}
function editCouponById(id) {
  const c = couponCache[id]; if (!c) return;
  document.getElementById("couponModalTitle").textContent = "编辑优惠券";
  document.getElementById("cId").value = c.id; document.getElementById("cCode").value = c.code; document.getElementById("cCode").disabled = true;
  document.getElementById("cName").value = c.name; document.getElementById("cType").value = c.type; document.getElementById("cValue").value = c.value;
  document.getElementById("cMinAmount").value = c.min_amount; document.getElementById("cMaxUses").value = c.max_uses; document.getElementById("cPerUserLimit").value = c.per_user_limit;
  document.getElementById("cMaxDiscount").value = c.max_discount || "";
  document.getElementById("cStartsAt").value = c.starts_at ? c.starts_at.replace(" ", "T").substring(0, 16) : "";
  document.getElementById("cEndsAt").value = c.ends_at ? c.ends_at.replace(" ", "T").substring(0, 16) : "";
  document.getElementById("cStatus").checked = c.status == 1; toggleCouponType(); document.getElementById("couponModal").classList.add("show");
}
function closeCouponModal() { document.getElementById("couponModal").classList.remove("show"); }
function toggleCouponType() {
  const t = document.getElementById("cType").value;
  document.getElementById("cValueLabel").textContent = t === "fixed" ? "减免金额" : "折扣百分比 (1-100)";
  document.getElementById("cMaxDiscountGroup").style.display = t === "fixed" ? "none" : "block";
}
function saveCoupon() {
  const id = document.getElementById("cId").value, code = document.getElementById("cCode").value.trim(), name = document.getElementById("cName").value.trim(), value = document.getElementById("cValue").value;
  if (!code || !name || !value) { alert("请填写必填项"); return; }
  const body = new FormData(); body.append("action", id ? "update" : "create"); if (id) body.append("id", id);
  body.append("code", code); body.append("name", name); body.append("type", document.getElementById("cType").value); body.append("value", value);
  body.append("min_amount", document.getElementById("cMinAmount").value); body.append("max_uses", document.getElementById("cMaxUses").value); body.append("per_user_limit", document.getElementById("cPerUserLimit").value);
  const md = document.getElementById("cMaxDiscount").value; if (md) body.append("max_discount", md);
  const sa = document.getElementById("cStartsAt").value; if (sa) body.append("starts_at", sa.replace("T", " "));
  const ea = document.getElementById("cEndsAt").value; if (ea) body.append("ends_at", ea.replace("T", " "));
  body.append("status", document.getElementById("cStatus").checked ? 1 : 0);
  apiFetch("../api/coupons.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); if (data.code === 1) { closeCouponModal(); loadCoupons(); } });
}
function toggleCouponStatus(id, cs) { const body = new FormData(); body.append("action", "toggle"); body.append("id", id); body.append("status", cs == 1 ? 0 : 1); apiFetch("../api/coupons.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) loadCoupons(); else alert(d.msg); }); }
function deleteCoupon(id) { if (!confirm("确定要删除此优惠券吗？")) return; const body = new FormData(); body.append("action", "delete"); body.append("id", id); apiFetch("../api/coupons.php", { method: "POST", body }).then((r) => r.json()).then((d) => { alert(d.msg); if (d.code === 1) loadCoupons(); }); }

// ==================== 工单管理 ====================
let ticketCache = {};
function loadTicketStats() {
  apiFetch("../api/tickets.php?action=stats").then((r) => r.json()).then((data) => {
    if (data.code === 1) { ["statTicketPending:pending","statTicketReplied:replied","statTicketClosed:closed","statTicketTotal:total"].forEach((p) => { const [id,k] = p.split(":"); document.getElementById(id).textContent = data.data[k]; }); }
  });
}
function loadTickets() {
  apiFetch("../api/tickets.php?action=all").then((r) => r.json()).then((data) => {
    const tbody = document.getElementById("ticketTable");
    if (data.code !== 1 || !data.data || data.data.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无工单</td></tr>'; return; }
    ticketCache = {}; data.data.forEach((t) => { ticketCache[t.id] = t; });
    const pMap = ["低","中","高","紧急"];
    tbody.innerHTML = data.data.map((t) => `<tr><td>#${t.id}</td><td><span style="font-weight:600;color:var(--text-main)">${escapeHtml(t.title)}</span><div style="font-size:12px;color:var(--text-muted)">${escapeHtml(t.category || "other")} · ${pMap[parseInt(t.priority || 1)] || "中"}</div></td><td>${escapeHtml(t.username || "-")}</td><td>${t.order_no ? `<code style="color:var(--primary)">${escapeHtml(t.order_no)}</code>` : "-"}</td><td><span class="badge ${t.status == 0 ? "wait" : t.status == 1 ? "on" : "off"}">${t.status == 0 ? "待回复" : t.status == 1 ? "已回复" : "已关闭"}</span></td><td style="color:var(--text-muted);font-size:12px">${escapeHtml(t.updated_at)}</td><td><button class="action-btn edit" onclick="showAdminTicketDetail(${t.id})">查看</button></td></tr>`).join("");
  });
}
function showAdminTicketDetail(id) {
  Promise.all([
    apiFetch("../api/tickets.php?action=detail&id=" + id).then((r) => r.json()),
    apiFetch("../api/upload.php?action=list&ticket_id=" + id).then((r) => r.json()).catch(() => ({ code: 0, data: [] })),
  ]).then(([tRes, aRes]) => {
    if (tRes.code !== 1 || !tRes.data) { alert("获取工单详情失败"); return; }
    const t = tRes.data, att = aRes.code === 1 ? aRes.data : [];
    const sc = t.status == 0 ? "wait" : t.status == 1 ? "on" : "off";
    const st = t.status == 0 ? "待回复" : t.status == 1 ? "已回复" : "已关闭";
    const tgt = t.refund_target === "balance" ? "退回站内余额" : t.refund_target === "original" ? "原路退回" : "-";
    const oi = t.order_info || null;
    document.getElementById("adminTicketTitle").textContent = "#" + t.id + " " + t.title;
    const rHtml = (t.replies || []).map((r) => `<div class="ticket-reply ${r.user_id ? "user" : "admin"}"><div class="reply-header"><span class="reply-author">${r.user_id ? escapeHtml(r.username || "用户") : "客服 / 管理员"}</span><span class="reply-time">${escapeHtml(r.created_at || "")}</span></div><div class="reply-content">${escapeHtml(r.content || "")}</div></div>`).join("");
    let atHtml = "";
    if (att.length > 0) {
      atHtml = `<div class="ticket-attachments"><div class="ticket-attachments-title"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>附件 (${att.length})</div><div class="ticket-attachments-grid">${att.map((a) => {
        const isImg = (a.mime_type || "").startsWith("image/"), u = `../api/upload.php?action=download&id=${a.id}`, n = escapeHtml(a.original_name || "附件"), m = a.file_size ? `(${formatFileSize(a.file_size)})` : "";
        return isImg ? `<a class="ticket-attachment image" href="${u}" target="_blank"><img src="${u}" alt="${n}"><span class="ticket-attachment-name">${n}</span><span class="ticket-attachment-meta">${m}</span></a>` : `<a class="ticket-attachment file" href="${u}" target="_blank"><span class="ticket-attachment-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span><span class="ticket-attachment-name">${n}</span><span class="ticket-attachment-meta">${m}</span></a>`;
      }).join("")}</div></div>`;
    }
    let refundMeta = "";
    if (t.category === "refund_request") {
      refundMeta = `<div class="refund-admin-card"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:16px;font-weight:700;color:var(--text-main)">退款审批</div><div style="font-size:12px;color:var(--text-muted);margin-top:6px">用户提交时选择：${escapeHtml(tgt)}</div></div>${oi ? `<span class="badge ${String(oi.delivery_status || "") === "refunded" ? "off" : "wait"}">订单状态：${escapeHtml(["待支付","已支付","已退款","已取消"][parseInt(oi.status || 0)] || "-")} / ${escapeHtml(oi.delivery_status || "-")}</span>` : ""}</div>`;
      refundMeta += `<div class="refund-admin-grid"><div class="refund-admin-item"><label>关联订单</label><div>${escapeHtml(t.order_no || "-")}</div></div><div class="refund-admin-item"><label>退款金额</label><div>${oi ? parseFloat(oi.price || 0).toFixed(2) + " 积分" : "-"}</div></div><div class="refund-admin-item"><label>提交原因</label><div>${escapeHtml(t.refund_reason || "-")}</div></div><div class="refund-admin-item"><label>处理管理员</label><div>${escapeHtml(t.handled_admin_name || "-")}</div></div></div>`;
      if (t.status != 2) refundMeta += `<div class="refund-admin-grid"><div class="refund-admin-item"><label>审批退款方式</label><select id="approveRefundTarget"><option value="original" ${t.refund_target === "original" ? "selected" : ""}>原路退回</option><option value="balance" ${t.refund_target === "balance" ? "selected" : ""}>退回站内余额</option></select></div><div class="refund-admin-item" style="grid-column:1/-1"><label>审批备注</label><textarea id="approveRefundReason" rows="3" placeholder="会写入退款记录与工单回复">${escapeHtml(t.refund_reason || "工单退款")}</textarea></div></div>`;
      refundMeta += "</div>";
    }
    document.getElementById("adminTicketBody").innerHTML = `<div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span class="badge ${sc}">${st}</span><span style="color:var(--text-muted);font-size:13px">用户：${escapeHtml(t.username || "-")}</span>${t.order_no ? `<span style="color:var(--text-muted);font-size:13px">订单：${escapeHtml(t.order_no)}</span>` : ""}<span style="color:var(--text-muted);font-size:13px">分类：${escapeHtml(t.category || "other")}</span></div><div style="font-size:12px;color:var(--text-muted)">更新：${escapeHtml(t.updated_at || "")}</div></div></div>${refundMeta}<div class="ticket-replies">${rHtml}</div>${atHtml}${t.status != 2 ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)"><textarea id="adminReplyContent" rows="3" placeholder="输入回复内容..." style="width:100%;resize:vertical"></textarea><div style="margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><input type="file" id="adminTicketFile" accept="image/*,.txt,.log,.pdf" style="font-size:12px"><button class="btn btn-outline" style="padding:6px 12px;font-size:12px" onclick="uploadTicketAttachment(${t.id})">上传附件</button></div></div>` : ""}`;
    let fh = `<button class="btn btn-primary" onclick="closeAdminTicketDetail()">关闭</button>`;
    if (t.status != 2) fh = `<div class="admin-inline-actions">${t.category === "refund_request" ? `<button class="btn btn-danger" onclick="approveRefundTicket(${t.id})">同意退款</button>` : ""}<button class="btn btn-outline" onclick="adminCloseTicket(${t.id})">关闭工单</button><button class="btn btn-primary" onclick="adminReplyTicket(${t.id})">发送回复</button></div>`;
    document.getElementById("adminTicketFoot").innerHTML = fh;
    document.getElementById("ticketDetailModal").classList.add("show");
  });
}
function closeAdminTicketDetail() { document.getElementById("ticketDetailModal").classList.remove("show"); }
function uploadTicketAttachment(tid) {
  const fi = document.getElementById("adminTicketFile"); if (!fi.files || !fi.files[0]) { alert("请选择文件"); return; }
  if (fi.files[0].size > 5 * 1024 * 1024) { alert("文件大小不能超过5MB"); return; }
  const body = new FormData(); body.append("action", "ticket"); body.append("ticket_id", tid); body.append("file", fi.files[0]);
  apiFetch("../api/upload.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("附件上传成功"); fi.value = ""; showAdminTicketDetail(tid); } else alert(d.msg || "上传失败"); }).catch(() => alert("上传请求失败"));
}
function adminReplyTicket(tid) {
  const c = document.getElementById("adminReplyContent").value.trim(); if (!c) { alert("请输入回复内容"); return; }
  const body = new FormData(); body.append("action", "reply"); body.append("ticket_id", tid); body.append("content", c);
  apiFetch("../api/tickets.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showAdminTicketDetail(tid); loadTickets(); loadTicketStats(); } else alert(d.msg); });
}
function adminCloseTicket(tid) {
  if (!confirm("确定要关闭此工单吗？")) return;
  const body = new FormData(); body.append("action", "close"); body.append("ticket_id", tid);
  apiFetch("../api/tickets.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { closeAdminTicketDetail(); loadTickets(); loadTicketStats(); } else alert(d.msg); });
}
function approveRefundTicket(tid) {
  if (!confirm("确认同意该退款申请并立即执行退款吗？")) return;
  const target = document.getElementById("approveRefundTarget")?.value || "original";
  const reason = (document.getElementById("approveRefundReason")?.value || "工单退款").trim() || "工单退款";
  const body = new FormData(); body.append("action", "approve_refund"); body.append("ticket_id", tid); body.append("refund_target", target); body.append("refund_reason", reason);
  apiFetch("../api/tickets.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("退款已完成"); loadTickets(); loadOrders(adminOrderPagination.page || 1); showAdminTicketDetail(tid); } else alert(d.msg || "退款失败"); }).catch(() => alert("退款失败"));
}

// ==================== 公告管理 ====================
let announcementCache = {};
function loadAnnouncements() {
  apiFetch("../api/announcements.php?action=all").then((r) => r.json()).then((data) => {
    const tbody = document.getElementById("announcementTable");
    if (data.code !== 1 || !data.data || data.data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无公告</td></tr>'; return; }
    announcementCache = {}; data.data.forEach((a) => { announcementCache[a.id] = a; });
    tbody.innerHTML = data.data.map((a) => `<tr><td>${a.id}</td><td><span style="font-weight:600;color:var(--text-main)">${escapeHtml(a.title)}</span></td><td><span class="badge ${a.is_top == 1 ? "on" : ""}" style="${a.is_top != 1 ? "opacity:0.5" : ""}">${a.is_top == 1 ? "置顶" : "否"}</span></td><td><span class="badge ${a.status == 1 ? "on" : "off"}">${a.status == 1 ? "显示" : "隐藏"}</span></td><td style="color:var(--text-muted);font-size:12px">${escapeHtml(a.publish_at || a.created_at)}</td><td><button class="action-btn edit" onclick="editAnnouncementById(${a.id})">编辑</button><button class="action-btn" onclick="toggleAnnouncementTop(${a.id})">${a.is_top == 1 ? "取消置顶" : "置顶"}</button><button class="action-btn del" onclick="deleteAnnouncement(${a.id})">删除</button></td></tr>`).join("");
  });
}
function showAddAnnouncement() {
  document.getElementById("announcementModalTitle").textContent = "发布公告";
  ["annId","annTitle","annContent","annPublishAt","annExpiresAt"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("annTop").checked = false; document.getElementById("annStatus").checked = true;
  document.getElementById("announcementModal").classList.add("show");
}
function editAnnouncementById(id) {
  const a = announcementCache[id]; if (!a) return;
  document.getElementById("announcementModalTitle").textContent = "编辑公告";
  document.getElementById("annId").value = a.id; document.getElementById("annTitle").value = a.title; document.getElementById("annContent").value = a.content;
  document.getElementById("annTop").checked = a.is_top == 1; document.getElementById("annStatus").checked = a.status == 1;
  document.getElementById("annPublishAt").value = a.publish_at ? a.publish_at.replace(" ", "T").substring(0, 16) : "";
  document.getElementById("annExpiresAt").value = a.expires_at ? a.expires_at.replace(" ", "T").substring(0, 16) : "";
  document.getElementById("announcementModal").classList.add("show");
}
function closeAnnouncementModal() { document.getElementById("announcementModal").classList.remove("show"); }
function saveAnnouncement() {
  const id = document.getElementById("annId").value, title = document.getElementById("annTitle").value.trim(), content = document.getElementById("annContent").value.trim();
  if (!title || !content) { alert("请填写标题和内容"); return; }
  const body = new FormData(); body.append("action", id ? "edit" : "add"); if (id) body.append("id", id);
  body.append("title", title); body.append("content", content);
  body.append("is_top", document.getElementById("annTop").checked ? 1 : 0); body.append("status", document.getElementById("annStatus").checked ? 1 : 0);
  const pa = document.getElementById("annPublishAt").value; if (pa) body.append("publish_at", pa.replace("T", " "));
  const ea = document.getElementById("annExpiresAt").value; if (ea) body.append("expires_at", ea.replace("T", " "));
  apiFetch("../api/announcements.php", { method: "POST", body }).then((r) => r.json()).then((d) => { alert(d.msg); if (d.code === 1) { closeAnnouncementModal(); loadAnnouncements(); } });
}
function toggleAnnouncementTop(id) { const body = new FormData(); body.append("action", "toggle_top"); body.append("id", id); apiFetch("../api/announcements.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) loadAnnouncements(); else alert(d.msg); }); }
function deleteAnnouncement(id) { if (!confirm("确定删除该公告？")) return; const body = new FormData(); body.append("action", "delete"); body.append("id", id); apiFetch("../api/announcements.php", { method: "POST", body }).then((r) => r.json()).then((d) => { alert(d.msg); loadAnnouncements(); }); }

// ==================== 数据库维护 ====================
function checkDbStatus() {
  const s = document.getElementById("dbStatus"); s.style.display = "block"; s.style.background = "rgba(255,255,255,0.1)"; s.innerHTML = "正在检查...";
  apiFetch("../api/update_db.php?action=check").then((r) => r.json()).then((d) => {
    if (d.code === 1) { const i = d.data; if (i.all_installed) { s.style.background = "rgba(34,197,94,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#22c55e" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>数据库状态正常<br><small style="opacity:0.7">已安装: ' + i.existing.join(", ") + "</small>"; } else { s.style.background = "rgba(251,191,36,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>缺失表:<strong>' + i.missing.join(", ") + "</strong>"; } }
    else { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' + d.msg; }
  }).catch(() => { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>网络错误'; });
}
function updateDatabase() {
  if (!confirm("确定要更新数据库吗？")) return;
  const s = document.getElementById("dbStatus"); s.style.display = "block"; s.innerHTML = "正在更新...";
  const body = new FormData(); body.append("action", "update");
  apiFetch("../api/update_db.php", { method: "POST", body }).then((r) => r.json()).then((d) => {
    if (d.code === 1) { s.style.background = "rgba(34,197,94,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#22c55e" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' + d.msg + (d.data && d.data.created && d.data.created.length ? "<br><small>新建表: " + d.data.created.join(", ") + "</small>" : ""); }
    else { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' + d.msg; }
  }).catch(() => { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>网络错误'; });
}

// ==================== 仪表盘列表 ====================
function loadRecentOrders() {
  apiFetch("../api/orders.php?action=list&limit=5").then((r) => r.json()).then((data) => {
    const c = document.getElementById("recentOrders"); if (!c) return;
    if (data.code !== 1 || !data.data || data.data.length === 0) { c.innerHTML = '<div class="empty-tip">暂无订单</div>'; return; }
    const stMap = { paid: "已支付", pending: "待支付", refunded: "已退款", cancelled: "已取消" };
    c.innerHTML = data.data.slice(0, 5).map((o) => `<div class="recent-item"><div class="recent-info"><span class="recent-title">#${o.id} ${o.product_name || "商品"}</span><span class="recent-time">${o.created_at}</span></div><span class="status-badge status-${o.status}">${stMap[o.status] || o.status}</span></div>`).join("");
  });
}
function loadRecentTickets() {
  apiFetch("../api/tickets.php?action=admin_list&limit=5").then((r) => r.json()).then((data) => {
    const c = document.getElementById("recentTickets"); if (!c) return;
    if (data.code !== 1 || !data.data || data.data.length === 0) { c.innerHTML = '<div class="empty-tip">暂无工单</div>'; return; }
    c.innerHTML = data.data.slice(0, 5).map((t) => `<div class="recent-item"><div class="recent-info"><span class="recent-title">${t.title}</span><span class="recent-time">${t.created_at}</span></div><span class="status-badge status-${t.status}">${t.status === "open" ? "待处理" : t.status === "replied" ? "已回复" : "已关闭"}</span></div>`).join("");
  });
}

// ==================== 管理员 ====================
function loadAdmins() {
  const tbody = document.getElementById("adminTable"); if (!tbody) return;
  if (currentAdminInfo.role !== "super") { tbody.innerHTML = '<tr><td colspan="5" class="empty-tip">仅超级管理员可查看</td></tr>'; const pt = document.getElementById("promoteUserTable"); if (pt) pt.innerHTML = '<tr><td colspan="4" class="empty">仅超级管理员可提权</td></tr>'; return; }
  apiFetch("../api/admin.php?action=list").then((r) => r.json()).then((d) => {
    if (d.code !== 1 || !d.data) { tbody.innerHTML = '<tr><td colspan="5" class="empty-tip">暂无数据</td></tr>'; return; }
    tbody.innerHTML = d.data.map((a) => `<tr><td>${a.id}</td><td>${escapeHtml(a.username || "-")}</td><td><span class="role-badge role-${a.role}">${a.role === "super" ? "超级管理员" : "普通管理员"}</span></td><td>${escapeHtml(a.created_at || "-")}</td><td>${a.role !== "super" ? `<button class="action-btn del" onclick="deleteAdmin(${a.id})">删除</button>` : '<span class="compact-meta">-</span>'}</td></tr>`).join("");
    loadPromotableUsers();
  });
}
function showAddAdmin() { document.getElementById("newAdminUser").value = ""; document.getElementById("newAdminPass").value = ""; document.getElementById("newAdminRole").value = "admin"; document.getElementById("adminModal").classList.add("show"); }
function closeAdminModal() { document.getElementById("adminModal").classList.remove("show"); }
function saveAdmin() {
  const u = document.getElementById("newAdminUser").value.trim(), p = document.getElementById("newAdminPass").value, r = document.getElementById("newAdminRole").value;
  if (!u || !p) { showToast("请填写用户名和密码"); return; }
  apiFetch("../api/admin.php?action=add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p, role: r }) }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("管理员添加成功"); closeAdminModal(); loadAdmins(); } else showToast(d.msg || "添加失败"); });
}
function deleteAdmin(id) {
  if (!confirm("确定删除该管理员？")) return;
  apiFetch("../api/admin.php?action=delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("删除成功"); loadAdmins(); } else showToast(d.msg || "删除失败"); });
}
function loadPromotableUsers() {
  const tbody = document.getElementById("promoteUserTable"); if (!tbody) return;
  if (currentAdminInfo.role !== "super") { tbody.innerHTML = '<tr><td colspan="4" class="empty">仅超级管理员可提权</td></tr>'; return; }
  const kw = (document.getElementById("promoteUserKeyword")?.value || "").trim();
  if (!kw) { tbody.innerHTML = '<tr><td colspan="4" class="empty">输入关键词后搜索</td></tr>'; return; }
  tbody.innerHTML = '<tr><td colspan="4" class="empty">搜索中...</td></tr>';
  apiFetch("../api/admin.php?action=search_users&keyword=" + encodeURIComponent(kw) + "&limit=20").then((r) => r.json()).then((d) => {
    const list = d.code === 1 && Array.isArray(d.data) ? d.data : [];
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty">未找到匹配用户</td></tr>'; return; }
    tbody.innerHTML = list.map((u) => {
      const st = u.admin_id ? `<span class="badge on">已是${u.admin_role === "super" ? "超管" : "管理员"}</span>` : `<span class="badge wait">${u.has_password ? "可直接沿用密码" : "需单独设密码"}</span>`;
      const act = u.admin_id ? '<span class="compact-meta">无需提权</span>' : `<button class="action-btn edit" onclick="promoteExistingUser(${parseInt(u.id || 0)}, '${escapeHtml(u.username || "")}')">提权</button>`;
      return `<tr><td>${u.id}</td><td>${escapeHtml(u.username || "-")}<div class="compact-meta">${escapeHtml(u.email || u.linuxdo_username || "-")}</div></td><td>${st}</td><td>${act}</td></tr>`;
    }).join("");
  }).catch(() => { tbody.innerHTML = '<tr><td colspan="4" class="empty">搜索失败</td></tr>'; });
}
function promoteExistingUser(userId, username) {
  const role = document.getElementById("promoteUserRole")?.value || "admin", pw = document.getElementById("promoteUserPassword")?.value || "";
  if (!confirm(`确定将 ${username} 提权为${role === "super" ? "超级管理员" : "管理员"}吗？`)) return;
  apiFetch("../api/admin.php?action=promote_user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, role, password: pw }) }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("提权成功"); if (document.getElementById("promoteUserPassword")) document.getElementById("promoteUserPassword").value = ""; loadAdmins(); loadPromotableUsers(); } else showToast(d.msg || "提权失败"); });
}

// ==================== 操作日志 ====================
function loadAuditLogs(page = 1) {
  const tbody = document.getElementById("auditTable"); if (!tbody) return;
  auditPagination.page = page;
  const container = document.getElementById("auditTableContainer") || tbody.parentNode;
  tbody.innerHTML = '<tr><td colspan="6" class="empty">加载中...</td></tr>';
  apiFetch("../api/audit_logs.php?action=list&page=" + page + "&page_size=" + auditPagination.pageSize).then((r) => r.json()).then((d) => {
    if (d.code !== 1 || !d.data || !d.data.list || d.data.list.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无日志</td></tr>'; removePaginationWidget("auditPagination"); return; }
    auditPagination.total = d.data.total; auditPagination.totalPages = d.data.total_pages;
    tbody.innerHTML = d.data.list.map((l) => { const ds = (l.details || "").length > 80 ? l.details.slice(0, 80) + "..." : l.details || ""; const an = l.actor_name || (l.actor_id ? "#" + l.actor_id : "-"); return `<tr><td style="color:var(--text-muted);font-size:12px">${escapeHtml(l.created_at || "")}</td><td>${escapeHtml(an)}</td><td>${escapeHtml(l.action || "")}</td><td>${escapeHtml(l.target_id || "-")}</td><td>${escapeHtml(l.ip_address || "-")}</td><td title="${escapeHtml(l.details || "")}">${escapeHtml(ds || "-")}</td></tr>`; }).join("");
    if (auditPagination.totalPages > 1) renderPaginationWidget("auditPagination", page, auditPagination.totalPages, "loadAuditLogs", container, auditPagination.total);
    else removePaginationWidget("auditPagination");
  });
}
function clearAuditLogs() {
  if (currentAdminInfo.role !== "super") { showToast("仅超级管理员可清空日志"); return; }
  const pw = prompt("请输入当前管理员密码"); if (pw === null) return; if (!pw.trim()) { showToast("请输入密码"); return; }
  if (!confirm("确认删除全部操作日志？")) return;
  const body = new FormData(); body.append("action", "clear"); body.append("password", pw);
  apiFetch("../api/audit_logs.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("操作日志已清空"); loadAuditLogs(1); } else showToast(d.msg || "清空失败"); });
}

// ==================== 模板管理 ====================
function loadProductTemplateOptions(selectedId = "") {
  apiFetch("../api/templates.php?action=list").then((r) => r.json()).then((d) => {
    const sel = document.getElementById("pTemplate"); if (!sel) return;
    sel.innerHTML = '<option value="">不使用模板</option>';
    if (d.code === 1 && Array.isArray(d.data)) d.data.forEach((t) => { sel.innerHTML += `<option value="${t.id}">${escapeHtml(t.name)}</option>`; });
    if (selectedId !== "") sel.value = String(selectedId);
  });
}
function loadTemplateList() {
  apiFetch("../api/templates.php?action=list").then((r) => r.json()).then((d) => {
    const tbody = document.getElementById("templateTable"); if (!tbody) return;
    if (d.code !== 1 || !Array.isArray(d.data) || d.data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无模板</td></tr>'; return; }
    tbody.innerHTML = d.data.map((t) => `<tr><td>${t.id}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.cpu || "-")}/${escapeHtml(t.memory || "-")}/${escapeHtml(t.disk || "-")}</td><td><span class="badge ${parseInt(t.status || 1) === 1 ? "on" : "off"}">${parseInt(t.status || 1) === 1 ? "启用" : "停用"}</span></td><td></td></tr>`).join("");
    Array.from(tbody.querySelectorAll("tr")).forEach((tr, idx) => { const cell = tr.lastElementChild; if (!cell) return; const t = d.data[idx]; cell.innerHTML = `<button class="action-btn edit" onclick="fillTemplateForm(${t.id})">编辑</button><button class="action-btn edit" onclick="createTemplateFromProductPrompt()">从商品生成</button><button class="action-btn del" onclick="deleteTemplate(${t.id})">删除</button>`; });
    window.__templateCache = {}; d.data.forEach((t) => (window.__templateCache[t.id] = t));
  });
}
function fillTemplateForm(id) {
  const t = window.__templateCache ? window.__templateCache[id] : null; if (!t) return;
  ["tplId:id","tplName:name","tplCpu:cpu","tplMemory:memory","tplDisk:disk","tplBandwidth:bandwidth","tplRegion:region","tplLineType:line_type","tplOsType:os_type","tplDescription:description","tplExtraInfo:extra_info"].forEach((p) => { const [elId,k] = p.split(":"); document.getElementById(elId).value = t[k] || ""; });
  document.getElementById("tplSort").value = t.sort_order || 0; switchTab("templates");
}
function saveTemplate() {
  const body = new FormData(), id = document.getElementById("tplId").value;
  body.append("action", id ? "update" : "create"); if (id) body.append("id", id);
  "name:tplName,cpu:tplCpu,memory:tplMemory,disk:tplDisk,bandwidth:tplBandwidth,region:tplRegion,line_type:tplLineType,os_type:tplOsType,description:tplDescription,extra_info:tplExtraInfo,sort_order:tplSort".split(",").forEach((p) => { const [k, elId] = p.split(":"); body.append(k, document.getElementById(elId).value); });
  apiFetch("../api/templates.php", { method: "POST", body }).then((r) => r.json()).then((d) => {
    if (d.code === 1) { showToast("模板已保存"); ["tplId","tplName","tplCpu","tplMemory","tplDisk","tplBandwidth","tplRegion","tplLineType","tplOsType","tplDescription","tplExtraInfo"].forEach((i) => (document.getElementById(i).value = "")); document.getElementById("tplSort").value = "0"; loadTemplateList(); loadProductTemplateOptions(); }
    else alert(d.msg || "保存失败");
  });
}
function deleteTemplate(id) { if (!confirm("确定删除该模板？")) return; const body = new FormData(); body.append("action", "delete"); body.append("id", id); apiFetch("../api/templates.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("删除成功"); loadTemplateList(); loadProductTemplateOptions(); } else alert(d.msg || "删除失败"); }); }
function createTemplateFromProductPrompt() { const id = prompt("输入商品ID，快速生成模板"); if (!id) return; const body = new FormData(); body.append("action", "create_from_product"); body.append("product_id", id); apiFetch("../api/templates.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("已从商品生成模板"); loadTemplateList(); loadProductTemplateOptions(); } else alert(d.msg || "生成失败"); }); }

// ==================== 积分管理 ====================
function loadCreditAdminUsers() {
  const kw = document.getElementById("creditSearchKeyword") ? document.getElementById("creditSearchKeyword").value.trim() : "";
  apiFetch("../api/credits.php?action=admin_users&keyword=" + encodeURIComponent(kw)).then((r) => r.json()).then((d) => {
    const tbody = document.getElementById("creditUserTable"); if (!tbody) return;
    const list = d && d.code === 1 && d.data && Array.isArray(d.data.list) ? d.data.list : [];
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无用户</td></tr>'; return; }
    tbody.innerHTML = list.map((u) => `<tr><td>${u.id}</td><td>${escapeHtml(u.username || "-")}</td><td>${escapeHtml(u.linuxdo_username || "-")}<div style="font-size:12px;color:var(--text-muted)">TL${parseInt(u.linuxdo_trust_level || 0)} ${parseInt(u.linuxdo_silenced || 0) === 1 ? "· silenced" : ""}</div></td><td>${parseFloat(u.credit_balance || 0).toFixed(2)}</td><td><button class="action-btn edit" onclick="selectCreditUser(${u.id})">选择</button></td></tr>`).join("");
  });
}
function selectCreditUser(id) { document.getElementById("creditUserId").value = id; loadCreditTransactionList(id); }
function loadCreditTransactionList(userId = "") {
  let url = "../api/credits.php?action=admin_transactions&page_size=20";
  if (userId) url += "&user_id=" + encodeURIComponent(userId);
  apiFetch(url).then((r) => r.json()).then((d) => {
    const tbody = document.getElementById("creditTxnTable"); if (!tbody) return;
    if (d.code !== 1 || !d.data || !Array.isArray(d.data.list) || d.data.list.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无流水</td></tr>'; return; }
    tbody.innerHTML = d.data.list.map((t) => `<tr><td>${escapeHtml(t.created_at || "")}</td><td>${escapeHtml(t.username || "#" + t.user_id)}</td><td>${escapeHtml(t.type || "-")}</td><td style="color:${parseFloat(t.amount) >= 0 ? "var(--success)" : "var(--danger)"}">${parseFloat(t.amount).toFixed(2)}</td><td>${escapeHtml(t.remark || "-")}</td></tr>`).join("");
  });
}
function submitCreditAdjust() {
  const body = new FormData(); body.append("action", "admin_adjust");
  body.append("user_id", document.getElementById("creditUserId").value);
  body.append("amount", document.getElementById("creditAmount").value);
  body.append("remark", document.getElementById("creditRemark").value);
  apiFetch("../api/credits.php", { method: "POST", body }).then((r) => r.json()).then((d) => {
    if (d.code === 1) { showToast("积分已调整"); document.getElementById("creditAmount").value = ""; document.getElementById("creditRemark").value = ""; loadCreditAdminUsers(); loadCreditTransactionList(document.getElementById("creditUserId").value); loadStats(); }
    else alert(d.msg || "调整失败");
  });
}

// ==================== 社区规则 ====================
function loadCommunityOverview() {
  apiFetch("../api/community.php?action=overview").then((r) => r.json()).then((d) => { if (d.code === 1 && d.data && d.data.settings) document.getElementById("communitySilencedMode").value = d.data.settings.linuxdo_silenced_order_mode || "review"; });
  apiFetch("../api/community.php?action=rules").then((r) => r.json()).then((d) => {
    const tbody = document.getElementById("communityRuleTable"); if (!tbody) return;
    if (d.code !== 1 || !Array.isArray(d.data) || d.data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无规则</td></tr>'; return; }
    window.__communityRules = {}; d.data.forEach((r) => (window.__communityRules[r.id] = r));
    tbody.innerHTML = d.data.map((r) => `<tr><td>${r.id}</td><td>${escapeHtml(r.rule_type)}</td><td>${r.product_id ? "商品#" + r.product_id : "全局"} / ${r.linuxdo_id ? "LD#" + r.linuxdo_id : "本站#" + (r.user_id || "-")}</td><td>${escapeHtml(r.remark || "-")}</td><td><button class="action-btn edit" onclick="fillCommunityRule(${r.id})">编辑</button><button class="action-btn del" onclick="deleteCommunityRule(${r.id})">删除</button></td></tr>`).join("");
  });
  apiFetch("../api/community.php?action=discounts").then((r) => r.json()).then((d) => {
    const tbody = document.getElementById("communityDiscountTable"); if (!tbody) return;
    if (d.code !== 1 || !Array.isArray(d.data) || d.data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无折扣规则</td></tr>'; return; }
    window.__communityDiscounts = {}; d.data.forEach((r) => (window.__communityDiscounts[r.id] = r));
    tbody.innerHTML = d.data.map((r) => `<tr><td>${r.id}</td><td>TL${r.trust_level}</td><td>${r.product_id ? "#" + r.product_id : "全局"}</td><td>${escapeHtml(r.discount_type)}</td><td>${parseFloat(r.discount_value || 0).toFixed(2)}</td><td><button class="action-btn edit" onclick="fillCommunityDiscount(${r.id})">编辑</button><button class="action-btn del" onclick="deleteCommunityDiscount(${r.id})">删除</button></td></tr>`).join("");
  });
}
function saveCommunitySettings() { const body = new FormData(); body.append("action", "save_settings"); body.append("linuxdo_silenced_order_mode", document.getElementById("communitySilencedMode").value); apiFetch("../api/community.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) showToast("设置已保存"); else alert(d.msg || "保存失败"); }); }
function saveCommunityRule() {
  const body = new FormData(); body.append("action", "save_rule");
  if (document.getElementById("ruleId").value) body.append("id", document.getElementById("ruleId").value);
  "rule_type:ruleType,product_id:ruleProductId,user_id:ruleUserId,linuxdo_id:ruleLinuxdoId,remark:ruleRemark".split(",").forEach((p) => { const [k, i] = p.split(":"); body.append(k, document.getElementById(i).value); });
  apiFetch("../api/community.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("规则已保存"); ["ruleId","ruleProductId","ruleUserId","ruleLinuxdoId","ruleRemark"].forEach((i) => (document.getElementById(i).value = "")); document.getElementById("ruleType").value = "whitelist"; loadCommunityOverview(); } else alert(d.msg || "保存失败"); });
}
function fillCommunityRule(id) { const r = window.__communityRules ? window.__communityRules[id] : null; if (!r) return; document.getElementById("ruleId").value = r.id; document.getElementById("ruleType").value = r.rule_type || "whitelist"; document.getElementById("ruleProductId").value = r.product_id || ""; document.getElementById("ruleUserId").value = r.user_id || ""; document.getElementById("ruleLinuxdoId").value = r.linuxdo_id || ""; document.getElementById("ruleRemark").value = r.remark || ""; }
function deleteCommunityRule(id) { if (!confirm("确定删除该规则？")) return; const body = new FormData(); body.append("action", "delete_rule"); body.append("id", id); apiFetch("../api/community.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("删除成功"); loadCommunityOverview(); } else alert(d.msg || "删除失败"); }); }
function saveCommunityDiscount() {
  const body = new FormData(); body.append("action", "save_discount");
  if (document.getElementById("discountId").value) body.append("id", document.getElementById("discountId").value);
  "trust_level:discountTrustLevel,product_id:discountProductId,discount_type:discountType,discount_value:discountValue,remark:discountRemark".split(",").forEach((p) => { const [k, i] = p.split(":"); body.append(k, document.getElementById(i).value); });
  apiFetch("../api/community.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("折扣已保存"); ["discountId","discountProductId","discountValue","discountRemark"].forEach((i) => (document.getElementById(i).value = "")); document.getElementById("discountType").value = "percent"; document.getElementById("discountTrustLevel").value = "0"; loadCommunityOverview(); } else alert(d.msg || "保存失败"); });
}
function fillCommunityDiscount(id) { const r = window.__communityDiscounts ? window.__communityDiscounts[id] : null; if (!r) return; document.getElementById("discountId").value = r.id; document.getElementById("discountTrustLevel").value = r.trust_level || 0; document.getElementById("discountProductId").value = r.product_id || ""; document.getElementById("discountType").value = r.discount_type || "percent"; document.getElementById("discountValue").value = r.discount_value || ""; document.getElementById("discountRemark").value = r.remark || ""; }
function deleteCommunityDiscount(id) { if (!confirm("确定删除该折扣规则？")) return; const body = new FormData(); body.append("action", "delete_discount"); body.append("id", id); apiFetch("../api/community.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("删除成功"); loadCommunityOverview(); } else alert(d.msg || "删除失败"); }); }

// ==================== 报表 ====================
function loadReportDashboard() {
  Promise.all([
    apiFetch("../api/dashboard.php?action=summary").then((r) => r.json()),
    apiFetch("../api/dashboard.php?action=hot_products").then((r) => r.json()),
    apiFetch("../api/dashboard.php?action=ticket_summary").then((r) => r.json()),
  ]).then(([summary, hotProducts, tickets]) => {
    if (summary.code === 1) {
      document.getElementById("reportTodayIncome").textContent = parseFloat(summary.data.today_income || 0).toFixed(2);
      document.getElementById("reportMonthIncome").textContent = parseFloat(summary.data.month_income || 0).toFixed(2);
      document.getElementById("reportBalanceOrders").textContent = summary.data.balance_paid_orders || 0;
      document.getElementById("reportEpayOrders").textContent = summary.data.epay_paid_orders || 0;
      document.getElementById("reportExceptionOrders").textContent = summary.data.exception_orders || 0;
      document.getElementById("reportBalanceTotal").textContent = parseFloat(summary.data.user_balance_total || 0).toFixed(2);
    }
    const hotEl = document.getElementById("reportHotProducts");
    if (hotEl) hotEl.innerHTML = hotProducts.code === 1 && hotProducts.data.length ? hotProducts.data.map((i) => `<tr><td>${escapeHtml(i.name)}</td><td>${i.order_count}</td><td>${i.paid_count}</td><td>${parseFloat(i.income || 0).toFixed(2)}</td></tr>`).join("") : '<tr><td colspan="4" class="empty">暂无数据</td></tr>';
    const tkEl = document.getElementById("reportTicketCategory");
    if (tkEl) tkEl.innerHTML = tickets.code === 1 && tickets.data.category_breakdown && tickets.data.category_breakdown.length ? tickets.data.category_breakdown.map((i) => `<tr><td>${escapeHtml(i.category)}</td><td>${i.total}</td></tr>`).join("") : '<tr><td colspan="2" class="empty">暂无数据</td></tr>';
  });
}
