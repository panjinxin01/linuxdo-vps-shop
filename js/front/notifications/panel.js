/* =====================================================
   通知下拉面板：展开 / 收起 / 点击外部关闭
   来源：js/front/notifications.js（第二轮细化拆分，内容零改动）
   ===================================================== */
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
