// Keep this to avoid accidental https://host:5000 when testing locally
const DEV_SERVER_PORT = "5000";

try {
  const { protocol, port, hostname, pathname, search, hash } = window.location || {};
  if (protocol === "https:" && port === DEV_SERVER_PORT) {
    window.location.replace(`http://${hostname}:${DEV_SERVER_PORT}${pathname}${search}${hash}`);
  }
} catch {}

const AUTH_TOKEN_KEY = "auth_token";

function apiUrl(path) {
  const p = String(path || "");
  return `/api${p.startsWith("/") ? "" : "/"}${p}`;
}

function setError(msg) {
  const el = document.getElementById("err");
  if (!el) return;
  const m = String(msg || "").trim() || "Unable to sign in.";
  el.textContent = m;
  el.classList.remove("hidden");
}

function clearError() {
  const el = document.getElementById("err");
  if (el) el.classList.add("hidden");
}

function showFieldError(fieldId, msg) {
  const input = document.getElementById(fieldId);
  const error = document.getElementById(`${fieldId}-error`);
  if (input) input.classList.add("is-invalid");
  if (error) {
    error.textContent = msg;
    error.classList.add("show");
  }
}

function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  const error = document.getElementById(`${fieldId}-error`);
  if (input) input.classList.remove("is-invalid");
  if (error) error.classList.remove("show");
}

function validateUsername(value) {
  const v = String(value || "").trim();
  if (!v) return "Username is required";
  if (v.length < 3) return "Username must be at least 3 characters";
  if (v.length > 50) return "Username must not exceed 50 characters";
  if (!/^[a-zA-Z0-9_]+$/.test(v)) return "Only letters, numbers, and underscores allowed";
  return null;
}

function validatePassword(value) {
  const v = String(value || "");
  if (!v) return "Password is required";
  if (v.length < 4) return "Password must be at least 4 characters";
  return null;
}

function redirectToApp() {
  window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    localStorage.removeItem("api_base_url");
  } catch {}

  const tok = localStorage.getItem(AUTH_TOKEN_KEY);
  if (tok) {
    redirectToApp();
    return;
  }

  const form = document.getElementById("login-form");
  const btn = document.getElementById("submit");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");

  // Clear errors on input
  usernameInput?.addEventListener("input", () => {
    clearFieldError("username");
    clearError();
  });
  passwordInput?.addEventListener("input", () => {
    clearFieldError("password");
    clearError();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    clearFieldError("username");
    clearFieldError("password");

    const username = String(usernameInput?.value || "").trim();
    const password = String(passwordInput?.value || "");

    // Client-side validation
    let hasErrors = false;
    
    const usernameErr = validateUsername(username);
    if (usernameErr) {
      showFieldError("username", usernameErr);
      hasErrors = true;
    }

    const passwordErr = validatePassword(password);
    if (passwordErr) {
      showFieldError("password", passwordErr);
      hasErrors = true;
    }

    if (hasErrors) return;

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Signing in...";
      }

      const res = await fetch(apiUrl("/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const token = String(data?.token || "");
      if (!token) throw new Error("No authentication token received.");

      localStorage.setItem(AUTH_TOKEN_KEY, token);
      redirectToApp();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to sign in. Make sure the server is running.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Sign in";
      }
    }
  });
});
