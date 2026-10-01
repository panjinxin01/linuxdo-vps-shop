/* =====================================================
   旧弹窗时代全局函数兼容层（外部模块零改动）
   来源：js/tickets.js
   ===================================================== */
/* =====================================================
   14. 兼容别名 / 重定向（外部模块零改动）
   外部调用点：
   - js/notifications.js: showTicketDetail / switchPage("tickets")
   - js/main.js + 订单详情: showCreateTicket(orderId)
   - 后台仪表盘/列表: showAdminTicketDetail / closeAdminTicketDetail
   - 旧弹窗入口（showCreateTicket / showTicketDetail / replyTicket /
     closeTicket 等）在本章统一定义为页面版实现，全文件仅此一份
   ===================================================== */

/* 前台：发起工单 → 子路由 #ticket-new[?order=x] */
function showCreateTicket(orderId) {
  if (typeof currentUser === "undefined" || !currentUser) {
    if (typeof showLogin === "function") showLogin();
    return;
  }
  var oid = parseInt(orderId, 10) || 0;
  var target = oid ? "#ticket-new?order=" + oid : "#ticket-new";
  if ((window.location.hash || "") === target) openTicketNewPage(oid);
  else {
    try { window.location.hash = target; }
    catch (e) { openTicketNewPage(oid); }
  }
}
function closeTicketModal() { window.location.hash = "#tickets"; }

/* 前台：查看工单 → 子路由 #ticket-view?id=x */
function showTicketDetail(id) {
  id = parseInt(id, 10); if (!id) return;
  var target = "#ticket-view?id=" + id;
  if ((window.location.hash || "") === target) openTicketView(id);
  else {
    try { window.location.hash = target; }
    catch (e) { openTicketView(id); }
  }
}
function closeTicketDetail() { window.location.hash = "#tickets"; }

/* 前台：回复（页面版，回复后局部刷新） */
function replyTicket(ticketId) {
  var ta = document.getElementById("replyContent");
  var content = ta ? (ta.value || "").trim() : "";
  if (!content) { showToast("请输入回复内容"); if (ta) ta.focus(); return; }
  if (TicketState.replying) return;
  TicketState.replying = true;
  tkSetSending(document.getElementById("replySendBtn"), true, "发送中...", null);
  TicketApi.reply(ticketId, content)
    .then(function () {
      TicketState.replying = false;
      showToast("回复成功");
      loadMyTickets();
      return refreshTicketView(ticketId);
    })
    .catch(function (err) {
      TicketState.replying = false;
      showToast((err && err.message) || "回复失败");
    })
    .finally(function () {
      tkSetSending(document.getElementById("replySendBtn"), false, "", ticketIcon("send", 14) + "发送回复");
    });
}

/* 前台：关闭工单（页面版，关闭后就地呈现警示条） */
function closeTicket(ticketId) {
  if (!confirm("确定要关闭此工单吗？关闭后无法再回复。")) return;
  TicketApi.close(ticketId)
    .then(function () {
      showToast("工单已关闭");
      loadMyTickets();
      return refreshTicketView(ticketId);
    })
    .catch(function (err) { showToast((err && err.message) || "操作失败"); });
}

/* 后台：详情入口 → 内嵌子视图（原弹窗废弃） */
function showAdminTicketDetail(id) { openAdminTicketView(id); }
function closeAdminTicketDetail() { closeAdminTicketView(); }

/* 后台：关闭工单（页面版） */
function adminCloseTicket(tid) {
  if (!confirm("确定要关闭此工单吗？")) return;
  TicketApi.close(tid)
    .then(function () {
      showToast("工单已关闭");
      loadTickets();
      loadTicketStats();
      return refreshAdminTicketView(tid);
    })
    .catch(function (err) { showToast((err && err.message) || "操作失败"); });
}

/* 后台：同意退款（页面版，完成后就地刷新审批卡状态） */
function approveRefundTicket(tid) {
  if (!confirm("确认同意该退款申请并立即执行退款吗？")) return;
  var target = (document.getElementById("approveRefundTarget") || {}).value || "original";
  var reason = (((document.getElementById("approveRefundReason") || {}).value || "").trim()) || "工单退款";
  if (TicketState.refunding) return;
  TicketState.refunding = true;
  TicketApi.approveRefund(tid, target, reason)
    .then(function () {
      TicketState.refunding = false;
      showToast("退款已完成");
      loadTickets();
      loadTicketStats();
      if (typeof loadOrders === "function") loadOrders(typeof adminOrderPagination !== "undefined" ? adminOrderPagination.page || 1 : 1);
      return refreshAdminTicketView(tid);
    })
    .catch(function (err) {
      TicketState.refunding = false;
      showToast((err && err.message) || "退款失败");
    });
}

/* ==================== 15. 后台遗留别名（外部模块零改动） ==================== */

function uploadTicketAttachment(tid) {
  uploadAttachmentToTicket(tid, "adminTicketFile");
}
