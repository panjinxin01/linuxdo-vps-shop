/* =====================================================
   订单管理：筛选 / 搜索 / 行内快捷交付 / 详情 / 可视化退款
   ===================================================== */
let adminOrderFilter = "all";
let adminOrderRows = [];
let adminOrderCache = {};

function setAdminOrderFilter(filterKey, btnEl) {
  adminOrderFilter = filterKey || "all";
  document.querySelectorAll("#adminOrderFilterTabs .admin-filter-tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.filter === adminOrderFilter);
  });
  if (btnEl) btnEl.classList.add("active");
  loadOrders(1);
}

function buildAdminOrderQuery(page) {
  let url = "../api/orders.php?action=all&page=" + page + "&page_size=" + adminOrderPagination.pageSize;
  if (adminOrderFilter === "paid_waiting") {
    url += "&status=1&delivery_status=paid_waiting";
  } else if (adminOrderFilter === "pending_pay") {
    url += "&status=0";
  } else if (adminOrderFilter === "delivered") {
    url += "&status=1&delivery_status=delivered";
  } else if (adminOrderFilter === "exception") {
    url += "&delivery_status=exception";
  } else if (adminOrderFilter === "refunded") {
    url += "&status=2";
  }
  return url;
}

function loadOrders(page = 1) {
  adminOrderPagination.page = page;
  const tbody = document.getElementById("orderTable");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="empty">加载中...</td></tr>';
  apiFetch(buildAdminOrderQuery(page))
    .then((r) => r.json())
    .then((data) => {
      if (data.code !== 1 || !data.data || !data.data.list) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">加载失败</td></tr>';
        return;
      }
      adminOrderRows = data.data.list || [];
      adminOrderCache = {};
      adminOrderRows.forEach((o) => {
        if (o && o.order_no) adminOrderCache[o.order_no] = o;
      });
      renderAdminOrderRows();
      const container = tbody?.closest(".table-wrapper")?.parentNode;
      if (container && data.data.total_pages > 1) {
        removePaginationWidget("orderPagination");
        renderPaginationWidget("orderPagination", page, data.data.total_pages, "loadOrders", container);
      } else {
        removePaginationWidget("orderPagination");
      }
    })
    .catch(() => {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">加载失败，请刷新重试</td></tr>';
    });
}

function filterAdminOrdersClient() {
  renderAdminOrderRows();
}

function renderAdminOrderRows() {
  const tbody = document.getElementById("orderTable");
  if (!tbody) return;
  const kw = (document.getElementById("orderSearchInput")?.value || "").trim().toLowerCase();
  const list = kw
    ? adminOrderRows.filter((o) => {
        const hay = `${o.order_no || ""} ${o.product_name || ""} ${o.username || ""} ${o.linuxdo_username || ""}`.toLowerCase();
        return hay.includes(kw);
      })
    : adminOrderRows;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">${kw ? "没有匹配的订单" : "暂无订单"}</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((o) => {
      const ns = parseInt(o.status || 0);
      const pt = ["待支付", "已支付", "已退款", "已取消"][ns] || "未知";
      const ds = String(o.delivery_status || "");
      const dt = escapeHtml(o.delivery_status_text || ds || "-");
      const priceStr = parseFloat(o.price || 0).toFixed(2);
      const safeOrderNo = escapeHtml(o.order_no || "");
      const canDeliver = ns === 1 && !["delivered", "refunded", "cancelled"].includes(ds);
      const canUpdateCreds = ns === 1 && ds === "delivered";
      const canRefund = ns === 1 && !["refunded", "cancelled"].includes(ds);

      let ah = `<div class="admin-inline-actions">`;
      ah += `<button type="button" class="action-btn edit" onclick="showOrderDetail('${safeOrderNo}')">详情</button>`;
      if (canDeliver) {
        ah += `<button type="button" class="action-btn deliver" onclick="openQuickDeliverModal('${safeOrderNo}')">快捷交付</button>`;
      } else if (canUpdateCreds) {
        ah += `<button type="button" class="action-btn" onclick="openQuickDeliverModal('${safeOrderNo}')">更新交付</button>`;
      }
      if (canRefund) {
        ah += `<button type="button" class="action-btn del" onclick="refundOrder('${safeOrderNo}', ${priceStr})">退款</button>`;
      }
      if (ns !== 1) {
        ah += `<button type="button" class="action-btn del" onclick="deleteOrder('${safeOrderNo}')">删除</button>`;
      }
      ah += `</div>`;

      return `<tr>
        <td><code>${safeOrderNo}</code></td>
        <td>${escapeHtml(o.product_name || "商品已删除")}<div class="compact-meta">${dt}</div></td>
        <td>${escapeHtml(o.username || "-")}</td>
        <td>${priceStr}<div class="compact-meta">${escapeHtml(o.payment_method || "-")}</div></td>
        <td><span class="badge ${ns === 1 ? "on" : ns === 0 ? "wait" : "off"}">${pt}</span></td>
        <td>${escapeHtml(o.created_at || "")}</td>
        <td>${ah}</td>
      </tr>`;
    })
    .join("");
}

