/* =====================================================
   余额：用户名 / 余额 / 流水
   来源：js/main.js
   ===================================================== */
// ==================== 余额 / 资料 ====================
function getCurrentUserName() { currentUser = normalizeCurrentUserValueDeep(currentUser); return safeUserNameFrom(currentUser); }
function getCurrentBalance() { if (!currentUser || typeof currentUser !== "object") return 0; return parseFloat(currentUser.credit_balance || 0) || 0; }

function loadCreditSummary() {
  if (!currentUser || currentRole !== "user") return;
  apiFetch("api/credits.php?action=summary").then((r) => r.json()).then((data) => {
    if (data.code !== 1 || !data.data) return;
    if (typeof currentUser === "object") currentUser.credit_balance = data.data.balance;
    const ae = document.getElementById("creditBalanceSummary"), he = document.getElementById("creditBalanceHint"), be = document.getElementById("buyBalanceAmount");
    const bal = (parseFloat(data.data.balance) || 0).toFixed(2);
    if (ae) ae.textContent = bal + " 积分";
    if (he) he.textContent = "最近变动：" + (data.data.last_change_at || "暂无");
    if (be) be.textContent = bal + " 积分";
    // 局部更新 sidebar 和 header 中的余额文字，避免整体重渲染
    document.querySelectorAll("[data-role='user-balance']").forEach((el) => { el.textContent = bal; });
  });
}

function loadCreditTransactions() {
  if (!currentUser || currentRole !== "user") return;
  apiFetch("api/credits.php?action=my_transactions&page_size=5").then((r) => r.json()).then((data) => {
    const box = document.getElementById("creditTransactions"); if (!box) return;
    if (data.code !== 1 || !data.data || !data.data.list || data.data.list.length === 0) { box.innerHTML = '<div style="color:var(--text-muted)">暂无流水</div>'; return; }
    box.innerHTML = data.data.list.map((i) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px"><div><div style="color:var(--text-main)">${escapeHtml(i.type || "adjust")}</div><div style="color:var(--text-muted)">${escapeHtml(i.remark || "-")}</div></div><div style="text-align:right"><div style="color:${parseFloat(i.amount) >= 0 ? "var(--success)" : "var(--danger)"}">${parseFloat(i.amount) >= 0 ? "+" : ""}${parseFloat(i.amount).toFixed(2)}</div><div style="color:var(--text-muted)">${escapeHtml(i.created_at || "")}</div></div></div>`).join("");
  });
}

