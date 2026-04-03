// ==================== 订单 / 退款 / 凭据模块 ====================
// 前台订单详情、退款申请、VPS凭据展示

// 解析交付信息中的连接凭据
function parseDeliveryCredentials(text) {
  const raw = String(text || "");
  if (!raw) return {};
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result = {};
  const patterns = [
    { key: "ip_address", regex: /^(?:ip|ip地址|ipv4|地址|host|主机)\s*[:：]\s*(.+)$/i },
    { key: "ssh_port", regex: /^(?:ssh端口|端口|port)\s*[:：]\s*(.+)$/i },
    { key: "ssh_user", regex: /^(?:ssh账号|ssh用户|用户名|账号|用户|user|username|login)\s*[:：]\s*(.+)$/i },
    { key: "ssh_password", regex: /^(?:ssh密码|密码|pass|password|pwd)\s*[:：]\s*(.+)$/i },
  ];
  lines.forEach((line) => {
    patterns.forEach((item) => {
      if (result[item.key]) return;
      const match = line.match(item.regex);
      if (match && match[1]) result[item.key] = match[1].trim();
    });
  });
  return result;
}

// 判断订单凭据是否允许查看
function orderCredentialsAllowed(order) {
  if (!order) return false;
  const numericStatus = parseInt(order.status || 0);
  const delivery = String(order.delivery_status || "");
  return numericStatus === 1 && !["refunded", "cancelled", "exception"].includes(delivery);
}

// 构建 VPS 凭据展示区 HTML
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

// 通过 data 属性复制（防 XSS）
function copyFromData(btn) {
  if (!credentialCopyAllowedFromDom(btn)) {
    showToast("当前订单状态不允许复制连接信息");
    return;
  }
  const text = btn && btn.dataset ? btn.dataset.copy : "";
  if (text) copyToClipboard(text, btn);
}

// 复制全部 VPS 信息
function copyAllVpsFromData(btn) {
  if (!credentialCopyAllowedFromDom(btn)) {
    showToast("当前订单状态不允许复制连接信息");
    return;
  }
  const ip = (btn && btn.dataset) ? btn.dataset.ip : "";
  const port = (btn && btn.dataset) ? btn.dataset.port : "";
  const user = (btn && btn.dataset) ? btn.dataset.user : "";
  const pass = (btn && btn.dataset) ? btn.dataset.pass : "";
  const text = `IP: ${ip}\n端口: ${port}\n用户: ${user}\n密码: ${pass}`;
  copyToClipboard(text, null);
}

