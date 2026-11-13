/* =====================================================
   数据库维护页逻辑（依赖 js/core/common.js）
   ===================================================== */
window.__apiBase = "../";

document.addEventListener("DOMContentLoaded", function () {
  initCsrfToken("../");
  apiFetch("../api/admin.php?action=check")
    .then((r) => r.json())
    .then((data) => {
      if (data.code !== 1) location.href = "login.html";
    })
    .catch(() => {
      location.href = "login.html";
    });
});

function checkDbStatus() {
  const statusDiv = document.getElementById("dbStatus");
  statusDiv.className = "show loading";
  statusDiv.innerHTML = "正在检查数据库状态...";

  apiFetch("../api/update_db.php?action=check")
    .then((r) => r.json())
    .then((data) => {
      if (data.code === 1) {
        const info = data.data;
        if (info.all_installed) {
          statusDiv.className = "show success";
          const build = info.build ? '<br><small style="opacity:0.8">构建版本: ' + info.build + "</small>" : "";
          const missingColCount = info.missing_columns ? info.missing_columns.length : 0;
          const missingCols =
            info.missing_columns && info.missing_columns.length
              ? '<br><small style="opacity:0.8">缺失关键列: ' + info.missing_columns.join(", ") + "</small>"
              : "";
          const columnOk = info.all_columns_ready !== false;
          if (columnOk) {
            statusDiv.innerHTML =
              appIcon("check-circle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' 数据库状态正常，所有表和关键列已安装' +
              build +
              '<br><small style="opacity:0.8">已安装表: ' +
              info.existing.join(", ") +
              "</small>";
          } else {
            statusDiv.className = "show warning";
            statusDiv.innerHTML =
              appIcon("alert-triangle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' 表都在，但关键列不完整' +
              build +
              (missingColCount ? '<br><small style="opacity:0.8">缺失数量: ' + missingColCount + "</small>" : "") +
              missingCols +
              '<br><small style="opacity:0.8">请点击“更新数据库”执行补列</small>';
          }
        } else {
          statusDiv.className = "show warning";
          statusDiv.innerHTML =
            appIcon("alert-triangle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' 发现缺失的表：<strong>' +
            info.missing.join(", ") +
            '</strong><br><small style="opacity:0.8">请点击“更新数据库”按钮进行安装</small>';
        }
      } else {
        statusDiv.className = "show error";
        statusDiv.innerHTML =
          appIcon("x-circle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' 检查失败：' +
          escapeHtml(data.msg || "未知错误");
      }
    })
    .catch(() => {
      statusDiv.className = "show error";
      statusDiv.innerHTML =
        appIcon("x-circle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' 网络错误，请检查网络连接';
    });
}

async function updateDatabase() {
  const statusDiv = document.getElementById("dbStatus");
  statusDiv.className = "show loading";
  statusDiv.innerHTML = "正在检查数据库结构...";

  try {
    const checkData = await apiFetch("../api/update_db.php?action=check").then((r) => r.json());
    const info = checkData.data || {};
    const tablesReady = !!info.all_installed;
    const columnsReady = info.all_columns_ready !== false;

    if (checkData.code === 1 && tablesReady && columnsReady) {
      statusDiv.className = "show success";
      statusDiv.innerHTML =
        appIcon("check-circle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' <strong>数据库已完整安装，无需更新。</strong><br><small style="opacity:0.8">所有数据表和关键字段均已就绪，未对数据库做任何改动。</small>';
      showToast("数据库结构已是最新版本", "success");
      return;
    }

    const parts = [];
    if (!tablesReady && info.missing && info.missing.length) {
      parts.push("待新建数据表（" + info.missing.length + " 张）：" + info.missing.join(", "));
    }
    if (!columnsReady && info.missing_columns && info.missing_columns.length) {
      parts.push("待补齐关键字段（" + info.missing_columns.length + " 个）：" + info.missing_columns.join(", "));
    }

    const ok = await showConfirmModal({
      title: "确认更新数据库",
      message:
        "检测到数据库结构不完整，即将自动补齐缺失内容（不会删除或修改任何现有数据）：\n" +
        (parts.join("\n") || "补全结构与默认配置"),
      confirmText: "立即更新",
    });
    if (!ok) {
      statusDiv.className = "";
      statusDiv.innerHTML = "";
      return;
    }

    statusDiv.className = "show loading";
    statusDiv.innerHTML = "正在更新数据库...";

    const body = new FormData();
    body.append("action", "update");
    const data = await apiFetch("../api/update_db.php", { method: "POST", body }).then((r) => r.json());
    const res = data.data || {};
    const build = res.build ? '<br><small style="opacity:0.8">构建版本: ' + res.build + "</small>" : "";
    const createdCount = (res.created || []).length;
    const migratedCount = (res.migrated || []).length;
    const created = createdCount
      ? '<br><small style="opacity:0.8">本次新增数据表 ' + createdCount + " 张：" + res.created.join(", ") + "</small>"
      : "";
    const migrated = migratedCount
      ? '<br><small style="opacity:0.8">本次补齐字段及数据项 ' + migratedCount + " 个：" + res.migrated.join(", ") + "</small>"
      : "";
    const remaining = (res.remaining_missing_columns || []).length
      ? '<br><small style="opacity:0.8">仍缺关键列: ' + res.remaining_missing_columns.join(", ") + "</small>"
      : "";
    const errors = (res.errors || []).length
      ? '<br><small style="opacity:0.8">错误详情:<br>' + res.errors.join("<br>") + "</small>"
      : "";

    if (data.code === 1) {
      statusDiv.className = "show success";
      if (createdCount === 0 && migratedCount === 0) {
        statusDiv.innerHTML =
          appIcon("check-circle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' <strong>检查完成：数据库结构已是最新版本，无需新增任何表或字段。</strong>' +
          build;
      } else {
        statusDiv.innerHTML =
          appIcon("check-circle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' <strong>更新完成！</strong>' +
          build +
          created +
          migrated;
      }
      showToast(data.msg || "数据库更新完成", "success");
      setTimeout(checkDbStatus, 300);
    } else {
      statusDiv.className = "show error";
      statusDiv.innerHTML =
        appIcon("x-circle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' <strong>更新失败：</strong>' +
        escapeHtml(data.msg || "未知错误") +
        build +
        created +
        migrated +
        remaining +
        errors;
      showToast(data.msg || "数据库更新失败", "error");
    }
  } catch (e) {
    statusDiv.className = "show error";
    statusDiv.innerHTML =
      appIcon("x-circle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' 网络错误，请检查网络连接';
    showToast("网络错误，请检查网络连接", "error");
  }
}

async function resetDatabase() {
  // 第一次确认：高危警告弹窗
  const step1 = await showConfirmModal({
    title: "高危操作：准备重置数据库",
    message:
      "重置数据库将会永久清空所有商品、订单、用户账号、优惠券、工单和公告记录（仅保留管理员与系统设置）！\n\n确认继续进入第二步口令校验吗？",
    confirmText: "继续下一步",
    cancelText: "取消（保留数据）",
    danger: true,
  });
  if (!step1) return;

  // 第二次确认：强制输入 RESET 口令
  const confirmText = await showPromptModal({
    title: "最终二次确认",
    message: "请输入大写口令 RESET 以确认执行不可逆数据库重置：",
    label: "确认口令（区分大小写）",
    placeholder: "请输入 RESET",
    confirmText: "确认立即重置",
    cancelText: "取消",
  });
  if (confirmText === null) return;
  if (confirmText.trim() !== "RESET") {
    showToast("口令输入不正确（需输入 RESET），重置已取消", "warning");
    return;
  }

  const statusDiv = document.getElementById("dbStatus");
  statusDiv.className = "show loading";
  statusDiv.innerHTML = "正在重置数据库...";

  const body = new FormData();
  body.append("action", "reset");

  apiFetch("../api/update_db.php", { method: "POST", body })
    .then((r) => r.json())
    .then((data) => {
      const info = data.data || {};
      const build = info.build ? '<br><small style="opacity:0.8">构建版本: ' + info.build + "</small>" : "";
      const created = (info.created || []).length ? '<br><small style="opacity:0.8">新建表: ' + info.created.join(", ") + "</small>" : "";
      const migrated = (info.migrated || []).length ? '<br><small style="opacity:0.8">已补项目: ' + info.migrated.join(", ") + "</small>" : "";
      const remaining = (info.remaining_missing_columns || []).length
        ? '<br><small style="opacity:0.8">仍缺关键列: ' + info.remaining_missing_columns.join(", ") + "</small>"
        : "";
      const errors = (info.errors || []).length ? '<br><small style="opacity:0.8">错误详情:<br>' + info.errors.join("<br>") + "</small>" : "";
      if (data.code === 1) {
        statusDiv.className = "show success";
        statusDiv.innerHTML =
          appIcon("check-circle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' ' +
          escapeHtml(data.msg || "数据库重置成功") +
          build +
          created +
          migrated +
          remaining;
        showToast("数据库重置成功，如需体验数据可点击「恢复演示数据」", "success");
        setTimeout(checkDbStatus, 300);
      } else {
        statusDiv.className = "show error";
        statusDiv.innerHTML =
          appIcon("x-circle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' ' +
          escapeHtml(data.msg || "重置失败") +
          build +
          created +
          migrated +
          remaining +
          errors;
        showToast(data.msg || "数据库重置失败", "error");
      }
    })
    .catch(() => {
      statusDiv.className = "show error";
      statusDiv.innerHTML =
        appIcon("x-circle", 16, { style: "vertical-align:-3px;margin-right:4px" }) + ' 网络错误，请检查网络连接';
      showToast("网络错误，请检查网络连接", "error");
    });
}
