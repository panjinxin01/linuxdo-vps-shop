/* =====================================================
   社区规则：概览 / 规则 / 等级折扣
   来源：js/admin.js
   ===================================================== */
// ==================== 社区规则 ====================
function loadCommunityOverview() {
  apiFetch("../api/community.php?action=overview").then((r) => r.json()).then((d) => { if (d.code === 1 && d.data && d.data.settings) document.getElementById("communitySilencedMode").value = d.data.settings.linuxdo_silenced_order_mode || "review"; });
  apiFetch("../api/community.php?action=rules").then((r) => r.json()).then((d) => {
    const tbody = document.getElementById("communityRuleTable"); if (!tbody) return;
    if (d.code !== 1 || !Array.isArray(d.data) || d.data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无规则</td></tr>'; return; }
    window.__communityRules = {}; d.data.forEach((r) => (window.__communityRules[r.id] = r));
    tbody.innerHTML = d.data.map((r) => `<tr><td>${r.id}</td><td>${escapeHtml(r.rule_type)}</td><td>${r.product_id ? "商品#" + r.product_id : "全局"} / ${r.linuxdo_id ? "LD#" + r.linuxdo_id : "本站#" + (r.user_id || "-")}</td><td>${escapeHtml(r.remark || "-")}</td><td><button class="action-btn edit" onclick="fillCommunityRule(${r.id})">编辑</button><button class="action-btn del" onclick="deleteCommunityRule(${r.id})">删除</button></td></tr>`).join("");
  });
  apiFetch("../api/community.php?action=discounts").then((r) => r.json()).then((d) => {
    const tbody = document.getElementById("communityDiscountTable"); if (!tbody) return;
    if (d.code !== 1 || !Array.isArray(d.data) || d.data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无折扣规则</td></tr>'; return; }
    window.__communityDiscounts = {}; d.data.forEach((r) => (window.__communityDiscounts[r.id] = r));
    tbody.innerHTML = d.data.map((r) => `<tr><td>${r.id}</td><td>TL${r.trust_level}</td><td>${r.product_id ? "#" + r.product_id : "全局"}</td><td>${escapeHtml(r.discount_type)}</td><td>${parseFloat(r.discount_value || 0).toFixed(2)}</td><td><button class="action-btn edit" onclick="fillCommunityDiscount(${r.id})">编辑</button><button class="action-btn del" onclick="deleteCommunityDiscount(${r.id})">删除</button></td></tr>`).join("");
  });
}
function saveCommunitySettings() { const body = new FormData(); body.append("action", "save_settings"); body.append("linuxdo_silenced_order_mode", document.getElementById("communitySilencedMode").value); apiFetch("../api/community.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) showToast("设置已保存"); else alert(d.msg || "保存失败"); }); }
function saveCommunityRule() {
  const body = new FormData(); body.append("action", "save_rule");
  if (document.getElementById("ruleId").value) body.append("id", document.getElementById("ruleId").value);
  "rule_type:ruleType,product_id:ruleProductId,user_id:ruleUserId,linuxdo_id:ruleLinuxdoId,remark:ruleRemark".split(",").forEach((p) => { const [k, i] = p.split(":"); body.append(k, document.getElementById(i).value); });
  apiFetch("../api/community.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("规则已保存"); ["ruleId","ruleProductId","ruleUserId","ruleLinuxdoId","ruleRemark"].forEach((i) => (document.getElementById(i).value = "")); document.getElementById("ruleType").value = "whitelist"; loadCommunityOverview(); } else alert(d.msg || "保存失败"); });
}
function fillCommunityRule(id) { const r = window.__communityRules ? window.__communityRules[id] : null; if (!r) return; document.getElementById("ruleId").value = r.id; document.getElementById("ruleType").value = r.rule_type || "whitelist"; document.getElementById("ruleProductId").value = r.product_id || ""; document.getElementById("ruleUserId").value = r.user_id || ""; document.getElementById("ruleLinuxdoId").value = r.linuxdo_id || ""; document.getElementById("ruleRemark").value = r.remark || ""; }
function deleteCommunityRule(id) { if (!confirm("确定删除该规则？")) return; const body = new FormData(); body.append("action", "delete_rule"); body.append("id", id); apiFetch("../api/community.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("删除成功"); loadCommunityOverview(); } else alert(d.msg || "删除失败"); }); }
function saveCommunityDiscount() {
  const body = new FormData(); body.append("action", "save_discount");
  if (document.getElementById("discountId").value) body.append("id", document.getElementById("discountId").value);
  "trust_level:discountTrustLevel,product_id:discountProductId,discount_type:discountType,discount_value:discountValue,remark:discountRemark".split(",").forEach((p) => { const [k, i] = p.split(":"); body.append(k, document.getElementById(i).value); });
  apiFetch("../api/community.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("折扣已保存"); ["discountId","discountProductId","discountValue","discountRemark"].forEach((i) => (document.getElementById(i).value = "")); document.getElementById("discountType").value = "percent"; document.getElementById("discountTrustLevel").value = "0"; loadCommunityOverview(); } else alert(d.msg || "保存失败"); });
}
function fillCommunityDiscount(id) { const r = window.__communityDiscounts ? window.__communityDiscounts[id] : null; if (!r) return; document.getElementById("discountId").value = r.id; document.getElementById("discountTrustLevel").value = r.trust_level || 0; document.getElementById("discountProductId").value = r.product_id || ""; document.getElementById("discountType").value = r.discount_type || "percent"; document.getElementById("discountValue").value = r.discount_value || ""; document.getElementById("discountRemark").value = r.remark || ""; }
function deleteCommunityDiscount(id) { if (!confirm("确定删除该折扣规则？")) return; const body = new FormData(); body.append("action", "delete_discount"); body.append("id", id); apiFetch("../api/community.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("删除成功"); loadCommunityOverview(); } else alert(d.msg || "删除失败"); }); }

