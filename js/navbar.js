(() => {
  const historyStateKey = 'jsecModalBackGuard';
  let hasModalHistoryEntry = false;

  function getActiveModal() {
    const swal = window.Swal || window.Sweetalert2;
    if (swal?.isVisible?.()) {
      return { close: () => swal.close() };
    }

    const dialog = document.querySelector('dialog[open]');
    if (dialog) return { close: () => dialog.close() };

    const overlay = document.querySelector(
      '.modal-overlay.active, #notificationOverlay.active, .resort-notice-modal.active, .payroll-modal.active'
    );
    if (overlay) {
      return {
        close: () => overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      };
    }

    return null;
  }

  function syncModalHistory() {
    const modalIsOpen = Boolean(getActiveModal());
    if (modalIsOpen && !hasModalHistoryEntry) {
      const currentState = window.history.state;
      const state = currentState && typeof currentState === 'object' ? currentState : {};
      window.history.pushState({ ...state, [historyStateKey]: true }, '', window.location.href);
      hasModalHistoryEntry = true;
    } else if (!modalIsOpen && hasModalHistoryEntry) {
      hasModalHistoryEntry = false;
      window.history.back();
    }
  }

  window.addEventListener('popstate', () => {
    if (!hasModalHistoryEntry && window.history.state?.[historyStateKey] !== true) return;

    hasModalHistoryEntry = false;
    getActiveModal()?.close();
  });

  const modalObserver = new MutationObserver(syncModalHistory);
  modalObserver.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['class', 'open']
  });
  syncModalHistory();
})();

