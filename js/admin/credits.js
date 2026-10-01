/* =====================================================
   积分管理：用户查询 / 流水 / 手工加减
   来源：js/admin.js
   ===================================================== */
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
// 后端 admin_transactions 强制要求 user_id，初始化时无选中用户，
// 直接请求必然返回"用户ID无效"，因此先渲染提示占位。
function renderCreditTxnPlaceholder() {
  const tbody = document.getElementById("creditTxnTable"); if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="empty">请先在上方选择用户查看积分流水</td></tr>';
}
function loadCreditTransactionList(userId = "") {
  if (!userId) { renderCreditTxnPlaceholder(); return; }
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

