/* =====================================================
   订单：我的订单列表 / 订单详情弹窗
   来源：js/main.js
   ===================================================== */
// ==================== 订单列表 ====================
function loadMyOrders(page = 1) {
  orderPagination.page = page;
  const container = document.getElementById("myOrders");
  if (!currentUser) {
    if (container) container.innerHTML = renderLoginRequired('登录后查看订单记录', {
      icon: 'order',
      sub: '管理您的VPS订单、查看交付状态与余额流水'
    });
    cachedPaidOrderList = [];
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
    loadPaidInstances();
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
