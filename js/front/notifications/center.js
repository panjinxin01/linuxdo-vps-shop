/* =====================================================
   通知中心全页面：筛选 / 分页 / 全部已读
   来源：js/front/notifications.js（第二轮细化拆分，内容零改动）
   ===================================================== */
// ==================== 通知中心全页面 ====================
let notifPageFilter = "all";
let notifPageCurrent = 1;
const NOTIF_PAGE_SIZE = 20;

function loadNotificationPage(filter, page) {
  if (filter) notifPageFilter = filter;
  if (page) notifPageCurrent = page;
  else if (filter) notifPageCurrent = 1;

  const btnAll = document.getElementById("notifFilterAll");
  const btnUnread = document.getElementById("notifFilterUnread");
  if (btnAll) btnAll.style.opacity = notifPageFilter === "all" ? "1" : "0.5";
  if (btnUnread) btnUnread.style.opacity = notifPageFilter === "unread" ? "1" : "0.5";

  const listEl = document.getElementById("notificationPageList");
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">加载中...</div>';

  const onlyUnread = notifPageFilter === "unread" ? "&only_unread=1" : "";
  apiFetch(`api/notifications.php?action=list&page=${notifPageCurrent}&page_size=${NOTIF_PAGE_SIZE}${onlyUnread}`)
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        renderNotificationPage(data.data);
      } else {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">加载失败</div>';
      }
    })
    .catch(() => {
      listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">网络错误</div>';
    });
}

function renderNotificationPage(data) {
  const listEl = document.getElementById("notificationPageList");
  const pagEl = document.getElementById("notificationPagePagination");
  if (!listEl) return;

  const list = data.list || [];
  if (list.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted)"><div style="font-size:48px;margin-bottom:16px"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div><div>暂无通知</div></div>';
    if (pagEl) pagEl.innerHTML = "";
    return;
  }

  listEl.innerHTML = list.map((n) => buildNotificationItemHtml(n, true)).join("");

  // 分页
  if (pagEl) {
    const totalPages = Math.ceil((data.total || 0) / NOTIF_PAGE_SIZE);
    if (totalPages <= 1) { pagEl.innerHTML = ""; return; }
    let html = "";
    for (let i = 1; i <= totalPages; i++) {
      const active = i === notifPageCurrent ? "background:var(--primary);color:#fff;" : "";
      html += `<button onclick="loadNotificationPage(null,${i})" style="margin:0 4px;padding:6px 12px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:13px;${active}">${i}</button>`;
    }
    pagEl.innerHTML = html;
  }

  updateNotificationBadge(data.unread || 0);
}

// 全页面标记全部已读（复用 markAllNotificationsRead，刷新全页面）
function markAllNotificationsReadPage() {
  const body = new URLSearchParams();
  body.append("action", "mark_all_read");
  apiFetch("api/notifications.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        showToast("已全部标记为已读");
        loadNotificationPage();
        updateNotificationBadge(0);
      }
    });
}
