// ==================== 订单 / 退款 / 凭据模块 ====================
// 前台订单详情、退款申请、一键复制 VPS 连接凭据

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

// 统一提取连接凭据对象
function extractOrderCredentials(order) {
  const parsed = parseDeliveryCredentials(order && order.delivery_info ? order.delivery_info : "");
  const ip = (order && order.ip_address) || parsed.ip_address || "";
  const port = String((order && order.ssh_port) || parsed.ssh_port || "22");
  const user = (order && order.ssh_user) || parsed.ssh_user || "root";
  const pass = (order && order.ssh_password) || parsed.ssh_password || "";
  const hasCred = !!(ip || pass || (order && order.ssh_user) || parsed.ssh_user || parsed.ssh_port);
  return { ip, port, user, pass, hasCred };
}

// 密码显示/隐藏切换
function toggleCredentialPass(btn) {
  if (!btn) return;
  const row = btn.closest(".ssh-row");
  if (!row) return;
  const codeEl = row.querySelector(".ssh-pass-code");
  if (!codeEl) return;
  const shown = codeEl.dataset.shown === "1";
  const realPass = codeEl.dataset.pass || "";
  if (shown) {
    codeEl.textContent = realPass ? "••••••••••••" : "-";
    codeEl.dataset.shown = "0";
    btn.title = "显示密码";
    btn.setAttribute("aria-label", "显示密码");
    btn.innerHTML = appIcon("eye", 13);
  } else {
    codeEl.textContent = realPass || "-";
    codeEl.dataset.shown = "1";
    btn.title = "隐藏密码";
    btn.setAttribute("aria-label", "隐藏密码");
    btn.innerHTML = appIcon("eye-off", 13);
  }
}

// 构建结构化 VPS 连接凭据面板（供实例卡片与订单详情共用）
function buildOrderCredentialView(order, opts) {
  const o = opts || {};
  const compact = !!o.compact;
  if (!orderCredentialsAllowed(order)) {
    return '<div style="margin-top:12px;padding:10px 12px;border-radius:var(--radius-md);background:var(--bg-muted);border:1px solid var(--border-light);color:var(--text-muted);font-size:12.5px">当前订单状态不支持查看或复制连接凭据</div>';
  }
  const cred = extractOrderCredentials(order);
  if (!cred.hasCred) {
    return '<div style="margin-top:12px;padding:10px 12px;border-radius:var(--radius-md);background:var(--warning-bg);color:var(--warning);font-size:12.5px">实例凭据将在交付完成后显示</div>';
  }
  const copyIcon = appIcon("copy", 12);
  const sshCmd = cred.ip ? `ssh ${cred.user}@${cred.ip}${cred.port && cred.port !== "22" ? " -p " + cred.port : ""}` : "";

  return `<div class="ssh-panel" style="margin-top:${compact ? "12px" : "16px"}">
    <div class="ssh-panel-head">
      <span class="ssh-panel-title">
        ${appIcon("terminal", 13)}
        SSH 连接凭据
      </span>
      <button type="button" class="copy-btn" data-ip="${escapeHtml(cred.ip)}" data-port="${escapeHtml(cred.port)}" data-user="${escapeHtml(cred.user)}" data-pass="${escapeHtml(cred.pass)}" onclick="event.stopPropagation();copyAllVpsFromData(this)">${copyIcon}<span>复制全部</span></button>
    </div>
    <div class="ssh-row">
      <span class="ssh-label">IP 地址</span>
      <div class="ssh-value">
        <code class="ssh-code">${escapeHtml(cred.ip || "-")}</code>
        ${cred.ip ? `<button type="button" class="copy-btn" data-copy="${escapeHtml(cred.ip)}" onclick="event.stopPropagation();copyFromData(this)">${copyIcon}<span>复制</span></button>` : ""}
      </div>
    </div>
    <div class="ssh-row">
      <span class="ssh-label">SSH 端口</span>
      <div class="ssh-value">
        <code class="ssh-code">${escapeHtml(cred.port)}</code>
        <button type="button" class="copy-btn" data-copy="${escapeHtml(cred.port)}" onclick="event.stopPropagation();copyFromData(this)">${copyIcon}<span>复制</span></button>
      </div>
    </div>
    <div class="ssh-row">
      <span class="ssh-label">用户名</span>
      <div class="ssh-value">
        <code class="ssh-code">${escapeHtml(cred.user)}</code>
        <button type="button" class="copy-btn" data-copy="${escapeHtml(cred.user)}" onclick="event.stopPropagation();copyFromData(this)">${copyIcon}<span>复制</span></button>
      </div>
    </div>
    <div class="ssh-row">
      <span class="ssh-label">密码</span>
      <div class="ssh-value">
        <code class="ssh-code ssh-pass-code" data-pass="${escapeHtml(cred.pass)}" data-shown="0">${cred.pass ? "••••••••••••" : "-"}</code>
        ${cred.pass ? `<button type="button" class="ssh-icon-btn" title="显示密码" aria-label="显示密码" onclick="event.stopPropagation();toggleCredentialPass(this)">${appIcon("eye", 13)}</button>` : ""}
        ${cred.pass ? `<button type="button" class="copy-btn" data-copy="${escapeHtml(cred.pass)}" onclick="event.stopPropagation();copyFromData(this)">${copyIcon}<span>复制</span></button>` : ""}
      </div>
    </div>
    ${sshCmd ? `<div class="ssh-cmd-bar">
      <span class="ssh-cmd-text" title="${escapeHtml(sshCmd)}">${escapeHtml(sshCmd)}</span>
      <button type="button" class="copy-btn" data-copy="${escapeHtml(sshCmd)}" onclick="event.stopPropagation();copyFromData(this)">${copyIcon}<span>复制命令</span></button>
    </div>` : ""}
  </div>`;
}

