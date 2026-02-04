// ============================================================
// Configuration
// ============================================================
const DEV_SERVER_PORT = "5000";
try {
  const { protocol, port, hostname, pathname, search, hash } = window.location || {};
  if (protocol === "https:" && port === DEV_SERVER_PORT) {
    window.location.replace(`http://${hostname}:${DEV_SERVER_PORT}${pathname}${search}${hash}`);
  }
} catch {}

const AUTH_TOKEN_KEY = "auth_token";
const CHATS_KEY = "chat_history";
const PROJECTS_KEY = "projects";

// ============================================================
// API Helpers
// ============================================================
function apiUrl(path) {
  const p = String(path || "");
  return `/api${p.startsWith("/") ? "" : "/"}${p}`;
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function authHeaders(extra) {
  const h = { ...(extra || {}) };
  const tok = getAuthToken();
  if (tok) h["Authorization"] = `Bearer ${tok}`;
  return h;
}

async function apiFetch(path, options) {
  const res = await fetch(apiUrl(path), {
    ...(options || {}),
    headers: authHeaders((options || {}).headers),
  });
  if (res.status === 401) {
    logout();
    throw new Error("Unauthorized");
  }
  return res;
}

// ============================================================
// Utilities
// ============================================================
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.location.href = "login.html";
}

function formatNumber(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

// ============================================================
// State
// ============================================================
let currentChatId = null;
let currentProjectId = null;
let isStreaming = false;
let abortController = null;
let selectedFiles = [];
let selectedQuote = null;
let models = [];
let projects = [];
let chats = [];

// ============================================================
// DOM Ready
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  try { localStorage.removeItem("api_base_url"); } catch {}

  if (!getAuthToken()) {
    window.location.href = "login.html";
    return;
  }

  setAppVh();
  window.addEventListener("resize", setAppVh);

  initSidebar();
  initComposer();
  initProjects();
  initModals();

  try {
    await loadMe();
    await loadModels();
    loadChatsFromStorage();
    loadProjectsFromStorage();
    renderChatList();
    renderProjectList();
  } catch (err) {
    console.error("Init error:", err);
  }

  window.lucide?.createIcons?.();
});

function setAppVh() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--app-vh", `${vh}px`);
}

// ============================================================
// Sidebar
// ============================================================
function initSidebar() {
  document.getElementById("sidebar-open")?.addEventListener("click", openSidebar);
  document.getElementById("sidebar-close")?.addEventListener("click", closeSidebar);
  document.getElementById("sidebar-overlay")?.addEventListener("click", closeSidebar);
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  document.getElementById("clear-history")?.addEventListener("click", clearHistory);
  document.getElementById("global-chat-item")?.addEventListener("click", () => {
    currentProjectId = null;
    document.getElementById("current-project-name").textContent = "No project selected";
    newChat();
  });
}

function openSidebar() {
  document.getElementById("sidebar")?.classList.add("active");
  const overlay = document.getElementById("sidebar-overlay");
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.classList.add("active");
  }
}

function closeSidebar() {
  document.getElementById("sidebar")?.classList.remove("active");
  const overlay = document.getElementById("sidebar-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    setTimeout(() => overlay.classList.add("hidden"), 200);
  }
}

// ============================================================
// Composer
// ============================================================
function initComposer() {
  const fileInput = document.getElementById("file-in");
  const clearFilesBtn = document.getElementById("clear-files");
  const quoteClear = document.getElementById("quote-clear");
  const userIn = document.getElementById("user-in");

  fileInput?.addEventListener("change", handleFileSelect);
  clearFilesBtn?.addEventListener("click", clearFiles);
  quoteClear?.addEventListener("click", clearQuote);

  // Handle Enter key
  userIn?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const maxSize = 10 * 1024 * 1024; // 10MB
  const invalidFiles = files.filter(f => f.size > maxSize);
  if (invalidFiles.length) {
    if (window.toast) {
      window.toast.error(`File "${invalidFiles[0].name}" exceeds maximum size of 10MB.`, 5000);
    } else {
      alert("File too large. Maximum size is 10MB.");
    }
    return;
  }

  selectedFiles = [...selectedFiles, ...files];
  renderFileChips();
  e.target.value = "";

  if (window.toast && files.length > 0) {
    window.toast.success(`${files.length} file(s) attached successfully.`, 3000);
  }
}