async function deleteOrder(orderNo) {
  const ok = await showConfirmModal({
    title: "删除订单",
    message: `确定要删除订单 ${orderNo} 吗？\n删除后将释放相关锁定状态且不可恢复。`,
    confirmText: "确认删除",
    danger: true,
  });
  if (!ok) return;
  const body = new FormData();
  body.append("action", "delete");
  body.append("order_no", orderNo);
  apiFetch("../api/orders.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      showToast(data.msg || (data.code === 1 ? "订单已删除" : "删除失败"), data.code === 1 ? "success" : "error");
      if (data.code === 1) {
        loadOrders(adminOrderPagination.page || 1);
        loadStats();
      }
    })
    .catch(() => showToast("删除请求失败", "error"));
}

async function batchDeleteOrders(type) {
  const tt = type === "expired" ? "已取消/超时" : type === "refunded" ? "已退款" : "待支付";
  const ok = await showConfirmModal({
    title: "批量清理订单",
    message: `确定要删除所有“${tt}”的订单吗？\n此操作不可恢复。`,
    confirmText: "确认清理",
    danger: true,
  });
  if (!ok) return;
  const body = new FormData();
  body.append("action", "batch_delete");
  body.append("type", type);
  apiFetch("../api/orders.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      showToast(data.msg || "批量清理完成", data.code === 1 ? "success" : "error");
      if (data.code === 1) {
        loadOrders(1);
        loadStats();
      }
    })
    .catch(() => showToast("批量删除请求失败", "error"));
}

function exportData(type) {
  const link = document.createElement("a");
  link.href = "../api/export.php?type=" + encodeURIComponent(type);
  link.download = "";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("已开始导出 CSV 文件", "info");
}

// ==================== 快捷交付弹窗 ====================
function openQuickDeliverModal(orderNo) {
  const cached = adminOrderCache[orderNo];
  const openWithOrder = (o) => {
    if (!o) {
      showToast("未找到订单信息", "error");
      return;
    }
    adminOrderCache[o.order_no] = o;
    document.getElementById("qdOrderNo").value = o.order_no;
    document.getElementById("qdModalTitle").textContent =
      o.delivery_status === "delivered" ? "更新交付信息" : "快捷交付订单";
    document.getElementById("qdOrderSummary").innerHTML =
      `<div><strong>订单号：</strong><code>${escapeHtml(o.order_no)}</code></div>` +
      `<div><strong>商品：</strong>${escapeHtml(o.product_name || "商品")} · <strong>用户：</strong>${escapeHtml(o.username || "-")}</div>` +
      `<div><strong>主机 IP：</strong>${escapeHtml(o.ip_address || "待填")} · <strong>当前状态：</strong>${escapeHtml(o.delivery_status_text || o.delivery_status || "-")}</div>`;
    const statusSel = document.getElementById("qdDeliveryStatus");
    if (statusSel) {
      statusSel.value = ["provisioning", "exception"].includes(o.delivery_status) ? o.delivery_status : "delivered";
    }
    document.getElementById("qdDeliveryInfo").value = o.delivery_info || "";
    document.getElementById("qdDeliveryNote").value = o.delivery_note || "";
    document.getElementById("qdDeliveryError").value = o.delivery_error || "";
    document.getElementById("quickDeliverModal").classList.add("show");
  };

  if (cached && (cached.ip_address !== undefined || cached.delivery_info !== undefined)) {
    openWithOrder(cached);
    return;
  }
  apiFetch("../api/orders.php?action=detail&order_no=" + encodeURIComponent(orderNo))
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1 && data.data) openWithOrder(data.data);
      else showToast(data.msg || "获取订单信息失败", "error");
    })
    .catch(() => showToast("请求订单信息失败", "error"));
}

