/* =====================================================
   公告管理
   来源：js/admin.js
   ===================================================== */
// ==================== 公告管理 ====================
let announcementCache = {};
function loadAnnouncements() {
  apiFetch("../api/announcements.php?action=all").then((r) => r.json()).then((data) => {
    const tbody = document.getElementById("announcementTable");
    if (data.code !== 1 || !data.data || data.data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无公告</td></tr>'; return; }
    announcementCache = {}; data.data.forEach((a) => { announcementCache[a.id] = a; });
    tbody.innerHTML = data.data.map((a) => `<tr><td>${a.id}</td><td><span style="font-weight:600;color:var(--text-main)">${escapeHtml(a.title)}</span></td><td><span class="badge ${a.is_top == 1 ? "on" : ""}" style="${a.is_top != 1 ? "opacity:0.5" : ""}">${a.is_top == 1 ? "置顶" : "否"}</span></td><td><span class="badge ${a.status == 1 ? "on" : "off"}">${a.status == 1 ? "显示" : "隐藏"}</span></td><td style="color:var(--text-muted);font-size:12px">${escapeHtml(a.publish_at || a.created_at)}</td><td><button class="action-btn edit" onclick="editAnnouncementById(${a.id})">编辑</button><button class="action-btn" onclick="toggleAnnouncementTop(${a.id})">${a.is_top == 1 ? "取消置顶" : "置顶"}</button><button class="action-btn del" onclick="deleteAnnouncement(${a.id})">删除</button></td></tr>`).join("");
  });
}
function showAddAnnouncement() {
  document.getElementById("announcementModalTitle").textContent = "发布公告";
  ["annId","annTitle","annContent","annPublishAt","annExpiresAt"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("annTop").checked = false; document.getElementById("annStatus").checked = true;
  document.getElementById("announcementModal").classList.add("show");
}
function editAnnouncementById(id) {
  const a = announcementCache[id]; if (!a) return;
  document.getElementById("announcementModalTitle").textContent = "编辑公告";
  document.getElementById("annId").value = a.id; document.getElementById("annTitle").value = a.title; document.getElementById("annContent").value = a.content;
  document.getElementById("annTop").checked = a.is_top == 1; document.getElementById("annStatus").checked = a.status == 1;
  document.getElementById("annPublishAt").value = a.publish_at ? a.publish_at.replace(" ", "T").substring(0, 16) : "";
  document.getElementById("annExpiresAt").value = a.expires_at ? a.expires_at.replace(" ", "T").substring(0, 16) : "";
  document.getElementById("announcementModal").classList.add("show");
}
function closeAnnouncementModal() { document.getElementById("announcementModal").classList.remove("show"); }
function saveAnnouncement() {
  const id = document.getElementById("annId").value, title = document.getElementById("annTitle").value.trim(), content = document.getElementById("annContent").value.trim();
  if (!title || !content) { alert("请填写标题和内容"); return; }
  const body = new FormData(); body.append("action", id ? "edit" : "add"); if (id) body.append("id", id);
  body.append("title", title); body.append("content", content);
  body.append("is_top", document.getElementById("annTop").checked ? 1 : 0); body.append("status", document.getElementById("annStatus").checked ? 1 : 0);
  const pa = document.getElementById("annPublishAt").value; if (pa) body.append("publish_at", pa.replace("T", " "));
  const ea = document.getElementById("annExpiresAt").value; if (ea) body.append("expires_at", ea.replace("T", " "));
  apiFetch("../api/announcements.php", { method: "POST", body }).then((r) => r.json()).then((d) => { alert(d.msg); if (d.code === 1) { closeAnnouncementModal(); loadAnnouncements(); } });
}
function toggleAnnouncementTop(id) { const body = new FormData(); body.append("action", "toggle_top"); body.append("id", id); apiFetch("../api/announcements.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) loadAnnouncements(); else alert(d.msg); }); }
function deleteAnnouncement(id) { if (!confirm("确定删除该公告？")) return; const body = new FormData(); body.append("action", "delete"); body.append("id", id); apiFetch("../api/announcements.php", { method: "POST", body }).then((r) => r.json()).then((d) => { alert(d.msg); loadAnnouncements(); }); }