function renderFileChips() {
  const preview = document.getElementById("file-preview");
  const chips = document.getElementById("file-chips");

  if (!selectedFiles.length) {
    preview?.classList.add("hidden");
    return;
  }

  preview?.classList.remove("hidden");
  if (chips) {
    chips.innerHTML = selectedFiles.map((f, i) => `
      <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs" style="background:var(--surface-3);color:var(--text-2)">
        <i data-lucide="file" class="w-3 h-3"></i>
        <span class="truncate max-w-[100px]">${escapeHtml(f.name)}</span>
        <button type="button" onclick="removeFile(${i})" class="hover:text-red-500">
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
      </div>
    `).join("");
    window.lucide?.createIcons?.();
  }
}

window.removeFile = function(index) {
  selectedFiles.splice(index, 1);
  renderFileChips();
};

function clearFiles() {
  selectedFiles = [];
  renderFileChips();
}

function clearQuote() {
  selectedQuote = null;
  document.getElementById("quote-preview")?.classList.add("hidden");
}

// ============================================================
// Send Message
// ============================================================
function validateMessage(text) {
  const trimmed = text.trim();
  if (!trimmed && !selectedFiles.length) {
    return "Please enter a message or attach a file.";
  }
  if (trimmed.length > 50000) {
    return "Message is too long (max 50,000 characters).";
  }
  return null;
}

async function send() {
  if (isStreaming) {
    stopStreaming();
    return;
  }

  const userIn = document.getElementById("user-in");
  const text = userIn?.value || "";
  const error = validateMessage(text);

  if (error) {
    if (window.toast) {
      window.toast.warning(error, 4000);
    } else {
      alert(error);
    }
    userIn?.focus();
    return;
  }

  const modelSelect = document.getElementById("model-select");
  const model = modelSelect?.value;
  if (!model) {
    if (window.toast) {
      window.toast.warning("Please select a model first.", 4000);
    } else {
      alert("Please select a model first.");
    }
    modelSelect?.focus();
    return;
  }

  const userMessage = text.trim();
  if (userIn) {
    userIn.value = "";
    userIn.style.height = "";
  }

  const emptyState = document.getElementById("empty-state");
  if (emptyState) emptyState.style.display = "none";

  appendMessage("user", userMessage);

  isStreaming = true;
  updateSendButton();
  abortController = new AbortController();

  try {
    const botMsgId = "bot-" + Date.now();
    appendMessage("bot", "", botMsgId);

    const thinkingLevel = document.getElementById("thinking-level");
    const thinking = Number(thinkingLevel?.value) || 0;

    const body = {
      message: userMessage,
      model,
      thinking_level: thinking,
      chat_id: currentChatId,
      project_id: currentProjectId,
    };

    if (selectedQuote) {
      body.quote = selectedQuote;
    }

    clearFiles();
    clearQuote();

    const res = await fetch(apiUrl("/chat"), {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          if (json.content) {
            fullResponse += json.content;
            updateBotMessage(botMsgId, fullResponse);
          }
          if (json.chat_id && !currentChatId) {
            currentChatId = json.chat_id;
          }
        } catch {}
      }
    }

    saveCurrentChat(userMessage, fullResponse);

  } catch (err) {
    if (err.name === "AbortError") {
      console.log("Request aborted");
      if (window.toast) {
        window.toast.info("Message sending was stopped.", 3000);
      }
    } else {
      console.error("Send error:", err);
      const errorMessage = err.message || "Failed to send message.";
      if (window.toast) {
        window.toast.error(errorMessage, 5000);
      } else {
        alert(errorMessage);
      }
    }
  } finally {
    isStreaming = false;
    abortController = null;
    updateSendButton();
    loadMe();
  }
}

function stopStreaming() {
  abortController?.abort();
  isStreaming = false;
  updateSendButton();
}

function updateSendButton() {
  const sendBtn = document.getElementById("send-btn");
  const icon = sendBtn?.querySelector("i");

  if (isStreaming) {
    sendBtn?.classList.add("stop-btn");
    icon?.setAttribute("data-lucide", "square");
  } else {
    sendBtn?.classList.remove("stop-btn");
    icon?.setAttribute("data-lucide", "arrow-up");
  }
  window.lucide?.createIcons?.();
}

// ============================================================
// Messages UI
// ============================================================
function appendMessage(role, content, id) {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return;

  const row = document.createElement("div");
  row.className = "msg-row";
  if (id) row.id = id;

  const avatarClass = role === "user" ? "msg-avatar-user" : "msg-avatar-bot";
  const bubbleClass = role === "user" ? "msg-user" : "msg-bot";
  const icon = role === "user" ? "user" : "bot";

  row.innerHTML = `
    <div class="msg-avatar ${avatarClass}">
      <i data-lucide="${icon}" class="w-4 h-4"></i>
    </div>
    <div class="msg-bubble ${bubbleClass}">
      <div class="prose">${content ? renderMarkdown(content) : '<span class="thinking-pulse">Thinking...</span>'}</div>
    </div>
  `;

  chatBox.appendChild(row);
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
  window.lucide?.createIcons?.();
  highlightCode();
}

