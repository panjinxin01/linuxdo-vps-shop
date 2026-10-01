/* =====================================================
   订单管理：列表 / 批量删除 / 导出 / 详情 / 交付状态 / 退款
   来源：js/admin.js
   ===================================================== */
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
// v20260825：订单详情改用独立弹窗 orderAdminModal（不再复用工单弹窗节点）
function closeOrderAdminModal() {
  const m = document.getElementById("orderAdminModal");
  if (m) m.classList.remove("show");
}

function showOrderDetail(orderNo) {
  apiFetch("../api/orders.php?action=detail&order_no=" + encodeURIComponent(orderNo)).then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !data.data) { alert(data.msg || "获取订单详情失败"); return; }
    const o = data.data, pt = ["待支付","已支付","已退款","已取消"][parseInt(o.status || 0)] || "未知";
    const dt = escapeHtml(o.delivery_status_text || o.delivery_status || "-");
    const statuses = { pending:"待支付", paid_waiting:"待开通", provisioning:"处理中", delivered:"已交付", exception:"异常", refunded:"已退款", cancelled:"已取消" };
    const canRefund = parseInt(o.status || 0) === 1 && !["refunded","cancelled"].includes(String(o.delivery_status || ""));
    document.getElementById("orderAdminTitle").textContent = "订单详情";
    document.getElementById("orderAdminBody").innerHTML = `<div style="display:grid;gap:12px">
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
    document.getElementById("orderAdminFoot").innerHTML = `<button class="btn btn-primary" onclick="closeOrderAdminModal()">关闭</button>`;
    document.getElementById("orderAdminModal").classList.add("show");
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
  apiFetch("../api/orders.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg || (data.code === 1 ? "退款成功" : "退款失败")); if (data.code === 1) { closeOrderAdminModal(); loadOrders(); loadStats(); } }).catch(() => alert("退款请求失败"));
}

