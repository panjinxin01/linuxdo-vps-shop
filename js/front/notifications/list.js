/* =====================================================
   通知列表加载与渲染 / 图标映射
   来源：js/front/notifications.js（第二轮细化拆分，内容零改动）
   ===================================================== */
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
