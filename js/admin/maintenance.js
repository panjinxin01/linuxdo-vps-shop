/* =====================================================
   数据库维护：状态检查 / 更新
   来源：js/admin.js
   ===================================================== */
// ==================== 数据库维护 ====================
function checkDbStatus() {
  const s = document.getElementById("dbStatus"); s.style.display = "block"; s.style.background = "rgba(255,255,255,0.1)"; s.innerHTML = "正在检查...";
  apiFetch("../api/update_db.php?action=check").then((r) => r.json()).then((d) => {
    if (d.code === 1) { const i = d.data; if (i.all_installed) { s.style.background = "rgba(34,197,94,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#22c55e" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>数据库状态正常<br><small style="opacity:0.7">已安装: ' + i.existing.join(", ") + "</small>"; } else { s.style.background = "rgba(251,191,36,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>缺失表:<strong>' + i.missing.join(", ") + "</strong>"; } }
    else { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' + d.msg; }
  }).catch(() => { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>网络错误'; });
}
function updateDatabase() {
  if (!confirm("确定要更新数据库吗？")) return;
  const s = document.getElementById("dbStatus"); s.style.display = "block"; s.innerHTML = "正在更新...";
  const body = new FormData(); body.append("action", "update");
  apiFetch("../api/update_db.php", { method: "POST", body }).then((r) => r.json()).then((d) => {
    if (d.code === 1) { s.style.background = "rgba(34,197,94,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#22c55e" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' + d.msg + (d.data && d.data.created && d.data.created.length ? "<br><small>新建表: " + d.data.created.join(", ") + "</small>" : ""); }
    else { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' + d.msg; }
  }).catch(() => { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>网络错误'; });
}

// ==================== 仪表盘列表 ====================