function updateBotMessage(id, content) {
  const row = document.getElementById(id);
  if (!row) return;

  const prose = row.querySelector(".prose");
  if (prose) {
    prose.innerHTML = renderMarkdown(content);
    highlightCode();
  }
  document.getElementById("chat-box")?.scrollTo({ top: document.getElementById("chat-box").scrollHeight, behavior: "smooth" });
}

function renderMarkdown(text) {
  if (!text) return "";
  try {
    return marked.parse(text, { breaks: true, gfm: true });
  } catch {
    return escapeHtml(text);
  }
}

function highlightCode() {
  document.querySelectorAll("pre code").forEach((block) => {
    if (!block.classList.contains("language-")) {
      block.classList.add("language-plaintext");
    }
    if (window.Prism) Prism.highlightElement(block);

    const pre = block.parentElement;
    if (pre && !pre.querySelector(".copy-btn")) {
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.textContent = "Copy";
      btn.onclick = () => {
        navigator.clipboard.writeText(block.textContent || "");
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 2000);
      };
      pre.appendChild(btn);
    }
  });
}

// ============================================================
// Chat Management
// ============================================================
function newChat() {
  currentChatId = null;
  const chatBox = document.getElementById("chat-box");
  const emptyState = document.getElementById("empty-state");

  if (chatBox) chatBox.innerHTML = "";
  if (emptyState) {
    emptyState.style.display = "flex";
    chatBox?.appendChild(emptyState);
  }

  document.getElementById("current-chat-title").textContent = "New conversation";
  closeSidebar();
  renderChatList();
}

function loadChatsFromStorage() {
  try {
    chats = JSON.parse(localStorage.getItem(CHATS_KEY) || "[]");
  } catch {
    chats = [];
  }
}

function saveCurrentChat(userMsg, botMsg) {
  if (!currentChatId) {
    currentChatId = "chat-" + Date.now();
  }

  const existing = chats.find(c => c.id === currentChatId);
  const title = userMsg.slice(0, 50) + (userMsg.length > 50 ? "..." : "");

  if (existing) {
    existing.messages.push({ role: "user", content: userMsg });
    existing.messages.push({ role: "assistant", content: botMsg });
    existing.updatedAt = Date.now();
  } else {
    chats.unshift({
      id: currentChatId,
      title,
      projectId: currentProjectId,
      messages: [
        { role: "user", content: userMsg },
        { role: "assistant", content: botMsg },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  document.getElementById("current-chat-title").textContent = title;
  renderChatList();
}

function loadChat(chatId) {
  const chat = chats.find(c => c.id === chatId);
  if (!chat) return;

  currentChatId = chatId;
  currentProjectId = chat.projectId;

  const chatBox = document.getElementById("chat-box");
  const emptyState = document.getElementById("empty-state");

  if (chatBox) chatBox.innerHTML = "";
  if (emptyState) emptyState.style.display = "none";

  chat.messages.forEach(msg => {
    appendMessage(msg.role === "user" ? "user" : "bot", msg.content);
  });

  document.getElementById("current-chat-title").textContent = chat.title;
  closeSidebar();
}

function deleteChat(chatId) {
  chats = chats.filter(c => c.id !== chatId);
  localStorage.setItem(CHATS_KEY, JSON.stringify(chats));

  if (currentChatId === chatId) {
    newChat();
  }
  renderChatList();
}

function clearHistory() {
  if (!confirm("Delete all chat history? This cannot be undone.")) return;
  chats = [];
  localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  newChat();
}

function renderChatList() {
  const chatList = document.getElementById("chat-list");
  if (!chatList) return;

  const filteredChats = currentProjectId
    ? chats.filter(c => c.projectId === currentProjectId)
    : chats.filter(c => !c.projectId);

  if (!filteredChats.length) {
    chatList.innerHTML = '<div class="text-center text-xs py-4" style="color:var(--text-3)">No conversations yet</div>';
    return;
  }

  chatList.innerHTML = filteredChats.map(chat => `
    <div class="p-2.5 rounded-xl cursor-pointer text-sm hover:bg-primary-500/8 border border-transparent hover:border-primary-500/15 flex items-center gap-2.5 transition-all duration-200 ${chat.id === currentChatId ? 'bg-primary-500/10 border-primary-500/20' : ''}" 
         style="color:var(--text-2)" data-chat-id="${chat.id}">
      <i data-lucide="message-square" class="w-4 h-4 shrink-0" style="color:var(--text-3)"></i>
      <span class="truncate flex-1">${escapeHtml(chat.title)}</span>
      <button class="p-1 rounded hover:bg-red-500/10 delete-chat shrink-0" data-id="${chat.id}" style="color:var(--text-3)">
        <i data-lucide="trash-2" class="w-3 h-3"></i>
      </button>
    </div>
  `).join("");

  chatList.querySelectorAll("[data-chat-id]").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".delete-chat")) {
        deleteChat(item.dataset.chatId);
      } else {
        loadChat(item.dataset.chatId);
      }
    });
  });

  window.lucide?.createIcons?.();
}

