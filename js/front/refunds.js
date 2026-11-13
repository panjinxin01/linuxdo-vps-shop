/* =====================================================
   前台：退款售后独立栏目 (#page-refunds)
   ===================================================== */
let frontRefundFilter = "all";
let frontRefundOrders = [];
let frontRefundTickets = [];

function setFrontRefundFilter(filterKey, btnEl) {
  frontRefundFilter = filterKey || "all";
  document.querySelectorAll("#frontRefundFilterTabs .rf-hub-tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.filter === frontRefundFilter);
  });
  if (btnEl) btnEl.classList.add("active");
  renderMyRefunds();
}

function loadMyRefunds() {
  const container = document.getElementById("myRefunds");
  const eligibleEl = document.getElementById("frontRfEligibleCount");
  const pendingEl = document.getElementById("frontRfPendingCount");
  const sumEl = document.getElementById("frontRfRefundedSum");

  if (typeof currentRole !== "undefined" && currentRole === "admin") {
    if (typeof renderAdminFrontendHints === "function") renderAdminFrontendHints();
    return;
  }

  if (typeof currentUser === "undefined" || !currentUser) {
    frontRefundOrders = [];
    frontRefundTickets = [];
    if (eligibleEl) eligibleEl.textContent = "0";
    if (pendingEl) pendingEl.textContent = "0";
    if (sumEl) sumEl.textContent = "0.00";
    if (container && typeof renderLoginRequired === "function") {
      container.innerHTML = renderLoginRequired("登录后管理退款与售后", {
        icon: "order",
        sub: "查看可退款订单、发起退款申请并实时跟踪审批进度",
      });
    }
    return;
  }

  if (container) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;">正在加载售后数据...</p>';
  }

  Promise.all([
    apiFetch("api/orders.php?action=my&page=1&page_size=50").then((r) => r.json()).catch(() => ({ code: 0 })),
    apiFetch("api/tickets.php?action=my").then((r) => r.json()).catch(() => ({ code: 0 })),
  ])
    .then(([ordersRes, ticketsRes]) => {
      frontRefundOrders = ordersRes && ordersRes.code === 1 && ordersRes.data && Array.isArray(ordersRes.data.list)
        ? ordersRes.data.list
        : (typeof cachedOrderList !== "undefined" ? cachedOrderList : []);
      if (frontRefundOrders.length && typeof cachedOrderList !== "undefined") {
        cachedOrderList = frontRefundOrders;
      }
      const allTickets = ticketsRes && ticketsRes.code === 1 && Array.isArray(ticketsRes.data)
        ? ticketsRes.data
        : [];
      frontRefundTickets = allTickets.filter((t) => String(t.category || "") === "refund_request");
      renderMyRefunds();
    })
    .catch(() => {
      if (container) {
        container.innerHTML = '<p style="color:var(--danger);text-align:center;padding:24px;">售后数据加载失败，请稍后重试</p>';
      }
    });
}