document.addEventListener('DOMContentLoaded', async () => {
  const preferences = window.userPreferences;
  if (preferences) await preferences.load();

  const navContainer = document.getElementById('navbar');
  if (!navContainer) return;

  // Determine the current page for navigation highlighting.
  const currentPath = window.location.pathname;

  // Inject shared navigation styles.
  const navStyle = document.createElement('style');
  navStyle.textContent = `
    .nav-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 100;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .nav-title {
      font-size: 18px;
      font-weight: 700;
      color: #f8fafc;
    }
    .nav-brand-link {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      color: inherit;
      text-decoration: none;
    }
    .nav-brand-logo {
      display: block;
      width: 36px;
      height: 36px;
      object-fit: contain;
      flex: 0 0 auto;
    }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .notification-btn {
      position: relative;
      width: 40px;
      height: 40px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.06);
      color: #f8fafc;
      font-size: 20px;
      cursor: pointer;
    }
    .notification-badge {
      position: absolute;
      top: -5px;
      right: -6px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 10px;
      background: #ef4444;
      color: #fff;
      font-size: 11px;
      line-height: 18px;
      font-weight: 700;
    }
    .hamburger-btn {
      background: none;
      border: none;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 6px;
    }
    .hamburger-btn span {
      width: 22px;
      height: 2px;
      background-color: #f8fafc;
      border-radius: 2px;
      transition: all 0.3s ease;
    }
    .drawer-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 200;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    .drawer-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }
    .drawer-menu {
      position: fixed;
      top: 0;
      right: -280px;
      width: 280px;
      height: 100vh;
      height: 100dvh;
      background: #1e293b;
      z-index: 201;
      padding: 0 20px 20px;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 20px;
      overflow-y: auto;
      overscroll-behavior: contain;
      transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      border-left: 1px solid rgba(255, 255, 255, 0.1);
      box-sizing: border-box;
    }
    .drawer-menu.active { right: 0; }
    .drawer-header {
      position: sticky;
      top: 0;
      z-index: 10;
      flex: 0 0 auto;
      margin: 0 -20px;
      padding: max(20px, env(safe-area-inset-top)) 20px 8px;
      background: var(--app-surface, #1e293b);
      box-shadow: 0 8px 12px -10px rgba(0, 0, 0, 0.45);
    }
    .drawer-menu > div:first-child { flex: 0 0 auto; }
    .drawer-menu > .drawer-bottom { flex: 0 0 auto; margin-top: auto; padding-top: 12px; }
    
    .drawer-user-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 4px;
    }
    .drawer-user-name { font-size: 18px; font-weight: 700; color: #f8fafc; }
    .btn-settings-gear {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 8px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      text-decoration: none;
      font-size: 16px;
      transition: background 0.2s;
    }
    .btn-settings-gear:hover {
      background: rgba(56, 189, 248, 0.2);
    }
    .drawer-close-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      min-width: 40px;
      height: 40px;
      flex: 0 0 auto;
      padding: 0 10px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.06);
      color: #f8fafc;
      cursor: pointer;
    }
    .drawer-close-icon { font-size: 24px; line-height: 1; }
    .drawer-close-label { font-size: 14px; font-weight: 650; }
    .drawer-user-role { font-size: 12px; color: #38bdf8; font-weight: 600; }
    
    .drawer-links { display: grid; gap: 17px; padding: 8px 0 4px; }
    .drawer-group { display: grid; gap: 7px; }
    .drawer-group-title {
      margin: 0;
      padding: 0 2px;
      color: #849588;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.1em;
    }
    .drawer-group-items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .drawer-item-shell { position: relative; min-width: 0; }
    .drawer-item-shell > .drawer-item { width: 100%; min-height: 78px; padding-right: 34px; }
    .drawer-item-shell > .drawer-item-favorite { position: absolute; top: 50%; right: 6px; z-index: 2; display: grid; width: 30px; height: 30px; padding: 0; place-items: center; border: 1px solid transparent; border-radius: 7px; background: rgba(11, 18, 32, 0.45); color: #aabbd0; font-size: 17px; line-height: 1; cursor: pointer; transform: translateY(-50%); }
    .drawer-favorite-row > .drawer-item-favorite { position: static; display: grid; width: 32px; height: 32px; padding: 0; place-items: center; border: 1px solid rgba(145, 210, 179, 0.16); border-radius: 8px; background: rgba(145, 210, 179, 0.055); color: #f1be5b; font-size: 17px; line-height: 1; cursor: pointer; }
    .drawer-item-favorite[aria-pressed="true"] { color: #f1be5b; }
    .drawer-item-favorite:hover, .drawer-item-favorite:focus-visible { border-color: rgba(241, 190, 91, 0.45); color: #f1be5b; }
    .drawer-item-favorite:focus-visible, .drawer-favorite-link:focus-visible { outline: 2px solid var(--primary, #91d2b3); outline-offset: 2px; }
    .drawer-favorites-list { display: grid; gap: 6px; }
    .drawer-favorite-row { display: grid; grid-template-columns: minmax(0, 1fr) 34px; align-items: center; gap: 5px; }
    .drawer-favorite-link { display: flex; min-width: 0; min-height: 42px; align-items: center; gap: 9px; padding: 6px 9px; border: 1px solid rgba(145, 210, 179, 0.16); border-radius: 9px; background: rgba(145, 210, 179, 0.055); color: #dce8df; font-size: 11px; font-weight: 650; text-decoration: none; }
    .drawer-favorite-link:hover { border-color: rgba(145, 210, 179, 0.4); }
    .drawer-favorite-link .drawer-item-icon { width: 27px; height: 27px; flex: 0 0 auto; }
    .drawer-favorite-label { min-width: 0; overflow-wrap: anywhere; }
    .drawer-favorites-status { min-height: 14px; color: #fca5a5; font-size: 10px; }
    .drawer-favorites-status:empty { display: none; }
    html[data-theme="light"] #navbar .drawer-favorite-link { border-color: var(--app-border); background: #f5f7f4; color: #1b2922; }
    html[data-theme="light"] #navbar .drawer-favorite-link:hover { border-color: rgba(25, 114, 84, 0.38); background: #edf4ef; }
    html[data-theme="light"] #navbar .drawer-item-shell > .drawer-item-favorite { border-color: var(--app-border); background: #fff; color: #66766d; }
    html[data-theme="light"] #navbar .drawer-item-shell > .drawer-item-favorite[aria-pressed="true"],
    html[data-theme="light"] #navbar .drawer-favorite-row > .drawer-item-favorite { border-color: rgba(138, 97, 0, 0.28); background: #fff8e7; color: #805900; }
    .drawer-menu-search { display: grid; gap: 7px; margin: 4px 0 2px; }
    .drawer-menu-search label { color: var(--text-sub, #a4b4aa); font-size: 11px; font-weight: 700; }
    .drawer-menu-search input { width: 100%; min-height: 40px; padding: 0 11px; border: 1px solid var(--app-border, rgba(195, 220, 204, 0.14)); border-radius: 9px; background: var(--input-bg, #141e19); color: var(--text-main, #edf4ef); font: inherit; font-size: 12px; }
    .drawer-menu-search input::placeholder { color: var(--text-sub, #a4b4aa); }
    .drawer-menu-search input:focus { outline: 2px solid color-mix(in srgb, var(--primary, #91d2b3) 38%, transparent); outline-offset: 1px; }
    .drawer-menu-search-recent { display: flex; flex-wrap: wrap; gap: 5px; }
    .drawer-menu-search-recent[hidden] { display: none; }
    .drawer-menu-search-recent-label { width: 100%; color: var(--text-sub, #a4b4aa); font-size: 10px; }
    .drawer-menu-search-recent button { min-height: 25px; padding: 0 7px; border: 1px solid var(--app-border, rgba(195, 220, 204, 0.14)); border-radius: 999px; background: transparent; color: var(--text-sub, #a4b4aa); font-size: 10px; cursor: pointer; }
    .drawer-menu-search-recent button:hover { border-color: var(--primary, #91d2b3); color: var(--primary, #91d2b3); }
    .drawer-menu-search-status { min-height: 13px; color: var(--text-sub, #a4b4aa); font-size: 10px; }
    .drawer-menu-search-status:empty { display: none; }
    html[data-theme="light"] #navbar .drawer-menu-search input { background: #f7f9f6; color: var(--text-main); }
    html[data-theme="light"] #navbar .drawer-menu-search label,
    html[data-theme="light"] #navbar .drawer-menu-search-recent-label { color: var(--text-sub); }
    html[data-theme="light"] #navbar .drawer-menu-search-recent button { background: #f5f8f4; color: #43594b; }
    html[data-theme="light"] #navbar .drawer-menu-search-recent button:hover { color: #155c43; }
    .drawer-item {
      display: flex;
      min-width: 0;
      min-height: 72px;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 8px;
      padding: 10px 11px;
      border: 1px solid rgba(195, 220, 204, 0.1);
      background: rgba(255, 255, 255, 0.025);
      color: #94a3b8;
      text-decoration: none;
      font-size: 12px;
      font-weight: 650;
      line-height: 1.25;
      border-radius: 11px;
      transition: color 150ms ease, background 150ms ease, border-color 150ms ease, transform 150ms ease;
    }
    .drawer-item:hover { border-color: rgba(145, 210, 179, 0.28); background: rgba(145, 210, 179, 0.06); color: #edf4ef; }
    .drawer-item:active { transform: scale(0.98); }
    .drawer-item:focus-visible { outline: 2px solid var(--primary, #91d2b3); outline-offset: 2px; }
    .drawer-item.active {
      border-color: rgba(145, 210, 179, 0.32);
      background: rgba(56, 189, 248, 0.15);
      color: var(--primary, #91d2b3);
    }
    .drawer-item-icon { display: grid; width: 31px; height: 31px; place-items: center; border: 1px solid rgba(145, 210, 179, 0.22); border-radius: 9px; background: rgba(145, 210, 179, 0.11); color: #a6dfbf; }
    .drawer-item-icon svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.7; }
    .drawer-item-label { overflow-wrap: anywhere; }
    .btn-nav-logout {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 14px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
      text-align: center;
    }
    .drawer-policy-link {
      display: flex;
      min-height: 40px;
      align-items: center;
      justify-content: center;
      gap: 7px;
      margin-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      font-size: 12px;
      font-weight: 550;
      letter-spacing: 0.01em;
      text-decoration: none;
      transition: color 150ms ease;
    }
    .drawer-policy-link:hover,
    .drawer-policy-link:focus-visible { color: #cbd5e1; }
    .drawer-policy-link:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 5px; }
    .drawer-policy-icon { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.6; }
    .policy-dialog {
      flex-direction: column;
      width: min(900px, calc(100vw - 32px));
      height: min(780px, calc(100dvh - 32px));
      max-width: none;
      max-height: none;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--app-border, rgba(255, 255, 255, 0.14));
      border-radius: 16px;
      background: var(--app-surface, #1e293b);
      color: var(--text-main, #f8fafc);
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
    }
    .policy-dialog:not([open]) { display: none; }
    .policy-dialog[open] { display: flex; }
    .policy-dialog::backdrop { background: rgba(4, 12, 20, 0.72); backdrop-filter: blur(5px); }
    .policy-dialog-header {
      display: flex;
      min-height: 56px;
      flex: 0 0 auto;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px 10px 20px;
      border-bottom: 1px solid var(--app-border, rgba(255, 255, 255, 0.12));
    }
    .policy-dialog-title { margin: 0; font-size: 15px; font-weight: 720; }
    .policy-dialog-close {
      display: grid;
      width: 36px;
      height: 36px;
      flex: 0 0 auto;
      place-items: center;
      border: 1px solid var(--app-border, rgba(255, 255, 255, 0.12));
      border-radius: 9px;
      background: var(--app-surface-raised, rgba(255, 255, 255, 0.06));
      color: inherit;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
    }
    .policy-dialog-close:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .policy-dialog-frame { width: 100%; min-height: 0; flex: 1 1 auto; border: 0; background: #f3f6f8; }
    .notification-overlay {
      position: fixed;
      inset: 0;
      z-index: 300;
      display: none;
      justify-content: center;
      align-items: center;
      padding: 16px;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
    }
    .notification-overlay.active { display: flex; }
    .notification-dialog {
      display: flex;
      flex-direction: column;
      width: min(100%, 480px);
      max-height: min(78vh, 680px);
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 18px;
      background: #1e293b;
      color: #f8fafc;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
    }
    .notification-dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .notification-dialog-title { font-size: 17px; font-weight: 700; }
    .notification-header-actions { display: flex; align-items: center; gap: 10px; }
    .notification-text-btn, .notification-close-btn {
      border: 0;
      background: none;
      color: #38bdf8;
      font-size: 12px;
      font-weight: 650;
      cursor: pointer;
    }
    .notification-close-btn { color: #94a3b8; font-size: 23px; line-height: 1; }
    .notification-delete-all-btn {
      min-height: 32px;
      padding: 0 9px;
      border: 1px solid rgba(239, 133, 133, 0.28);
      border-radius: 7px;
      background: rgba(239, 133, 133, 0.08);
      color: #ef9a9a;
      font-size: 12px;
      font-weight: 650;
      cursor: pointer;
    }
    .notification-delete-all-btn:disabled { cursor: default; opacity: 0.45; }
    .notification-list {
      overflow-y: auto;
      padding: 8px 12px;
    }
    .notification-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 12px 4px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .notification-item.unread { background: rgba(56, 189, 248, 0.07); }
    .notification-content {
      flex: 1;
      min-width: 0;
      border: 0;
      background: none;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .notification-item-title { display: block; font-size: 14px; font-weight: 700; }
    .notification-item-body {
      display: block;
      margin-top: 4px;
      color: #cbd5e1;
      font-size: 13px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .notification-item-date { display: block; margin-top: 6px; color: #94a3b8; font-size: 11px; }
    .notification-read-state { margin-right: 5px; color: #38bdf8; font-size: 11px; }
    .notification-delete-btn {
      flex: 0 0 auto;
      padding: 6px;
      border: 0;
      background: none;
      color: #f87171;
      font-size: 12px;
      cursor: pointer;
    }
    .notification-empty { padding: 32px 12px; color: #94a3b8; font-size: 13px; text-align: center; }
    .resort-notice-modal { position: fixed; inset: 0; z-index: 1000; display: none; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.76); }
    .resort-notice-modal.active { display: flex; }
    .resort-notice-dialog { display: flex; width: min(100%, 620px); max-height: min(88dvh, 780px); flex-direction: column; overflow: hidden; border: 1px solid var(--app-border, rgba(255,255,255,.14)); border-radius: 18px; background: var(--app-surface, #1e293b); color: var(--text-main, #f8fafc); box-shadow: 0 24px 70px rgba(0,0,0,.45); }
    .resort-notice-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--app-border, rgba(255,255,255,.12)); }
    .resort-notice-header h2 { margin: 0; font-size: 17px; }
    .resort-notice-header-actions { display: flex; gap: 8px; }
    .resort-notice-header button, .resort-notice-page-button, .resort-notice-back { min-height: 34px; padding: 0 10px; border: 1px solid var(--app-border, rgba(255,255,255,.14)); border-radius: 8px; background: var(--app-surface-raised, rgba(255,255,255,.06)); color: inherit; font-size: 12px; cursor: pointer; }
    .resort-notice-content { position: relative; min-height: 180px; overflow: auto; overscroll-behavior: contain; }
    .resort-notice-content[aria-busy="true"] { pointer-events: none; }
    .resort-notice-loading { position: absolute; inset: 0; z-index: 2; display: grid; align-content: center; justify-items: center; gap: 10px; min-height: 180px; background: rgba(15, 23, 42, 0.64); background: color-mix(in srgb, var(--app-surface, #1e293b) 72%, transparent); color: var(--text-sub, #94a3b8); font-size: 13px; pointer-events: none; }
    .resort-notice-spinner { width: 28px; height: 28px; border: 3px solid var(--app-border, rgba(255,255,255,.16)); border-top-color: var(--primary, #38bdf8); border-radius: 50%; animation: resort-notice-spin .75s linear infinite; }
    @keyframes resort-notice-spin { to { transform: rotate(360deg); } }
    .resort-notice-list { display: grid; }
    .resort-notice-item { display: flex; width: 100%; align-items: center; gap: 12px; padding: 12px 16px; border: 0; border-bottom: 1px solid var(--app-border, rgba(255,255,255,.08)); background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .resort-notice-item:hover { background: var(--app-surface-raised, rgba(255,255,255,.05)); }
    .resort-notice-thumb { width: 68px; height: 54px; flex: 0 0 auto; border-radius: 7px; background: var(--app-surface-raised, #24332b); object-fit: cover; }
    .resort-notice-item-copy { min-width: 0; flex: 1; }
    .resort-notice-item-title { display: block; overflow: hidden; font-size: 14px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .resort-notice-item-meta { display: block; margin-top: 6px; color: var(--text-sub, #94a3b8); font-size: 12px; }
    .resort-notice-state { padding: 32px 16px; color: var(--text-sub, #94a3b8); font-size: 13px; text-align: center; }
    .resort-notice-pagination { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 12px; border-top: 1px solid var(--app-border, rgba(255,255,255,.1)); }
    .resort-notice-pagination button:disabled { cursor: default; opacity: .45; }
    .resort-notice-detail { padding: 16px; }
    .resort-notice-detail-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
    .resort-notice-detail-heading h3 { margin: 0; font-size: 16px; line-height: 1.45; overflow-wrap: anywhere; }
    .resort-notice-detail-date { flex: 0 0 auto; color: var(--text-sub, #94a3b8); font-size: 12px; }
    .resort-notice-detail-image { display: block; width: 100%; height: auto; margin: 0 auto 10px; border-radius: 6px; }
    .resort-notice-original { display: inline-block; margin-top: 8px; color: var(--primary, #38bdf8); font-size: 12px; }
    @media (max-width: 480px) { .resort-notice-modal { padding: 0; align-items: flex-end; } .resort-notice-dialog { max-height: 92dvh; border-radius: 18px 18px 0 0; padding-bottom: env(safe-area-inset-bottom); } .resort-notice-item { padding: 11px 13px; } }
  `;
  document.head.appendChild(navStyle);

  let pageTitle = '지산리조트 보안팀';
  if (currentPath.includes('main.html')) pageTitle = '메인 메뉴';
  else if (currentPath.includes('item-requests.html')) pageTitle = '물품 신청';
  else if (currentPath.includes('annual-leave.html')) pageTitle = '연차 관리';
  else if (currentPath.includes('users.html')) pageTitle = '회원 조회 및 관리';
  else if (currentPath.includes('vehicle.html')) pageTitle = '지산 차량조회';
  else if (currentPath.includes('calendar.html')) pageTitle = '휴무 캘린더';
  else if (currentPath.includes('manuals.html')) pageTitle = '업무 매뉴얼';
  else if (currentPath.includes('phonebook.html')) pageTitle = '지산 연락망';

  // Inject shared navigation and modal markup.
  navContainer.innerHTML = `
    <header class="nav-header">
      <div class="nav-title">
        <a class="nav-brand-link" href="/pages/main.html" aria-label="${pageTitle} - 메인으로 이동">
          <img class="nav-brand-logo" src="/logo.png" alt="">
          <span>${pageTitle}</span>
        </a>
      </div>
      <div class="nav-actions">
        <button class="notification-btn" id="openNotifications" type="button" aria-label="알림 열기" aria-haspopup="dialog" aria-expanded="false">
          🔔<span class="notification-badge" id="notificationUnreadBadge" style="display: none;">0</span>
        </button>
        <button class="hamburger-btn" id="openNavDrawer" type="button" aria-label="메뉴 열기">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>

    <div class="notification-overlay" id="notificationOverlay">
      <section class="notification-dialog" role="dialog" aria-modal="true" aria-labelledby="notificationDialogTitle">
        <header class="notification-dialog-header">
          <h2 class="notification-dialog-title" id="notificationDialogTitle">알림</h2>
          <div class="notification-header-actions">
            <button class="notification-text-btn" id="markAllNotificationsRead" type="button">모두 읽음</button>
            <button class="notification-delete-all-btn" id="deleteAllNotifications" type="button">모두 삭제</button>
            <button class="notification-close-btn" id="closeNotifications" type="button" aria-label="닫기">&times;</button>
          </div>
        </header>
        <div class="notification-list" id="notificationList" aria-live="polite"></div>
      </section>
    </div>

    <div class="drawer-overlay" id="navDrawerOverlay"></div>
    <div class="drawer-menu" id="navDrawerMenu">
      <div>
        <div class="drawer-header">
          <div class="drawer-user-row">
            <div>
              <div class="drawer-user-name" id="navUserName">회원 정보 불러오는 중...</div>
              <div class="drawer-user-role" id="navUserRole">Jisan Security Team</div>
            </div>
            <a href="/pages/settings.html" class="btn-settings-gear" title="개인정보 설정">⚙️</a>
            <button class="drawer-close-btn" id="closeNavDrawer" type="button" aria-label="메뉴 닫기">
              <span class="drawer-close-icon" aria-hidden="true">&times;</span><span class="drawer-close-label">닫기</span>
            </button>
          </div>
        </div>

        <button class="theme-switch" id="themeSwitch" type="button">
          <span id="themeSwitchLabel">라이트 모드로 전환</span>
          <span class="theme-switch-icon" id="themeSwitchIcon" aria-hidden="true">☀</span>
        </button>
        <button class="large-text-switch" id="largeTextSwitch" type="button" aria-pressed="false">
          <span>큰 글씨 모드</span>
          <span id="largeTextSwitchState" aria-hidden="true">끔</span>
        </button>
        <div class="drawer-menu-search">
          <label for="drawerMenuSearchInput">메뉴 검색</label>
          <input id="drawerMenuSearchInput" type="search" autocomplete="off" placeholder="예: 연차, 차량, 식단">
          <div class="drawer-menu-search-recent" id="drawerMenuSearchRecent" hidden></div>
          <div class="drawer-menu-search-status" id="drawerMenuSearchStatus" role="status" aria-live="polite"></div>
        </div>
        <nav class="drawer-links" aria-label="업무 메뉴">
          <section class="drawer-group" id="drawerFavoritesGroup" aria-labelledby="drawerFavoritesTitle" hidden>
            <h2 class="drawer-group-title" id="drawerFavoritesTitle">즐겨찾기</h2>
            <div class="drawer-favorites-list" id="drawerFavoritesList"></div>
            <div class="drawer-favorites-status" id="drawerFavoritesStatus" role="status" aria-live="polite"></div>
          </section>
          <section class="drawer-group" aria-labelledby="drawerHomeGroup">
            <h2 class="drawer-group-title" id="drawerHomeGroup">홈</h2>
            <div class="drawer-group-items">
              <a href="/pages/main.html" class="drawer-item ${currentPath.includes('main.html') ? 'active' : ''}" ${currentPath.includes('main.html') ? 'aria-current="page"' : ''}>
                <span class="drawer-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9M9 21v-7h6v7"/></svg></span><span class="drawer-item-label">메인 메뉴</span>
              </a>
            </div>
          </section>
          <section class="drawer-group" aria-labelledby="drawerWorkGroup">
            <h2 class="drawer-group-title" id="drawerWorkGroup">근무 · 급여</h2>
            <div class="drawer-group-items">
              <a href="/pages/calendar.html" class="drawer-item ${currentPath.includes('calendar.html') ? 'active' : ''}" ${currentPath.includes('calendar.html') ? 'aria-current="page"' : ''}>
                <span class="drawer-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/><path d="m9 16 2 2 4-4"/></svg></span><span class="drawer-item-label">휴무 일정</span>
              </a>
              <a href="/pages/annual-leave.html" class="drawer-item ${currentPath.includes('annual-leave.html') ? 'active' : ''}" ${currentPath.includes('annual-leave.html') ? 'aria-current="page"' : ''}>
                <span class="drawer-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19V5m0 14h16"/><path d="m7 15 4-4 3 2 5-6"/></svg></span><span class="drawer-item-label">연차 관리</span>
              </a>
              <a href="https://www.ibro.co.kr/PayRoll/JOBWITH/index.asp" class="drawer-item" target="_blank" rel="noopener noreferrer">
                <span class="drawer-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4m4 0h2M8 2v3m8-3v3"/></svg></span><span class="drawer-item-label">급여 조회 ↗</span>
              </a>
            </div>
          </section>
          <section class="drawer-group" aria-labelledby="drawerTeamGroup">
            <h2 class="drawer-group-title" id="drawerTeamGroup">팀 운영</h2>
            <div class="drawer-group-items">
              <a href="/pages/users.html" class="drawer-item ${currentPath.includes('users.html') ? 'active' : ''}" ${currentPath.includes('users.html') ? 'aria-current="page"' : ''}>
                <span class="drawer-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></span><span class="drawer-item-label">회원 명부</span>
              </a>
              <a href="/pages/item-requests.html" class="drawer-item ${currentPath.includes('item-requests.html') ? 'active' : ''}" ${currentPath.includes('item-requests.html') ? 'aria-current="page"' : ''}>
                <span class="drawer-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3 8 9-5 9 5v9l-9 5-9-5V8Z"/><path d="m3.5 8.5 8.5 5 8.5-5M12 13.5V22M7.5 5.5l9 5"/></svg></span><span class="drawer-item-label">물품 신청</span>
              </a>
            </div>
          </section>
          <section class="drawer-group" aria-labelledby="drawerInfoGroup">
            <h2 class="drawer-group-title" id="drawerInfoGroup">자료 · 연락처</h2>
            <div class="drawer-group-items">
              <a href="/pages/meal-plan.html" class="drawer-item ${currentPath.includes('meal-plan.html') ? 'active' : ''}" ${currentPath.includes('meal-plan.html') ? 'aria-current="page"' : ''}>
                <span class="drawer-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h5"/><path d="m5 4 2-2m10 2 2-2"/></svg></span><span class="drawer-item-label">주간 식단표</span>
              </a>
              <a href="/pages/vehicle.html" class="drawer-item ${currentPath.includes('vehicle.html') ? 'active' : ''}" ${currentPath.includes('vehicle.html') ? 'aria-current="page"' : ''}>
                <span class="drawer-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 11 1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><path d="M3 11h18v8H3z"/><path d="M6 19v2m12-2v2M6 15h.01M18 15h.01M3 13l-1-2m19 2 1-2"/></svg></span><span class="drawer-item-label">지산 차량조회</span>
              </a>
              <a href="/pages/manuals.html" class="drawer-item ${currentPath.includes('manuals.html') ? 'active' : ''}" ${currentPath.includes('manuals.html') ? 'aria-current="page"' : ''}>
                <span class="drawer-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg></span><span class="drawer-item-label">업무 매뉴얼</span>
              </a>
              <a href="/pages/phonebook.html" class="drawer-item ${currentPath.includes('phonebook.html') ? 'active' : ''}" ${currentPath.includes('phonebook.html') ? 'aria-current="page"' : ''}>
                <span class="drawer-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 11.19 18a19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.09 3.18 2 2 0 0 1 4.08 1h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.06 8.94a16 16 0 0 0 6 6l1.31-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.58 2.8.7A2 2 0 0 1 22 16.92Z"/></svg></span><span class="drawer-item-label">지산 연락망</span>
              </a>
              <a href="#" class="drawer-item" id="openResortNoticesFromDrawer">
                <span class="drawer-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span><span class="drawer-item-label">지산 공지사항</span>
              </a>
            </div>
          </section>
        </nav>
      </div>

      <div class="drawer-bottom">
        <button class="btn-nav-logout" id="navLogoutBtn" type="button">로그아웃</button>
        <a class="drawer-policy-link" id="openPrivacyPolicy" href="/privacy-policy.html"
          aria-haspopup="dialog" aria-controls="privacyPolicyDialog">
          <svg class="drawer-policy-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.5 19 6v5.2c0 4.2-2.8 7.5-7 9.3-4.2-1.8-7-5.1-7-9.3V6l7-2.5Z"/>
            <path d="m9.2 12 1.8 1.8 3.8-4"/>
          </svg>
          <span>개인정보 처리방침</span>
        </a>
        <button class="large-text-switch" id="nativeBiometricSwitch" type="button" aria-pressed="false" style="display: none;">
          <span>생체 인증 잠금</span>
          <span id="nativeBiometricSwitchState" aria-hidden="true">끔</span>
        </button>
      </div>
    </div>
    <dialog class="policy-dialog" id="privacyPolicyDialog" aria-labelledby="privacyPolicyDialogTitle">
      <header class="policy-dialog-header">
        <h2 class="policy-dialog-title" id="privacyPolicyDialogTitle">개인정보 처리방침</h2>
        <button class="policy-dialog-close" id="closePrivacyPolicy" type="button" aria-label="닫기">&times;</button>
      </header>
      <iframe class="policy-dialog-frame" src="/privacy-policy.html" title="개인정보 처리방침"></iframe>
    </dialog>
    <div class="resort-notice-modal" id="resortNoticeModal" aria-hidden="true">
      <section class="resort-notice-dialog" role="dialog" aria-modal="true" aria-labelledby="resortNoticeTitle">
        <header class="resort-notice-header">
          <h2 id="resortNoticeTitle">지산리조트 공지사항</h2>
          <div class="resort-notice-header-actions">
            <button id="resortNoticeListButton" type="button" hidden>목록</button>
            <button id="closeResortNotices" type="button" aria-label="공지사항 닫기">닫기</button>
          </div>
        </header>
        <div class="resort-notice-content" id="resortNoticeContent" aria-live="polite"></div>
        <footer class="resort-notice-pagination" id="resortNoticePagination" hidden>
          <button class="resort-notice-page-button" id="resortNoticePrevious" type="button">이전</button>
          <span id="resortNoticePageLabel"></span>
          <button class="resort-notice-page-button" id="resortNoticeNext" type="button">다음</button>
        </footer>
      </section>
    </div>
  `;

  const drawerFavoritesGroup = document.getElementById('drawerFavoritesGroup');
  const drawerFavoritesList = document.getElementById('drawerFavoritesList');
  const drawerFavoritesStatus = document.getElementById('drawerFavoritesStatus');

  function getMenuFavoriteKey(anchor) {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return '';
    const url = new URL(href, window.location.origin);
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : url.href;
  }

  function setupDrawerMenuFavorites() {
    const menuLinks = [...navContainer.querySelectorAll('.drawer-group-items .drawer-item')]
      .map(anchor => ({ anchor, key: getMenuFavoriteKey(anchor) }))
      .filter(item => item.key);
    menuLinks.forEach(({ anchor, key }) => {
      if (anchor.parentElement.classList.contains('drawer-item-shell')) return;
      const shell = document.createElement('div');
      shell.className = 'drawer-item-shell';
      anchor.parentNode.insertBefore(shell, anchor);
      shell.append(anchor);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'drawer-item-favorite';
      button.dataset.drawerFavorite = key;
      button.dataset.menuLabel = anchor.querySelector('.drawer-item-label')?.textContent.trim() || '메뉴';
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${button.dataset.menuLabel} 즐겨찾기에 추가`);
      button.textContent = '☆';
      shell.append(button);
    });
    renderDrawerFavorites(menuLinks);
  }

  function renderDrawerFavorites(menuLinks) {
    if (!drawerFavoritesList || !preferences) return;
    const entries = menuLinks || [...navContainer.querySelectorAll('.drawer-group-items .drawer-item')]
      .map(anchor => ({ anchor, key: getMenuFavoriteKey(anchor) }))
      .filter(item => item.key);
    const favorites = preferences.getFavorites().filter(item => item.type === 'menu');
    const menuByKey = new Map(entries.map(item => [item.key, item.anchor]));
    const visibleFavorites = favorites.filter(item => menuByKey.has(item.key));
    drawerFavoritesList.replaceChildren();
    drawerFavoritesGroup.hidden = visibleFavorites.length === 0;

    visibleFavorites.forEach(favorite => {
      const source = menuByKey.get(favorite.key);
      const row = document.createElement('div');
      row.className = 'drawer-favorite-row';
      const link = document.createElement('a');
      link.className = 'drawer-favorite-link';
      link.href = source.getAttribute('href');
      if (source.target) link.target = source.target;
      if (source.rel) link.rel = source.rel;
      const sourceIcon = source.querySelector('.drawer-item-icon');
      if (sourceIcon) link.append(sourceIcon.cloneNode(true));
      const label = document.createElement('span');
      label.className = 'drawer-favorite-label';
      label.textContent = source.querySelector('.drawer-item-label')?.textContent.trim() || '메뉴';
      link.append(label);
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'drawer-item-favorite';
      removeButton.dataset.drawerFavorite = favorite.key;
      removeButton.dataset.menuLabel = label.textContent;
      removeButton.setAttribute('aria-pressed', 'true');
      removeButton.setAttribute('aria-label', `${label.textContent} 즐겨찾기에서 제거`);
      removeButton.title = '즐겨찾기에서 제거';
      removeButton.textContent = '★';
      row.append(link, removeButton);
      drawerFavoritesList.append(row);
    });

    navContainer.querySelectorAll('[data-drawer-favorite]').forEach(button => {
      const favorite = favorites.some(item => item.key === button.dataset.drawerFavorite);
      button.setAttribute('aria-pressed', String(favorite));
      button.textContent = favorite ? '★' : '☆';
      button.title = favorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가';
      button.setAttribute('aria-label', `${button.dataset.menuLabel} ${button.title}`);
    });
  }

  function getDrawerMenuSearchTerms(anchor) {
    const pathname = anchor.getAttribute('href')?.startsWith('/')
      ? new URL(anchor.href).pathname
      : '';
    const keywordMap = {
      '/pages/main.html': '홈 메인 시작 대시보드',
      '/pages/calendar.html': '휴무 일정 캘린더 달력 근무표 스케줄 휴가 공가 시간차 연차 신청',
      '/pages/annual-leave.html': '연차 휴가 잔여 소진 근속 가산 차감 기준일 직원',
      '/pages/users.html': '회원 명부 직원 사원 사용자 계정 권한 인사 재직자',
      '/pages/item-requests.html': '물품 신청 비품 구매 소모품 장비 물건 요청 승인',
      '/pages/meal-plan.html': '식단 식단표 메뉴 밥 식사 점심 저녁 주간 식당',
      '/pages/vehicle.html': '차량 자동차 차 번호 방문 차량 주차',
      '/pages/manuals.html': '업무 매뉴얼 지침 대응 상황조치 골프장 스키장 안전 수칙',
      '/pages/phonebook.html': '전화번호 연락처 전화 연락망 부서 직원 통화 전화번호부'
    };
    if (anchor.id === 'openResortNoticesFromDrawer') return '공지 공지사항 리조트 공지 알림 안내 업데이트';
    if (anchor.href.includes('/PayRoll/')) return '급여 월급 임금 급여명세서 페이롤 payroll';
    return keywordMap[pathname] || '';
  }

  function normalizeDrawerSearch(value) {
    return String(value || '').toLocaleLowerCase('ko-KR').replace(/[()-]/g, ' ');
  }

  function setupDrawerMenuSearch() {
    const input = document.getElementById('drawerMenuSearchInput');
    const recentContainer = document.getElementById('drawerMenuSearchRecent');
    const status = document.getElementById('drawerMenuSearchStatus');
    const recentKey = 'jsec-recent-menu-searches';
    let recentTerms = [];
    try {
      const saved = JSON.parse(localStorage.getItem(recentKey) || '[]');
      if (Array.isArray(saved)) recentTerms = saved
        .filter(term => typeof term === 'string' && term.trim())
        .slice(0, 5);
    } catch {
      recentTerms = [];
    }

    const menuGroups = [...navContainer.querySelectorAll('.drawer-links > .drawer-group:not(#drawerFavoritesGroup)')];
    menuGroups.forEach(group => {
      group.querySelectorAll('.drawer-group-items .drawer-item').forEach(anchor => {
        anchor.dataset.searchKeywords = getDrawerMenuSearchTerms(anchor);
      });
    });

    function renderRecentTerms() {
      recentContainer.replaceChildren();
      recentContainer.hidden = recentTerms.length === 0;
      if (!recentTerms.length) return;
      const label = document.createElement('span');
      label.className = 'drawer-menu-search-recent-label';
      label.textContent = '최근 검색';
      recentContainer.append(label);
      recentTerms.forEach(term => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.recentDrawerSearch = term;
        button.textContent = term;
        recentContainer.append(button);
      });
    }

    function applySearch() {
      const tokens = normalizeDrawerSearch(input.value).trim().split(/\s+/).filter(Boolean);
      let matchCount = 0;
      menuGroups.forEach(group => {
        let groupCount = 0;
        group.querySelectorAll('.drawer-group-items .drawer-item').forEach(anchor => {
          const searchable = normalizeDrawerSearch([
            group.querySelector('.drawer-group-title')?.textContent,
            anchor.textContent,
            anchor.dataset.searchKeywords
          ].join(' '));
          const matches = tokens.every(token => searchable.includes(token));
          (anchor.closest('.drawer-item-shell') || anchor).hidden = !matches;
          if (matches) {
            groupCount += 1;
            matchCount += 1;
          }
        });
        group.hidden = tokens.length > 0 && groupCount === 0;
      });
      status.textContent = tokens.length ? `${matchCount}개 메뉴` : '';
    }

    function saveRecentSearch(value) {
      const term = String(value || '').trim().slice(0, 60);
      if (!term) return;
      recentTerms = [term, ...recentTerms.filter(item => item !== term)].slice(0, 5);
      try {
        localStorage.setItem(recentKey, JSON.stringify(recentTerms));
      } catch (error) {
        console.warn('최근 메뉴 검색을 저장하지 못했습니다.', error);
      }
      renderRecentTerms();
    }

    renderRecentTerms();
    input.addEventListener('input', applySearch);
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      saveRecentSearch(input.value);
    });
    recentContainer.addEventListener('click', event => {
      const button = event.target.closest('[data-recent-drawer-search]');
      if (!button) return;
      input.value = button.dataset.recentDrawerSearch;
      applySearch();
      input.focus();
    });
    navContainer.addEventListener('click', event => {
      if (!event.target.closest('.drawer-item-shell .drawer-item')) return;
      saveRecentSearch(input.value);
    });
  }

  setupDrawerMenuFavorites();
  setupDrawerMenuSearch();
  window.addEventListener('jsec:favorites-changed', () => renderDrawerFavorites());
  navContainer.addEventListener('click', async event => {
    const button = event.target.closest('[data-drawer-favorite]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    drawerFavoritesStatus.textContent = '';
    try {
      await preferences.toggleFavorite('menu', button.dataset.drawerFavorite);
    } catch (error) {
      console.error('햄버거 메뉴 즐겨찾기 저장 오류:', error);
      drawerFavoritesStatus.textContent = error.message || '즐겨찾기를 저장하지 못했습니다.';
    } finally {
      button.disabled = false;
    }
  });

  // Attach event handlers and load user information.
  const openBtn = document.getElementById('openNavDrawer');
  const closeBtn = document.getElementById('closeNavDrawer');
  const overlay = document.getElementById('navDrawerOverlay');
  const drawer = document.getElementById('navDrawerMenu');
  const privacyPolicyLink = document.getElementById('openPrivacyPolicy');
  const privacyPolicyDialog = document.getElementById('privacyPolicyDialog');
  const closePrivacyPolicyButton = document.getElementById('closePrivacyPolicy');
  const logoutBtn = document.getElementById('navLogoutBtn');
  const themeSwitch = document.getElementById('themeSwitch');
  const themeSwitchLabel = document.getElementById('themeSwitchLabel');
  const themeSwitchIcon = document.getElementById('themeSwitchIcon');
  const largeTextSwitch = document.getElementById('largeTextSwitch');
  const largeTextSwitchState = document.getElementById('largeTextSwitchState');
  const nativeBiometricSwitch = document.getElementById('nativeBiometricSwitch');
  const nativeBiometricSwitchState = document.getElementById('nativeBiometricSwitchState');
  const openNotificationsBtn = document.getElementById('openNotifications');
  const notificationOverlay = document.getElementById('notificationOverlay');
  const notificationList = document.getElementById('notificationList');
  const notificationBadge = document.getElementById('notificationUnreadBadge');
  const markAllReadBtn = document.getElementById('markAllNotificationsRead');
  const deleteAllNotificationsBtn = document.getElementById('deleteAllNotifications');
  const NOTIFICATIONS_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/notifications';
  let notificationSession = null;
  let notifications = [];
  let unreadNotificationCount = 0;
  const resortNoticeModal = document.getElementById('resortNoticeModal');
  const resortNoticeContent = document.getElementById('resortNoticeContent');
  const resortNoticePagination = document.getElementById('resortNoticePagination');
  const resortNoticePrevious = document.getElementById('resortNoticePrevious');
  const resortNoticeNext = document.getElementById('resortNoticeNext');
  const resortNoticePageLabel = document.getElementById('resortNoticePageLabel');
  const resortNoticeListButton = document.getElementById('resortNoticeListButton');
  const isAndroidApp = Boolean(window.AndroidSecurity);
  const RESORT_NOTICES_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/resort-notices';
  let resortNoticePage = 1;
  let resortNoticeTotalPages = 1;
  let resortNoticeItems = [];
  let resortNoticeRequestId = 0;

  function updateThemeSwitch() {
    const isLight = document.documentElement.dataset.theme === 'light';
    themeSwitchLabel.textContent = isLight ? '다크 모드로 전환' : '라이트 모드로 전환';
    themeSwitchIcon.textContent = isLight ? '☾' : '☀';
    themeSwitch.setAttribute('aria-label', themeSwitchLabel.textContent);
  }

  if (themeSwitch && preferences) {
    updateThemeSwitch();
    themeSwitch.addEventListener('click', async () => {
      const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      const savePromise = preferences.setTheme(nextTheme);
      updateThemeSwitch();
      await savePromise;
      updateThemeSwitch();
    });
  }

  function updateLargeTextSwitch() {
    const enabled = document.documentElement.dataset.largeText === 'true';
    largeTextSwitch.setAttribute('aria-pressed', String(enabled));
    largeTextSwitchState.textContent = enabled ? '켬' : '끔';
    largeTextSwitch.setAttribute('aria-label', `큰 글씨 모드 ${enabled ? '끄기' : '켜기'}`);
  }

  if (largeTextSwitch && preferences) {
    updateLargeTextSwitch();
    largeTextSwitch.addEventListener('click', async () => {
      const enabled = document.documentElement.dataset.largeText !== 'true';
      const saved = await preferences.setLargeTextMode(enabled);
      updateLargeTextSwitch();
      if (!saved) console.error('큰 글씨 모드 설정을 계정에 저장하지 못했습니다. 이 기기에서만 적용됩니다.');
    });
  }

  if (nativeBiometricSwitch && window.AndroidSecurity) {
    nativeBiometricSwitch.style.display = 'flex';
    const updateBiometricSwitch = enabled => {
      nativeBiometricSwitch.setAttribute('aria-pressed', String(enabled));
      nativeBiometricSwitchState.textContent = enabled ? '켬' : '끔';
      nativeBiometricSwitch.setAttribute('aria-label', `생체 인증 잠금 ${enabled ? '끄기' : '켜기'}`);
    };
    updateBiometricSwitch(window.AndroidSecurity.isEnabled());
    window.onNativeBiometricLockChanged = updateBiometricSwitch;
    nativeBiometricSwitch.addEventListener('click', () => {
      window.AndroidSecurity.setEnabled(!window.AndroidSecurity.isEnabled());
    });
  }

  function setDrawerOpen(isOpen) {
    overlay.classList.toggle('active', isOpen);
    drawer.classList.toggle('active', isOpen);
    openBtn?.setAttribute('aria-expanded', String(isOpen));
  }

  if (openBtn) openBtn.addEventListener('click', () => setDrawerOpen(!drawer.classList.contains('active')));
  if (closeBtn) closeBtn.addEventListener('click', () => setDrawerOpen(false));
  if (overlay) overlay.addEventListener('click', () => setDrawerOpen(false));
  if (privacyPolicyLink && privacyPolicyDialog) {
    privacyPolicyLink.addEventListener('click', event => {
      if (typeof privacyPolicyDialog.showModal !== 'function') return;
      event.preventDefault();
      setDrawerOpen(false);
      privacyPolicyDialog.showModal();
      closePrivacyPolicyButton?.focus();
    });
    privacyPolicyDialog.addEventListener('click', event => {
      if (event.target === privacyPolicyDialog) privacyPolicyDialog.close();
    });
  }
  closePrivacyPolicyButton?.addEventListener('click', () => privacyPolicyDialog?.close());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drawer.classList.contains('active')) setDrawerOpen(false);
  });
  if (openNotificationsBtn) {
    openNotificationsBtn.addEventListener('click', async () => {
      notificationOverlay.classList.add('active');
      openNotificationsBtn.setAttribute('aria-expanded', 'true');
      await refreshNotifications();
    });
  }
  if (document.getElementById('closeNotifications')) {
    document.getElementById('closeNotifications').addEventListener('click', closeNotifications);
  }
  if (notificationOverlay) {
    notificationOverlay.addEventListener('click', event => {
      if (event.target === notificationOverlay) closeNotifications();
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && notificationOverlay.classList.contains('active')) {
      closeNotifications();
    }
  });

  function closeNotifications() {
    notificationOverlay.classList.remove('active');
    openNotificationsBtn.setAttribute('aria-expanded', 'false');
  }

  function setResortNoticeState(message, retryAction) {
    resortNoticeContent.setAttribute('aria-busy', 'false');
    resortNoticeContent.replaceChildren();
    const state = document.createElement('div');
    state.className = 'resort-notice-state';
    state.textContent = message;
    if (retryAction) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'resort-notice-page-button';
      retry.textContent = '다시 시도';
      retry.addEventListener('click', retryAction);
      state.append(document.createElement('br'), retry);
    }
    resortNoticeContent.appendChild(state);
  }

  function setResortNoticeLoading(message) {
    resortNoticeContent.setAttribute('aria-busy', 'true');
    const loading = document.createElement('div');
    loading.className = 'resort-notice-loading';
    loading.setAttribute('role', 'status');
    const spinner = document.createElement('span');
    spinner.className = 'resort-notice-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = message;
    loading.append(spinner, label);
    resortNoticeContent.appendChild(loading);
  }

  function getAuthorizationHeader(session) {
    return { Authorization: `${'Bear' + 'er '}${session.access_token}` };
  }
  async function resortNoticeRequest(path) {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!session) throw new Error('로그인이 필요합니다.');
    const request = window.appLoading?.fetchWithoutLoading || fetch;
    const response = await request(`${RESORT_NOTICES_API}${path}`, {
      headers: getAuthorizationHeader(session)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  function renderResortNoticeList() {
    resortNoticeContent.setAttribute('aria-busy', 'false');
    resortNoticeListButton.hidden = true;
    resortNoticePagination.hidden = false;
    resortNoticePageLabel.textContent = `${resortNoticePage} / ${resortNoticeTotalPages}`;
    resortNoticePrevious.disabled = resortNoticePage <= 1;
    resortNoticeNext.disabled = resortNoticePage >= resortNoticeTotalPages;
    resortNoticeContent.replaceChildren();

    if (resortNoticeItems.length === 0) {
      setResortNoticeState('표시할 공지사항이 없습니다.');
      return;
    }

    const list = document.createElement('div');
    list.className = 'resort-notice-list';
    resortNoticeItems.forEach(notice => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'resort-notice-item';
      item.dataset.noticeId = notice.id;
      if (notice.imageUrl) {
        const image = document.createElement('img');
        image.className = 'resort-notice-thumb';
        image.src = notice.imageUrl;
        image.alt = '';
        image.loading = 'lazy';
        item.appendChild(image);
      }
      const copy = document.createElement('span');
      copy.className = 'resort-notice-item-copy';
      const title = document.createElement('span');
      title.className = 'resort-notice-item-title';
      title.textContent = notice.title;
      const meta = document.createElement('span');
      meta.className = 'resort-notice-item-meta';
      meta.textContent = [notice.category, notice.date].filter(Boolean).join(' · ');
      copy.append(title, meta);
      item.appendChild(copy);
      list.appendChild(item);
    });
    resortNoticeContent.appendChild(list);
  }

  async function loadResortNotices(page = 1) {
    const requestId = ++resortNoticeRequestId;
    resortNoticePrevious.disabled = true;
    resortNoticeNext.disabled = true;
    setResortNoticeLoading('공지사항을 불러오는 중...');
    try {
      const result = await resortNoticeRequest(`?page=${page}`);
      if (requestId !== resortNoticeRequestId) return;
      resortNoticePage = result.page;
      resortNoticeTotalPages = result.totalPages;
      resortNoticeItems = result.notices;
      renderResortNoticeList();
    } catch (error) {
      if (requestId !== resortNoticeRequestId) return;
      console.error('지산리조트 공지 목록 조회 실패:', error);
      resortNoticePrevious.disabled = resortNoticePage <= 1;
      resortNoticeNext.disabled = resortNoticePage >= resortNoticeTotalPages;
      setResortNoticeState(`공지사항을 불러오지 못했습니다. ${error.message}`, () => loadResortNotices(page));
    }
  }

  async function openResortNoticeDetail(noticeId) {
    const requestId = ++resortNoticeRequestId;
    resortNoticePrevious.disabled = true;
    resortNoticeNext.disabled = true;
    resortNoticeListButton.disabled = true;
    setResortNoticeLoading('공지 내용을 불러오는 중...');
    try {
      const notice = await resortNoticeRequest(`/${encodeURIComponent(noticeId)}`);
      if (requestId !== resortNoticeRequestId) return;
      resortNoticeContent.replaceChildren();
      resortNoticeContent.setAttribute('aria-busy', 'false');
      resortNoticePagination.hidden = true;
      resortNoticeListButton.hidden = false;
      resortNoticeListButton.disabled = false;
      const detail = document.createElement('article');
      detail.className = 'resort-notice-detail';
      const heading = document.createElement('header');
      heading.className = 'resort-notice-detail-heading';
      const title = document.createElement('h3');
      title.textContent = notice.title;
      const date = document.createElement('time');
      date.className = 'resort-notice-detail-date';
      date.textContent = notice.date;
      heading.append(title, date);
      detail.appendChild(heading);

      notice.images.forEach(imageUrl => {
        const image = document.createElement('img');
        image.className = 'resort-notice-detail-image';
        image.src = imageUrl;
        image.alt = notice.title;
        image.loading = 'lazy';
        detail.appendChild(image);
      });
      if (notice.images.length === 0) {
        const noBody = document.createElement('p');
        noBody.className = 'resort-notice-state';
        noBody.textContent = '원문 본문을 표시할 수 없습니다.';
        detail.appendChild(noBody);
      }
      const original = document.createElement('a');
      original.className = 'resort-notice-original';
      original.href = `https://www.jisanresort.co.kr/w/event/board_view.asp?board_sw=notice&seq=${encodeURIComponent(notice.id)}`;
      original.target = isAndroidApp ? '_self' : '_blank';
      if (!isAndroidApp) original.rel = 'noopener noreferrer';
      original.textContent = '지산리조트 원문 보기 ↗';
      detail.appendChild(original);
      resortNoticeContent.appendChild(detail);
    } catch (error) {
      if (requestId !== resortNoticeRequestId) return;
      console.error('지산리조트 공지 상세 조회 실패:', error);
      resortNoticeListButton.disabled = false;
      resortNoticePrevious.disabled = resortNoticePage <= 1;
      resortNoticeNext.disabled = resortNoticePage >= resortNoticeTotalPages;
      setResortNoticeState(`공지 내용을 불러오지 못했습니다. ${error.message}`, () => openResortNoticeDetail(noticeId));
    }
  }

  function openResortNotices() {
    setDrawerOpen(false);
    resortNoticeModal.classList.add('active');
    resortNoticeModal.setAttribute('aria-hidden', 'false');
    loadResortNotices(1);
  }

  function closeResortNotices() {
    resortNoticeRequestId++;
    resortNoticeContent.setAttribute('aria-busy', 'false');
    resortNoticeModal.classList.remove('active');
    resortNoticeModal.setAttribute('aria-hidden', 'true');
  }

  document.getElementById('closeResortNotices').addEventListener('click', closeResortNotices);
  resortNoticeModal.addEventListener('click', event => {
    if (event.target === resortNoticeModal) closeResortNotices();
  });
  resortNoticePrevious.addEventListener('click', () => loadResortNotices(resortNoticePage - 1));
  resortNoticeNext.addEventListener('click', () => loadResortNotices(resortNoticePage + 1));
  resortNoticeListButton.addEventListener('click', () => {
    resortNoticeRequestId++;
    renderResortNoticeList();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && resortNoticeModal.classList.contains('active')) closeResortNotices();
  });
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const noticeTrigger = target.closest('#openResortNotices, #openResortNoticesFromDrawer');
    const noticeItem = target.closest('[data-notice-id]');
    if (!noticeTrigger && !noticeItem) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (noticeTrigger) openResortNotices();
    else if (resortNoticeModal.contains(noticeItem)) {
      openResortNoticeDetail(noticeItem.dataset.noticeId);
    }
  }, true);

  async function signOutRetiredUser() {
    window.markIntentionalSignOut?.();
    const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
    if (error) {
      window.markIntentionalSignOut?.(false);
      throw error;
    }
    window.location.replace('/index.html?session=retired');
  }

  async function notificationRequest(path = '', options = {}) {
    if (!notificationSession) throw new Error('로그인이 필요합니다.');
    const request = window.appLoading?.fetchWithoutLoading || fetch;
    const response = await request(`${NOTIFICATIONS_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${notificationSession.access_token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  function updateNotificationBadge(unreadCount) {
    if (!notificationBadge) return;
    const count = Number(unreadCount) || 0;
    unreadNotificationCount = count;
    notificationBadge.textContent = count > 99 ? '99+' : String(count);
    notificationBadge.style.display = count > 0 ? 'block' : 'none';
    openNotificationsBtn.setAttribute('aria-label', count > 0 ? `알림 열기, 읽지 않은 알림 ${count}개` : '알림 열기');
  }

  function showNotificationError(error) {
    const message = document.createElement('div');
    message.className = 'notification-empty';
    message.setAttribute('role', 'alert');
    message.textContent = `알림 처리에 실패했습니다: ${error.message}`;
    notificationList.prepend(message);
  }

  function renderNotifications() {
    notificationList.replaceChildren();
    if (deleteAllNotificationsBtn) deleteAllNotificationsBtn.disabled = notifications.length === 0;
    if (notifications.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'notification-empty';
      empty.textContent = '알림이 없습니다.';
      notificationList.appendChild(empty);
      return;
    }

    notifications.forEach(notification => {
      const item = document.createElement('article');
      item.className = `notification-item${notification.read_at ? '' : ' unread'}`;

      const content = document.createElement('button');
      content.type = 'button';
      content.className = 'notification-content';
      content.setAttribute('aria-label', `${notification.read_at ? '읽음' : '읽지 않음'}: ${notification.title}`);

      const title = document.createElement('span');
      title.className = 'notification-item-title';
      const readState = document.createElement('span');
      readState.className = 'notification-read-state';
      readState.textContent = notification.read_at ? '읽음' : '읽지 않음';
      title.append(readState, document.createTextNode(notification.title));

      const body = document.createElement('span');
      body.className = 'notification-item-body';
      body.textContent = notification.body;

      const date = document.createElement('time');
      date.className = 'notification-item-date';
      date.dateTime = notification.created_at;
      date.textContent = new Date(notification.created_at).toLocaleString('ko-KR');

      content.append(title, body, date);
      content.addEventListener('click', async () => {
        if (!notification.read_at) {
          try {
            await notificationRequest(`/${encodeURIComponent(notification.id)}`, { method: 'PUT' });
            notification.read_at = new Date().toISOString();
            updateNotificationBadge(Math.max(0, unreadNotificationCount - 1));
            renderNotifications();
          } catch (error) {
            showNotificationError(error);
          }
        }
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'notification-delete-btn';
      deleteButton.textContent = '삭제';
      deleteButton.setAttribute('aria-label', `${notification.title} 알림 삭제`);
      deleteButton.addEventListener('click', async () => {
        try {
          await notificationRequest(`/${encodeURIComponent(notification.id)}`, { method: 'DELETE' });
          notifications = notifications.filter(itemNotification => itemNotification.id !== notification.id);
          if (!notification.read_at) updateNotificationBadge(Math.max(0, unreadNotificationCount - 1));
          renderNotifications();
        } catch (error) {
          showNotificationError(error);
        }
      });

      item.append(content, deleteButton);
      notificationList.appendChild(item);
    });
  }

  async function refreshNotifications() {
    try {
      const result = await notificationRequest();
      notifications = result.notifications || [];
      updateNotificationBadge(result.unreadCount);
      renderNotifications();
    } catch (error) {
      notificationList.replaceChildren();
      const message = document.createElement('div');
      message.className = 'notification-empty';
      message.textContent = `알림을 불러오지 못했습니다. ${error.message}`;
      notificationList.appendChild(message);
    }
  }

  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', async () => {
      if (unreadNotificationCount === 0) return;
      try {
        await notificationRequest('/read-all', { method: 'PUT' });
        notifications.forEach(notification => {
          if (!notification.read_at) notification.read_at = new Date().toISOString();
        });
        updateNotificationBadge(0);
        renderNotifications();
      } catch (error) {
        showNotificationError(error);
      }
    });
  }

  if (deleteAllNotificationsBtn) {
    deleteAllNotificationsBtn.addEventListener('click', async () => {
      if (notifications.length === 0 || deleteAllNotificationsBtn.disabled) return;

      let confirmed = false;
      if (window.Swal?.fire) {
        const result = await window.Swal.fire({
          icon: 'warning',
          title: '알림을 모두 삭제할까요?',
          text: '삭제한 알림은 복구할 수 없습니다.',
          showCancelButton: true,
          confirmButtonText: '모두 삭제',
          cancelButtonText: '취소',
          reverseButtons: true
        });
        confirmed = result.isConfirmed;
      } else {
        confirmed = window.confirm('모든 알림을 삭제할까요? 삭제한 알림은 복구할 수 없습니다.');
      }
      if (!confirmed) return;

      deleteAllNotificationsBtn.disabled = true;
      try {
        await notificationRequest('', { method: 'DELETE' });
        notifications = [];
        updateNotificationBadge(0);
        renderNotifications();
      } catch (error) {
        deleteAllNotificationsBtn.disabled = false;
        showNotificationError(error);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (typeof supabaseClient !== 'undefined') {
        window.markIntentionalSignOut?.();
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
          window.markIntentionalSignOut?.(false);
          console.error('로그아웃 오류:', error);
        }
      }
      window.location.href = '/index.html';
    });
  }

  // Load the signed-in user's profile.
  if (typeof supabaseClient !== 'undefined') {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      const { data: profile, error: profileError } = await supabaseClient
        .from('users')
        .select('name, role, status')
        .eq('id', session.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (profile?.status === '퇴직') {
        await signOutRetiredUser();
        return;
      }

      notificationSession = session;
      await refreshNotifications();
      window.setInterval(refreshNotifications, 60000);

      if (profile) {
        const userNameEl = document.getElementById('navUserName');
        const userRoleEl = document.getElementById('navUserRole');
        if (userNameEl) userNameEl.textContent = `${profile.name} 님`;
        if (userRoleEl) {
          userRoleEl.textContent = profile.role === 'admin'
            ? '관리자 (Admin)'
            : profile.role === 'guest'
              ? '게스트'
              : '일반 회원';
        }
      }

      window.setInterval(async () => {
        try {
          const { data: { session: activeSession }, error: sessionError } = await supabaseClient.auth.getSession();
          if (sessionError) throw sessionError;
          if (!activeSession) return;

          const { data: activeProfile, error: activeProfileError } = await supabaseClient
            .from('users')
            .select('status')
            .eq('id', activeSession.user.id)
            .maybeSingle();
          if (activeProfileError) throw activeProfileError;
          if (activeProfile?.status === '퇴직') await signOutRetiredUser();
        } catch (error) {
          console.error('퇴직 상태 확인 오류:', error);
        }
      }, 10 * 60 * 1000);
    }
    supabaseClient.auth.onAuthStateChange((_event, updatedSession) => {
      notificationSession = updatedSession;
      if (updatedSession) refreshNotifications();
      else updateNotificationBadge(0);
    });
  }
});