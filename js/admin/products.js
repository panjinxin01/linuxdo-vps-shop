/* =====================================================
   商品管理：列表 / 新增 / 编辑 / 删除 / 退出登录
   来源：js/admin.js
   ===================================================== */
// ==================== 商品模块 ====================
function loadProducts() {
  apiFetch("../api/products.php?action=all").then((r) => r.json()).then((data) => {
    const tbody = document.getElementById("productTable");
    if (data.code !== 1 || !data.data || data.data.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无商品</td></tr>'; return; }
    productCache = {}; data.data.forEach((p) => { productCache[p.id] = p; });
    tbody.innerHTML = data.data.map((p) => `<tr><td>${p.id}</td><td><span style="font-weight:600;color:var(--text-main)">${escapeHtml(p.name)}</span><div style="font-size:12px;color:var(--text-muted)">${escapeHtml(p.template_name || "")}</div></td><td>${escapeHtml(p.cpu) || "-"}/${escapeHtml(p.memory) || "-"}/${escapeHtml(p.disk) || "-"}<div style="font-size:12px;color:var(--text-muted)">${escapeHtml(p.region || "-")} · TL${parseInt(p.min_trust_level || 0)}</div></td><td>${parseFloat(p.price || 0).toFixed(2)}积分</td><td>${escapeHtml(p.ip_address || "-")}</td><td><span class="badge ${p.status == 1 ? "on" : "off"}">${p.status == 1 ? "在售" : "已售"}</span></td><td><button class="action-btn edit" onclick="editProductById(${p.id})">编辑</button><button class="action-btn del" onclick="deleteProduct(${p.id})">删除</button></td></tr>`).join("");
  });
}

function showAddProduct() {
  document.getElementById("productModalTitle").textContent = "添加商品";
  ["pId","pName","pCpu","pMem","pDisk","pBw","pPrice","pIp","pPort","pUser","pPass","pExtra","pRegion","pLineType","pOsType","pDescription"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("pPort").value = "22"; document.getElementById("pUser").value = "root";
  document.getElementById("pTemplate").value = ""; document.getElementById("pMinTrustLevel").value = "0";
  document.getElementById("pRiskReviewRequired").checked = false; document.getElementById("pAllowWhitelistOnly").checked = false;
  loadProductTemplateOptions(); document.getElementById("productModal").classList.add("show");
}

function editProduct(p) {
  document.getElementById("productModalTitle").textContent = "编辑商品";
  const fields = {pId:"id",pName:"name",pCpu:"cpu",pMem:"memory",pDisk:"disk",pBw:"bandwidth",pPrice:"price",pIp:"ip_address",pPort:"ssh_port",pUser:"ssh_user",pPass:"ssh_password",pExtra:"extra_info",pRegion:"region",pLineType:"line_type",pOsType:"os_type",pDescription:"description"};
  Object.entries(fields).forEach(([elId,key]) => { document.getElementById(elId).value = p[key] || (key==="ssh_port"?22:key==="ssh_user"?"root":""); });
  document.getElementById("pMinTrustLevel").value = p.min_trust_level || 0;
  document.getElementById("pRiskReviewRequired").checked = parseInt(p.risk_review_required || 0) === 1;
  document.getElementById("pAllowWhitelistOnly").checked = parseInt(p.allow_whitelist_only || 0) === 1;
  loadProductTemplateOptions(p.template_id || ""); document.getElementById("productModal").classList.add("show");
}
function editProductById(id) { const p = productCache[id]; if (p) editProduct(p); }
function closeProductModal() { document.getElementById("productModal").classList.remove("show"); }

function saveProduct() {
  const body = new FormData(), id = document.getElementById("pId").value;
  body.append("action", id ? "edit" : "add"); if (id) body.append("id", id);
  "name:pName,cpu:pCpu,memory:pMem,disk:pDisk,bandwidth:pBw,price:pPrice,ip_address:pIp,ssh_port:pPort,ssh_user:pUser,ssh_password:pPass,extra_info:pExtra,region:pRegion,line_type:pLineType,os_type:pOsType,description:pDescription,template_id:pTemplate,min_trust_level:pMinTrustLevel".split(",").forEach((pair) => { const [k, elId] = pair.split(":"); const el = document.getElementById(elId); body.append(k, el ? el.value : ""); });
  body.append("risk_review_required", document.getElementById("pRiskReviewRequired").checked ? "1" : "0");
  body.append("allow_whitelist_only", document.getElementById("pAllowWhitelistOnly").checked ? "1" : "0");
  apiFetch("../api/products.php", { method: "POST", body }).then((r) => r.json()).then((data) => { if (data.code === 1) { showToast("保存成功"); closeProductModal(); loadProducts(); } else { alert(data.msg || "保存失败"); } });
}

function deleteProduct(id) {
  if (!confirm("确定删除该商品？")) return;
  const body = new FormData(); body.append("action", "delete"); body.append("id", id);
  apiFetch("../api/products.php", { method: "POST", body }).then((r) => r.json()).then((data) => { alert(data.msg); loadProducts(); loadStats(); });
}

function logout() { apiFetch("../api/admin.php", { method: "POST", body: new URLSearchParams({ action: "logout" }) }).then(() => (window.location.href = "login.html")); }

