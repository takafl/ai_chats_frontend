class ThemeToggle extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <style>
        :host {
          position: fixed !important;
          z-index: 99999 !important;
          right: 14px !important;
          bottom: 14px !important;
          left: auto !important;
          top: auto !important;
          display: block !important;
          pointer-events: auto !important;
        }
        @media (max-width: 767px) {
          :host { bottom: 80px !important; }
        }
        .toggle-btn {
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background: rgba(255,255,255,0.9);
          border: 1px solid rgba(0,0,0,0.08);
          color: #475569;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        html.dark .toggle-btn {
          background: rgba(17, 26, 46, 0.9);
          border: 1px solid rgba(148,163,184,0.15);
          color: #e2e8f0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .toggle-btn:hover {
          transform: scale(1.08);
          box-shadow: 0 4px 16px rgba(99,102,241,0.2);
        }
        .toggle-btn:active { transform: scale(0.95); }
        #icon-sun { display: none; }
      </style>
      <button class="toggle-btn" id="theme-toggle" type="button" aria-label="Toggle light/dark mode">
        <span id="icon-moon"><i data-lucide="moon" class="w-4 h-4"></i></span>
        <span id="icon-sun"><i data-lucide="sun" class="w-4 h-4"></i></span>
      </button>
    `;

    const btn = this.querySelector("#theme-toggle");
    const moon = this.querySelector("#icon-moon");
    const sun = this.querySelector("#icon-sun");

    const apply = (isDark) => {
      document.documentElement.classList.toggle("dark", !!isDark);
      moon.style.display = isDark ? "none" : "inline-flex";
      sun.style.display = isDark ? "inline-flex" : "none";
      localStorage.setItem("theme", isDark ? "dark" : "light");
    };

    const saved = localStorage.getItem("theme");
    apply(saved ? saved === "dark" : true);
    window.lucide?.createIcons?.();

    btn?.addEventListener("click", () => {
      apply(!document.documentElement.classList.contains("dark"));
      window.lucide?.createIcons?.();
    });
  }
}

customElements.define("theme-toggle", ThemeToggle);