function renderMyRefunds() {
  const container = document.getElementById("myRefunds");
  const eligibleEl = document.getElementById("frontRfEligibleCount");
  const pendingEl = document.getElementById("frontRfPendingCount");
  const sumEl = document.getElementById("frontRfRefundedSum");

  const orders = Array.isArray(frontRefundOrders) ? frontRefundOrders : [];
  const tickets = Array.isArray(frontRefundTickets) ? frontRefundTickets : [];

  const pendingTicketByOrderNo = {};
  tickets.forEach((t) => {
    if (parseInt(t.status || 0, 10) !== 2 && t.order_no) {
      pendingTicketByOrderNo[String(t.order_no)] = t;
    }
  });

  const eligibleOrders = orders.filter((o) => {
    if (!canRequestRefund(o)) return false;
    return !pendingTicketByOrderNo[String(o.order_no || "")];
  });
  const pendingTickets = tickets.filter((t) => parseInt(t.status || 0, 10) !== 2);
  const refundedOrders = orders.filter((o) => parseInt(o.status || 0, 10) === 2 || String(o.delivery_status || "") === "refunded");
  const refundedTotal = refundedOrders.reduce((acc, o) => acc + parseFloat(o.price || 0), 0);

  if (eligibleEl) eligibleEl.textContent = String(eligibleOrders.length);
  if (pendingEl) pendingEl.textContent = String(pendingTickets.length);
  if (sumEl) sumEl.textContent = refundedTotal.toFixed(2);

  if (!container) return;

  const kw = (document.getElementById("frontRefundSearchInput")?.value || "").trim().toLowerCase();
  const matchKw = (text) => !kw || String(text || "").toLowerCase().includes(kw);

  const items = [];

  if (frontRefundFilter === "all" || frontRefundFilter === "tickets") {
    tickets.forEach((t) => {
      const hay = `${t.id || ""} ${t.title || ""} ${t.order_no || ""} ${t.refund_reason || ""}`;
      if (!matchKw(hay)) return;
      const st = parseInt(t.status || 0, 10);
      const badgeClass = st === 2 ? "on" : st === 1 ? "wait" : "wait";
      const statusText = st === 2 ? "已处理 / 已关闭" : st === 1 ? "客服已回复" : "审核处理中";
      const tgtText = t.refund_target === "balance" ? "退回站内余额" : "原路退回";
      const tid = parseInt(t.id || 0, 10);
      items.push(`
        <div class="rf-card">
          <div class="rf-card-head">
            <div>
              <div class="rf-card-title">#${tid} ${escapeHtml(t.title || "退款申请")}</div>
              <div class="rf-card-sub">关联订单：<code>${escapeHtml(t.order_no || "-")}</code> · 更新于 ${escapeHtml(t.updated_at || t.created_at || "-")}</div>
            </div>
            <span class="badge ${badgeClass}">${statusText}</span>
          </div>
          <div class="rf-card-meta">
            <div class="rf-meta-item"><label>退款方式</label><span>${escapeHtml(tgtText)}</span></div>
            <div class="rf-meta-item"><label>退款原因</label><span>${escapeHtml(t.refund_reason || "-")}</span></div>
            <div class="rf-meta-item"><label>提交时间</label><span>${escapeHtml(t.created_at || "-")}</span></div>
          </div>
          <div class="rf-card-foot">
            <button type="button" class="btn btn-outline btn-sm" onclick="showTicketDetail(${tid})">查看工单详情</button>
          </div>
        </div>
      `);
    });
  }

  if (frontRefundFilter === "all" || frontRefundFilter === "eligible") {
    eligibleOrders.forEach((o) => {
      const name = getDisplayProductName(o);
      const hay = `${o.order_no || ""} ${name}`;
      if (!matchKw(hay)) return;
      const oid = parseInt(o.id || 0, 10);
      const orderNo = String(o.order_no || "");
      const refundable = parseFloat(o.refundable_amount || 0);
      const remDays = o.remaining_days !== undefined ? parseFloat(o.remaining_days || 0).toFixed(2) + " 天" : "-";
      items.push(`
        <div class="rf-card">
          <div class="rf-card-head">
            <div>
              <div class="rf-card-title">${escapeHtml(name)}</div>
              <div class="rf-card-sub">订单号：<code>${escapeHtml(orderNo)}</code> · 下单于 ${escapeHtml(o.created_at || "-")}</div>
            </div>
            <span class="badge on">可申请退款</span>
          </div>
          <div class="rf-card-meta">
            <div class="rf-meta-item"><label>实付金额</label><span>${parseFloat(o.price || 0).toFixed(2)} 积分</span></div>
            <div class="rf-meta-item"><label>当前可退</label><span style="color:var(--primary)">${refundable.toFixed(2)} 积分</span></div>
            <div class="rf-meta-item"><label>剩余有效时长</label><span>${remDays}</span></div>
            <div class="rf-meta-item"><label>支付方式</label><span>${escapeHtml(o.payment_method || "-")}</span></div>
          </div>
          <div class="rf-card-foot">
            <button type="button" class="btn btn-outline btn-sm" onclick="showOrderDetail(${oid})">订单详情</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="openRefundModal(${oid}, '${escapeHtml(orderNo)}', ${refundable.toFixed(2)})">申请退款</button>
          </div>
        </div>
      `);
    });
  }

  if (frontRefundFilter === "all" || frontRefundFilter === "refunded") {
    refundedOrders.forEach((o) => {
      const name = getDisplayProductName(o);
      const hay = `${o.order_no || ""} ${name} ${o.refund_reason || ""}`;
      if (!matchKw(hay)) return;
      const oid = parseInt(o.id || 0, 10);
      const orderNo = String(o.order_no || "");
      items.push(`
        <div class="rf-card">
          <div class="rf-card-head">
            <div>
              <div class="rf-card-title">${escapeHtml(name)}</div>
              <div class="rf-card-sub">订单号：<code>${escapeHtml(orderNo)}</code> · 退款时间 ${escapeHtml(o.refund_at || o.updated_at || "-")}</div>
            </div>
            <span class="badge off">已退款</span>
          </div>
          <div class="rf-card-meta">
            <div class="rf-meta-item"><label>订单金额</label><span>${parseFloat(o.price || 0).toFixed(2)} 积分</span></div>
            <div class="rf-meta-item"><label>支付通道</label><span>${escapeHtml(o.payment_method || "-")}</span></div>
            <div class="rf-meta-item"><label>退款说明</label><span>${escapeHtml(o.refund_reason || "管理员操作退款")}</span></div>
          </div>
          <div class="rf-card-foot">
            <button type="button" class="btn btn-outline btn-sm" onclick="showOrderDetail(${oid})">订单详情</button>
          </div>
        </div>
      `);
    });
  }

  if (!items.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${appIcon("rotate-cw", 44, { strokeWidth: 1.5 })}</div>
      <p>${kw ? "没有匹配的退款售后记录" : "暂无相关退款售后记录"}</p>
    </div>`;
    return;
  }

  container.innerHTML = `<div class="rf-list">${items.join("")}</div>`;
}
