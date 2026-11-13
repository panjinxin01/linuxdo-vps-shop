/* =====================================================
   登录 / 注册页逻辑
   来源：login.html 内联脚本（结构整理抽出，内容零改动）
   ===================================================== */
      // ==================== 主题 ====================
      function toggleTheme() {
        const dark = document.documentElement.classList.toggle("dark");
        try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
        updateThemeIcon();
      }
      function updateThemeIcon() {
        const dark = document.documentElement.classList.contains("dark");
        document.getElementById("themeIcon").innerHTML = dark ? APP_ICONS.moon : APP_ICONS.sun;
      }
      updateThemeIcon();

      // ==================== 密码可见性 ====================
      let passVisible = false;
      function togglePassVisible() {
        passVisible = !passVisible;
        document.getElementById("authPass").type = passVisible ? "text" : "password";
        document.getElementById("eyeIcon").innerHTML = passVisible ? APP_ICONS["eye-off"] : APP_ICONS.eye;
      }

      // ==================== 登录 / 注册模式 ====================
      let isLoginMode = true;
      function applyMode() {
        const title = document.getElementById("formTitle");
        const btn = document.getElementById("authBtn");
        const link = document.getElementById("switchLink");
        if (isLoginMode) {
          document.documentElement.classList.remove("reg-mode");
          title.textContent = "欢迎回来";
          btn.textContent = "登录";
          link.textContent = "创建账户";
          document.getElementById("authPass").setAttribute("autocomplete", "current-password");
        } else {
          document.documentElement.classList.add("reg-mode");
          title.textContent = "创建账户";
          btn.textContent = "注册";
          link.textContent = "已有账户？登录";
          document.getElementById("authPass").setAttribute("autocomplete", "new-password");
        }
      }
      function switchMode(e) {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        hideMsg();
        applyMode();
        const url = new URL(window.location.href);
        if (!isLoginMode) url.searchParams.set("mode", "register");
        else url.searchParams.delete("mode");
        history.replaceState(null, "", url);
      }
      function forgotPassword(e) {
        e.preventDefault();
        showMsg("如需找回密码，请使用账户关联邮箱联系站点管理员处理。", "ok");
      }

      // ==================== 提示信息 ====================
      function showMsg(text, type) {
        const tip = document.getElementById("msgTip");
        tip.className = "msg-tip " + (type === "ok" ? "ok" : "error");
        tip.textContent = text;
      }
      function hideMsg() { document.getElementById("msgTip").className = "msg-tip"; }

      // ==================== 认证提交 ====================
      function doAuth(e) {
        e.preventDefault();
        const username = document.getElementById("authUser").value.trim();
        const password = document.getElementById("authPass").value;
        const email = document.getElementById("authEmail").value.trim();
        if (!username || !password) { showMsg("请填写用户名和密码"); return; }
        const body = new FormData();
        body.append("action", isLoginMode ? "login" : "register");
        body.append("username", username);
        body.append("password", password);
        if (!isLoginMode && email) body.append("email", email);
        const btn = document.getElementById("authBtn");
        btn.disabled = true;
        btn.textContent = isLoginMode ? "登录中…" : "注册中…";
        apiFetch("api/user.php", { method: "POST", body })
          .then((r) => r.json())
          .then((data) => {
            if (data.code !== 1) {
              showMsg(data.msg || "操作失败");
              btn.disabled = false;
              btn.textContent = isLoginMode ? "登录" : "注册";
              return;
            }
            if (isLoginMode) {
              showMsg("登录成功，正在跳转…", "ok");
              if (data.data.role === "admin") { window.location.href = "admin/index.html"; return; }
              window.location.href = "index.html";
            } else {
              showMsg("注册成功，请登录", "ok");
              isLoginMode = true;
              applyMode();
              document.getElementById("authUser").value = username;
              document.getElementById("authPass").value = "";
              btn.disabled = false;
              btn.textContent = "登录";
            }
          })
          .catch(() => {
            showMsg("网络异常，请稍后重试");
            btn.disabled = false;
            btn.textContent = isLoginMode ? "登录" : "注册";
          });
      }

      // ==================== 设置弹窗（减弱动画效果开关） ====================
      function openSettings() {
        document.getElementById("settingsModal").classList.add("show");
      }
      function closeSettings() {
        document.getElementById("settingsModal").classList.remove("show");
      }
      function toggleReduceMotion() {
        const on = document.documentElement.classList.toggle("reduce-motion");
        try { localStorage.setItem("reduceMotion", on ? "1" : "0"); } catch (e) {}
        const sw = document.getElementById("motionSwitch");
        sw.classList.toggle("active", on);
        sw.setAttribute("aria-checked", on ? "true" : "false");
      }
      (function initReduceMotion() {
        try {
          if (localStorage.getItem("reduceMotion") === "1") {
            document.documentElement.classList.add("reduce-motion");
          }
        } catch (e) {}
        const sw = document.getElementById("motionSwitch");
        const on = document.documentElement.classList.contains("reduce-motion");
        sw.classList.toggle("active", on);
        sw.setAttribute("aria-checked", on ? "true" : "false");
      })();

      // ==================== Linux DO OAuth ====================
      function loginWithLinuxDO() { window.location.href = "api/oauth.php?action=login"; }
      function checkLinuxDOOAuth() {
        apiFetch("api/oauth.php?action=check").then((r) => r.json())
          .then((data) => {
            const configured = data.code === 1 && data.data && data.data.configured;
            document.getElementById("oauthDivider").style.display = configured ? "flex" : "none";
            document.getElementById("linuxdoLoginBtn").style.display = configured ? "flex" : "none";
          })
          .catch(() => {
            document.getElementById("oauthDivider").style.display = "none";
            document.getElementById("linuxdoLoginBtn").style.display = "none";
          });
      }

      // ==================== 初始化 ====================
      (function init() {
        initCsrfToken();
        checkLinuxDOOAuth();
        const params = new URLSearchParams(window.location.search);
        if (params.get("mode") === "register") { isLoginMode = false; }
        applyMode();
        // 已登录则直接跳回
        apiFetch("api/user.php?action=check").then((r) => r.json()).then((data) => {
          if (data.code === 1) {
            window.location.href = (data.data && data.data.role === "admin") ? "admin/index.html" : "index.html";
          }
        }).catch(() => {});
      })();
