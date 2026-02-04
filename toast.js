/**
 * Professional Toast Notification System
 * Provides elegant, non-intrusive notifications for user feedback
 * Features: Auto-dismiss, stacking, animations, accessibility
 */

class ToastManager {
  constructor() {
    this.container = null;
    this.activeToasts = new Set();
    this.maxToasts = 5;
    this.defaultDuration = 4000;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    // Create toast container if it doesn't exist
    if (!this.container && document.body) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'toast-container';
      this.container.setAttribute('role', 'alert');
      this.container.setAttribute('aria-live', 'polite');
      this.container.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(this.container);
    }
  }

  ensureContainer() {
    if (!this.container || !this.container.parentNode) {
      this.container = null;
      this.init();
    }
    return this.container;
  }

  show(message, type = 'info', duration = null) {
    const container = this.ensureContainer();
    if (!container) {
      console.warn('Toast container not available');
      return null;
    }

    // Limit max toasts
    if (this.activeToasts.size >= this.maxToasts) {
      const oldest = this.activeToasts.values().next().value;
      if (oldest) this.dismiss(oldest);
    }

    const toast = this.createToast(message, type);
    container.appendChild(toast);
    this.activeToasts.add(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add('show');
      });
    });

    // Auto-dismiss
    const dismissTime = duration !== null ? duration : this.defaultDuration;
    if (dismissTime > 0) {
      toast._timeout = setTimeout(() => this.dismiss(toast), dismissTime);
    }

    return toast;
  }

  createToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-atomic', 'true');

    const icon = this.getIcon(type);
    const typeLabel = this.getTypeLabel(type);

    toast.innerHTML = `
      <div class="toast-icon" aria-hidden="true">${icon}</div>
      <div class="toast-content">
        <span class="toast-type-label">${typeLabel}</span>
        <div class="toast-message">${this.escapeHtml(message)}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss notification" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <div class="toast-progress">
        <div class="toast-progress-bar toast-progress-${type}"></div>
      </div>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.dismiss(toast));

    // Pause timer on hover
    toast.addEventListener('mouseenter', () => {
      if (toast._timeout) {
        clearTimeout(toast._timeout);
        toast._timeout = null;
      }
      const progressBar = toast.querySelector('.toast-progress-bar');
      if (progressBar) progressBar.style.animationPlayState = 'paused';
    });

    toast.addEventListener('mouseleave', () => {
      const progressBar = toast.querySelector('.toast-progress-bar');
      if (progressBar) progressBar.style.animationPlayState = 'running';
      toast._timeout = setTimeout(() => this.dismiss(toast), 2000);
    });

    return toast;
  }

  getIcon(type) {
    const icons = {
      success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9 12l2 2 4-4"></path></svg>`,
      error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
      warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
      info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };
    return icons[type] || icons.info;
  }

  getTypeLabel(type) {
    const labels = {
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: 'Info'
    };
    return labels[type] || 'Info';
  }

  dismiss(toast) {
    if (!toast || !toast.parentNode) return;

    if (toast._timeout) {
      clearTimeout(toast._timeout);
      toast._timeout = null;
    }

    toast.classList.remove('show');
    toast.classList.add('hide');

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.activeToasts.delete(toast);
    }, 300);
  }

  dismissAll() {
    this.activeToasts.forEach(toast => this.dismiss(toast));
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Convenience methods
  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration = 6000) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration = 5000) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }
}

// Create global instance
window.toast = new ToastManager();
