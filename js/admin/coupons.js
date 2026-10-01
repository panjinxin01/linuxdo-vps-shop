/* =====================================================
   优惠券管理
   来源：js/admin.js
   ===================================================== */
// ==================== 优惠券管理 ====================
let couponCache = {};
function loadCoupons() {
  apiFetch("../api/coupons.php?action=all").then((r) => r.json()).then((data) => {
    const tbody = document.getElementById("couponTable");
    if (data.code !== 1 || !data.data || !data.data.list || data.data.list.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="empty">暂无优惠券</td></tr>'; return; }
    couponCache = {}; data.data.list.forEach((c) => { couponCache[c.id] = c; });
    tbody.innerHTML = data.data.list.map((c) => {
      const isExp = c.ends_at && new Date(c.ends_at) < new Date();
      const sc = c.status == 1 ? (isExp ? "wait" : "on") : "off", st = c.status == 1 ? (isExp ? "已过期" : "有效") : "停用";
      const tt = c.type === "fixed" ? "减免" : "折扣", vt = c.type === "fixed" ? c.value + "积分" : c.value + "%";
      return `<tr><td><code style="color:var(--primary)">${escapeHtml(c.code)}</code></td><td>${escapeHtml(c.name)}</td><td>${tt}</td><td style="font-weight:600">${vt}</td><td>${c.used_count} / ${c.max_uses == 0 ? "∞" : c.max_uses}</td><td style="font-size:12px;color:var(--text-muted)">${c.starts_at ? c.starts_at.substring(0, 10) : "即时"}<br>${c.ends_at ? c.ends_at.substring(0, 10) : "永久"}</td><td><span class="badge ${sc}">${st}</span></td><td><button class="action-btn edit" onclick="editCouponById(${c.id})">编辑</button><button class="action-btn" onclick="toggleCouponStatus(${c.id}, ${c.status})">${c.status == 1 ? "停用" : "启用"}</button><button class="action-btn del" onclick="deleteCoupon(${c.id})">删除</button></td></tr>`;
    }).join("");
  });
}
function showAddCoupon() {
  document.getElementById("couponModalTitle").textContent = "创建优惠券";
  ["cId","cCode","cName","cValue","cMaxDiscount","cStartsAt","cEndsAt"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("cCode").disabled = false; document.getElementById("cType").value = "fixed";
  document.getElementById("cMinAmount").value = "0"; document.getElementById("cMaxUses").value = "0"; document.getElementById("cPerUserLimit").value = "1";
  document.getElementById("cStatus").checked = true; toggleCouponType(); document.getElementById("couponModal").classList.add("show");
}
function editCouponById(id) {
  const c = couponCache[id]; if (!c) return;
  document.getElementById("couponModalTitle").textContent = "编辑优惠券";
  document.getElementById("cId").value = c.id; document.getElementById("cCode").value = c.code; document.getElementById("cCode").disabled = true;
  document.getElementById("cName").value = c.name; document.getElementById("cType").value = c.type; document.getElementById("cValue").value = c.value;
  document.getElementById("cMinAmount").value = c.min_amount; document.getElementById("cMaxUses").value = c.max_uses; document.getElementById("cPerUserLimit").value = c.per_user_limit;
  document.getElementById("cMaxDiscount").value = c.max_discount || "";
  document.getElementById("cStartsAt").value = c.starts_at ? c.starts_at.replace(" ", "T").substring(0, 16) : "";
  document.getElementById("cEndsAt").value = c.ends_at ? c.ends_at.replace(" ", "T").substring(0, 16) : "";
  document.getElementById("cStatus").checked = c.status == 1; toggleCouponType(); document.getElementById("couponModal").classList.add("show");
}
function closeCouponModal() { document.getElementById("couponModal").classList.remove("show"); }
function toggleCouponType() {
  const t = document.getElementById("cType").value;
  document.getElementById("cValueLabel").textContent = t === "fixed" ? "减免金额" : "折扣百分比 (1-100)";
  document.getElementById("cMaxDiscountGroup").style.display = t === "fixed" ? "none" : "block";
}
function saveCoupon() {
  const id = document.getElementById("cId").value, code = document.getElementById("cCode").value.trim(), name = document.getElementById("cName").value.trim(), value = document.getElementById("cValue").value;
  if (!code || !name || !value) { alert("请填写必填项"); return; }
  const body = new FormData(); body.append("action", id ? "update" : "create"); if (id) body.append("id", id);
  body.append("code", code); body.append("name", name); body.append("type", document.getElementById("cType").value); body.append("value", value);
  body.append("min_amount", document.getElementById("cMinAmount").value); body.append("max_uses", document.getElementById("cMaxUses").value); body.append("per_user_limit", document.getElementById("cPerUserLimit").value);
  const md = document.getElementById("cMaxDiscount").value; if (md) body.append("max_discount", md);
  const sa = document.getElementById("cStartsAt").value; if (sa) body.append("starts_at", sa.replace("T", " "));
  const ea = document.getElementById("cEndsAt").value; if (ea) body.append("ends_at", ea.replace("T", " "));
  body.append("status", document.getElementById("cStatus").checked ? 1 : 0);
  apiFetch("../api/coupons.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); if (data.code === 1) { closeCouponModal(); loadCoupons(); } });
}
function toggleCouponStatus(id, cs) { const body = new FormData(); body.append("action", "toggle"); body.append("id", id); body.append("status", cs == 1 ? 0 : 1); apiFetch("../api/coupons.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) loadCoupons(); else alert(d.msg); }); }
function deleteCoupon(id) { if (!confirm("确定要删除此优惠券吗？")) return; const body = new FormData(); body.append("action", "delete"); body.append("id", id); apiFetch("../api/coupons.php", { method: "POST", body }).then((r) => r.json()).then((d) => { alert(d.msg); if (d.code === 1) loadCoupons(); }); }