function closeQuickDeliverModal() {
  const m = document.getElementById("quickDeliverModal");
  if (m) m.classList.remove("show");
}

function fillQuickDeliverFromOrder() {
  const orderNo = document.getElementById("qdOrderNo")?.value;
  const o = adminOrderCache[orderNo] || {};
  const lines = [
    `服务器 IP: ${o.ip_address || "请填写IP"}`,
    `SSH 端口: ${o.ssh_port || 22}`,
    `登录用户: ${o.ssh_user || "root"}`,
    `初始密码: ${o.ssh_password || "请在商品或订单内核对"}`,
    `系统镜像: ${o.os_type || "Linux"}`,
  ];
  document.getElementById("qdDeliveryInfo").value = lines.join("\n");
  if (!document.getElementById("qdDeliveryNote").value.trim()) {
    document.getElementById("qdDeliveryNote").value = "已完成服务器开通与连通性检查";
  }
  showToast("已填充标准 SSH 交付信息", "info");
}

function submitQuickDeliver() {
  const orderNo = document.getElementById("qdOrderNo").value;
  const status = document.getElementById("qdDeliveryStatus").value || "delivered";
  const info = (document.getElementById("qdDeliveryInfo").value || "").trim();
  const note = (document.getElementById("qdDeliveryNote").value || "").trim();
  const err = (document.getElementById("qdDeliveryError").value || "").trim();
  const btn = document.getElementById("qdSubmitBtn");

  if (status === "exception" && !err) {
    showToast("标记为异常状态时请填写异常说明", "warning");
    document.getElementById("qdDeliveryError").focus();
    return;
  }
  if (btn) btn.disabled = true;

  const body = new FormData();
  body.append("action", "update_delivery_status");
  body.append("order_no", orderNo);
  body.append("delivery_status", status);
  body.append("delivery_info", info);
  body.append("delivery_note", note);
  body.append("delivery_error", err);

  apiFetch("../api/orders.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        showToast("交付状态已更新并已通知用户", "success");
        closeQuickDeliverModal();
        loadOrders(adminOrderPagination.page || 1);
        loadStats();
        if (document.getElementById("orderAdminModal")?.classList.contains("show")) {
          showOrderDetail(orderNo);
        }
      } else {
        showToast(data.msg || "更新失败", "error");
      }
    })
    .catch(() => showToast("更新请求失败", "error"))
    .finally(() => {
      if (btn) btn.disabled = false;
    });
}

// ==================== 订单详情 / 可视化退款 ====================
function closeOrderAdminModal() {
  const m = document.getElementById("orderAdminModal");
  if (m) m.classList.remove("show");
}

