/* =====================================================
   管理员管理：列表 / 新增 / 删除 / 用户提权
   来源：js/admin.js
   ===================================================== */
// ==================== 管理员 ====================
function loadAdmins() {
  const tbody = document.getElementById("adminTable"); if (!tbody) return;
  if (currentAdminInfo.role !== "super") { tbody.innerHTML = '<tr><td colspan="5" class="empty-tip">仅超级管理员可查看</td></tr>'; const pt = document.getElementById("promoteUserTable"); if (pt) pt.innerHTML = '<tr><td colspan="4" class="empty">仅超级管理员可提权</td></tr>'; return; }
  apiFetch("../api/admin.php?action=list").then((r) => r.json()).then((d) => {
    if (d.code !== 1 || !d.data) { tbody.innerHTML = '<tr><td colspan="5" class="empty-tip">暂无数据</td></tr>'; return; }
    tbody.innerHTML = d.data.map((a) => `<tr><td>${a.id}</td><td>${escapeHtml(a.username || "-")}</td><td><span class="role-badge role-${a.role}">${a.role === "super" ? "超级管理员" : "普通管理员"}</span></td><td>${escapeHtml(a.created_at || "-")}</td><td>${a.role !== "super" ? `<button class="action-btn del" onclick="deleteAdmin(${a.id})">删除</button>` : '<span class="compact-meta">-</span>'}</td></tr>`).join("");
    loadPromotableUsers();
  });
}
function showAddAdmin() { document.getElementById("newAdminUser").value = ""; document.getElementById("newAdminPass").value = ""; document.getElementById("newAdminRole").value = "admin"; document.getElementById("adminModal").classList.add("show"); }
function closeAdminModal() { document.getElementById("adminModal").classList.remove("show"); }
function saveAdmin() {
  const u = document.getElementById("newAdminUser").value.trim(), p = document.getElementById("newAdminPass").value, r = document.getElementById("newAdminRole").value;
  if (!u || !p) { showToast("请填写用户名和密码"); return; }
  apiFetch("../api/admin.php?action=add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p, role: r }) }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("管理员添加成功"); closeAdminModal(); loadAdmins(); } else showToast(d.msg || "添加失败"); });
}
function deleteAdmin(id) {
  if (!confirm("确定删除该管理员？")) return;
  apiFetch("../api/admin.php?action=delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("删除成功"); loadAdmins(); } else showToast(d.msg || "删除失败"); });
}
function loadPromotableUsers() {
  const tbody = document.getElementById("promoteUserTable"); if (!tbody) return;
  if (currentAdminInfo.role !== "super") { tbody.innerHTML = '<tr><td colspan="4" class="empty">仅超级管理员可提权</td></tr>'; return; }
  const kw = (document.getElementById("promoteUserKeyword")?.value || "").trim();
  if (!kw) { tbody.innerHTML = '<tr><td colspan="4" class="empty">输入关键词后搜索</td></tr>'; return; }
  tbody.innerHTML = '<tr><td colspan="4" class="empty">搜索中...</td></tr>';
  apiFetch("../api/admin.php?action=search_users&keyword=" + encodeURIComponent(kw) + "&limit=20").then((r) => r.json()).then((d) => {
    const list = d.code === 1 && Array.isArray(d.data) ? d.data : [];
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty">未找到匹配用户</td></tr>'; return; }
    tbody.innerHTML = list.map((u) => {
      const st = u.admin_id ? `<span class="badge on">已是${u.admin_role === "super" ? "超管" : "管理员"}</span>` : `<span class="badge wait">${u.has_password ? "可直接沿用密码" : "需单独设密码"}</span>`;
      const act = u.admin_id ? '<span class="compact-meta">无需提权</span>' : `<button class="action-btn edit" onclick="promoteExistingUser(${parseInt(u.id || 0)}, '${escapeHtml(u.username || "")}')">提权</button>`;
      return `<tr><td>${u.id}</td><td>${escapeHtml(u.username || "-")}<div class="compact-meta">${escapeHtml(u.email || u.linuxdo_username || "-")}</div></td><td>${st}</td><td>${act}</td></tr>`;
    }).join("");
  }).catch(() => { tbody.innerHTML = '<tr><td colspan="4" class="empty">搜索失败</td></tr>'; });
}
function promoteExistingUser(userId, username) {
  const role = document.getElementById("promoteUserRole")?.value || "admin", pw = document.getElementById("promoteUserPassword")?.value || "";
  if (!confirm(`确定将 ${username} 提权为${role === "super" ? "超级管理员" : "管理员"}吗？`)) return;
  apiFetch("../api/admin.php?action=promote_user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, role, password: pw }) }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("提权成功"); if (document.getElementById("promoteUserPassword")) document.getElementById("promoteUserPassword").value = ""; loadAdmins(); loadPromotableUsers(); } else showToast(d.msg || "提权失败"); });
}

