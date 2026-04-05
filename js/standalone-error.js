(function () {
  function getApiErrorDetail(data) {
    if (!data || typeof data !== "object") return "";
    return String(data.error_detail || data.errorDetail || "").trim();
  }

  function buildApiErrorText(data, fallbackMessage = "请求失败") {
    const msg = String((data && data.msg) || fallbackMessage || "请求失败").trim();
    const detail = getApiErrorDetail(data);
    return detail ? msg + "\n\n" + detail : msg;
  }

  function getReadableRequestError(error, fallbackMessage = "请求失败") {
    if (!error) return String(fallbackMessage || "请求失败");
    if (typeof error === "string") return error;
    if (typeof error.message === "string" && error.message.trim()) return error.message.trim();
    return String(fallbackMessage || "请求失败");
  }

  function copyText(text, btn) {
    const value = String(text || "");
    if (!value) return;
    const done = function () {
      if (!btn) return;
      const originalText = btn.dataset.originalText || btn.textContent || "复制报错";
      btn.dataset.originalText = originalText;
      btn.textContent = "已复制";
      clearTimeout(btn.__copyTimer);
      btn.__copyTimer = setTimeout(function () {
        btn.textContent = originalText;
      }, 1600);
    };
    const fallbackCopy = function () {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        done();
      } catch (err) {
        alert("复制失败，请手动复制");
      }
      document.body.removeChild(textarea);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(fallbackCopy);
      return;
    }
    fallbackCopy();
  }

  function ensureErrorModal() {
    let modal = document.getElementById("standaloneApiErrorModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "standaloneApiErrorModal";
    modal.className = "modal-bg";
    modal.innerHTML = `
      <div class="modal api-error-modal" style="max-width:680px;width:min(92vw,680px)">
        <div class="modal-head">
          <h3 style="color:var(--danger, #ef4444)">错误详情</h3>
          <button class="modal-close" type="button" onclick="closeApiErrorModal()">&times;</button>
        </div>
        <div class="modal-body">
          <div id="standaloneApiErrorSummary" class="api-error-summary"></div>
          <textarea id="standaloneApiErrorDetailText" readonly class="api-error-textarea"></textarea>
        </div>
        <div class="modal-foot">
          <button class="btn btn-outline" type="button" onclick="closeApiErrorModal()">关闭</button>
          <button class="btn btn-primary" type="button" onclick="copyApiErrorDetail(this)">复制报错</button>
        </div>
      </div>`;
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeApiErrorModal();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function closeApiErrorModal() {
    const modal = document.getElementById("standaloneApiErrorModal");
    if (modal) modal.classList.remove("show");
  }

  function copyApiErrorDetail(btn) {
    const textarea = document.getElementById("standaloneApiErrorDetailText");
    if (!textarea) return;
    copyText(textarea.value || "", btn);
  }

  function showApiError(title, detailText) {
    const summary = String(title || "请求失败").trim() || "请求失败";
    const detail = String(detailText || summary).trim() || summary;
    const modal = ensureErrorModal();
    const summaryEl = document.getElementById("standaloneApiErrorSummary");
    const detailEl = document.getElementById("standaloneApiErrorDetailText");
    if (summaryEl) summaryEl.textContent = summary;
    if (detailEl) detailEl.value = detail;
    modal.classList.add("show");
  }

  function showDetailedError(data, fallbackMessage = "请求失败") {
    const msg = String((data && data.msg) || fallbackMessage || "请求失败").trim();
    const detail = getApiErrorDetail(data);
    if (!detail) {
      alert(msg);
      return;
    }
    showApiError(msg, buildApiErrorText(data, fallbackMessage));
  }

  function showRequestError(error, fallbackMessage = "请求失败") {
    const msg = String(fallbackMessage || "请求失败").trim() || "请求失败";
    const detail = getReadableRequestError(error, msg);
    showApiError(msg, detail || msg);
  }

  window.getApiErrorDetail = getApiErrorDetail;
  window.buildApiErrorText = buildApiErrorText;
  window.showDetailedError = showDetailedError;
  window.showRequestError = showRequestError;
  window.closeApiErrorModal = closeApiErrorModal;
  window.copyApiErrorDetail = copyApiErrorDetail;
})();
