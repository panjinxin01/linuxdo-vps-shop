/* =====================================================
   仪表盘：统计卡片 / 最近订单 / 最近工单
   来源：js/admin.js
   ===================================================== */
// ==================== 仪表盘 ====================
function loadStats() {
  Promise.all([
    apiFetch("../api/orders.php?action=stats").then((r) => r.json()),
    apiFetch("../api/dashboard.php?action=summary").then((r) => r.json()).catch(() => ({ code: 0, data: {} })),
  ]).then(([os, db]) => {
    if (os.code === 1) { ["statProducts","statUsers","statPending","statPaid","statIncome"].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = os.data[id.replace("stat","").toLowerCase()] || 0; }); document.getElementById("statProducts").textContent = os.data.products; document.getElementById("statUsers").textContent = os.data.users; document.getElementById("statPending").textContent = os.data.pending; document.getElementById("statPaid").textContent = os.data.paid; document.getElementById("statIncome").textContent = os.data.income; }
  });
}


function loadRecentOrders() {
  apiFetch("../api/orders.php?action=list&limit=5").then((r) => r.json()).then((data) => {
    const c = document.getElementById("recentOrders"); if (!c) return;
    if (data.code !== 1 || !data.data || data.data.length === 0) { c.innerHTML = '<div class="empty-tip">暂无订单</div>'; return; }
    const stMap = { paid: "已支付", pending: "待支付", refunded: "已退款", cancelled: "已取消" };
    c.innerHTML = data.data.slice(0, 5).map((o) => `<div class="recent-item"><div class="recent-info"><span class="recent-title">#${o.id} ${o.product_name || "商品"}</span><span class="recent-time">${o.created_at}</span></div><span class="status-badge status-${o.status}">${stMap[o.status] || o.status}</span></div>`).join("");
  });
}
function loadRecentTickets() {
  apiFetch("../api/tickets.php?action=admin_list&limit=5").then((r) => r.json()).then((data) => {
    const c = document.getElementById("recentTickets"); if (!c) return;
    if (data.code !== 1 || !data.data || data.data.length === 0) { c.innerHTML = '<div class="empty-tip">暂无工单</div>'; return; }
    c.innerHTML = data.data.slice(0, 5).map((t) => `<div class="recent-item"><div class="recent-info"><span class="recent-title">${t.title}</span><span class="recent-time">${t.created_at}</span></div><span class="status-badge status-${t.status}">${t.status === "open" ? "待处理" : t.status === "replied" ? "已回复" : "已关闭"}</span></div>`).join("");
  });
}

