document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/weather';
  const widget = document.getElementById('homeWeather');
  const refreshButton = document.getElementById('homeWeatherRefresh');
  const current = document.getElementById('homeWeatherCurrent');
  const details = document.getElementById('homeWeatherDetails');
  const forecast = document.getElementById('homeWeatherForecast');
  const errorMessage = document.getElementById('homeWeatherError');
  const source = document.getElementById('homeWeatherSource');
  const updated = document.getElementById('homeWeatherUpdated');

  function formatValue(value, suffix = '') {
    if (value === null || value === undefined || value === '') return '--';
    const number = Number(value);
    return Number.isFinite(number) ? `${number}${suffix}` : `${value}${suffix}`;
  }

  function formatPrecipitation(value) {
    if (value === null || value === undefined || value === '') return '--';
    if (['강수 없음', '강수없음', '적설 없음', '적설없음', '-'].includes(String(value))) return '없음';
    const amount = Number.parseFloat(value);
    return Number.isFinite(amount) ? `${amount} mm` : String(value);
  }

  function setDetail(label, value) {
    const detail = [...details.children].find(item => item.querySelector('span')?.textContent === label);
    if (detail) detail.querySelector('strong').textContent = value;
  }

  function renderWeather(weather) {
    document.getElementById('homeWeatherTitle').textContent = `${weather.location} 날씨`;
    current.querySelector('.home-weather-icon').textContent = weather.current.icon || '🌥️';
    current.querySelector('.home-weather-temperature').textContent =
      `${formatValue(weather.current.temperature)}°`;
    current.querySelector('.home-weather-condition').textContent = weather.current.condition || '날씨 정보 없음';
    setDetail('습도', formatValue(weather.current.humidity, '%'));
    setDetail('바람', `${formatValue(weather.current.wind)} m/s`);
    setDetail('강수', formatPrecipitation(weather.current.precipitation));

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
        hour.append(time, icon, temperature, condition);
        forecast.append(hour);
      });
    }
    source.textContent = `${weather.provider || '기상청 동네예보'} · 시간별 예보는 발표 주기에 따라 달라질 수 있습니다.`;
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
      const response = await fetcher(API_URL, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: 'no-store'
      });
      const weather = await response.json().catch(() => ({}));
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

  refreshButton.addEventListener('click', loadWeather);
  await loadWeather();
  window.setInterval(loadWeather, 10 * 60 * 1000);
});
