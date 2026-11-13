/* =====================================================
   后台：退款管理栏目 (data-tab="refunds")
   ===================================================== */
let adminRefundFilter = "pending_tickets";
let adminRefundTickets = [];
let adminRefundPaidOrders = [];
let adminRefundDoneOrders = [];

function setAdminRefundFilter(filterKey, btnEl) {
  adminRefundFilter = filterKey || "pending_tickets";
  document.querySelectorAll("#adminRefundFilterTabs .admin-filter-tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.filter === adminRefundFilter);
  });
  if (btnEl) btnEl.classList.add("active");
  renderAdminRefunds();
}

function loadAdminRefunds() {
  const listEl = document.getElementById("adminRefundList");
  if (listEl) listEl.innerHTML = '<div class="empty">正在加载退款数据...</div>';

  Promise.all([
    TicketApi.all({ category: "refund_request" }).catch(() => ({ code: 0, data: [] })),
    apiFetch("../api/orders.php?action=all&status=1&page=1&page_size=50").then((r) => r.json()).catch(() => ({ code: 0 })),
    apiFetch("../api/orders.php?action=all&status=2&page=1&page_size=50").then((r) => r.json()).catch(() => ({ code: 0 })),
  ])
    .then(([ticketRes, paidRes, refundedRes]) => {
      adminRefundTickets = ticketRes && ticketRes.code === 1 && Array.isArray(ticketRes.data) ? ticketRes.data : [];
      adminRefundTickets.forEach((t) => {
        if (typeof TicketState !== "undefined" && TicketState.ticketCache && t && t.id) {
          TicketState.ticketCache[t.id] = t;
        }
      });

      const paidList = paidRes && paidRes.code === 1 && paidRes.data && Array.isArray(paidRes.data.list) ? paidRes.data.list : [];
      adminRefundPaidOrders = paidList.filter((o) => !["refunded", "cancelled"].includes(String(o.delivery_status || "")));
      paidList.forEach((o) => {
        if (typeof adminOrderCache !== "undefined" && o && o.order_no) adminOrderCache[o.order_no] = o;
      });

      adminRefundDoneOrders = refundedRes && refundedRes.code === 1 && refundedRes.data && Array.isArray(refundedRes.data.list) ? refundedRes.data.list : [];
      adminRefundDoneOrders.forEach((o) => {
        if (typeof adminOrderCache !== "undefined" && o && o.order_no) adminOrderCache[o.order_no] = o;
      });

      updateAdminRefundStats();
      renderAdminRefunds();
    })
    .catch(() => {
      if (listEl) listEl.innerHTML = '<div class="empty">加载退款数据失败，请刷新重试</div>';
    });
}

function updateAdminRefundStats() {
  const pendingCount = adminRefundTickets.filter((t) => parseInt(t.status || 0, 10) !== 2).length;
  const refundedSum = adminRefundDoneOrders.reduce((sum, o) => sum + parseFloat(o.price || 0), 0);

  const pEl = document.getElementById("adminRfPendingTickets");
  const eEl = document.getElementById("adminRfEligibleOrders");
  const cEl = document.getElementById("adminRfRefundedCount");
  const sEl = document.getElementById("adminRfRefundedSum");

  if (pEl) pEl.textContent = String(pendingCount);
  if (eEl) eEl.textContent = String(adminRefundPaidOrders.length);
  if (cEl) cEl.textContent = String(adminRefundDoneOrders.length);
  if (sEl) sEl.textContent = refundedSum.toFixed(2);

  const badge = document.getElementById("refundBadge");
  if (badge) {
    badge.textContent = pendingCount > 99 ? "99+" : String(pendingCount);
    badge.style.display = pendingCount > 0 ? "" : "none";
  }
}