function showOrderDetail(orderNo) {
  apiFetch("../api/orders.php?action=detail&order_no=" + encodeURIComponent(orderNo))
    .then((r) => r.json())
    .then((data) => {
      if (data.code !== 1 || !data.data) {
        showToast(data.msg || "获取订单详情失败", "error");
        return;
      }
      const o = data.data;
      adminOrderCache[o.order_no] = o;
      const pt = ["待支付", "已支付", "已退款", "已取消"][parseInt(o.status || 0)] || "未知";
      const dt = escapeHtml(o.delivery_status_text || o.delivery_status || "-");
      const statuses = {
        pending: "待支付",
        paid_waiting: "待开通",
        provisioning: "处理中",
        delivered: "已交付",
        exception: "异常",
        refunded: "已退款",
        cancelled: "已取消",
      };
      const canRefund = parseInt(o.status || 0) === 1 && !["refunded", "cancelled"].includes(String(o.delivery_status || ""));
      document.getElementById("orderAdminTitle").textContent = "订单详情";
      document.getElementById("orderAdminBody").innerHTML = `<div style="display:grid;gap:10px">
        <div><strong>订单号：</strong><code>${escapeHtml(o.order_no)}</code></div>
        <div><strong>商品：</strong>${escapeHtml(o.product_name || "已删除")}</div>
        <div><strong>用户：</strong>${escapeHtml(o.username || "-")}</div>
        <div><strong>支付状态：</strong>${pt} · <strong>交付状态：</strong>${dt}</div>
        <div><strong>金额：</strong>${parseFloat(o.price || 0).toFixed(2)} 积分（余额 ${parseFloat(o.balance_paid_amount || 0).toFixed(2)} / 外部 ${parseFloat(o.external_pay_amount || 0).toFixed(2)}）</div>
        <div><strong>支付方式：</strong>${escapeHtml(o.payment_method || "-")}</div>
        ${o.trade_no ? `<div><strong>交易号：</strong>${escapeHtml(o.trade_no)}</div>` : ""}
        ${o.refund_at ? `<div><strong>退款时间：</strong>${escapeHtml(o.refund_at)}${o.refund_reason ? `（${escapeHtml(o.refund_reason)}）` : ""}</div>` : ""}
        ${o.delivery_info ? `<div><strong>交付信息：</strong><span style="white-space:pre-wrap">${escapeHtml(o.delivery_info)}</span></div>` : ""}
        ${o.delivery_note ? `<div><strong>交付备注：</strong><span style="white-space:pre-wrap">${escapeHtml(o.delivery_note)}</span></div>` : ""}
        ${o.delivery_error ? `<div><strong>异常说明：</strong><span style="white-space:pre-wrap">${escapeHtml(o.delivery_error)}</span></div>` : ""}
        <div><strong>创建时间：</strong>${escapeHtml(o.created_at || "")}</div>
        ${o.paid_at ? `<div><strong>支付时间：</strong>${escapeHtml(o.paid_at)}</div>` : ""}
        ${o.delivery_updated_at ? `<div><strong>交付更新时间：</strong>${escapeHtml(o.delivery_updated_at)}</div>` : ""}
        <div style="margin-top:8px;padding-top:12px;border-top:1px solid var(--border)">
          <div class="form-group"><label>交付状态</label><select id="orderDeliveryStatus">${Object.keys(statuses).map((k) => `<option value="${k}" ${o.delivery_status === k ? "selected" : ""}>${statuses[k]}</option>`).join("")}</select></div>
          <div class="form-group"><label>交付信息</label><textarea id="orderDeliveryInfo" rows="4" placeholder="填写登录地址、面板地址、到期时间、补充说明等">${escapeHtml(o.delivery_info || "")}</textarea></div>
          <div class="form-group"><label>交付备注</label><textarea id="orderDeliveryNote" rows="2">${escapeHtml(o.delivery_note || "")}</textarea></div>
          <div class="form-group"><label>异常原因</label><textarea id="orderDeliveryError" rows="2">${escapeHtml(o.delivery_error || "")}</textarea></div>
          <div class="admin-inline-actions">
            <button type="button" class="btn btn-primary" onclick="saveOrderDeliveryStatus('${escapeHtml(o.order_no)}')">保存交付状态</button>
            ${canRefund ? `<button type="button" class="btn btn-danger" onclick="refundOrder('${escapeHtml(o.order_no)}', ${parseFloat(o.price || 0).toFixed(2)})">立即退款</button>` : ""}
          </div>
        </div>
      </div>`;
      document.getElementById("orderAdminFoot").innerHTML = `<button type="button" class="btn btn-outline" onclick="closeOrderAdminModal()">关闭</button>`;
      document.getElementById("orderAdminModal").classList.add("show");
    })
    .catch(() => showToast("获取订单详情失败", "error"));
}

