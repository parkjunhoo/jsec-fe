(() => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/map-config';
  let loadingPromise;

  async function load() {
    if (window.kakao?.maps?.services) return window.kakao;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      const response = await fetch(API_URL, { cache: 'no-store' });
      const config = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(config.error || `카카오 지도를 불러오지 못했습니다. (HTTP ${response.status})`);
      if (typeof config.appKey !== 'string' || !config.appKey.trim()) {
        throw new Error('카카오 지도 JavaScript 키가 설정되지 않았습니다.');
      }

      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const params = new URLSearchParams({
          appkey: config.appKey,
          libraries: 'services',
          autoload: 'false'
        });
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?${params}`;
        script.async = true;
        script.onload = () => {
          if (!window.kakao?.maps?.load) {
            reject(new Error('카카오 지도 SDK를 초기화하지 못했습니다. 앱 키와 등록 도메인을 확인해 주세요.'));
            return;
          }
          window.kakao.maps.load(() => resolve());
        };
        script.onerror = () => reject(new Error('카카오 지도 SDK를 불러오지 못했습니다. 키, 등록 도메인, 네트워크를 확인해 주세요.'));
        document.head.append(script);
      });
      return window.kakao;
    })().catch(error => {
      loadingPromise = null;
      throw error;
    });
    return loadingPromise;
  }

  async function search(query) {
    const kakao = await load();
    return new Promise((resolve, reject) => {
      const places = new kakao.maps.services.Places();
      places.keywordSearch(query, (results, status) => {
        if (status === kakao.maps.services.Status.ZERO_RESULT) {
          resolve([]);
        } else if (status !== kakao.maps.services.Status.OK) {
          reject(new Error('카카오 장소 검색에 실패했습니다. 검색어를 바꾸거나 잠시 후 다시 시도해 주세요.'));
        } else {
          resolve(results.map(result => ({
            name: result.place_name || result.address_name || '검색 위치',
            address: result.road_address_name || result.address_name || '',
            latitude: Number(result.y),
            longitude: Number(result.x),
            url: result.place_url || ''
          })).filter(result => Number.isFinite(result.latitude) && Number.isFinite(result.longitude)));
        }
      });
    });
  }

  window.jsecKakaoMaps = { load, search };
})();