// ============================================================
// Projects
// ============================================================
function initProjects() {
  document.getElementById("new-project-btn")?.addEventListener("click", showProjectForm);
  document.getElementById("project-cancel-btn")?.addEventListener("click", hideProjectForm);
  document.getElementById("project-save-btn")?.addEventListener("click", createProject);
  document.getElementById("project-settings-btn")?.addEventListener("click", () => {
    if (currentProjectId) openProjectSettings(currentProjectId);
  });
}

function showProjectForm() {
  document.getElementById("project-form")?.classList.remove("hidden");
  document.getElementById("project-name-input")?.focus();
}

function hideProjectForm() {
  document.getElementById("project-form")?.classList.add("hidden");
  document.getElementById("project-name-input").value = "";
  document.getElementById("project-description-input").value = "";
  document.getElementById("project-instructions-input").value = "";
}

function createProject() {
  const nameEl = document.getElementById("project-name-input");
  const descEl = document.getElementById("project-description-input");
  const instEl = document.getElementById("project-instructions-input");

  const name = nameEl?.value?.trim() || "";
  if (!name) {
    if (window.toast) {
      window.toast.warning("Project name is required.", 4000);
    } else {
      alert("Project name is required.");
    }
    nameEl?.focus();
    return;
  }
  if (name.length < 2) {
    if (window.toast) {
      window.toast.warning("Project name must be at least 2 characters.", 4000);
    } else {
      alert("Project name must be at least 2 characters.");
    }
    nameEl?.focus();
    return;
  }

  const project = {
    id: "proj-" + Date.now(),
    name,
    description: descEl?.value?.trim() || "",
    instructions: instEl?.value?.trim() || "",
    createdAt: Date.now(),
  };

  projects.push(project);
  saveProjects();
  renderProjectList();
  hideProjectForm();

  currentProjectId = project.id;
  document.getElementById("current-project-name").textContent = project.name;

  if (window.toast) {
    window.toast.success(`Project "${project.name}" created successfully.`, 3000);
  }

  newChat();
}

function loadProjectsFromStorage() {
  try {
    projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]");
  } catch {
    projects = [];
  }
}

function saveProjects() {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function renderProjectList() {
  const projectList = document.getElementById("project-list");
  if (!projectList) return;

  if (!projects.length) {
    projectList.innerHTML = "";
    return;
  }

  projectList.innerHTML = projects.map(p => `
    <div class="p-2.5 rounded-xl cursor-pointer text-sm hover:bg-primary-500/8 border border-transparent hover:border-primary-500/15 flex items-center gap-2.5 transition-all duration-200 ${p.id === currentProjectId ? 'bg-primary-500/10 border-primary-500/20' : ''}"
         style="color:var(--text-2)" data-project-id="${p.id}">
      <i data-lucide="folder" class="w-4 h-4 shrink-0" style="color:var(--text-3)"></i>
      <span class="truncate flex-1">${escapeHtml(p.name)}</span>
      <button class="p-1 rounded hover:bg-primary-500/10 edit-project shrink-0" data-id="${p.id}" style="color:var(--text-3)">
        <i data-lucide="settings" class="w-3 h-3"></i>
      </button>
    </div>
  `).join("");

  projectList.querySelectorAll("[data-project-id]").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".edit-project")) {
        openProjectSettings(item.dataset.projectId);
      } else {
        selectProject(item.dataset.projectId);
      }
    });
  });

  window.lucide?.createIcons?.();
}

function selectProject(projectId) {
  currentProjectId = projectId;
  const project = projects.find(p => p.id === projectId);

  document.getElementById("current-project-name").textContent = project?.name || "No project selected";
  document.getElementById("global-chat-item")?.classList.remove("bg-primary-500/10", "border-primary-500/20");

  renderProjectList();
  renderChatList();
  newChat();
}

// ============================================================
// Project Settings Modal
// ============================================================
let editingProjectId = null;

