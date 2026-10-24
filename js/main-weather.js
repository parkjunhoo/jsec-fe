document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/weather';
  const widget = document.getElementById('homeWeather');
  const refreshButton = document.getElementById('homeWeatherRefresh');
  const current = document.getElementById('homeWeatherCurrent');
  const details = document.getElementById('homeWeatherDetails');
  const forecast = document.getElementById('homeWeatherForecast');
  const forecastPrevious = document.getElementById('homeWeatherForecastPrevious');
  const forecastNext = document.getElementById('homeWeatherForecastNext');
  const locationToggle = document.getElementById('homeWeatherLocationToggle');
  const locationForm = document.getElementById('homeWeatherLocationForm');
  const locationInput = document.getElementById('homeWeatherLocationInput');
  const locationSearch = document.getElementById('homeWeatherLocationSearch');
  const locationReset = document.getElementById('homeWeatherLocationReset');
  const locationResults = document.getElementById('homeWeatherLocationResults');
  const locationMessage = document.getElementById('homeWeatherLocationMessage');
  const errorMessage = document.getElementById('homeWeatherError');
  const source = document.getElementById('homeWeatherSource');
  const updated = document.getElementById('homeWeatherUpdated');
  const locationStorageKey = 'jsec-weather-location';
  const defaultLocation = { name: '지산컨트리클럽', latitude: 37.2137, longitude: 127.34099 };
  let selectedLocation = defaultLocation;

  try {
    const savedLocation = JSON.parse(localStorage.getItem(locationStorageKey) || 'null');
    if (savedLocation && typeof savedLocation.name === 'string'
      && Number.isFinite(savedLocation.latitude) && savedLocation.latitude >= 32 && savedLocation.latitude <= 40
      && Number.isFinite(savedLocation.longitude) && savedLocation.longitude >= 123 && savedLocation.longitude <= 133) {
      selectedLocation = {
        name: savedLocation.name.slice(0, 100),
        latitude: savedLocation.latitude,
        longitude: savedLocation.longitude
      };
    }
  } catch (error) {
    console.warn('저장된 날씨 위치를 불러오지 못했습니다.', error);
  }

  function formatValue(value, suffix = '') {
    if (value === null || value === undefined || value === '') return '--';
    const number = Number(value);
    return Number.isFinite(number) ? `${number}${suffix}` : `${value}${suffix}`;
  }

  function formatPrecipitation(value) {
    if (value === null || value === undefined || value === '') return '--';
    const text = String(value).trim();
    if (['강수 없음', '강수없음', '적설 없음', '적설없음', '-'].includes(text)) return '없음';
    if (/^\d+(?:\.\d+)?$/.test(text)) {
      const amount = Number(text);
      return amount === 0 ? '없음' : `${amount} mm`;
    }
    return text.replace(/\s*mm\b/i, ' mm').replace(/\s+/g, ' ').trim();
  }

  function setDetail(label, value) {
    const detail = [...details.children].find(item => item.querySelector('span')?.textContent === label);
    if (detail) detail.querySelector('strong').textContent = value;
  }

  function renderWeather(weather) {
    document.getElementById('homeWeatherTitle').textContent = `${selectedLocation.name} 날씨`;
    current.querySelector('.home-weather-icon').textContent = weather.current.icon || '🌥️';
    current.querySelector('.home-weather-temperature').textContent =
      `${formatValue(weather.current.temperature)}°`;
    current.querySelector('.home-weather-condition').textContent = weather.current.condition || '날씨 정보 없음';
    setDetail('습도', formatValue(weather.current.humidity, '%'));
    setDetail('바람', `${formatValue(weather.current.wind)} m/s`);
    setDetail('강수', formatPrecipitation(weather.current.precipitation));
    setDetail('강수확률', formatValue(weather.current.precipitationProbability, '%'));

    const observedAt = weather.observedAt || '';
    updated.textContent = observedAt.length >= 13
      ? `관측 ${observedAt.slice(4, 6)}.${observedAt.slice(6, 8)} ${observedAt.slice(9, 11)}:${observedAt.slice(11, 13)}`
      : '';

    forecast.replaceChildren();
    if (!weather.hourly?.length) {
      const empty = document.createElement('div');
      empty.className = 'home-weather-hour';
      empty.textContent = '시간별 예보가 없습니다.';
      forecast.append(empty);
    } else {
      weather.hourly.forEach(item => {
        const hour = document.createElement('div');
        hour.className = 'home-weather-hour';
        const time = document.createElement('time');
        time.textContent = item.label;
        const icon = document.createElement('span');
        icon.className = 'home-weather-hour-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = item.icon || '🌥️';
        const temperature = document.createElement('strong');
        temperature.textContent = `${formatValue(item.temperature)}°`;
        const condition = document.createElement('span');
        condition.textContent = item.condition || '';
        const precipitation = document.createElement('span');
        precipitation.className = 'home-weather-hour-precipitation';
        precipitation.textContent = `강수량 ${formatPrecipitation(item.precipitation)}`;
        const probability = document.createElement('span');
        probability.className = 'home-weather-hour-probability';
        probability.textContent = `확률 ${formatValue(item.precipitationProbability, '%')}`;
        hour.append(time, icon, temperature, condition, precipitation, probability);
        forecast.append(hour);
      });
    }
    source.textContent = `${weather.provider || '기상청 동네예보'} · 예보 최대 ${weather.hourly?.length || 0}개 시각 · 이후 예보 간격은 기상청 발표 주기에 따릅니다.`;
  }

  async function loadWeather() {
    refreshButton.disabled = true;
    widget.setAttribute('aria-busy', 'true');
    errorMessage.textContent = '';
    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (!data.session?.access_token) throw new Error('로그인이 필요합니다.');
      const fetcher = window.appLoading?.fetchWithoutLoading || window.fetch;
      const url = new URL(API_URL);
      url.search = new URLSearchParams({
        lat: String(selectedLocation.latitude),
        lon: String(selectedLocation.longitude),
        name: selectedLocation.name
      });
      const response = await fetcher(url, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: 'no-store'
      });
      const weather = await response.json().catch(() => ({}));
      if (response.status === 404) {
        throw new Error('날씨 API 경로가 Worker에 배포되지 않았습니다. Worker를 최신 버전으로 다시 배포해 주세요.');
      }
      if (!response.ok) throw new Error(weather.error || `날씨 조회에 실패했습니다. (HTTP ${response.status})`);
      renderWeather(weather);
    } catch (error) {
      console.error('메인 날씨 조회 오류:', error);
      errorMessage.textContent = `날씨 정보를 불러오지 못했습니다: ${error.message}`;
    } finally {
      refreshButton.disabled = false;
      widget.setAttribute('aria-busy', 'false');
    }
  }

  function slideForecast(direction) {
    const card = forecast.querySelector('.home-weather-hour');
    forecast.scrollBy({
      left: direction * (card ? (card.getBoundingClientRect().width + 7) * 4 : forecast.clientWidth * 0.8),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }

  async function searchLocation(event) {
    event.preventDefault();
    const query = locationInput.value.trim();
    if (!query) return;
    locationSearch.disabled = true;
    locationMessage.textContent = '장소를 검색하고 있습니다...';
    locationResults.replaceChildren();
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({
        q: query,
        format: 'jsonv2',
        limit: '5',
        countrycodes: 'kr',
        'accept-language': 'ko'
      });
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`장소 검색에 실패했습니다. (HTTP ${response.status})`);
      const results = await response.json();
      if (!Array.isArray(results)) throw new Error('장소 검색 응답 형식이 올바르지 않습니다.');
      for (const result of results) {
        const latitude = Number(result.lat);
        const longitude = Number(result.lon);
        if (!Number.isFinite(latitude) || latitude < 32 || latitude > 40
          || !Number.isFinite(longitude) || longitude < 123 || longitude > 133) continue;
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.latitude = String(latitude);
        button.dataset.longitude = String(longitude);
        button.textContent = result.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        item.append(button);
        locationResults.append(item);
      }
      locationMessage.textContent = locationResults.childElementCount
        ? '검색 결과를 선택하면 해당 지역의 날씨를 확인합니다.'
        : '대한민국 내 검색 결과가 없습니다. 다른 주소나 장소명을 입력해 주세요.';
    } catch (error) {
      console.error('날씨 위치 검색 오류:', error);
      locationMessage.textContent = error.message || '위치를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    } finally {
      locationSearch.disabled = false;
    }
  }

  function applySelectedLocation(location) {
    selectedLocation = location;
    let storageNotice = '';
    try {
      if (location === defaultLocation) localStorage.removeItem(locationStorageKey);
      else localStorage.setItem(locationStorageKey, JSON.stringify(location));
    } catch (error) {
      console.error('날씨 위치 저장 오류:', error);
      storageNotice = '위치는 변경했지만 이 기기에 저장하지 못했습니다. 다음 방문 시 기본 위치로 표시됩니다.';
    }
    locationResults.replaceChildren();
    locationMessage.textContent = storageNotice;
    locationForm.hidden = true;
    locationToggle.setAttribute('aria-expanded', 'false');
    loadWeather();
  }

  refreshButton.addEventListener('click', loadWeather);
  forecastPrevious.addEventListener('click', () => slideForecast(-1));
  forecastNext.addEventListener('click', () => slideForecast(1));
  locationToggle.addEventListener('click', () => {
    const isOpening = locationForm.hidden;
    locationForm.hidden = !isOpening;
    locationToggle.setAttribute('aria-expanded', String(isOpening));
    if (isOpening) locationInput.focus();
  });
  locationForm.addEventListener('submit', searchLocation);
  locationResults.addEventListener('click', event => {
    const button = event.target.closest('button[data-latitude][data-longitude]');
    if (!button) return;
    const latitude = Number(button.dataset.latitude);
    const longitude = Number(button.dataset.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    applySelectedLocation({
      name: button.textContent.trim().split(',').slice(0, 3).join(',').slice(0, 100),
      latitude,
      longitude
    });
  });
  locationReset.addEventListener('click', () => applySelectedLocation(defaultLocation));
  await loadWeather();
  window.setInterval(loadWeather, 10 * 60 * 1000);
});
