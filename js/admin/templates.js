/* =====================================================
   商品模板：选项加载 / 表单回填 / 列表 / 增删改
   来源：js/admin.js
   ===================================================== */
// ==================== 模板管理 ====================
function loadProductTemplateOptions(selectedId = "") {
apiFetch("../api/templates.php?action=list").then((r) => r.json()).then((d) => {
const sel = document.getElementById("pTemplate"); if (!sel) return;
sel.innerHTML = '<option value="">不使用模板</option>';
if (d.code === 1 && Array.isArray(d.data)) d.data.forEach((t) => { sel.innerHTML += `<option value="${t.id}">${escapeHtml(t.name)}</option>`; });
if (selectedId !== "") sel.value = String(selectedId);
// 绑定 onchange 事件（仅一次）
if (!sel._templateBound) {
  sel.addEventListener("change", function() {
    if (this.value) applyTemplateToProductForm(this.value);
    else resetProductFormFields();
  });
  sel._templateBound = true;
}
// 编辑模式：自动触发填充
if (selectedId !== "") applyTemplateToProductForm(selectedId);
});
}
function applyTemplateToProductForm(templateId) {
const t = window.__templateCache ? window.__templateCache[templateId] : null;
if (!t) return;
const fieldMap = {pCpu:"cpu",pMem:"memory",pDisk:"disk",pBw:"bandwidth",pRegion:"region",pLineType:"line_type",pOsType:"os_type",pDescription:"description",pExtra:"extra_info"};
const labelMap = {pCpu:"pCpu",pMem:"pMem",pDisk:"pDisk",pBw:"pBw",pRegion:"pRegion",pLineType:"pLineType",pOsType:"pOsType",pDescription:"pDescription",pExtra:"pExtra"};
Object.entries(fieldMap).forEach(([elId, key]) => {
  const el = document.getElementById(elId);
  const label = el ? el.closest(".form-group")?.querySelector("label") : null;
  if (t[key] && String(t[key]).trim() !== "") {
    el.value = t[key];
    el.classList.add("field-from-template");
    if (label) label.classList.add("template-indicator");
  } else {
    if (el && !el.dataset.manuallyEdited) el.value = "";
    el.classList.remove("field-from-template");
    if (label) label.classList.remove("template-indicator");
  }
});
}
function resetProductFormFields() {
["pCpu","pMem","pDisk","pBw","pRegion","pLineType","pOsType","pDescription","pExtra"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove("field-from-template");
    const label = el.closest(".form-group")?.querySelector("label");
    if (label) label.classList.remove("template-indicator");
  }
});
}
function loadTemplateList() {
  apiFetch("../api/templates.php?action=list").then((r) => r.json()).then((d) => {
    const tbody = document.getElementById("templateTable"); if (!tbody) return;
    if (d.code !== 1 || !Array.isArray(d.data) || d.data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无模板</td></tr>'; return; }
    tbody.innerHTML = d.data.map((t) => `<tr><td>${t.id}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.cpu || "-")}/${escapeHtml(t.memory || "-")}/${escapeHtml(t.disk || "-")}</td><td><span class="badge ${parseInt(t.status || 1) === 1 ? "on" : "off"}">${parseInt(t.status || 1) === 1 ? "启用" : "停用"}</span></td><td></td></tr>`).join("");
    Array.from(tbody.querySelectorAll("tr")).forEach((tr, idx) => { const cell = tr.lastElementChild; if (!cell) return; const t = d.data[idx]; cell.innerHTML = `<button class="action-btn edit" onclick="fillTemplateForm(${t.id})">编辑</button><button class="action-btn edit" onclick="createTemplateFromProductPrompt()">从商品生成</button><button class="action-btn del" onclick="deleteTemplate(${t.id})">删除</button>`; });
    window.__templateCache = {}; d.data.forEach((t) => (window.__templateCache[t.id] = t));
  });
}
function fillTemplateForm(id) {
  const t = window.__templateCache ? window.__templateCache[id] : null; if (!t) return;
  ["tplId:id","tplName:name","tplCpu:cpu","tplMemory:memory","tplDisk:disk","tplBandwidth:bandwidth","tplRegion:region","tplLineType:line_type","tplOsType:os_type","tplDescription:description","tplExtraInfo:extra_info"].forEach((p) => { const [elId,k] = p.split(":"); document.getElementById(elId).value = t[k] || ""; });
  document.getElementById("tplSort").value = t.sort_order || 0; switchTab("templates");
}
function saveTemplate() {
  const body = new FormData(), id = document.getElementById("tplId").value;
  body.append("action", id ? "update" : "create"); if (id) body.append("id", id);
  "name:tplName,cpu:tplCpu,memory:tplMemory,disk:tplDisk,bandwidth:tplBandwidth,region:tplRegion,line_type:tplLineType,os_type:tplOsType,description:tplDescription,extra_info:tplExtraInfo,sort_order:tplSort".split(",").forEach((p) => { const [k, elId] = p.split(":"); body.append(k, document.getElementById(elId).value); });
  apiFetch("../api/templates.php", { method: "POST", body }).then((r) => r.json()).then((d) => {
    if (d.code === 1) { showToast("模板已保存"); ["tplId","tplName","tplCpu","tplMemory","tplDisk","tplBandwidth","tplRegion","tplLineType","tplOsType","tplDescription","tplExtraInfo"].forEach((i) => (document.getElementById(i).value = "")); document.getElementById("tplSort").value = "0"; loadTemplateList(); loadProductTemplateOptions(); }
    else alert(d.msg || "保存失败");
  });
}
function deleteTemplate(id) { if (!confirm("确定删除该模板？")) return; const body = new FormData(); body.append("action", "delete"); body.append("id", id); apiFetch("../api/templates.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("删除成功"); loadTemplateList(); loadProductTemplateOptions(); } else alert(d.msg || "删除失败"); }); }
function createTemplateFromProductPrompt() { const id = prompt("输入商品ID，快速生成模板"); if (!id) return; const body = new FormData(); body.append("action", "create_from_product"); body.append("product_id", id); apiFetch("../api/templates.php", { method: "POST", body }).then((r) => r.json()).then((d) => { if (d.code === 1) { showToast("已从商品生成模板"); loadTemplateList(); loadProductTemplateOptions(); } else alert(d.msg || "生成失败"); }); }

