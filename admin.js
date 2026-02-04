 const DEFAULT_API_BASE = (() => {
    try {
      const origin = window.location?.origin;
       if (origin && origin !== "null" && !origin.startsWith("file:")) {
         return `${origin}/api`;
       }
    } catch {}
    return "/api";
   })();
const API_BASE_KEY = "api_base_url";
const AUTH_TOKEN_KEY = "auth_token";

let modelOptions = [];

function normalizeApiBase(raw) {
  const base = String(raw || "").trim().replace(/\/+$/, "");
  if (!base) return DEFAULT_API_BASE.replace(/\/+$/, "");
  if (/\/api(\/|$)/i.test(base)) return base;
  return `${base}/api`;
}
function getApiBase() {
  return normalizeApiBase(localStorage.getItem(API_BASE_KEY) || DEFAULT_API_BASE);
}
function apiUrl(path) {
  const p = String(path || "");
  return `${getApiBase()}${p.startsWith("/") ? "" : "/"}${p}`;
}

function getAuthToken() {
  return String(localStorage.getItem(AUTH_TOKEN_KEY) || "");
}

function authHeaders(extra) {
  const h = { ...(extra || {}) };
  const tok = getAuthToken();
  if (tok) h["Authorization"] = `Bearer ${tok}`;
  return h;
}

function setError(msg) {
  const el = document.getElementById("err");
  if (!el) return;
  const m = String(msg || "").trim() || "Something went wrong.";
  el.textContent = m;
  el.classList.remove("hidden");
}

function clearError() {
  const el = document.getElementById("err");
  if (el) el.classList.add("hidden");
}

function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.location.href = "login.html";
}

async function apiFetch(path, options) {
  const res = await fetch(apiUrl(path), {
    ...(options || {}),
    headers: authHeaders((options || {}).headers),
  });
  if (res.status === 401) {
    logout();
    throw new Error("unauthorized");
  }
  return res;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAllowedModels(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : item?.key))
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim());
  }
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function loadModelOptions() {
  let loadError = "";
  const modelsUrl = apiUrl("/models?all=1");
  try {
    const res = await apiFetch("/models?all=1", { method: "GET" });
    const resClone = res.clone();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const text = await resClone.text().catch(() => "");
      console.error("Models request failed", {
        url: modelsUrl,
        status: res.status,
        responseText: text,
      });
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    let items = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (Array.isArray(data?.items)) {
      items = data.items;
    } else if (Array.isArray(data?.models)) {
      items = data.models;
    }
    modelOptions = items
      .map((item) => {
        if (typeof item === "string") return { key: item, label: item };
        if (!item || typeof item !== "object") return null;
        const key = String(item.key || item.id || item.name || item.model || "").trim();
        if (!key) return null;
        const label = String(item.label || item.name || item.model || key).trim();
        return { key, label };
      })
      .filter(Boolean);
  } catch (e) {
    console.error("Unable to load models", { url: modelsUrl, error: e });
    loadError = e?.message || "Unable to load models.";
    modelOptions = [];
  }
  const container = document.getElementById("c-models");
  if (container) {
    if (loadError) {
      container.innerHTML = `<div class="text-red-500">Unable to load models (${escapeHtml(loadError)})</div>`;
    } else {
      container.innerHTML = renderModelCheckboxList("");
    }
  }
}

function renderModelCheckboxList(selectedCsv) {
  const selected = normalizeAllowedModels(selectedCsv);
  if (!modelOptions.length) {
    return `<div class="text-slate-400">No models available</div>`;
  }
  return modelOptions
    .map((m, index) => {
      const key = String(m.key || "");
      const isSelected = selected.includes(key);
      const safeKey = key.replace(/[^a-z0-9_-]/gi, "_");
      const inputId = `model-${safeKey}-${index}`;
      return `
        <label for="${inputId}" class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition">
          <input id="${inputId}" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/40" value="${escapeHtml(key)}" ${isSelected ? "checked" : ""} />
          <span class="text-slate-600 dark:text-slate-200">${escapeHtml(m.label || key)}</span>
        </label>
      `;
    })
    .join("");
}

function renderModelCheckboxes(selectedCsv) {
  return `
    <div data-field="allowed_models" class="w-60 px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/40 text-xs min-h-[3rem] max-h-36 overflow-y-auto">
      ${renderModelCheckboxList(selectedCsv)}
    </div>
  `;
}

async function loadMe() {
  const res = await apiFetch("/me", { method: "GET" });
  const data = await res.json().catch(() => ({}));
  const user = data?.user || {};
  if (String(user.role || "").toLowerCase() !== "admin") {
    window.location.href = "index.html";
    return null;
  }
  const me = document.getElementById("me");
  if (me) me.textContent = `Welcome ${user.username} (admin)`;
  return data;
}

