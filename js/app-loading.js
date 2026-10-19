(() => {
  const nativeFetch = window.fetch.bind(window);
  let activeRequests = 0;
  let showTimer;
  let hideTimer;

  function getOverlay() {
    let overlay = document.getElementById('appLoading');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'appLoading';
    overlay.className = 'app-loading';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="app-loading-panel" role="status"><span class="app-loading-spinner" aria-hidden="true"></span><span>데이터를 불러오는 중...</span></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function begin() {
    activeRequests += 1;
    clearTimeout(hideTimer);
    if (activeRequests === 1) {
      showTimer = setTimeout(() => {
        const overlay = getOverlay();
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
      }, 160);
    }

    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      activeRequests = Math.max(0, activeRequests - 1);
      if (activeRequests !== 0) return;

      clearTimeout(showTimer);
      hideTimer = setTimeout(() => {
        const overlay = document.getElementById('appLoading');
        if (!overlay) return;
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
      }, 120);
    };
  }

  window.appLoading = {
    begin,
    fetchWithoutLoading: (...args) => nativeFetch(...args),
    async track(operation) {
      const finish = begin();
      try {
        return await operation();
      } finally {
        finish();
      }
    }
  };

  window.fetch = (...args) => window.appLoading.track(() => nativeFetch(...args));
})();