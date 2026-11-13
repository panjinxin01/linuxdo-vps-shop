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
    payment: appIcon("check-circle", 18),
    ticket: appIcon("chat", 18),
  };
  return icons[type] || appIcon("info", 18);
}

// 通知点击处理（面板）