async function loadUsers() {
  clearError();
  const tbody = document.getElementById("rows");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="15" class="py-4 text-center text-slate-400">Loading...</td></tr>`;

  let rows = [];
  try {
    const res = await apiFetch("/admin/users", { method: "GET" });
    const data = await res.json().catch(() => ([]));
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    if (Array.isArray(data)) {
      rows = data;
    } else if (Array.isArray(data?.items)) {
      rows = data.items;
    } else {
      rows = [];
    }
  } catch (err) {
    console.error(err);
    setError(err?.message || "Unable to load users.");
    tbody.innerHTML = `<tr><td colspan="15" class="py-4 text-center text-red-500">Unable to load users</td></tr>`;
    return;
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="15" class="py-4 text-center text-slate-400">No users found</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((u) => {
      const id = num(u.id);
      const role = String(u.role || "basic").toLowerCase();
      const active = num(u.is_active ?? 1) ? "checked" : "";

      const totalLimitStored = num(u.monthly_token_limit || 0);
      const totalUsed = num(u.monthly_tokens_used || 0);

      const gLimit = num(u.monthly_gemini_token_limit || 0);
      const gUsed = num(u.monthly_gemini_tokens_used || 0);

      const oLimit = num(u.monthly_openai_token_limit || 0);
      const oUsed = num(u.monthly_openai_tokens_used || 0);

      const grLimit = num(u.monthly_grok_token_limit || 0);
      const grUsed = num(u.monthly_grok_tokens_used || 0);

      const cLimit = num(u.monthly_claude_token_limit || 0);
      const cUsed = num(u.monthly_claude_tokens_used || 0);

      // If the stored total limit is 0 but provider limits are set, display the computed sum.
      const totalLimit = totalLimitStored > 0 ? totalLimitStored : ((gLimit + oLimit + grLimit + cLimit) > 0 ? (gLimit + oLimit + grLimit + cLimit) : 0);

      return `
        <tr data-id="${id}" data-role="${escapeHtml(role)}" class="align-top even:bg-slate-50/70 dark:even:bg-slate-900/50 hover:bg-slate-50/90 dark:hover:bg-slate-900/60 transition">
          <td class="py-3 px-3 text-slate-500">${id}</td>
          <td class="py-3 px-3 font-semibold text-slate-700 dark:text-slate-100">${escapeHtml(u.username || "")}</td>
          <td class="py-3 px-3">
            <input data-field="is_active" type="checkbox" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/40" ${active} />
          </td>
          <td class="py-3 px-3">
            <input data-field="monthly_token_limit" type="number" min="0" class="w-28 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40" value="${totalLimit}" title="0 = unlimited" />
          </td>
          <td class="py-3 px-3 text-slate-500">${totalUsed}</td>
          <td class="py-3 px-3">
            <input data-field="monthly_gemini_token_limit" type="number" min="0" class="w-28 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40" value="${gLimit}" title="0 = unlimited" />
          </td>
          <td class="py-3 px-3 text-slate-500">${gUsed}</td>
          <td class="py-3 px-3">
            <input data-field="monthly_openai_token_limit" type="number" min="0" class="w-28 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40" value="${oLimit}" title="0 = unlimited" />
          </td>
          <td class="py-3 px-3 text-slate-500">${oUsed}</td>
          <td class="py-3 px-3">
            <input data-field="monthly_grok_token_limit" type="number" min="0" class="w-28 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40" value="${grLimit}" title="0 = unlimited" />
          </td>
          <td class="py-3 px-3 text-slate-500">${grUsed}</td>
          <td class="py-3 px-3">
            <input data-field="monthly_claude_token_limit" type="number" min="0" class="w-28 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40" value="${cLimit}" title="0 = unlimited" />
          </td>
          <td class="py-3 px-3 text-slate-500">${cUsed}</td>
          <td class="py-3 px-3">
            ${renderModelCheckboxes(u.allowed_models)}
          </td>
          <td class="py-3 px-3 sticky right-0 bg-white/95 dark:bg-slate-950/95">
            <div class="flex flex-wrap gap-2">
              <button data-action="save" type="button" class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow shadow-blue-500/20">Save changes</button>
              <button data-action="reset-month" type="button" class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium">Reset month</button>
              <button data-action="reset-daily" type="button" class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium">Reset day</button>
              <button data-action="set-pass" type="button" class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium">Change password</button>
              <button data-action="delete-user" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow shadow-red-500/20">Delete user</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function rowPayload(tr) {
  const role = tr.getAttribute("data-role") || "basic";
  const isActive = tr.querySelector('[data-field="is_active"]')?.checked ? 1 : 0;
  const totalLimit = tr.querySelector('[data-field="monthly_token_limit"]')?.value;
  const gLimit = tr.querySelector('[data-field="monthly_gemini_token_limit"]')?.value;
  const oLimit = tr.querySelector('[data-field="monthly_openai_token_limit"]')?.value;
  const grLimit = tr.querySelector('[data-field="monthly_grok_token_limit"]')?.value;
  const cLimit = tr.querySelector('[data-field="monthly_claude_token_limit"]')?.value;
  const allowedModels = Array.from(tr.querySelectorAll('[data-field="allowed_models"] input[type="checkbox"]:checked')).map((o) => o.value);

  const payload = {
    role: String(role || "basic").toLowerCase(),
    is_active: isActive,
    monthly_token_limit: num(totalLimit || 0),
    monthly_gemini_token_limit: num(gLimit || 0),
    monthly_openai_token_limit: num(oLimit || 0),
    monthly_grok_token_limit: num(grLimit || 0),
    monthly_claude_token_limit: num(cLimit || 0),
    allowed_models: allowedModels,
  };

  return payload;
}