function renderAdminRefunds() {
  const listEl = document.getElementById("adminRefundList");
  if (!listEl) return;

  const kw = (document.getElementById("adminRefundSearchInput")?.value || "").trim().toLowerCase();
  const matchKw = (text) => !kw || String(text || "").toLowerCase().includes(kw);

  let htmlCards = [];

  if (adminRefundFilter === "pending_tickets" || adminRefundFilter === "all_tickets") {
    const source = adminRefundFilter === "pending_tickets"
      ? adminRefundTickets.filter((t) => parseInt(t.status || 0, 10) !== 2)
      : adminRefundTickets;

    source.forEach((t) => {
      const hay = `${t.id || ""} ${t.title || ""} ${t.order_no || ""} ${t.username || ""} ${t.refund_reason || ""}`;
      if (!matchKw(hay)) return;
      const tid = parseInt(t.id || 0, 10);
      const st = parseInt(t.status || 0, 10);
      const badgeClass = st === 2 ? "on" : "wait";
      const statusText = st === 2 ? "已处理" : st === 1 ? "已回复待确认" : "待审批";
      const tgtText = t.refund_target === "balance" ? "退回站内余额" : "原路退回";
      const orderNo = String(t.order_no || "");
      const linkedOrder = (typeof adminOrderCache !== "undefined" && adminOrderCache[orderNo]) || t.order_info || null;
      const orderPrice = linkedOrder && linkedOrder.price ? parseFloat(linkedOrder.price).toFixed(2) + " 积分" : "按规则核算";
      const safeOrderNo = escapeHtml(orderNo);

      htmlCards.push(`
        <div class="rf-admin-card">
          <div class="rf-admin-card-head">
            <div>
              <div class="rf-admin-card-title">#${tid} ${escapeHtml(t.title || "退款工单")}</div>
              <div class="rf-admin-card-sub">用户：${escapeHtml(t.username || "-")} · 关联订单：<code>${safeOrderNo || "-"}</code></div>
            </div>
            <span class="badge ${badgeClass}">${statusText}</span>
          </div>
          <div class="rf-admin-card-meta">
            <div class="rf-admin-meta-item"><label>订单实付</label><span>${escapeHtml(orderPrice)}</span></div>
            <div class="rf-admin-meta-item"><label>申请退款去向</label><span>${escapeHtml(tgtText)}</span></div>
            <div class="rf-admin-meta-item"><label>退款原因</label><span>${escapeHtml(t.refund_reason || "-")}</span></div>
            <div class="rf-admin-meta-item"><label>提交时间</label><span>${escapeHtml(t.created_at || "-")}</span></div>
          </div>
          <div class="rf-admin-card-foot">
            ${orderNo ? `<button type="button" class="btn btn-outline btn-sm" onclick="showOrderDetail('${safeOrderNo}')">关联订单</button>` : ""}
            <button type="button" class="btn btn-outline btn-sm" onclick="switchTab('tickets');openAdminTicketView(${tid});">工单详情</button>
            ${st !== 2 ? `<button type="button" class="btn btn-danger btn-sm" onclick="openAdminRefundTicketModal(${tid})">审批退款</button>` : ""}
          </div>
        </div>
      `);
    });
  } else if (adminRefundFilter === "eligible_orders") {
    adminRefundPaidOrders.forEach((o) => {
      const hay = `${o.order_no || ""} ${o.product_name || ""} ${o.username || ""}`;
      if (!matchKw(hay)) return;
      const orderNo = String(o.order_no || "");
      const safeOrderNo = escapeHtml(orderNo);
      const priceStr = parseFloat(o.price || 0).toFixed(2);
      htmlCards.push(`
        <div class="rf-admin-card">
          <div class="rf-admin-card-head">
            <div>
              <div class="rf-admin-card-title">${escapeHtml(o.product_name || "订单商品")}</div>
              <div class="rf-admin-card-sub">订单号：<code>${safeOrderNo}</code> · 用户：${escapeHtml(o.username || "-")}</div>
            </div>
            <span class="badge on">已支付 · ${escapeHtml(o.delivery_status_text || o.delivery_status || "-")}</span>
          </div>
          <div class="rf-admin-card-meta">
            <div class="rf-admin-meta-item"><label>实付金额</label><span>${priceStr} 积分</span></div>
            <div class="rf-admin-meta-item"><label>支付方式</label><span>${escapeHtml(o.payment_method || "-")}</span></div>
            <div class="rf-admin-meta-item"><label>余额 / 外部</label><span>${parseFloat(o.balance_paid_amount || 0).toFixed(2)} / ${parseFloat(o.external_pay_amount || 0).toFixed(2)}</span></div>
            <div class="rf-admin-meta-item"><label>支付时间</label><span>${escapeHtml(o.paid_at || o.created_at || "-")}</span></div>
          </div>
          <div class="rf-admin-card-foot">
            <button type="button" class="btn btn-outline btn-sm" onclick="showOrderDetail('${safeOrderNo}')">订单详情</button>
            <button type="button" class="btn btn-danger btn-sm" onclick="refundOrder('${safeOrderNo}', ${priceStr})">发起退款</button>
          </div>
        </div>
      `);
    });
  } else if (adminRefundFilter === "refunded_orders") {
    adminRefundDoneOrders.forEach((o) => {
      const hay = `${o.order_no || ""} ${o.product_name || ""} ${o.username || ""} ${o.refund_reason || ""}`;
      if (!matchKw(hay)) return;
      const safeOrderNo = escapeHtml(o.order_no || "");
      const priceStr = parseFloat(o.price || 0).toFixed(2);
      htmlCards.push(`
        <div class="rf-admin-card">
          <div class="rf-admin-card-head">
            <div>
              <div class="rf-admin-card-title">${escapeHtml(o.product_name || "已退款订单")}</div>
              <div class="rf-admin-card-sub">订单号：<code>${safeOrderNo}</code> · 用户：${escapeHtml(o.username || "-")}</div>
            </div>
            <span class="badge off">已退款</span>
          </div>
          <div class="rf-admin-card-meta">
            <div class="rf-admin-meta-item"><label>退款订单金额</label><span>${priceStr} 积分</span></div>
            <div class="rf-admin-meta-item"><label>原支付方式</label><span>${escapeHtml(o.payment_method || "-")}</span></div>
            <div class="rf-admin-meta-item"><label>退款原因</label><span>${escapeHtml(o.refund_reason || "人工退款")}</span></div>
            <div class="rf-admin-meta-item"><label>退款时间</label><span>${escapeHtml(o.refund_at || o.updated_at || "-")}</span></div>
          </div>
          <div class="rf-admin-card-foot">
            <button type="button" class="btn btn-outline btn-sm" onclick="showOrderDetail('${safeOrderNo}')">订单详情</button>
          </div>
        </div>
      `);
    });
  }

  if (!htmlCards.length) {
    listEl.innerHTML = `<div class="empty">${kw ? "没有匹配的退款记录" : "当前分类下暂无退款记录"}</div>`;
    return;
  }

  listEl.innerHTML = `<div class="rf-admin-list">${htmlCards.join("")}</div>`;
}
