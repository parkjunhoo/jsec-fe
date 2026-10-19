(() => {
  const nativeFetch = window.fetch.bind(window);
  let activeRequests = 0;
  let showTimer;
  let hideTimer;
  const scriptPromises = new Map();

  function loadScript(src) {
    const existing = scriptPromises.get(src);
    if (existing) return existing;

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    const promise = new Promise((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        scriptPromises.delete(src);
        reject(new Error(`스크립트를 불러오지 못했습니다: ${src}`));
      };
    });
    scriptPromises.set(src, promise);
    document.head.appendChild(script);
    return promise;
  }

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
    loadScript,
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