// DOM 判断是否允许复制凭据
function credentialCopyAllowedFromDom(btn) {
  if (!btn) return true;
  const wrap = btn.closest("#orderDetailBody, .card, .order-item, [data-order-no]");
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

// 判断是否可申请退款
function canRequestRefund(order) {
  if (!order) return false;
  const numericStatus = parseInt(order.status || 0);
  const delivery = String(order.delivery_status || "");
  const refundable = parseFloat(order.refundable_amount || 0);
  return numericStatus === 1 && !["refunded", "cancelled"].includes(delivery) && refundable > 0;
}

// 获取可退金额文本
function getRefundAmountText(order) {
  const amount = parseFloat((order && order.refundable_amount) || 0);
  if (!(amount > 0)) return "0.00 积分";
  return amount.toFixed(2) + " 积分";
}

// 获取显示用商品名
function getDisplayProductName(order) {
  return (
    order.product_name ||
    order.product_name_snapshot ||
    (order.product_id ? "商品#" + order.product_id : "历史订单")
  );
}

// 构建订单规格快照 HTML
function getOrderSpecHtml(order) {
  const specPairs = [
    ["CPU", order.cpu],
    ["内存", order.memory],
    ["硬盘", order.disk],
    ["带宽", order.bandwidth],
    ["地区", order.region],
    ["线路", order.line_type],
    ["系统", order.os_type],
  ].filter((row) => row[1]);
  if (!specPairs.length) {
    return '<div style="margin-top:12px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.04);color:var(--text-muted)">该订单暂未记录规格快照。常见原因是下单时数据库还没补齐快照字段，或原商品已被删除。部署本次修复后，先在后台执行一次数据库更新，之后新订单会自动保留规格与连接快照。</div>';
  }
  return (
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:14px">' +
    specPairs.map((row) =>
      '<div style="padding:12px;border-radius:12px;background:rgba(255,255,255,0.04)"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">' +
      row[0] +
      '</div><div style="font-weight:600;color:var(--text-main)">' +
      escapeHtml(String(row[1])) +
      "</div></div>"
    ).join("") +
    "</div>"
  );
}

// 退款弹窗（通用）
function requestRefund(orderId, orderNo, amount) {
  openRefundModal(orderId, orderNo, amount);
}

function openRefundModal(orderId, orderNo, amount) {
  if (typeof currentUser !== "undefined" && !currentUser) {
    if (typeof showLogin === "function") showLogin();
    return;
  }
  const order = (typeof cachedOrderList !== "undefined" ? cachedOrderList : []).find(
    (item) => parseInt(item.id || 0) === parseInt(orderId || 0) || String(item.order_no || "") === String(orderNo || "")
  ) || null;
  const computedAmount = order
    ? parseFloat(order.refundable_amount || amount || 0)
    : parseFloat(amount || 0);
  if (!(computedAmount > 0)) {
    alert("当前订单剩余时长为 0，可退金额为 0");
    return;
  }
  const modal = document.getElementById("refundModal");
  if (!modal) {
    // Fallback: prompt 方式
    const refundTarget =
      ((prompt("请选择退款方式：\noriginal = 原路退回\nbalance = 退回站内余额", "original") || "original").trim().toLowerCase() === "balance")
        ? "balance" : "original";
    const refundReason = (prompt("请输入退款原因", "无法登录 / 交付异常") || "").trim();
    if (!refundReason) return;
    const extra = (prompt("补充说明（可留空）", "") || "").trim();
    const body = new FormData();
    body.append("action", "create_refund_request");
    body.append("order_id", String(orderId || ""));
    body.append("refund_target", refundTarget);
    body.append("refund_reason", refundReason);
    body.append("content", extra);
    apiFetch("api/tickets.php", { method: "POST", body, credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (data.code === 1) {
          alert("退款申请已提交，管理员同意后会自动退款");
          if (typeof loadMyTickets === "function") loadMyTickets();
          if (typeof loadMyOrders === "function") loadMyOrders(typeof orderPagination !== "undefined" ? orderPagination.page || 1 : 1);
        } else {
          alert(data.msg || "退款申请提交失败");
        }
      })
      .catch(() => alert("退款申请提交失败"));
    return;
  }
  // 弹窗方式
  const idEl = document.getElementById("refundOrderId");
  const noEl = document.getElementById("refundModalOrderNo");
  const amountEl = document.getElementById("refundModalAmount");
  const reasonEl = document.getElementById("refundReason");
  const contentEl = document.getElementById("refundContent");
  if (idEl) idEl.value = String(orderId || "");
  if (noEl) noEl.textContent = orderNo || "-";
  if (amountEl) {
    const remainingText = order && order.remaining_days !== undefined
      ? "（剩余 " + parseFloat(order.remaining_days || 0).toFixed(2) + " 天）" : "";
    amountEl.textContent = computedAmount.toFixed(2) + " 积分 " + remainingText;
  }
  if (reasonEl) reasonEl.value = "";
  if (contentEl) contentEl.value = "";
  const defaultRadio = document.querySelector('input[name="refundTarget"][value="original"]');
  if (defaultRadio) defaultRadio.checked = true;
  modal.classList.add("show");
}

function closeRefundModal() {
  const modal = document.getElementById("refundModal");
  if (modal) modal.classList.remove("show");
}

function submitRefundRequest() {
  if (typeof currentUser !== "undefined" && !currentUser) {
    if (typeof showLogin === "function") showLogin();
    return;
  }
  const orderId = parseInt(document.getElementById("refundOrderId")?.value || "0");
  const refundTarget = document.querySelector('input[name="refundTarget"]:checked')?.value || "original";
  const refundReason = (document.getElementById("refundReason")?.value || "").trim();
  const extra = (document.getElementById("refundContent")?.value || "").trim();
  if (!orderId) { alert("订单信息缺失"); return; }
  if (!refundReason) { alert("请填写退款原因"); return; }
  const body = new FormData();
  body.append("action", "create_refund_request");
  body.append("order_id", String(orderId));
  body.append("refund_target", refundTarget);
  body.append("refund_reason", refundReason);
  body.append("content", extra);
  apiFetch("api/tickets.php", { method: "POST", body, credentials: "same-origin" })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        closeRefundModal();
        alert("退款申请已提交，管理员同意后会自动退款");
        if (typeof loadMyTickets === "function") loadMyTickets();
        if (typeof loadMyOrders === "function") loadMyOrders(typeof orderPagination !== "undefined" ? orderPagination.page || 1 : 1);
      } else {
        alert(data.msg || "退款申请提交失败");
      }
    })
    .catch(() => alert("退款申请提交失败"));
}

function closeOrderDetail() {
  const modal = document.getElementById("orderDetailModal");
  if (modal) modal.classList.remove("show");
}
