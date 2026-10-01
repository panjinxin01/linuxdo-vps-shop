/* =====================================================
   后台工单详情内嵌子视图
   来源：js/tickets.js
   ===================================================== */
/* =====================================================
   13. 管理侧页面控制器（后台 tab 内嵌子视图）
   ===================================================== */

function openAdminTicketView(id) {
  id = parseInt(id, 10); if (!id) return;
  TicketState.currentAdminDetailId = id;
  var listWrap = document.getElementById("tkAdminListWrap");
  var view = document.getElementById("ticketAdminView");
  var body = document.getElementById("ticketAdminViewBody");
  if (!view || !body) return;
  if (listWrap) listWrap.style.display = "none";
  view.style.display = "";
  var bc = document.getElementById("breadcrumbCurrent");
  if (bc) bc.textContent = "工单 #" + id;
  var main = document.querySelector(".main-content");
  if (main) main.scrollTop = 0;
  body.innerHTML = renderTicketSkeletonDetail();
  Promise.all([TicketApi.detail(id), TicketApi.listAttachments(id), getTicketTemplates()])
    .then(function (rs) {
      var t = rs[0].data;
      TicketState.ticketCache[id] = t;
      if (bc) bc.textContent = "工单 #" + id + (t.title ? " · " + t.title : "");
      body.innerHTML = buildTicketViewPageHtml(t, rs[1] || [], { isAdminSide: true, templates: rs[2] || [] });
      tkScrollConversationToEnd();
    })
    .catch(function (err) {
      body.innerHTML = renderTicketErrorState("ticketAdminViewBody", (err && err.message) || "获取工单详情失败");
    });
}

function closeAdminTicketView() {
  var view = document.getElementById("ticketAdminView");
  var listWrap = document.getElementById("tkAdminListWrap");
  if (view) view.style.display = "none";
  if (listWrap) listWrap.style.display = "";
  var bc = document.getElementById("breadcrumbCurrent");
  if (bc) bc.textContent = "工单管理";
  loadTickets();
  loadTicketStats();
}

function refreshAdminTicketView(tid) {
  return Promise.all([TicketApi.detail(tid), TicketApi.listAttachments(tid), getTicketTemplates()])
    .then(function (rs) {
      var t = rs[0].data;
      TicketState.ticketCache[tid] = t;
      var body = document.getElementById("ticketAdminViewBody");
      if (!body) return;
      var ta = document.getElementById("adminReplyContent");
      var draft = ta ? ta.value : "";
      var sel = document.getElementById("approveRefundTarget");
      var selVal = sel ? sel.value : null;
      body.innerHTML = buildTicketViewPageHtml(t, rs[1] || [], { isAdminSide: true, templates: rs[2] || [] });
      if (draft) {
        var ta2 = document.getElementById("adminReplyContent");
        if (ta2) { ta2.value = draft; tkUpdateComposerCount(ta2, "adminReplyContentCount"); }
      }
      if (selVal && document.getElementById("approveRefundTarget")) {
        document.getElementById("approveRefundTarget").value = selVal;
      }
      tkScrollConversationToEnd();
    })
    .catch(function () { openAdminTicketView(tid); });
}
function ticketAdminViewBodyRetry() { openAdminTicketView(TicketState.currentAdminDetailId || 0); }

