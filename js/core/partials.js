/* =====================================================
   HTML 片段加载器（v20261001）
   —— 用于在纯静态页面中把大块 HTML 拆到 partials/ 目录
   用法：
     1) 在需要插入的位置放占位符
        <div data-partial="partials/admin/tabs/products.html"></div>
     2) 在「所有占位符之后、业务脚本之前」加载本脚本
        <script src="js/core/partials.js"></script>
   说明：
     - 本脚本同步执行，占位符所在位置的 DOM 顺序与内联时完全一致，
       后续业务脚本执行时 DOM 已完整，因此无需改动任何业务 JS。
     - 片段文件内不要放 <script> 标签（innerHTML 注入不会执行），
       页面级脚本请放在外部 js 文件中。
   ===================================================== */
(function () {
  var VERSION = "20261001";

  function renderError(target, url) {
    var box = document.createElement("div");
    box.setAttribute(
      "style",
      "padding:16px;margin:12px 0;border:1px dashed #e11d48;border-radius:8px;color:#e11d48;font-size:13px"
    );
    box.textContent = "内容片段加载失败：" + url;
    if (target && target.parentNode) target.parentNode.insertBefore(box, target);
  }

  function run() {
    var nodes = document.querySelectorAll("[data-partial]");
    Array.prototype.forEach.call(nodes, function (node) {
      var url = node.getAttribute("data-partial");
      var html = "";
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url + (url.indexOf("?") > -1 ? "&" : "?") + "v=" + VERSION, false);
        xhr.send(null);
        var ok = xhr.status === 0 || (xhr.status >= 200 && xhr.status < 400);
        if (ok) html = xhr.responseText;
      } catch (e) {
        html = "";
      }
      if (!html) {
        renderError(node, url);
        return;
      }
      node.insertAdjacentHTML("beforebegin", html);
    });
    // 注入完成后清理占位符
    Array.prototype.forEach.call(document.querySelectorAll("[data-partial]"), function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }

  run();
})();
