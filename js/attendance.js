document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/attendance';
  const todayStatus = document.getElementById('attendanceTodayStatus');
  const todayDuration = document.getElementById('attendanceTodayDuration');
  const punchMessage = document.getElementById('attendancePunchMessage');
  const punchButton = document.getElementById('attendancePunchToggle');
  const appPunchControls = document.getElementById('attendanceAppPunchControls');
  const webPunchNotice = document.getElementById('attendanceWebPunchNotice');
  const todayDateLabel = document.getElementById('attendanceTodayDate');
  const homeDateLabel = document.getElementById('attendanceHomeDate');
  const currentTimeLabel = document.getElementById('attendanceCurrentTime');
  const liveTimeLabel = document.getElementById('attendanceLiveTime');
  const checkInTimeLabel = document.getElementById('attendanceCheckInTime');
  const punchLabel = document.getElementById('attendancePunchLabel');
  const profileName = document.getElementById('attendanceProfileName');
  const profileMeta = document.getElementById('attendanceProfileMeta');
  const monthInput = document.getElementById('attendanceMonth');
  const personalHistory = document.getElementById('attendancePersonalHistory');
  const personalSummary = document.getElementById('attendancePersonalSummary');
  const personalRecords = document.getElementById('attendancePersonalRecords');
  const adminRecordsTable = document.getElementById('attendanceAdminRecordsTable');
  const userFilterField = document.getElementById('attendanceUserFilterField');
  const userFilter = document.getElementById('attendanceUserFilter');
  const recordsBody = document.getElementById('attendanceRecords');
  const historyMessage = document.getElementById('attendanceHistoryMessage');
  const siteSettings = document.getElementById('attendanceSiteSettings');
  const attendanceAdminPanel = document.getElementById('attendanceAdminPanel');
  const attendanceAdminTab = document.getElementById('attendanceAdminTab');
  const siteFields = document.getElementById('attendanceSiteFields');
  const siteForm = document.getElementById('attendanceSiteForm');
  const siteMessage = document.getElementById('attendanceSiteMessage');
  const saveSitesButton = document.getElementById('attendanceSaveSites');
  const addSiteButton = document.getElementById('attendanceAddSite');
  const addRecordButton = document.getElementById('attendanceAddRecord');
  const createDialog = document.getElementById('attendanceCreateDialog');
  const createForm = document.getElementById('attendanceCreateForm');
  const createMessage = document.getElementById('attendanceCreateMessage');
  const createSaveButton = document.getElementById('attendanceCreateSave');
  const createUser = document.getElementById('attendanceCreateUser');
  const createSite = document.getElementById('attendanceCreateSite');
  const mapDialog = document.getElementById('attendanceMapDialog');
  const mapMessage = document.getElementById('attendanceMapMessage');
  const mapConfirmButton = document.getElementById('attendanceMapConfirm');
  const mapSearchForm = document.getElementById('attendanceMapSearchForm');
  const mapSearchInput = document.getElementById('attendanceMapSearchInput');
  const mapSearchButton = document.getElementById('attendanceMapSearchButton');
  const mapSearchResults = document.getElementById('attendanceMapSearchResults');
  const recordMapDialog = document.getElementById('attendanceRecordMapDialog');
  const recordMapTitle = document.getElementById('attendanceRecordMapTitle');
  const recordMapDetails = document.getElementById('attendanceRecordMapDetails');
  let recordMap = null;
  let recordMapMarker = null;
  let recordMapAccuracyCircle = null;
  const editDialog = document.getElementById('attendanceEditDialog');
  const editForm = document.getElementById('attendanceEditForm');
  const editMessage = document.getElementById('attendanceEditMessage');
  const editSaveButton = document.getElementById('attendanceEditSave');
  let isAdmin = false;
  let adminUsers = [];
  let sites = [];
  let records = [];
  let personalRecordsData = [];
  let weeklyRecords = [];
  let todayRecord = null;
  let currentUserId = '';
  let attendanceDevice = null;
  let busy = false;
  let mapPicker = null;
  let mapMarker = null;
  let mapRadius = null;
  let mapTargetCard = null;
  let mapSelection = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  async function deleteAttendanceRecord(record) {
    const reason = window.prompt(`${record.username} · ${record.work_date} 근태 기록 삭제 사유를 입력해 주세요.`);
    if (reason === null) return;
    if (!reason.trim()) {
      historyMessage.textContent = '삭제 사유를 입력해야 합니다.';
      return;
    }
    if (!window.confirm('선택한 근태 기록을 삭제할까요? 기록은 목록에서 숨겨지고 감사 기록은 보존됩니다.')) return;

    historyMessage.textContent = '';
    try {
      await request(`/records/${encodeURIComponent(record.id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: reason.trim() })
      });
      historyMessage.textContent = '근태 기록을 삭제했습니다. 감사 기록은 보존되었습니다.';
      historyMessage.style.color = 'var(--primary)';
      await loadRecords();
      if (record.user_id === currentUserId) await loadTodayRecord();
    } catch (error) {
      console.error('근태 기록 삭제 오류:', error);
      historyMessage.textContent = error.message || '근태 기록을 삭제하지 못했습니다.';
      historyMessage.style.color = 'var(--danger)';
    }
  }

  function getAttendanceDevice() {
    const bridge = window.AndroidAttendance;
    if (!bridge || typeof bridge.getDeviceInfo !== 'function') return null;
    try {
      const device = JSON.parse(bridge.getDeviceInfo());
      if (!device || typeof device !== 'object' || !device.model) return null;
      return {
        manufacturer: String(device.manufacturer || '').slice(0, 80),
        model: String(device.model).slice(0, 120),
        android_version: String(device.android_version || '').slice(0, 40),
        app_version: String(device.app_version || '').slice(0, 40)
      };
    } catch (error) {
      console.error('앱 기기 정보를 확인하지 못했습니다:', error);
      return null;
    }
  }

  function formatDeviceInfo(device) {
    if (!device) return '기기 정보 없음';
    const manufacturerModel = [device.manufacturer, device.model].filter(Boolean).join(' ');
    const details = [manufacturerModel, device.android_version ? `Android ${device.android_version}` : '', device.app_version ? `앱 ${device.app_version}` : '']
      .filter(Boolean);
    return details.join(' · ') || '기기 정보 없음';
  }

  function getKstParts(date = new Date()) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).map(part => [part.type, part.value]));
  }

  function getKstDate() {
    const { year, month, day } = getKstParts();
    return `${year}-${month}-${day}`;
  }

  function getPreviousKstDate(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  }

  function getCurrentMonth() {
    const { year, month } = getKstParts();
    return `${year}-${month}`;
  }

  function getKoreaDateTimeInput() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  function getMonthRange(value) {
    const [year, month] = value.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    };
  }

  function getCurrentWeekRange() {
    const today = getKstDate();
    const todayDate = new Date(`${today}T12:00:00Z`);
    const mondayOffset = (todayDate.getUTCDay() + 6) % 7;
    const weekStart = new Date(todayDate);
    weekStart.setUTCDate(todayDate.getUTCDate() - mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    return { start: weekStart.toISOString().slice(0, 10), end: weekEnd.toISOString().slice(0, 10) };
  }

  function formatDateTime(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23', timeZone: 'Asia/Seoul'
    }).format(new Date(value));
  }

  function formatWorkDuration(start, end) {
    const durationMinutes = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000));
    const days = Math.floor(durationMinutes / 1440);
    const hours = Math.floor((durationMinutes % 1440) / 60);
    const minutes = durationMinutes % 60;
    return `${days ? `${days}일 ` : ''}${hours}시간 ${minutes}분`;
  }

  function formatWorkDate(value) {
    const date = new Date(`${value}T12:00:00+09:00`);
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'short'
    }).format(date);
  }

  function formatPunchTime(value, workDate) {
    if (!value) return '미기록';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
    const time = `${parts.hour}:${parts.minute}`;
    const punchDate = `${parts.year}-${parts.month}-${parts.day}`;
    return punchDate === workDate ? time : `${parts.month}.${parts.day} ${time}`;
  }

  function getTotalWorkMinutes() {
    const sourceRecords = isAdmin ? personalRecordsData : records;
    return sourceRecords.reduce((total, record) => {
      const end = record.check_out_at ? new Date(record.check_out_at).getTime() : Date.now();
      const start = new Date(record.check_in_at).getTime();
      return total + (Number.isFinite(start) && Number.isFinite(end)
        ? Math.max(0, Math.floor((end - start) / 60000))
        : 0);
    }, 0);
  }

  function renderPersonalMetrics() {
    const totalMinutes = getTotalWorkMinutes();
    const formatMinutes = minutes => `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
    const monthTotal = formatMinutes(totalMinutes);
    const monthlyLabel = document.getElementById('attendanceMonthlyWorkTime');
    const homeMonthlyLabel = document.getElementById('attendanceMonthlyWorkTimeHome');
    if (monthlyLabel) monthlyLabel.textContent = monthTotal;
    if (homeMonthlyLabel) homeMonthlyLabel.textContent = monthTotal;
    const { start, end } = getCurrentWeekRange();
    const weeklyMinutes = weeklyRecords
      .reduce((total, record) => {
        const finish = record.check_out_at ? new Date(record.check_out_at).getTime() : Date.now();
        return total + Math.max(0, Math.floor((finish - new Date(record.check_in_at).getTime()) / 60000));
      }, 0);
    const weeklyLabel = document.getElementById('attendanceWeeklyWorkTime');
    if (weeklyLabel) weeklyLabel.textContent = formatMinutes(weeklyMinutes);
  }

  function formatDateForInput(value) {
    if (!value) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(value));
    const dateParts = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${dateParts.year}-${dateParts.month}-${dateParts.day}T${dateParts.hour}:${dateParts.minute}`;
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

  function setBusy(nextBusy) {
    busy = nextBusy;
    punchButton.disabled = busy;
  }

  function renderSites() {
    if (isAdmin) {
      document.getElementById('attendanceEditSite').innerHTML = sites
        .map(site => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}${site.enabled ? '' : ' (보관됨)'}</option>`)
        .join('');
    }
    punchButton.disabled = busy;
  }

  function renderTodayStatus() {
    const record = todayRecord;
    const title = todayStatus.querySelector('strong');
    const detail = todayStatus.querySelector('span');
    const now = new Date();
    todayDateLabel.textContent = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    }).format(now);
    const currentTime = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).format(now);
    currentTimeLabel.textContent = `현재 시각 ${currentTime}`;
    liveTimeLabel.textContent = currentTime;
    homeDateLabel.textContent = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short'
    }).format(now);
    checkInTimeLabel.textContent = record ? formatPunchTime(record.check_in_at, record.work_date) : '--:--';
    if (!record) {
      title.textContent = '출근 전';
      detail.textContent = '현재 위치를 확인해 출근을 등록해 주세요.';
      todayDuration.textContent = '';
    } else if (!record.check_out_at) {
      title.textContent = '근무 중';
      const elapsed = formatWorkDuration(record.check_in_at, now);
      detail.textContent = `${record.location_name} · 출근 ${formatDateTime(record.check_in_at)}${record.work_date !== getKstDate() ? ' (전날 출근)' : ''}`;
      todayDuration.textContent = `현재까지 근무시간 ${elapsed}`;
    } else {
      const duration = formatWorkDuration(record.check_in_at, record.check_out_at);
      title.textContent = '근무 완료 · 다음 출근 가능';
      detail.textContent = `${record.location_name} · ${formatDateTime(record.check_in_at)} ~ ${formatDateTime(record.check_out_at)} · 근무 ${duration}`;
      todayDuration.textContent = '';
    }
    const isCheckingOut = Boolean(record && !record.check_out_at);
    punchButton.dataset.action = isCheckingOut ? 'check-out' : 'check-in';
    punchLabel.textContent = isCheckingOut ? '퇴근' : '출근';
    punchButton.setAttribute('aria-label', isCheckingOut
      ? `현재 위치로 퇴근하기. 퇴근 시 근무시간 ${formatWorkDuration(record.check_in_at, now)}`
      : '현재 위치로 출근하기');
    punchButton.disabled = busy;
  }

  function renderRecords() {
    personalHistory.hidden = false;
    adminRecordsTable.hidden = !isAdmin;
    addRecordButton.hidden = !isAdmin;
    renderPersonalMetrics();
    const displayRecords = isAdmin ? personalRecordsData : records;
    const completedCount = displayRecords.filter(record => record.check_out_at).length;
    const inProgressCount = displayRecords.length - completedCount;
    personalSummary.textContent = `${monthInput.value.replace('-', '.')} · ${displayRecords.length}건 · 퇴근 완료 ${completedCount} · 근무 중 ${inProgressCount} · 휴게시간 미차감`;
    const [selectedYear, selectedMonth] = monthInput.value.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(selectedYear, selectedMonth, 0)).getUTCDate();
    const recordsByDate = new Map(displayRecords.map(record => [record.work_date, record]));
    const currentTime = Date.now();
    personalRecords.innerHTML = Array.from({ length: daysInMonth }, (_, index) => {
      const workDate = `${monthInput.value}-${String(index + 1).padStart(2, '0')}`;
      const record = recordsByDate.get(workDate);
      if (!record) {
        return `
          <article class="attendance-personal-record empty">
            <div>
              <div class="attendance-personal-record-heading">
                <span>${escapeHtml(formatWorkDate(workDate))}</span>
                <span class="attendance-record-status empty">기록 없음</span>
              </div>
              <div class="attendance-personal-record-site">등록된 근무기록이 없습니다.</div>
            </div>
            <div class="attendance-personal-record-duration">-</div>
            <div class="attendance-personal-record-times">
              <div>출근<strong>--:--</strong></div>
              <div>퇴근<strong>--:--</strong></div>
            </div>
          </article>`;
      }
      const status = record.check_out_at ? '퇴근 완료' : '근무 중';
      const duration = record.check_out_at
        ? formatWorkDuration(record.check_in_at, record.check_out_at)
        : `${formatWorkDuration(record.check_in_at, currentTime)} · 진행 중`;
      return `
        <article class="attendance-personal-record">
          <div>
            <div class="attendance-personal-record-heading">
              <span>${escapeHtml(formatWorkDate(record.work_date))}</span>
              <span class="attendance-record-status ${record.check_out_at ? '' : 'open'}">${status}</span>
            </div>
            <div class="attendance-personal-record-site">${escapeHtml(record.location_name)}</div>
          </div>
          <div class="attendance-personal-record-duration">${duration}</div>
          <div class="attendance-personal-record-times">
            <div>출근<strong>${escapeHtml(formatPunchTime(record.check_in_at, record.work_date))}</strong></div>
            <div>퇴근<strong>${escapeHtml(formatPunchTime(record.check_out_at, record.work_date))}</strong></div>
          </div>
        </article>`;
    }).join('');
    const adminDisplayRecords = isAdmin && !userFilter.value
      ? records.filter(record => record.user_id !== currentUserId)
      : records;
    if (!adminDisplayRecords.length) {
      recordsBody.innerHTML = '<div class="attendance-empty">해당 기간의 출퇴근 기록이 없습니다.</div>';
      return;
    }
    recordsBody.innerHTML = adminDisplayRecords.map(record => {
      const status = record.check_out_at ? '퇴근 완료' : '근무 중';
      const duration = formatWorkDuration(record.check_in_at, record.check_out_at || currentTime);
      const checkInLocation = record.check_in_latitude == null
        ? 'GPS 미수집 · 관리자 추가 기록'
        : `정확도 ${Math.round(record.check_in_accuracy_m)}m · 거리 ${Math.round(record.check_in_distance_m)}m`;
      const checkOutLocation = !record.check_out_at
        ? '퇴근 전'
        : record.check_out_latitude == null
          ? 'GPS 미수집 · 관리자 추가 기록'
          : `정확도 ${Math.round(record.check_out_accuracy_m)}m · 거리 ${Math.round(record.check_out_distance_m)}m`;
      return `
        <article class="attendance-admin-record">
          <header class="attendance-admin-record-header">
            <div class="attendance-admin-record-identity">
              <strong class="attendance-admin-record-date">${escapeHtml(formatWorkDate(record.work_date))}</strong>
              <span class="attendance-admin-record-user">${escapeHtml(record.username || '직원')}</span>
              <div class="attendance-admin-record-site">${escapeHtml(record.location_name)}</div>
            </div>
            <span class="attendance-admin-record-status ${record.check_out_at ? '' : 'open'}">${status}</span>
          </header>
          <div class="attendance-admin-record-times">
            <div class="attendance-admin-record-time">
              <span>출근</span><strong>${escapeHtml(formatPunchTime(record.check_in_at, record.work_date))}</strong>
              <small>${escapeHtml(checkInLocation)}</small>
            </div>
            <div class="attendance-admin-record-time">
              <span>퇴근</span><strong>${escapeHtml(formatPunchTime(record.check_out_at, record.work_date))}</strong>
              <small>${escapeHtml(checkOutLocation)}</small>
            </div>
          </div>
          <div class="attendance-admin-record-footer">
            <div class="attendance-admin-record-meta">
              <strong>근무 ${escapeHtml(duration)}</strong>
              ${record.note ? `<span class="attendance-admin-record-note">${escapeHtml(record.note)}</span>` : ''}
            </div>
            <div class="attendance-admin-record-tools">
              ${record.check_in_latitude != null ? `<button class="attendance-button" type="button" data-attendance-gps="${escapeHtml(record.id)}" data-gps-action="check-in">출근 위치</button>` : ''}
              ${record.check_out_latitude != null ? `<button class="attendance-button" type="button" data-attendance-gps="${escapeHtml(record.id)}" data-gps-action="check-out">퇴근 위치</button>` : ''}
            </div>
          </div>
          <details class="attendance-admin-record-details">
            <summary>기기 정보</summary>
            <div class="attendance-admin-record-details-body">
              <span>출근 · ${escapeHtml(formatDeviceInfo(record.check_in_device))}</span>
              ${record.check_out_at ? `<span>퇴근 · ${escapeHtml(formatDeviceInfo(record.check_out_device))}</span>` : ''}
            </div>
          </details>
          <footer class="attendance-admin-record-actions">
            <button class="attendance-button" type="button" data-edit-attendance="${escapeHtml(record.id)}">기록 수정</button>
            <button class="attendance-button danger" type="button" data-delete-attendance="${escapeHtml(record.id)}">기록 삭제</button>
          </footer>
        </article>`;
    }).join('');
  }

  function renderSiteSettings() {
    const activeSites = sites
      .map((site, index) => ({ site, index }))
      .filter(({ site }) => site.enabled);
    siteFields.innerHTML = activeSites.length ? activeSites.map(({ site, index }) => `
      <article class="attendance-site" data-site-index="${index}">
        <h3>${site.site_number ? `출근지 ${site.site_number}` : '새 출근지'}</h3>
        <div class="attendance-site-fields">
          <label class="attendance-field">출근지 이름
            <input type="text" maxlength="80" required data-site-name value="${escapeHtml(site.name)}">
          </label>
          <div class="attendance-coordinate-grid">
            <label class="attendance-field">위도
              <input type="number" min="-90" max="90" step="any" data-site-latitude value="${site.latitude ?? ''}" placeholder="예: 37.123456">
            </label>
            <label class="attendance-field">경도
              <input type="number" min="-180" max="180" step="any" data-site-longitude value="${site.longitude ?? ''}" placeholder="예: 127.123456">
            </label>
          </div>
          <label class="attendance-field">반경 (m, 20~1000)
            <input type="number" min="20" max="1000" step="1" required data-site-radius value="${site.radius_m}">
          </label>
          <button class="attendance-button" type="button" data-open-site-map>지도에서 위치 선택</button>
          <button class="attendance-button" type="button" data-set-current-location>이 기기의 현재 위치로 지정</button>
          <p class="attendance-location-help" data-location-message>${site.latitude == null ? '위치 미설정' : `위도 ${site.latitude}, 경도 ${site.longitude}`}</p>
          ${site.id ? '<button class="attendance-button" type="button" data-delete-site>출근지 삭제</button>' : '<button class="attendance-button" type="button" data-remove-new-site>추가 취소</button>'}
        </div>
      </article>
    `).join('') : '<p class="attendance-empty">등록된 출근지가 없습니다. 출근지를 추가해 주세요.</p>';
  }

  function updateMapPreview(latitude, longitude, radius) {
    if (!window.kakao?.maps || !mapPicker) return;
    const point = new window.kakao.maps.LatLng(latitude, longitude);
    if (!mapMarker) mapMarker = new window.kakao.maps.Marker({ position: point, map: mapPicker });
    else {
      mapMarker.setPosition(point);
      mapMarker.setMap(mapPicker);
    }
    if (!mapRadius) {
      mapRadius = new window.kakao.maps.Circle({
        map: mapPicker,
        center: point,
        radius,
        strokeWeight: 2,
        strokeColor: '#197a52',
        strokeOpacity: 0.8,
        fillColor: '#197a52',
        fillOpacity: 0.12
      });
    } else {
      mapRadius.setPosition(point);
      mapRadius.setRadius(radius);
      mapRadius.setMap(mapPicker);
    }
  }

  async function openSiteMap(card) {
    mapTargetCard = card;
    mapMessage.textContent = '';
    mapSearchInput.value = '';
    mapSearchResults.replaceChildren();
    mapSelection = null;
    mapConfirmButton.disabled = true;
    mapDialog.showModal();
    try {
      await window.jsecKakaoMaps.load();
      const latitudeValue = card.querySelector('[data-site-latitude]').value;
      const longitudeValue = card.querySelector('[data-site-longitude]').value;
      const latitude = Number(latitudeValue);
      const longitude = Number(longitudeValue);
      const hasCoordinates = latitudeValue !== '' && longitudeValue !== ''
        && Number.isFinite(latitude) && Number.isFinite(longitude);
      const center = new window.kakao.maps.LatLng(
        hasCoordinates ? latitude : 36.5,
        hasCoordinates ? longitude : 127.5
      );
      if (!mapPicker) {
        mapPicker = new window.kakao.maps.Map(document.getElementById('attendanceMap'), {
          center,
          level: hasCoordinates ? 3 : 13
        });
        window.kakao.maps.event.addListener(mapPicker, 'click', event => {
          const point = event.latLng;
          mapSelection = { lat: point.getLat(), lng: point.getLng() };
          updateMapPreview(mapSelection.lat, mapSelection.lng, Number(mapTargetCard?.querySelector('[data-site-radius]').value) || 100);
          mapMessage.textContent = `선택한 좌표: ${mapSelection.lat.toFixed(6)}, ${mapSelection.lng.toFixed(6)}`;
          mapConfirmButton.disabled = false;
        });
      } else {
        mapPicker.setCenter(center);
        mapPicker.setLevel(hasCoordinates ? 3 : 13);
      }
      if (hasCoordinates) {
        mapSelection = { lat: latitude, lng: longitude };
        updateMapPreview(latitude, longitude, Number(card.querySelector('[data-site-radius]').value) || 100);
        mapMessage.textContent = `현재 좌표: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        mapConfirmButton.disabled = false;
      } else {
        mapMarker?.setMap(null);
        mapRadius?.setMap(null);
        mapMarker = null;
        mapRadius = null;
      }
      window.setTimeout(() => {
        mapPicker.relayout();
        mapPicker.setCenter(center);
      }, 0);
    } catch (error) {
      console.error('카카오 지도 초기화 오류:', error);
      mapMessage.textContent = `${error.message} 지도 키와 등록 도메인을 설정하거나 위도·경도를 직접 입력해 주세요.`;
    }
  }

  async function searchMapLocation(event) {
    event.preventDefault();
    const query = mapSearchInput.value.trim();
    if (!query) return;
    mapSearchButton.disabled = true;
    mapMessage.textContent = '장소를 검색하고 있습니다...';
    mapSearchResults.replaceChildren();
    try {
      const results = await window.jsecKakaoMaps.search(query);
      if (!results.length) {
        mapMessage.textContent = '검색 결과가 없습니다. 다른 주소나 장소명을 입력해 주세요.';
        return;
      }
      for (const result of results) {
        const latitude = result.latitude;
        const longitude = result.longitude;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.latitude = String(latitude);
        button.dataset.longitude = String(longitude);
        button.dataset.name = result.name;
        button.textContent = [result.name, result.address].filter(Boolean).join(' · ');
        item.append(button);
        mapSearchResults.append(item);
      }
      if (!mapSearchResults.childElementCount) throw new Error('사용할 수 있는 검색 결과가 없습니다.');
      mapMessage.textContent = '검색 결과를 선택하면 지도가 해당 위치로 이동합니다.';
    } catch (error) {
      console.error('출근지 지도 검색 오류:', error);
      mapMessage.textContent = error.message || '장소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    } finally {
      mapSearchButton.disabled = false;
    }
  }

  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('이 브라우저는 위치 정보를 지원하지 않습니다.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, error => {
        const messages = {
          1: '위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.',
          2: '현재 위치를 확인할 수 없습니다. GPS를 켜고 다시 시도해 주세요.',
          3: '위치 확인 시간이 초과되었습니다. 다시 시도해 주세요.'
        };
        reject(new Error(messages[error.code] || '현재 위치를 가져오지 못했습니다.'));
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    });
  }

  async function getVerifiedPosition() {
    if (!window.isSecureContext) throw new Error('근태 관리의 위치 기능은 HTTPS 연결에서만 사용할 수 있습니다.');
    const position = await getCurrentPosition();
    if (position.coords.accuracy > 100) {
      throw new Error(`GPS 정확도가 ${Math.round(position.coords.accuracy)}m입니다. 100m 이내가 되도록 다시 확인해 주세요.`);
    }
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy_m: position.coords.accuracy
    };
  }

  async function loadSites() {
    sites = await request('/sites');
    renderSites();
    if (isAdmin) renderSiteSettings();
  }

  async function loadRecords() {
    historyMessage.textContent = '';
    const { start, end } = getMonthRange(monthInput.value);
    const params = new URLSearchParams({ start, end });
    if (isAdmin && userFilter.value) params.set('user_id', userFilter.value);
    recordsBody.innerHTML = '<div class="attendance-empty">기록을 불러오는 중입니다.</div>';
    try {
      const result = await request(`/records?${params}`);
      records = result.records || [];
      isAdmin = result.isAdmin === true;
      renderRecords();
    } catch (error) {
      console.error('근태 기록 조회 오류:', error);
      historyMessage.textContent = error.message || '근태 기록을 불러오지 못했습니다.';
      recordsBody.innerHTML = '<div class="attendance-empty">기록을 불러오지 못했습니다.</div>';
    }
  }

  async function loadPersonalRecords() {
    const { start, end } = getMonthRange(monthInput.value);
    const params = new URLSearchParams({ start, end });
    if (isAdmin) params.set('user_id', currentUserId);
    const result = await request(`/records?${params}`);
    personalRecordsData = result.records || [];
    renderRecords();
  }

  async function loadWeeklyRecords() {
    const { start, end } = getCurrentWeekRange();
    const params = new URLSearchParams({ start, end });
    if (isAdmin) params.set('user_id', currentUserId);
    const result = await request(`/records?${params}`);
    weeklyRecords = result.records || [];
    renderPersonalMetrics();
  }

  async function loadTodayRecord() {
    const today = getKstDate();
    const params = new URLSearchParams({ start: getPreviousKstDate(today), end: today });
    if (isAdmin) params.set('user_id', currentUserId);
    const result = await request(`/records?${params}`);
    const userRecords = (result.records || []).filter(item => item.user_id === currentUserId);
    todayRecord = userRecords.find(item => !item.check_out_at)
      || userRecords.find(item => item.work_date === today)
      || null;
    renderTodayStatus();
  }

  async function loadAnnualLeaveBalance() {
    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (!data.session?.access_token) throw new Error('로그인이 필요합니다.');
      const response = await fetch('https://jsec-serverless.adobephotoshop.workers.dev/api/annual-leave', {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `연차 조회에 실패했습니다. (HTTP ${response.status})`);
      const balance = (result.balances || []).find(item => item.user_id === currentUserId);
      if (!balance) throw new Error('내 연차 현황을 찾을 수 없습니다.');
      document.getElementById('attendanceAnnualLeaveBalance').textContent =
        balance.remaining_days == null ? '산정 불가' : `${balance.remaining_days}일`;
      document.getElementById('attendanceAnnualLeaveDetail').textContent = balance.annual_base_date
        ? `총 ${balance.entitled_days ?? '--'}일 · 사용 ${balance.used_days}일 · 입사 ${balance.annual_base_date}`
        : '연차 기준일이 등록되지 않았습니다.';
    } catch (error) {
      console.error('근태 화면 연차 현황 조회 오류:', error);
      document.getElementById('attendanceAnnualLeaveBalance').textContent = '조회 실패';
      document.getElementById('attendanceAnnualLeaveDetail').textContent =
        error.message || '연차 관리 페이지에서 다시 확인해 주세요.';
    }
  }

  async function punch(action) {
    if (busy) return;
    if (!attendanceDevice) {
      punchMessage.textContent = '출퇴근 등록은 Android 앱에서만 가능합니다. 웹에서는 근태 기록만 확인해 주세요.';
      return;
    }
    punchMessage.textContent = '';
    setBusy(true);
    try {
      const position = await getVerifiedPosition();
      await request(`/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          ...position,
          device: attendanceDevice
        })
      });
      punchMessage.textContent = action === 'check-in' ? '출근이 기록되었습니다.' : '퇴근이 기록되었습니다.';
      punchMessage.style.color = 'var(--primary)';
      await Promise.all([loadRecords(), loadTodayRecord(), loadWeeklyRecords()]);
    } catch (error) {
      console.error('출퇴근 등록 오류:', error);
      punchMessage.textContent = error.message || '출퇴근을 기록하지 못했습니다.';
      punchMessage.style.color = 'var(--danger)';
    } finally {
      setBusy(false);
      renderTodayStatus();
    }
  }

  function populateAdminUserFilter(users) {
    adminUsers = users.filter(user =>
      !['guest', 'monitor'].includes(user.role) && user.status !== '퇴직'
    );
    userFilter.innerHTML = '<option value="">전체 직원</option>' + users
      .filter(user => !['guest', 'monitor'].includes(user.role))
      .map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name || user.username || '이름 없음')}</option>`)
      .join('');
    createUser.innerHTML = '<option value="">직원 선택</option>' + adminUsers
      .map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name || user.username || '이름 없음')}</option>`)
      .join('');
    createSite.innerHTML = '<option value="">출근지 선택</option>' + sites
      .map(site => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}${site.enabled ? '' : ' (보관됨)'}</option>`)
      .join('');
  }

  function openCreateDialog() {
    createForm.reset();
    createMessage.textContent = '';
    document.getElementById('attendanceCreateCheckIn').value = getKoreaDateTimeInput();
    document.getElementById('attendanceCreateCheckOut').value = '';
    createDialog.showModal();
  }

  function openEditDialog(record) {
    document.getElementById('attendanceEditRecordId').value = record.id;
    document.getElementById('attendanceEditSite').value = record.location_id;
    document.getElementById('attendanceEditCheckIn').value = formatDateForInput(record.check_in_at);
    document.getElementById('attendanceEditCheckOut').value = formatDateForInput(record.check_out_at);
    document.getElementById('attendanceEditNote').value = record.note || '';
    document.getElementById('attendanceEditReason').value = '';
    editMessage.textContent = '';
    editDialog.showModal();
  }

  async function openRecordMap(record, action) {
    const isCheckIn = action === 'check-in';
    const prefix = isCheckIn ? 'check_in' : 'check_out';
    const latitude = record[`${prefix}_latitude`];
    const longitude = record[`${prefix}_longitude`];
    if (latitude == null || longitude == null) return;

    const timestamp = isCheckIn ? record.check_in_at : record.check_out_at;
    const accuracy = isCheckIn ? record.check_in_accuracy_m : record.check_out_accuracy_m;
    const distance = isCheckIn ? record.check_in_distance_m : record.check_out_distance_m;
    recordMapTitle.textContent = `${isCheckIn ? '출근' : '퇴근'} GPS 위치`;
    recordMapDetails.textContent =
      `${record.username} · ${record.location_name} · ${formatDateTime(timestamp)}\n`
      + `위도 ${Number(latitude).toFixed(6)}, 경도 ${Number(longitude).toFixed(6)} · `
      + `GPS 정확도 약 ${Math.round(accuracy)}m · 출근지까지 ${Math.round(distance)}m`;
    recordMapDialog.showModal();
    try {
      await window.jsecKakaoMaps.load();
    } catch (error) {
      console.error('카카오 근태 지도 초기화 오류:', error);
      recordMapDetails.textContent += `\n${error.message} 좌표를 참고해 주세요.`;
      return;
    }

    const point = new window.kakao.maps.LatLng(latitude, longitude);
    if (!recordMap) {
      recordMap = new window.kakao.maps.Map(document.getElementById('attendanceRecordMap'), {
        center: point,
        level: 3
      });
      recordMapMarker = new window.kakao.maps.Marker({ position: point, map: recordMap });
      recordMapAccuracyCircle = new window.kakao.maps.Circle({
        map: recordMap,
        center: point,
        radius: accuracy,
        strokeWeight: 2,
        strokeColor: '#d24d57',
        strokeOpacity: 0.8,
        fillColor: '#d24d57',
        fillOpacity: 0.12
      });
    } else {
      recordMap.setCenter(point);
      recordMap.setLevel(3);
      recordMapMarker.setPosition(point);
      recordMapAccuracyCircle.setPosition(point);
      recordMapAccuracyCircle.setRadius(accuracy);
    }
    window.setTimeout(() => {
      recordMap.relayout();
      recordMap.setCenter(point);
    }, 0);
  }

  attendanceDevice = getAttendanceDevice();
  appPunchControls.hidden = !attendanceDevice;
  webPunchNotice.hidden = Boolean(attendanceDevice);
  monthInput.value = getCurrentMonth();
  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !sessionData.session) {
    window.location.replace('/index.html');
    return;
  }
  currentUserId = sessionData.session.user.id;
  try {
    const { data: profile, error: profileError } = await supabaseClient
      .from('users')
      .select('role, name, username, job_title, work_location')
      .eq('id', currentUserId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || ['guest', 'monitor'].includes(profile.role)) {
      document.getElementById('attendancePunchCard').hidden = true;
      const headingMessage = document.getElementById('attendanceHeadingMessage');
      if (headingMessage) headingMessage.textContent = '이 계정은 근태 기능을 사용할 수 없습니다.';
      historyMessage.textContent = '근태 기능을 사용할 권한이 없습니다.';
      return;
    }
    profileName.textContent = profile.name || profile.username || '사용자';
    profileMeta.textContent = [profile.job_title, profile.work_location].filter(Boolean).join(' · ') || '근무지 미등록';
    isAdmin = profile.role === 'admin';
    document.body.classList.toggle('attendance-admin-available', isAdmin);
    attendanceAdminTab.hidden = !isAdmin;
    attendanceAdminPanel.hidden = !isAdmin;
    siteSettings.hidden = false;
    userFilterField.hidden = !isAdmin;
    await loadSites();
    if (isAdmin) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const response = await fetch('https://jsec-serverless.adobephotoshop.workers.dev/api/users/list', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const users = await response.json().catch(() => []);
      if (!response.ok) throw new Error(users.error || '직원 목록을 불러오지 못했습니다.');
      populateAdminUserFilter(users);
    }
    await Promise.all([loadRecords(), loadPersonalRecords(), loadTodayRecord(), loadWeeklyRecords(), loadAnnualLeaveBalance()]);
    window.setInterval(renderTodayStatus, 1000);
    if (!isAdmin) window.setInterval(renderPersonalMetrics, 60 * 1000);
  } catch (error) {
    console.error('근태 관리 화면 초기화 오류:', error);
    historyMessage.textContent = error.message || '근태 관리 화면을 불러오지 못했습니다.';
    punchMessage.textContent = error.message || '출근지 설정을 불러오지 못했습니다.';
  }

  punchButton.addEventListener('click', () => punch(punchButton.dataset.action));
  addRecordButton.addEventListener('click', openCreateDialog);
  document.getElementById('attendanceCreateCancel').addEventListener('click', () => createDialog.close());
  createDialog.addEventListener('click', event => {
    if (event.target === createDialog) createDialog.close();
  });
  createForm.addEventListener('submit', async event => {
    event.preventDefault();
    createMessage.textContent = '';
    createSaveButton.disabled = true;
    try {
      const userId = createUser.value;
      await request('/records', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          location_id: createSite.value,
          check_in_at: document.getElementById('attendanceCreateCheckIn').value,
          check_out_at: document.getElementById('attendanceCreateCheckOut').value || null,
          note: document.getElementById('attendanceCreateNote').value,
          reason: document.getElementById('attendanceCreateReason').value
        })
      });
      createDialog.close();
      userFilter.value = userId;
      monthInput.value = document.getElementById('attendanceCreateCheckIn').value.slice(0, 7);
      await loadRecords();
      historyMessage.textContent = '관리자 근태 기록을 추가했습니다. 추가 사유와 변경 내용은 감사 기록에 보관되었습니다.';
      historyMessage.style.color = 'var(--primary)';
      if (userId === currentUserId) await loadTodayRecord();
    } catch (error) {
      console.error('관리자 근태 기록 추가 오류:', error);
      createMessage.textContent = error.message || '근태 기록을 추가하지 못했습니다.';
    } finally {
      createSaveButton.disabled = false;
    }
  });
  const reloadRecords = () => Promise.all([loadRecords(), loadPersonalRecords()]);
  document.getElementById('attendanceReload').addEventListener('click', reloadRecords);
  document.getElementById('attendanceAdminReload').addEventListener('click', loadRecords);
  const changeMonth = offset => {
    const [year, month] = monthInput.value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    monthInput.value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    reloadRecords();
  };
  document.getElementById('attendancePrevMonth').addEventListener('click', () => changeMonth(-1));
  document.getElementById('attendanceNextMonth').addEventListener('click', () => changeMonth(1));
  monthInput.addEventListener('change', () => {
    if (monthInput.value) reloadRecords();
  });
  userFilter.addEventListener('change', loadRecords);

  addSiteButton.addEventListener('click', () => {
    sites.push({
      id: null,
      site_number: null,
      name: `출근지 ${sites.length + 1}`,
      latitude: null,
      longitude: null,
      radius_m: 100,
      enabled: true
    });
    renderSiteSettings();
    siteMessage.textContent = '';
  });

  siteFields.addEventListener('click', async event => {
    const card = event.target.closest('[data-site-index]');
    if (!card) return;
    const siteIndex = Number(card.dataset.siteIndex);
    const site = sites[siteIndex];
    if (!site) return;

    const mapButton = event.target.closest('[data-open-site-map]');
    if (mapButton) {
      await openSiteMap(card);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-site]');
    if (deleteButton) {
      if (!window.confirm('이 출근지를 설정 목록에서 삭제할까요? 기존 근태 기록은 삭제되지 않습니다.')) return;
      site.enabled = false;
      renderSiteSettings();
      return;
    }
    const removeButton = event.target.closest('[data-remove-new-site]');
    if (removeButton) {
      sites.splice(siteIndex, 1);
      renderSiteSettings();
      return;
    }
    const locationButton = event.target.closest('[data-set-current-location]');
    if (!locationButton) return;
    const message = card.querySelector('[data-location-message]');
    locationButton.disabled = true;
    message.textContent = '현재 위치 확인 중...';
    try {
      if (!window.isSecureContext) throw new Error('현재 위치 지정은 HTTPS 연결에서만 사용할 수 있습니다.');
      const position = await getCurrentPosition();
      if (position.coords.accuracy > 100) {
        throw new Error(`위치 정확도가 ${Math.round(position.coords.accuracy)}m입니다. 위치를 다시 확인해 주세요.`);
      }
      card.querySelector('[data-site-latitude]').value = position.coords.latitude.toFixed(6);
      card.querySelector('[data-site-longitude]').value = position.coords.longitude.toFixed(6);
      message.textContent = `좌표 설정됨 · 정확도 약 ${Math.round(position.coords.accuracy)}m`;
    } catch (error) {
      message.textContent = error.message;
    } finally {
      locationButton.disabled = false;
    }
  });

  mapConfirmButton.addEventListener('click', () => {
    if (!mapTargetCard || !mapSelection) return;
    mapTargetCard.querySelector('[data-site-latitude]').value = mapSelection.lat.toFixed(6);
    mapTargetCard.querySelector('[data-site-longitude]').value = mapSelection.lng.toFixed(6);
    mapTargetCard.querySelector('[data-location-message]').textContent =
      `지도에서 지정 · 위도 ${mapSelection.lat.toFixed(6)}, 경도 ${mapSelection.lng.toFixed(6)}`;
    mapDialog.close();
  });
  mapSearchForm.addEventListener('submit', searchMapLocation);
  mapSearchResults.addEventListener('click', event => {
    const resultButton = event.target.closest('button[data-latitude][data-longitude]');
    if (!resultButton || !mapPicker || !mapTargetCard) return;
    const latitude = Number(resultButton.dataset.latitude);
    const longitude = Number(resultButton.dataset.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    mapSelection = { lat: latitude, lng: longitude, name: resultButton.dataset.name || '' };
    const radius = Number(mapTargetCard.querySelector('[data-site-radius]').value) || 100;
    const point = new window.kakao.maps.LatLng(latitude, longitude);
    mapPicker.setCenter(point);
    mapPicker.setLevel(3);
    updateMapPreview(latitude, longitude, radius);
    mapMessage.textContent = `검색 위치 선택 · 위도 ${latitude.toFixed(6)}, 경도 ${longitude.toFixed(6)}. 지도를 클릭해 위치를 미세 조정할 수 있습니다.`;
    mapConfirmButton.disabled = false;
    window.setTimeout(() => mapPicker.relayout(), 0);
  });
  document.getElementById('attendanceMapCancel').addEventListener('click', () => mapDialog.close());
  mapDialog.addEventListener('click', event => {
    if (event.target === mapDialog) mapDialog.close();
  });
  document.getElementById('attendanceRecordMapClose').addEventListener('click', () => recordMapDialog.close());
  recordMapDialog.addEventListener('click', event => {
    if (event.target === recordMapDialog) recordMapDialog.close();
  });

  siteForm.addEventListener('submit', async event => {
    event.preventDefault();
    siteMessage.textContent = '';
    saveSitesButton.disabled = true;
    const newSites = [...siteFields.querySelectorAll('[data-site-index]')].map(card => ({
      id: sites[Number(card.dataset.siteIndex)].id,
      name: card.querySelector('[data-site-name]').value.trim(),
      latitude: card.querySelector('[data-site-latitude]').value === '' ? null : Number(card.querySelector('[data-site-latitude]').value),
      longitude: card.querySelector('[data-site-longitude]').value === '' ? null : Number(card.querySelector('[data-site-longitude]').value),
      radius_m: Number(card.querySelector('[data-site-radius]').value),
      enabled: sites[Number(card.dataset.siteIndex)].enabled
    }));
    try {
      await request('/sites', { method: 'PUT', body: JSON.stringify({ sites: newSites }) });
      siteMessage.textContent = '출근지 설정을 저장했습니다.';
      siteMessage.style.color = 'var(--primary)';
      await loadSites();
    } catch (error) {
      console.error('출근지 설정 저장 오류:', error);
      siteMessage.textContent = error.message || '출근지 설정을 저장하지 못했습니다.';
      siteMessage.style.color = 'var(--danger)';
    } finally {
      saveSitesButton.disabled = false;
    }
  });

  recordsBody.addEventListener('click', event => {
    const gpsButton = event.target.closest('[data-attendance-gps]');
    if (gpsButton && isAdmin) {
      const record = records.find(item => item.id === gpsButton.dataset.attendanceGps);
      if (record) openRecordMap(record, gpsButton.dataset.gpsAction);
      return;
    }
    const button = event.target.closest('[data-edit-attendance]');
    if (button && isAdmin) {
      const record = records.find(item => item.id === button.dataset.editAttendance);
      if (record) openEditDialog(record);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-attendance]');
    if (!deleteButton || !isAdmin) return;
    const record = records.find(item => item.id === deleteButton.dataset.deleteAttendance);
    if (record) deleteAttendanceRecord(record);
  });
  document.getElementById('attendanceEditCancel').addEventListener('click', () => editDialog.close());
  editDialog.addEventListener('click', event => {
    if (event.target === editDialog) editDialog.close();
  });
  editForm.addEventListener('submit', async event => {
    event.preventDefault();
    editMessage.textContent = '';
    editSaveButton.disabled = true;
    try {
      await request(`/records/${encodeURIComponent(document.getElementById('attendanceEditRecordId').value)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          location_id: document.getElementById('attendanceEditSite').value,
          check_in_at: document.getElementById('attendanceEditCheckIn').value,
          check_out_at: document.getElementById('attendanceEditCheckOut').value || null,
          note: document.getElementById('attendanceEditNote').value,
          reason: document.getElementById('attendanceEditReason').value
        })
      });
      editDialog.close();
      await loadRecords();
      historyMessage.textContent = '근태 기록을 수정했습니다. 수정 사유와 변경 전후 내역이 감사 기록에 저장되었습니다.';
      historyMessage.style.color = 'var(--primary)';
    } catch (error) {
      console.error('근태 기록 수정 오류:', error);
      editMessage.textContent = error.message || '근태 기록을 수정하지 못했습니다.';
    } finally {
      editSaveButton.disabled = false;
    }
  });

  const attendanceHomePanel = document.getElementById('attendanceHomePanel');
  const attendanceHistoryPanel = document.getElementById('attendanceHistoryPanel');
  const attendanceAdminRecordsPanel = document.getElementById('attendanceAdminRecordsPanel');
  const attendanceAdminSitesPanel = document.getElementById('attendanceAdminSitesPanel');
  const attendanceAdminSubtabs = [...document.querySelectorAll('[data-admin-view]')];
  const attendanceViewButtons = [...document.querySelectorAll('[data-attendance-view]')];
  function showAdminView(view) {
    const isSites = view === 'sites';
    attendanceAdminRecordsPanel.hidden = isSites;
    attendanceAdminSitesPanel.hidden = !isSites;
    siteSettings.hidden = !isSites;
    attendanceAdminSubtabs.forEach(button => button.setAttribute('aria-selected', String(button.dataset.adminView === view)));
  }
  function showAttendanceView(view) {
    const isHistory = view === 'history';
    const isAdminView = view === 'admin';
    document.body.classList.toggle('attendance-home-active', view === 'home');
    document.body.classList.toggle('attendance-admin-view', isAdminView);
    attendanceHomePanel.hidden = isHistory || isAdminView;
    attendanceHistoryPanel.hidden = !isHistory;
    attendanceAdminPanel.hidden = !isAdminView;
    if (isAdminView) showAdminView('records');
    attendanceViewButtons.forEach(button => button.setAttribute('aria-selected', String(button.dataset.attendanceView === view)));
    if (isHistory || isAdminView) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  attendanceViewButtons.forEach(button => button.addEventListener('click', () => showAttendanceView(button.dataset.attendanceView)));
  attendanceAdminSubtabs.forEach(button => button.addEventListener('click', () => showAdminView(button.dataset.adminView)));
  showAdminView('records');
  showAttendanceView('home');
});
