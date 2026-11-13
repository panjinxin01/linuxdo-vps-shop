/* =====================================================
   数据库维护：状态检查 / 更新
   来源：js/admin.js
   ===================================================== */
// ==================== 数据库维护 ====================
function checkDbStatus() {
  const s = document.getElementById("dbStatus"); s.style.display = "block"; s.style.background = "rgba(255,255,255,0.1)"; s.innerHTML = "正在检查...";
  apiFetch("../api/update_db.php?action=check").then((r) => r.json()).then((d) => {
    if (d.code === 1) { const i = d.data; if (i.all_installed) { s.style.background = "rgba(34,197,94,0.15)"; s.innerHTML = appIcon("check-circle", 16, { style: "vertical-align:-3px;margin-right:4px;color:#22c55e" }) + '数据库状态正常<br><small style="opacity:0.7">已安装: ' + i.existing.join(", ") + "</small>"; } else { s.style.background = "rgba(251,191,36,0.15)"; s.innerHTML = appIcon("alert-triangle", 16, { style: "vertical-align:-3px;margin-right:4px;color:#f59e0b" }) + "缺失表:<strong>" + i.missing.join(", ") + "</strong>"; } }
    else { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = appIcon("x-circle", 16, { style: "vertical-align:-3px;margin-right:4px;color:#ef4444" }) + d.msg; }
  }).catch(() => { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = appIcon("x-circle", 16, { style: "vertical-align:-3px;margin-right:4px;color:#ef4444" }) + "网络错误"; });
}
async function updateDatabase() {
  const ok = await showConfirmModal({ title: "更新数据库", message: "确定要更新数据库吗？系统将自动补齐缺失的数据表和字段。", confirmText: "立即更新" });
  if (!ok) return;
  const s = document.getElementById("dbStatus"); s.style.display = "block"; s.innerHTML = "正在更新...";
  const body = new FormData(); body.append("action", "update");
  apiFetch("../api/update_db.php", { method: "POST", body }).then((r) => r.json()).then((d) => {
    if (d.code === 1) { s.style.background = "rgba(34,197,94,0.15)"; s.innerHTML = appIcon("check-circle", 16, { style: "vertical-align:-3px;margin-right:4px;color:#22c55e" }) + d.msg + (d.data && d.data.created && d.data.created.length ? "<br><small>新建表: " + d.data.created.join(", ") + "</small>" : ""); }
    else { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = appIcon("x-circle", 16, { style: "vertical-align:-3px;margin-right:4px;color:#ef4444" }) + d.msg; }
  }).catch(() => { s.style.background = "rgba(239,68,68,0.15)"; s.innerHTML = appIcon("x-circle", 16, { style: "vertical-align:-3px;margin-right:4px;color:#ef4444" }) + "网络错误"; });
}

// ==================== 仪表盘列表 ====================