function saveOrderDeliveryStatus(orderNo) {
  const se = document.getElementById("orderDeliveryStatus");
  const info = (document.getElementById("orderDeliveryInfo")?.value || "").trim();
  let status = se ? se.value : "paid_waiting";
  if (info && ["pending", "paid_waiting", "provisioning"].includes(status)) {
    status = "delivered";
    if (se) se.value = status;
  }
  const body = new FormData();
  body.append("action", "update_delivery_status");
  body.append("order_no", orderNo);
  body.append("delivery_status", status);
  body.append("delivery_info", info);
  body.append("delivery_note", document.getElementById("orderDeliveryNote")?.value || "");
  body.append("delivery_error", document.getElementById("orderDeliveryError")?.value || "");
  apiFetch("../api/orders.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        showToast("交付状态已更新", "success");
        loadOrders(adminOrderPagination.page || 1);
        showOrderDetail(orderNo);
      } else {
        showToast(data.msg || "更新失败", "error");
      }
    })
    .catch(() => showToast("更新请求失败", "error"));
}

function saveOrderNote(orderNo) {
  const note = document.getElementById("orderAdminNote")?.value || "";
  const body = new FormData();
  body.append("action", "update_note");
  body.append("order_no", orderNo);
  body.append("admin_note", note);
  apiFetch("../api/orders.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) showToast("备注已保存", "success");
      else showToast(data.msg || "保存失败", "error");
    });
}

function markOrderDelivered(orderNo) {
  const info = document.getElementById("orderDeliveryInfo")?.value || "";
  const body = new FormData();
  body.append("action", "mark_delivered");
  body.append("order_no", orderNo);
  body.append("delivery_info", info);
  apiFetch("../api/orders.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        showToast("已标记交付", "success");
        showOrderDetail(orderNo);
      } else {
        showToast(data.msg || "操作失败", "error");
      }
    });
}

function syncAdminRefundTargetCards() {
  document.querySelectorAll("#adminRefundTargetList .refund-target-card").forEach((card) => {
    const radio = card.querySelector('input[name="rfTarget"]');
    card.classList.toggle("is-checked", !!(radio && radio.checked));
  });
}

function refundOrder(orderNo, price) {
  const cached = adminOrderCache[orderNo] || {};
  const titleEl = document.getElementById("rfModalTitle");
  if (titleEl) titleEl.textContent = "订单退款确认";
  const tidEl = document.getElementById("rfTicketId");
  if (tidEl) tidEl.value = "";
  document.getElementById("rfOrderNo").value = orderNo;
  document.getElementById("rfOrderSummary").innerHTML =
    `<div><strong>订单号：</strong><code>${escapeHtml(orderNo)}</code></div>` +
    `<div><strong>商品：</strong>${escapeHtml(cached.product_name || "订单商品")} · <strong>用户：</strong>${escapeHtml(cached.username || "-")}</div>` +
    `<div><strong>退款金额：</strong><span style="color:var(--danger);font-weight:700">${parseFloat(price || 0).toFixed(2)} 积分</span></div>`;
  const origRadio = document.querySelector('input[name="rfTarget"][value="original"]');
  if (origRadio) origRadio.checked = true;
  syncAdminRefundTargetCards();
  const reasonEl = document.getElementById("rfReason");
  if (reasonEl) reasonEl.value = "人工退款";
  const btn = document.getElementById("rfSubmitBtn");
  if (btn) btn.textContent = "确认立即退款";
  document.getElementById("adminRefundModal").classList.add("show");
}

