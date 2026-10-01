/* =====================================================
   操作日志：列表 / 清空
   来源：js/admin.js
   ===================================================== */
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

