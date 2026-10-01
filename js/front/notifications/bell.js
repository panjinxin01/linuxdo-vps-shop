/* =====================================================
   通知铃铛：初始化 / 轮询 / 未读计数 / 角标
   来源：js/front/notifications.js（第二轮细化拆分，内容零改动）
   ===================================================== */
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