function openAdminRefundTicketModal(ticketId) {
  const t = (typeof TicketState !== "undefined" && TicketState.ticketCache && TicketState.ticketCache[ticketId]) ||
    (typeof adminRefundTickets !== "undefined" ? adminRefundTickets.find((x) => parseInt(x.id || 0, 10) === parseInt(ticketId, 10)) : null) ||
    {};
  const orderNo = t.order_no || "";
  const oi = t.order_info || adminOrderCache[orderNo] || {};
  const price = parseFloat((oi && oi.price) || t.refund_amount || 0);
  const titleEl = document.getElementById("rfModalTitle");
  if (titleEl) titleEl.textContent = "审批退款工单 #" + ticketId;
  const tidEl = document.getElementById("rfTicketId");
  if (tidEl) tidEl.value = String(ticketId || "");
  document.getElementById("rfOrderNo").value = orderNo;
  document.getElementById("rfOrderSummary").innerHTML =
    `<div><strong>退款工单：</strong>#${parseInt(ticketId || 0, 10)} · ${escapeHtml(t.title || "退款申请")}</div>` +
    `<div><strong>关联订单：</strong><code>${escapeHtml(orderNo || "-")}</code> · <strong>用户：</strong>${escapeHtml(t.username || oi.username || "-")}</div>` +
    `<div><strong>实付/待退参考：</strong><span style="color:var(--danger);font-weight:700">${price > 0 ? price.toFixed(2) + " 积分（按系统规则核算）" : "按订单剩余时长核算"}</span></div>`;
  const desiredTarget = t.refund_target === "balance" ? "balance" : "original";
  const targetRadio = document.querySelector(`input[name="rfTarget"][value="${desiredTarget}"]`);
  if (targetRadio) targetRadio.checked = true;
  syncAdminRefundTargetCards();
  const reasonEl = document.getElementById("rfReason");
  if (reasonEl) reasonEl.value = (t.refund_reason || "工单退款").trim();
  const btn = document.getElementById("rfSubmitBtn");
  if (btn) btn.textContent = "同意并执行退款";
  document.getElementById("adminRefundModal").classList.add("show");
}

function closeAdminRefundModal() {
  const m = document.getElementById("adminRefundModal");
  if (m) m.classList.remove("show");
}

function setRefundReason(reason) {
  const el = document.getElementById("rfReason");
  if (el) {
    el.value = reason;
    el.focus();
  }
}

function submitAdminRefund() {
  const ticketId = parseInt(document.getElementById("rfTicketId")?.value || "0", 10);
  const orderNo = document.getElementById("rfOrderNo").value;
  const targetEl = document.querySelector('input[name="rfTarget"]:checked');
  const mode = targetEl ? targetEl.value : "original";
  const reason = (document.getElementById("rfReason")?.value || "").trim() || (ticketId ? "工单退款" : "人工退款");
  const btn = document.getElementById("rfSubmitBtn");
  if (btn) btn.disabled = true;

  let reqPromise;
  if (ticketId > 0) {
    const body = new FormData();
    body.append("action", "approve_refund");
    body.append("ticket_id", String(ticketId));
    body.append("refund_target", mode);
    body.append("refund_reason", reason);
    reqPromise = apiFetch("../api/tickets.php", { method: "POST", body }).then((r) => r.json());
  } else {
    const body = new FormData();
    body.append("action", "refund");
    body.append("order_no", orderNo);
    body.append("refund_target", mode);
    body.append("refund_reason", reason);
    reqPromise = apiFetch("../api/orders.php", { method: "POST", body }).then((r) => r.json());
  }

  reqPromise
    .then((data) => {
      showToast(data.msg || (data.code === 1 ? "退款成功" : "退款失败"), data.code === 1 ? "success" : "error");
      if (data.code === 1) {
        closeAdminRefundModal();
        closeOrderAdminModal();
        loadOrders(adminOrderPagination.page || 1);
        loadStats();
        if (typeof loadTickets === "function") loadTickets();
        if (typeof loadTicketStats === "function") loadTicketStats();
        if (typeof loadAdminRefunds === "function") loadAdminRefunds();
      }
    })
    .catch(() => showToast("退款请求失败", "error"))
    .finally(() => {
      if (btn) btn.disabled = false;
    });
}
