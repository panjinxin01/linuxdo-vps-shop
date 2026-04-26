// ==================== 通知系统模块 ====================
// 前台通知面板 + 通知中心全页面

let notificationInterval = null;

// 初始化通知系统（登录后调用）
function initNotifications() {
  const wrapper = document.getElementById("notificationWrapper");
  const list = document.getElementById("notificationList");
  const footer = document.getElementById("notificationFooter");
  const markAll = document.getElementById("notificationMarkAll");
  const loginPrompt = document.getElementById("notificationLoginPrompt");

  if (wrapper) wrapper.style.display = "block";
  if (list) list.style.display = "block";
  if (footer) footer.style.display = "block";
  if (markAll) markAll.style.display = "block";
  if (loginPrompt) loginPrompt.style.display = "none";

  loadNotificationCount();
  startNotificationPolling();
  document.addEventListener("click", handleNotificationOutsideClick);
}

// 轮询控制
function startNotificationPolling() {
  if (notificationInterval) clearInterval(notificationInterval);
  notificationInterval = setInterval(loadNotificationCount, 30000);
}

function stopNotificationPolling() {
  if (notificationInterval) {
    clearInterval(notificationInterval);
    notificationInterval = null;
  }
  const list = document.getElementById("notificationList");
  const footer = document.getElementById("notificationFooter");
  const markAll = document.getElementById("notificationMarkAll");
  const loginPrompt = document.getElementById("notificationLoginPrompt");
  if (list) list.style.display = "none";
  if (footer) footer.style.display = "none";
  if (markAll) markAll.style.display = "none";
  if (loginPrompt) {
    loginPrompt.innerHTML = typeof renderLoginRequired === 'function'
      ? renderLoginRequired('登录后查看通知消息', { icon: 'bell', sub: '接收订单状态更新、工单回复等系统消息', compact: true })
      : '';
    loginPrompt.style.display = "block";
  }
}

// 未读数量
function loadNotificationCount() {
  apiFetch("api/notifications.php?action=unread_count")
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) updateNotificationBadge(data.data.count);
    })
    .catch(() => {});
}

function updateNotificationBadge(count) {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "block";
  } else {
    badge.style.display = "none";
  }
}

// 面板开关
function toggleNotificationPanel(e) {
  e.stopPropagation();
  const panel = document.getElementById("notificationPanel");
  if (!panel) return;
  panel.classList.contains("show") ? closeNotificationPanel() : openNotificationPanel();
}

function openNotificationPanel() {
  const panel = document.getElementById("notificationPanel");
  if (panel) {
    panel.classList.add("show");
    loadNotifications();
  }
}

function closeNotificationPanel() {
  const panel = document.getElementById("notificationPanel");
  if (panel) panel.classList.remove("show");
}

function handleNotificationOutsideClick(e) {
  const wrapper = document.getElementById("notificationWrapper");
  if (wrapper && !wrapper.contains(e.target)) closeNotificationPanel();
}

// 加载通知列表（面板）
function loadNotifications() {
  const list = document.getElementById("notificationList");
  if (!list) return;
  list.innerHTML = '<div class="notification-empty">加载中...</div>';
  apiFetch("api/notifications.php?action=list&page_size=10")
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        renderNotificationList(data.data.list);
        updateNotificationBadge(data.data.unread);
      } else {
        list.innerHTML = '<div class="notification-empty">加载失败</div>';
      }
    })
    .catch(() => {
      list.innerHTML = '<div class="notification-empty">网络错误</div>';
    });
}

// 渲染通知列表（面板 + 全页面复用）
function renderNotificationList(notifications) {
  const list = document.getElementById("notificationList");
  if (!list) return;
  if (!notifications || notifications.length === 0) {
    list.innerHTML = '<div class="notification-empty">暂无通知</div>';
    return;
  }
  list.innerHTML = notifications
    .map((n) => buildNotificationItemHtml(n, false))
    .join("");
}

// 通知条目 HTML（统一构建，面板和全页面共用）
function buildNotificationItemHtml(n, fullPage) {
  const iconClass = getNotificationIconClass(n.type);
  const iconSvg = getNotificationIcon(n.type);
  const timeStr = formatRelativeTime(n.created_at);
  const unread = n.is_read == 0;
  const handler = fullPage ? "handleNotifPageClick" : "handleNotificationClick";
  const extraStyle = fullPage
    ? 'style="cursor:pointer;position:relative;border-radius:12px;margin-bottom:8px;background:var(--bg-card);border:1px solid var(--border)"'
    : "";
  const unreadDot = fullPage && unread
    ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary);flex-shrink:0;align-self:center"></span>'
    : "";
  return `<div class="notification-item ${unread ? "unread" : ""}" data-notif-id="${n.id}" ${extraStyle} onclick="${handler}(${n.id}, '${escapeHtml(n.type)}', '${escapeHtml(n.related_id || "")}')">
    <div class="notification-icon ${iconClass}">${iconSvg}</div>
    <div class="notification-content"${fullPage ? ' style="flex:1;min-width:0"' : ""}>
      <div class="notification-content-title">${escapeHtml(n.title)}</div>
      <div class="notification-content-text">${escapeHtml(n.content)}</div>
      <div class="notification-time">${timeStr}</div>
    </div>${unreadDot}
  </div>`;
}

// 图标
function getNotificationIconClass(type) {
  const map = { payment: "success", ticket: "warning" };
  return map[type] || "";
}

function getNotificationIcon(type) {
  const icons = {
    payment: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  };
  return icons[type] || '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
}

// 通知点击处理（面板）
function handleNotificationClick(id, type, relatedId) {
  markNotificationRead(id);
  closeNotificationPanel();
  navigateByNotificationType(type, relatedId);
}

// 通知点击处理（全页面）
function handleNotifPageClick(id, type, relatedId) {
  markNotificationRead(id);
  setTimeout(() => loadNotificationPage(), 300);
  navigateByNotificationType(type, relatedId);
}

// 根据通知类型跳转
function navigateByNotificationType(type, relatedId) {
  if ((type.startsWith("order_") || type === "payment") && relatedId) {
    if (typeof switchPage === "function") switchPage("orders");
    return;
  }
  if ((type.startsWith("ticket_") || type === "ticket") && relatedId) {
    if (typeof switchPage === "function") switchPage("tickets");
    if (typeof showTicketDetail === "function") {
      setTimeout(() => showTicketDetail(parseInt(relatedId)), 300);
    }
  }
}

// 标记已读
function markNotificationRead(id) {
  const body = new URLSearchParams();
  body.append("action", "mark_read");
  body.append("id", id);
  apiFetch("api/notifications.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        loadNotificationCount();
        document.querySelectorAll(".notification-item").forEach((item) => {
          if (item.dataset.notifId === String(id)) item.classList.remove("unread");
        });
      }
    });
}

function markAllNotificationsRead() {
  const body = new URLSearchParams();
  body.append("action", "mark_all_read");
  apiFetch("api/notifications.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        showToast("已全部标记为已读");
        loadNotifications();
        updateNotificationBadge(0);
      }
    });
}

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
