document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/attendance';
  const punchButton = document.getElementById('homeAttendancePunch');
  if (!punchButton) return;

  const status = document.getElementById('homeAttendanceStatus');
  const statusTitle = document.getElementById('homeAttendanceStatusTitle');
  const statusDetail = document.getElementById('homeAttendanceStatusDetail');
  const buttonTime = document.getElementById('homeAttendanceButtonTime');
  const buttonLabel = document.getElementById('homeAttendanceButtonLabel');
  const buttonDetail = document.getElementById('homeAttendanceButtonDetail');
  const message = document.getElementById('homeAttendanceMessage');
  const webNotice = document.getElementById('homeAttendanceWebNotice');
  const dateLabel = document.getElementById('homeAttendanceDate');
  const bridge = window.AndroidAttendance;
  let device = null;
  let currentRecord = null;
  let busy = false;
  let statusLoaded = false;
  let statusError = '';

  try {
    if (bridge && typeof bridge.getDeviceInfo === 'function') {
      const value = JSON.parse(bridge.getDeviceInfo());
      if (value && typeof value === 'object' && value.model) {
        device = {
          manufacturer: String(value.manufacturer || '').slice(0, 80),
          model: String(value.model).slice(0, 120),
          android_version: String(value.android_version || '').slice(0, 40),
          app_version: String(value.app_version || '').slice(0, 40)
        };
      }
    }
  } catch (error) {
    console.error('앱 기기 정보를 확인하지 못했습니다:', error);
  }

  function getKstDate(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function getPreviousDate(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  }

  function formatDuration(start, end) {
    const durationMinutes = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000));
    const days = Math.floor(durationMinutes / 1440);
    const hours = Math.floor((durationMinutes % 1440) / 60);
    const minutes = durationMinutes % 60;
    return `${days ? `${days}일 ` : ''}${hours}시간 ${minutes}분`;
  }

  function formatTime(date = new Date()) {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).format(date);
  }

  function showMessage(text, state = '') {
    message.textContent = text;
    message.dataset.state = state;
  }

  function render() {
    const now = new Date();
    const today = getKstDate(now);
    const isWorking = Boolean(currentRecord && !currentRecord.check_out_at);
    const isDone = Boolean(currentRecord?.check_out_at);
    const action = isWorking ? 'check-out' : 'check-in';
    const elapsed = isWorking ? formatDuration(currentRecord.check_in_at, now) : '';
    dateLabel.textContent = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    }).format(now);
    status.dataset.state = statusLoaded ? isWorking ? 'working' : isDone ? 'done' : 'idle' : statusError ? 'error' : 'loading';
    statusTitle.textContent = statusLoaded
      ? isWorking ? '근무 중' : isDone ? '근무 완료 · 추가 출근 가능' : '출근 전'
      : statusError ? '근태 상태 확인 실패' : '근태 상태 확인 중';
    statusDetail.textContent = statusLoaded
      ? isWorking
        ? `${currentRecord.location_name || '등록 출근지'} · 퇴근 시 근무 ${elapsed}`
        : isDone
          ? `최근 근무 ${formatDuration(currentRecord.check_in_at, currentRecord.check_out_at)}`
          : '출근 버튼을 누르면 가까운 등록 출근지를 자동 확인합니다.'
      : statusError || '내 근태 기록을 확인하고 있습니다.';

    punchButton.dataset.action = action;
    punchButton.dataset.state = isWorking ? 'check-out' : 'check-in';
    buttonTime.textContent = `현재 시각 ${formatTime(now)}`;
    buttonLabel.textContent = isWorking ? '퇴근하기' : '출근하기';
    buttonDetail.textContent = !statusLoaded
      ? '근태 상태를 확인하는 중입니다'
      : isWorking
        ? `현재 근무 ${elapsed} · 눌러서 퇴근 등록`
        : isDone
          ? `최근 근무 ${formatDuration(currentRecord.check_in_at, currentRecord.check_out_at)} · 다음 출근 등록`
          : `오늘 ${today.replace(/-/g, '.')} · 눌러서 출근 등록`;
    punchButton.setAttribute('aria-label', isWorking
      ? `퇴근하기. 현재 시각 ${formatTime(now)}, 현재 근무 ${elapsed}`
      : `출근하기. 현재 시각 ${formatTime(now)}`);
    punchButton.disabled = busy || !device || !statusLoaded;
  }

  async function request(path = '', options = {}) {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `요청에 실패했습니다. (HTTP ${response.status})`);
    return result;
  }

  async function loadTodayRecord() {
    const today = getKstDate();
    const params = new URLSearchParams({ start: getPreviousDate(today), end: today });
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
    const { data: profile, error: profileError } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', data.session.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || ['guest', 'monitor'].includes(profile.role)) {
      punchButton.hidden = true;
      webNotice.hidden = true;
      statusError = '이 계정은 근태 기능을 사용할 수 없습니다.';
      render();
      return;
    }
    if (profile?.role === 'admin') params.set('user_id', data.session.user.id);
    const result = await request(`/records?${params}`);
    const records = (result.records || []).filter(record => record.user_id === data.session.user.id);
    currentRecord = records.find(record => !record.check_out_at)
      || records.filter(record => record.work_date === today)
        .sort((left, right) => new Date(right.check_in_at) - new Date(left.check_in_at))[0]
      || null;
    statusLoaded = true;
    statusError = '';
    render();
  }

  function getVerifiedPosition() {
    return new Promise((resolve, reject) => {
      if (!window.isSecureContext) {
        reject(new Error('근태 위치 기능은 HTTPS 연결에서만 사용할 수 있습니다.'));
        return;
      }
      if (!navigator.geolocation) {
        reject(new Error('이 기기에서 위치 정보를 사용할 수 없습니다.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(position => {
        if (position.coords.accuracy > 100) {
          reject(new Error(`GPS 정확도가 ${Math.round(position.coords.accuracy)}m입니다. 100m 이내가 되도록 다시 확인해 주세요.`));
          return;
        }
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_m: position.coords.accuracy
        });
      }, error => {
        const errors = {
          1: '위치 권한이 거부되었습니다. 앱 설정에서 위치 권한을 허용해 주세요.',
          2: '현재 위치를 확인할 수 없습니다. GPS를 켜고 다시 시도해 주세요.',
          3: '위치 확인 시간이 초과되었습니다. 다시 시도해 주세요.'
        };
        reject(new Error(errors[error.code] || '현재 위치를 가져오지 못했습니다.'));
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    });
  }

  async function punch() {
    if (busy || !device) return;
    busy = true;
    showMessage('GPS 위치를 확인하고 있습니다.');
    render();
    try {
      const position = await getVerifiedPosition();
      const action = punchButton.dataset.action;
      await request(`/${action}`, {
        method: 'POST',
        body: JSON.stringify({ ...position, device, note: '' })
      });
      showMessage(action === 'check-in' ? '출근이 등록되었습니다.' : '퇴근이 등록되었습니다.', 'success');
      await loadTodayRecord();
    } catch (error) {
      console.error('메인 화면 출퇴근 등록 오류:', error);
      showMessage(error.message || '출퇴근을 등록하지 못했습니다.', 'error');
    } finally {
      busy = false;
      render();
    }
  }

  if (!device) {
    punchButton.hidden = true;
    webNotice.hidden = false;
  } else {
    punchButton.hidden = false;
    webNotice.hidden = true;
    punchButton.addEventListener('click', punch);
  }

  render();
  window.setInterval(render, 1000);
  try {
    await loadTodayRecord();
  } catch (error) {
    console.error('메인 화면 근태 상태 조회 오류:', error);
    statusError = '근태 상태를 불러오지 못했습니다. 아래 근태 관리 페이지에서 확인해 주세요.';
    showMessage(error.message || '근태 상태를 불러오지 못했습니다.', 'error');
    render();
  }
});