async function saveRow(tr) {
  const id = num(tr.getAttribute("data-id") || 0);
  if (!id) return;
  const payload = rowPayload(tr);
  const res = await apiFetch(`/admin/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);
}

async function resetMonth(id) {
  const res = await apiFetch(`/admin/users/${id}/reset_month`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);
}

async function resetDaily(id) {
  const res = await apiFetch(`/admin/users/${id}/reset_daily`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);
}

async function setPassword(id) {
  const pw = prompt("Enter the new password:");
  if (!pw) return;
  const res = await apiFetch(`/admin/users/${id}/set_password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: pw }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);
}

async function deleteUser(id, username) {
  const label = username ? ` (${username})` : "";
  const ok = confirm(`Delete user${label}? This cannot be undone.`);
  if (!ok) return;
  const res = await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);
}

async function createUser() {
  clearError();
  const username = String(document.getElementById("c-username")?.value || "").trim();
  const password = String(document.getElementById("c-password")?.value || "").trim();

  const gLimit = num(document.getElementById("c-monthly-gemini")?.value || 0);
  const oLimit = num(document.getElementById("c-monthly-gpt")?.value || 0);
  const grLimit = num(document.getElementById("c-monthly-grok")?.value || 0);
  const cLimit = num(document.getElementById("c-monthly-claude")?.value || 0);
  const allowedModels = Array.from(document.querySelectorAll("#c-models input[type='checkbox']:checked")).map((o) => o.value);

  if (!username || !password) {
    setError("Username and password are required.");
    return;
  }

  const payload = {
    username,
    password,
    role: "basic",
    monthly_gemini_token_limit: gLimit,
    monthly_openai_token_limit: oLimit,
    monthly_grok_token_limit: grLimit,
    monthly_claude_token_limit: cLimit,
    // total limit can be computed server-side from provider limits if not explicitly set
    monthly_token_limit: 0,
    allowed_models: allowedModels,
  };

  const res = await apiFetch("/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);

  // reset form
  document.getElementById("c-username").value = "";
  document.getElementById("c-password").value = "";
  document.getElementById("c-monthly-gemini").value = "";
  document.getElementById("c-monthly-gpt").value = "";
  document.getElementById("c-monthly-grok").value = "";
  document.getElementById("c-monthly-claude").value = "";
  document.querySelectorAll("#c-models input[type='checkbox']").forEach((input) => {
    input.checked = false;
  });

  await loadUsers();
}

document.addEventListener("DOMContentLoaded", async () => {
  const tok = getAuthToken();
  if (!tok) {
    window.location.href = "login.html";
    return;
  }

  document.getElementById("logout")?.addEventListener("click", logout);
  document.getElementById("reload")?.addEventListener("click", async () => {
    await loadModelOptions();
    await loadUsers();
  });
  document.getElementById("create-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await createUser();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to create the user.");
    }
  });

  try {
    const me = await loadMe();
    if (!me) return;
    await loadModelOptions();
    await loadUsers();
  } catch (err) {
    console.error(err);
    setError(err?.message || "Unable to load the admin panel.");
  }

  document.getElementById("rows")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const tr = btn.closest("tr[data-id]");
    const id = num(tr?.getAttribute("data-id") || 0);
    const username = tr?.querySelector("td:nth-child(2)")?.textContent?.trim() || "";
    const action = btn.getAttribute("data-action") || "";

    try {
      btn.disabled = true;
      clearError();

      if (action === "save") {
        await saveRow(tr);
      } else if (action === "reset-month") {
        await resetMonth(id);
      } else if (action === "reset-daily") {
        await resetDaily(id);
      } else if (action === "set-pass") {
        await setPassword(id);
      } else if (action === "delete-user") {
        await deleteUser(id, username);
      }

      await loadUsers();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Action failed.");
    } finally {
      btn.disabled = false;
    }
  });
});