function initModals() {
  document.getElementById("project-settings-close")?.addEventListener("click", closeProjectSettings);
  document.getElementById("project-settings-cancel")?.addEventListener("click", closeProjectSettings);
  document.getElementById("project-settings-save")?.addEventListener("click", saveProjectSettings);
  document.getElementById("project-settings-delete")?.addEventListener("click", deleteProject);
}

function openProjectSettings(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  editingProjectId = projectId;

  document.getElementById("project-settings-name").value = project.name;
  document.getElementById("project-settings-description").value = project.description || "";
  document.getElementById("project-settings-instructions").value = project.instructions || "";

  const modal = document.getElementById("project-settings-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.style.display = "flex";
  }
}

function closeProjectSettings() {
  const modal = document.getElementById("project-settings-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }
  editingProjectId = null;
}

function saveProjectSettings() {
  const nameEl = document.getElementById("project-settings-name");
  const name = nameEl?.value?.trim() || "";

  if (!name) {
    if (window.toast) {
      window.toast.warning("Project name is required.", 4000);
    } else {
      alert("Project name is required.");
    }
    nameEl?.focus();
    return;
  }
  if (name.length < 2) {
    if (window.toast) {
      window.toast.warning("Project name must be at least 2 characters.", 4000);
    } else {
      alert("Project name must be at least 2 characters.");
    }
    nameEl?.focus();
    return;
  }

  const project = projects.find(p => p.id === editingProjectId);
  if (project) {
    project.name = name;
    project.description = document.getElementById("project-settings-description")?.value?.trim() || "";
    project.instructions = document.getElementById("project-settings-instructions")?.value?.trim() || "";
    saveProjects();
    renderProjectList();

    if (currentProjectId === editingProjectId) {
      document.getElementById("current-project-name").textContent = name;
    }

    if (window.toast) {
      window.toast.success("Project settings updated successfully.", 3000);
    }
  }

  closeProjectSettings();
}

function deleteProject() {
  if (!confirm("Delete this project? Associated chats will remain.")) return;

  const project = projects.find(p => p.id === editingProjectId);
  const projectName = project?.name || "Project";

  projects = projects.filter(p => p.id !== editingProjectId);
  saveProjects();

  if (currentProjectId === editingProjectId) {
    currentProjectId = null;
    document.getElementById("current-project-name").textContent = "No project selected";
  }

  if (window.toast) {
    window.toast.success(`"${projectName}" deleted successfully.`, 3000);
  }

  renderProjectList();
  closeProjectSettings();
}

// ============================================================
// API Calls
// ============================================================
async function loadMe() {
  try {
    const res = await apiFetch("/me");
    const data = await res.json();
    const user = data?.user || {};

    document.getElementById("user-badge").textContent = user.username || "User";

    if (user.role === "admin") {
      document.getElementById("admin-link")?.classList.remove("hidden");
    }

    const limit = user.monthly_token_limit || 0;
    const used = user.tokens_used_this_month || 0;
    const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

    const quotaFill = document.getElementById("quota-fill");
    if (quotaFill) {
      quotaFill.style.width = `${percent}%`;
      quotaFill.style.background = percent > 90
        ? "var(--error, #e53e3e)"
        : percent > 70
          ? "var(--warning, #ed8936)"
          : "linear-gradient(90deg, var(--primary, #5c7c6f), var(--primary-light, #7a9a8d))";
    }

    const quotaText = document.getElementById("quota-text");
    if (quotaText) {
      quotaText.textContent = limit > 0
        ? `${formatNumber(used)} / ${formatNumber(limit)} tokens used`
        : `${formatNumber(used)} tokens used`;
    }
  } catch (err) {
    console.error("loadMe error:", err);
  }
}

async function loadModels() {
  const modelSelect = document.getElementById("model-select");

  try {
    const res = await apiFetch("/models");
    const data = await res.json();

    models = Array.isArray(data) ? data : (data?.models || data?.items || []);

    if (modelSelect) {
      modelSelect.innerHTML = models.map(m => {
        const key = typeof m === "string" ? m : (m.key || m.id || m.name);
        const label = typeof m === "string" ? m : (m.label || m.name || key);
        return `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`;
      }).join("");

      if (!models.length) {
        modelSelect.innerHTML = '<option value="">No models available</option>';
      }
    }
  } catch (err) {
    console.error("loadModels error:", err);
    if (modelSelect) {
      modelSelect.innerHTML = '<option value="">Error loading models</option>';
    }
  }
}

// Make functions available globally for onclick handlers
window.newChat = newChat;
window.send = send;
