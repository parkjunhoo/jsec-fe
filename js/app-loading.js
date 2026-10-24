(() => {
  const nativeFetch = window.fetch.bind(window);
  let activeRequests = 0;
  let showTimer;
  let hideTimer;
  const scriptPromises = new Map();

  async function fetchWithoutLoading(...args) {
    const response = await nativeFetch(...args);
    if (response.status === 401) {
      const input = args[0];
      const url = input instanceof Request ? input.url : input;
      try {
        const origin = new URL(url, window.location.href).origin;
        window.dispatchEvent(new CustomEvent('app-unauthorized', { detail: { origin } }));
      } catch (error) {
        console.error('인증 오류 응답 주소 확인 실패:', error);
      }
    }
    return response;
  }

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
    overlay.innerHTML = '<div class="app-loading-panel" role="status"><img class="app-loading-logo" src="/logo.png" alt=""><span>데이터를 불러오는 중...</span><span class="app-loading-progress" aria-hidden="true"></span></div>';
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
    fetchWithoutLoading,
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

  window.fetch = (...args) => window.appLoading.track(() => fetchWithoutLoading(...args));
})();