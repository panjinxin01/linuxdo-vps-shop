/* =====================================================
   公告：前台列表 / 详情弹窗
   来源：js/main.js
   ===================================================== */
function loadAnnouncements() {
  apiFetch("api/announcements.php?action=list").then((r) => r.json()).then((data) => {
    const container = document.getElementById("announcementList");
    const scrollList = document.getElementById("announcementScrollList");
    const hasData = data.code === 1 && data.data && data.data.length > 0;
    if (!hasData) {
      if (container) container.innerHTML = '<div class="empty-state"><div class="empty-icon">' + appIcon("bell", 48, { strokeWidth: 1.5 }) + '</div><p>暂无公告</p></div>';
      if (scrollList) scrollList.innerHTML = '<div class="announcement-scroll-empty">暂无公告</div>';
      return;
    }
    if (container) container.innerHTML = data.data.map((a) => `<div class="announcement-item ${a.is_top == 1 ? "top" : ""}" onclick="showAnnouncement(${a.id})">${a.is_top == 1 ? '<span class="announcement-tag">置顶</span>' : ""}<span class="announcement-title">${escapeHtml(a.title)}</span><span class="announcement-date">${escapeHtml((a.publish_at || a.created_at)?.split(" ")[0] || "")}</span></div>`).join("");
    if (scrollList) scrollList.innerHTML = data.data.map((a) => {
      const iconHtml = a.is_top == 1
        ? '<span class="tag">置顶</span>'
        : appIcon("bell", 14, { style: "vertical-align:-2px;margin-right:2px" });
      return `<div class="announcement-scroll-item" onclick="showAnnouncement(${a.id})"><div class="announcement-scroll-title">${iconHtml} ${escapeHtml(a.title)}</div><div class="announcement-scroll-desc">${escapeHtml((a.content || "").substring(0, 100))}</div><a href="#" class="announcement-scroll-link" onclick="event.stopPropagation();showAnnouncement(${a.id})">详情及修复办法</a></div>`;
    }).join("");
  }).catch(() => { const c = document.getElementById("announcementList"); if (c) c.innerHTML = '<div class="empty-state"><div class="empty-icon">' + appIcon("x-circle", 48, { strokeWidth: 1.5 }) + '</div><p>加载失败</p></div>'; });
}

function showAnnouncement(id) {
  apiFetch("api/announcements.php?action=detail&id=" + id).then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) {
      document.getElementById("announcementTitle").textContent = data.data.title;
      document.getElementById("announcementBody").innerHTML = `<div style="color:var(--text-muted);font-size:13px;margin-bottom:16px">发布时间：${escapeHtml(data.data.publish_at || data.data.created_at)}</div><div style="line-height:1.8;white-space:pre-wrap">${escapeHtml(data.data.content)}</div>`;
      document.getElementById("announcementModal").classList.add("show");
    }
  });
}
function closeAnnouncementModal() { document.getElementById("announcementModal").classList.remove("show"); }


