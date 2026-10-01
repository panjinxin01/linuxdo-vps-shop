/* =====================================================
   发起工单辅助：Markdown 工具条 / 图片选择与上传
   来源：js/tickets.js
   ===================================================== */
/* =====================================================
   11. Markdown 工具栏 + 图床式图片暂存（v20260825）
   ===================================================== */

/* 选区包裹（B / I / 行内代码） */
function tkMdWrap(taId, before, after) {
  var ta = document.getElementById(taId);
  if (!ta) return;
  var s = ta.selectionStart, e = ta.selectionEnd;
  var sel = ta.value.substring(s, e) || "文本";
  ta.value = ta.value.substring(0, s) + before + sel + after + ta.value.substring(e);
  ta.focus();
  var pos = s + before.length + sel.length + after.length;
  try { ta.setSelectionRange(pos, pos); } catch (err) {}
  if (taId === "tkNewContent") tkNewUpdateCount();
}

/* 行前缀（引用 / 列表）：对选中行逐行添加前缀 */
function tkMdLines(taId, prefix) {
  var ta = document.getElementById(taId);
  if (!ta) return;
  var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
  var ls = v.lastIndexOf("\n", Math.max(s - 1, 0)) + 1;
  var le = v.indexOf("\n", e);
  if (le === -1) le = v.length;
  var block = v.substring(ls, le) || "列表项";
  var lined = block.split("\n").map(function (l) { return prefix + l.replace(/^(- |\> )+/, ""); }).join("\n");
  ta.value = v.substring(0, ls) + lined + v.substring(le);
  ta.focus();
  var pos = ls + lined.length;
  try { ta.setSelectionRange(pos, pos); } catch (err) {}
  if (taId === "tkNewContent") tkNewUpdateCount();
}

/* 插入链接 */
function tkMdInsertLink() {
  var url = prompt("请输入链接地址：", "https://");
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  tkMdWrap("tkNewContent", "[", "](" + url + ")");
}

/* 图片按钮：选择文件 → 暂存 + 在光标处插入占位标记（提交工单后自动上传） */
function tkNewImagePick() {
  var fi = document.getElementById("tkNewImageFile");
  if (!fi) return;
  fi.value = "";
  fi.click();
}

function tkNewImageSelected(input) {
  var f = input.files && input.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) { showToast("图片大小不能超过 5MB"); return; }
  if (!TicketState.pendingNewImages) TicketState.pendingNewImages = [];
  if (TicketState.pendingNewImages.length >= 9) { showToast("最多随工单附带 9 张图片"); return; }
  TicketState.pendingNewImages.push(f);
  var ta = document.getElementById("tkNewContent");
  if (ta) {
    var mark = "[图片:" + f.name + "]";
    var s = ta.selectionStart, e = ta.selectionEnd;
    var head = ta.value.substring(0, s);
    var needNl = head && head.charAt(head.length - 1) !== "\n" ? "\n" : "";
    ta.value = head + needNl + mark + "\n" + ta.value.substring(e);
    ta.focus();
    tkNewUpdateCount();
  }
  tkUpdateImageButton();
  showToast("已添加待上传图片：" + f.name);
}

function tkUpdateImageButton() {
  var b = document.getElementById("tkNewImageBtn");
  if (!b) return;
  var n = (TicketState.pendingNewImages || []).length;
  b.classList.toggle("is-image-pending", n > 0);
  b.innerHTML = ticketIcon("clip", 13) + " 图片" + (n ? " (" + n + ")" : "");
}

function tkNewUpdateCount() {
  var ta = document.getElementById("tkNewContent");
  var el = document.getElementById("tkNewCount");
  if (ta && el) el.textContent = (ta.value || "").length + " 字";
}

/* 紧急勾选 → 强制优先级为「紧急」并锁定下拉 */
function tkToggleUrgent(cb) {
  var pri = document.getElementById("tkNewPriority");
  if (!pri) return;
  if (cb.checked) { pri.value = "3"; pri.disabled = true; }
  else { pri.disabled = false; }
}

/* 提交后按顺序续传暂存图片（单个失败不阻断，最后汇总提示） */
function tkUploadPendingImages(tid) {
  var files = (TicketState.pendingNewImages || []).slice();
  if (!tid || !files.length) return Promise.resolve();
  var failed = 0;
  var chain = Promise.resolve();
  files.forEach(function (f) {
    chain = chain.then(function () {
      return TicketApi.uploadAttachment(tid, f).catch(function () { failed++; });
    });
  });
  return chain.then(function () {
    if (failed) showToast(failed + " 张图片上传失败，可稍后在工单内重新上传");
  });
}

