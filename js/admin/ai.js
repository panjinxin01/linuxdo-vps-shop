/* =====================================================
   AI 智能生成配置：生成弹窗 / 表单回填 / AI 参数
   来源：js/admin.js
   ===================================================== */
// ==================== AI 智能生成 ====================
function openAIGenerate() {
  const desc = prompt("请输入商品描述（如：香港轻量VPS，2核4G，月付100积分）");
  if (!desc || !desc.trim()) return;
  showToast("AI 正在生成商品配置，请稍候...");
  const body = new FormData(); body.append("description", desc.trim());
  apiFetch("../api/ai.php?action=generate_product", { method: "POST", body })
    .then((r) => r.json()).then((data) => {
      if (data.code === 1 && data.data) {
        fillProductFormFromAI(data.data);
        showToast("AI 已生成配置，请检查并修改");
      } else {
        alert(data.msg || "AI 生成失败，请检查 API 配置");
      }
    }).catch(() => alert("网络请求失败，请检查 API 配置"));
}
function fillProductFormFromAI(data) {
  if (!data) return;
  const map = {pName:"name",pCpu:"cpu",pMem:"memory",pDisk:"disk",pBw:"bandwidth",pRegion:"region",pLineType:"line_type",pOsType:"os_type",pDescription:"description",pPrice:"price"};
  Object.entries(map).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el && data[key] !== undefined && String(data[key]).trim() !== "") {
      if (!el.value || el.dataset.manuallyEdited !== "true") el.value = data[key];
    }
  });
}
function loadAiSettings() {
  apiFetch("../api/settings.php?action=get_ai").then((r) => r.json()).then((data) => {
    if (data.code === 1 && data.data) {
      document.getElementById("cfgAiEndpoint").value = data.data.ai_api_endpoint || "";
      document.getElementById("cfgAiKey").value = "";
      document.getElementById("cfgAiKey").placeholder = data.data.ai_api_key_set ? "已配置，留空则保持不变" : "请输入 AI API Key";
      document.getElementById("cfgAiModel").value = data.data.ai_model || "";
    }
  }).catch(() => {});
}
function saveAiSettings() {
  const body = new FormData(); body.append("action", "save_ai");
  body.append("ai_api_endpoint", document.getElementById("cfgAiEndpoint").value);
  const key = document.getElementById("cfgAiKey").value;
  if (key && key !== "********") body.append("ai_api_key", key);
  body.append("ai_model", document.getElementById("cfgAiModel").value);
  apiFetch("../api/settings.php", { method: "POST", body }).then((r) => r.json()).then((data) => alert(data.msg));
}