// 通过 data 属性复制（防 XSS）
function copyFromData(btn) {
  if (!credentialCopyAllowedFromDom(btn)) return;
  const text = btn && btn.dataset ? btn.dataset.copy : "";
  if (text) copyToClipboard(text, btn);
}

// 复制全部 VPS 信息
function copyAllVpsFromData(btn) {
  if (!credentialCopyAllowedFromDom(btn)) return;
  const ip = btn && btn.dataset ? btn.dataset.ip : "";
  const port = btn && btn.dataset ? btn.dataset.port : "";
  const user = btn && btn.dataset ? btn.dataset.user : "";
  const pass = btn && btn.dataset ? btn.dataset.pass : "";
  const text = `IP: ${ip}\nSSH端口: ${port}\n用户名: ${user}\n密码: ${pass}\nSSH命令: ssh ${user}@${ip}${port && port !== "22" ? " -p " + port : ""}`;
  copyToClipboard(text, btn, "已复制全部连接信息");
}

// DOM 判断是否允许复制凭据
function credentialCopyAllowedFromDom(btn) {
  if (!btn) return true;
  const wrap = btn.closest("#orderDetailBody, .card, .order-item, [data-order-no]");
  if (!wrap) return true;
  const status = wrap.dataset ? wrap.dataset.status : undefined;
  const deliveryStatus = wrap.dataset ? wrap.dataset.deliveryStatus : undefined;
  if (status !== undefined) {
    const numericStatus = parseInt(status || "0");
    if (numericStatus !== 1) {
      showToast("当前订单状态不允许复制连接信息", "warning");
      return false;
    }
  }
  if (deliveryStatus !== undefined) {
    if (["refunded", "cancelled", "exception"].indexOf(deliveryStatus) !== -1) {
      showToast(
        "当前订单" + (deliveryStatus === "refunded" ? "已退款" : deliveryStatus === "cancelled" ? "已取消" : "状态异常") + "，不可复制连接信息",
        "warning"
      );
      return false;
    }
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
  if (!specPairs.length) return "";
  return (
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:12px">' +
    specPairs
      .map(
        (row) =>
          '<div style="padding:10px 12px;border-radius:var(--radius-md);background:var(--bg-muted);border:1px solid var(--border-light)"><div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">' +
          row[0] +
          '</div><div style="font-weight:600;font-size:13px;color:var(--text-main)">' +
          escapeHtml(String(row[1])) +
          "</div></div>"
      )
      .join("") +
    "</div>"
  );
}

// 退款弹窗（通用）
function requestRefund(orderId, orderNo, amount) {
  openRefundModal(orderId, orderNo, amount);
}

function syncFrontRefundTargetCards() {
  document.querySelectorAll("#refundTargetList .refund-option-card").forEach((card) => {
    const radio = card.querySelector('input[name="refundTarget"]');
    card.classList.toggle("is-checked", !!(radio && radio.checked));
  });
}

function setFrontRefundReason(text) {
  const el = document.getElementById("refundReason");
  if (!el) return;
  el.value = text || "";
  el.focus();
}

function openRefundModal(orderId, orderNo, amount) {
  if (typeof currentUser !== "undefined" && !currentUser) {
    if (typeof showLogin === "function") showLogin();
    return;
  }
  const order =
    (typeof cachedOrderList !== "undefined" ? cachedOrderList : []).find(
      (item) => parseInt(item.id || 0) === parseInt(orderId || 0) || String(item.order_no || "") === String(orderNo || "")
    ) || null;
  const computedAmount = order
    ? parseFloat(order.refundable_amount || amount || 0)
    : parseFloat(amount || 0);
  if (!(computedAmount > 0)) {
    showToast("当前订单剩余时长为 0，可退金额为 0", "warning");
    return;
  }
  const modal = document.getElementById("refundModal");
  if (!modal) {
    showToast("退款弹窗未加载，请刷新页面后重试", "error");
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
  const defaultRadio = document.querySelector('input[name="refundTarget"][value="original"]');
  if (defaultRadio) defaultRadio.checked = true;
  syncFrontRefundTargetCards();
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
  if (!orderId) {
    showToast("订单信息缺失", "error");
    return;
  }
  if (!refundReason) {
    showToast("请填写退款原因", "warning");
    document.getElementById("refundReason")?.focus();
    return;
  }
  const submitBtn = document.getElementById("refundSubmitBtn");
  const origText = submitBtn ? submitBtn.textContent : "提交退款申请";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中...";
  }
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
        showToast("退款申请已提交，管理员同意后会自动退款", "success");
        if (typeof loadMyTickets === "function") loadMyTickets();
        if (typeof loadMyOrders === "function") loadMyOrders(typeof orderPagination !== "undefined" ? orderPagination.page || 1 : 1);
        if (typeof loadMyRefunds === "function") loadMyRefunds();
      } else {
        showToast(data.msg || "退款申请提交失败", "error");
      }
    })
    .catch(() => showToast("退款申请提交失败", "error"))
    .finally(() => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
      }
    });
}

function closeOrderDetail() {
  const modal = document.getElementById("orderDetailModal");
  if (modal) modal.classList.remove("show");
}
