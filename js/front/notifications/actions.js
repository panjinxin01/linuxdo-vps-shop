/* =====================================================
   通知点击跳转 / 标记已读
   来源：js/front/notifications.js（第二轮细化拆分，内容零改动）
   ===================================================== */
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

