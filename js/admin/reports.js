/* =====================================================
   统计报表：营收 / 热销 / 工单分类
   来源：js/admin.js
   ===================================================== */
// ==================== 报表 ====================
function loadReportDashboard() {
  Promise.all([
    apiFetch("../api/dashboard.php?action=summary").then((r) => r.json()),
    apiFetch("../api/dashboard.php?action=hot_products").then((r) => r.json()),
    apiFetch("../api/dashboard.php?action=ticket_summary").then((r) => r.json()),
  ]).then(([summary, hotProducts, tickets]) => {
    if (summary.code === 1) {
      document.getElementById("reportTodayIncome").textContent = parseFloat(summary.data.today_income || 0).toFixed(2);
      document.getElementById("reportMonthIncome").textContent = parseFloat(summary.data.month_income || 0).toFixed(2);
      document.getElementById("reportBalanceOrders").textContent = summary.data.balance_paid_orders || 0;
      document.getElementById("reportEpayOrders").textContent = summary.data.epay_paid_orders || 0;
      document.getElementById("reportExceptionOrders").textContent = summary.data.exception_orders || 0;
      document.getElementById("reportBalanceTotal").textContent = parseFloat(summary.data.user_balance_total || 0).toFixed(2);
    }
    const hotEl = document.getElementById("reportHotProducts");
    if (hotEl) hotEl.innerHTML = hotProducts.code === 1 && hotProducts.data.length ? hotProducts.data.map((i) => `<tr><td>${escapeHtml(i.name)}</td><td>${i.order_count}</td><td>${i.paid_count}</td><td>${parseFloat(i.income || 0).toFixed(2)}</td></tr>`).join("") : '<tr><td colspan="4" class="empty">暂无数据</td></tr>';
    const tkEl = document.getElementById("reportTicketCategory");
    if (tkEl) tkEl.innerHTML = tickets.code === 1 && tickets.data.category_breakdown && tickets.data.category_breakdown.length ? tickets.data.category_breakdown.map((i) => `<tr><td>${escapeHtml(i.category)}</td><td>${i.total}</td></tr>`).join("") : '<tr><td colspan="2" class="empty">暂无数据</td></tr>';
  });
}
