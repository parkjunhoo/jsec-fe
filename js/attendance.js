document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/attendance';
  const siteSelect = document.getElementById('attendanceSiteSelect');
  const noteInput = document.getElementById('attendanceNote');
  const todayStatus = document.getElementById('attendanceTodayStatus');
  const punchMessage = document.getElementById('attendancePunchMessage');
  const checkInButton = document.getElementById('attendanceCheckIn');
  const checkOutButton = document.getElementById('attendanceCheckOut');
  const monthInput = document.getElementById('attendanceMonth');
  const userFilterField = document.getElementById('attendanceUserFilterField');
  const userFilter = document.getElementById('attendanceUserFilter');
  const recordsBody = document.getElementById('attendanceRecords');
  const historyMessage = document.getElementById('attendanceHistoryMessage');
  const actionHeading = document.getElementById('attendanceActionHeading');
  const siteSettings = document.getElementById('attendanceSiteSettings');
  const siteFields = document.getElementById('attendanceSiteFields');
  const siteForm = document.getElementById('attendanceSiteForm');
  const siteMessage = document.getElementById('attendanceSiteMessage');
  const saveSitesButton = document.getElementById('attendanceSaveSites');
  const addSiteButton = document.getElementById('attendanceAddSite');
  const mapDialog = document.getElementById('attendanceMapDialog');
  const mapMessage = document.getElementById('attendanceMapMessage');
  const mapConfirmButton = document.getElementById('attendanceMapConfirm');
  const editDialog = document.getElementById('attendanceEditDialog');
  const editForm = document.getElementById('attendanceEditForm');
  const editMessage = document.getElementById('attendanceEditMessage');
  const editSaveButton = document.getElementById('attendanceEditSave');
  let isAdmin = false;
  let sites = [];
  let records = [];
  let todayRecord = null;
  let currentUserId = '';
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

  function getKstParts(date = new Date()) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).map(part => [part.type, part.value]));
  }

  function getKstDate() {
    const { year, month, day } = getKstParts();
    return `${year}-${month}-${day}`;
  }

  function getCurrentMonth() {
    const { year, month } = getKstParts();
    return `${year}-${month}`;
  }

  function getMonthRange(value) {
    const [year, month] = value.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    };
  }

  function formatDateTime(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23', timeZone: 'Asia/Seoul'
    }).format(new Date(value));
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
    checkInButton.disabled = busy;
    checkOutButton.disabled = busy;
    siteSelect.disabled = busy;
    noteInput.disabled = busy;
  }

  function renderSites() {
    const availableSites = sites.filter(site =>
      site.enabled && (site.configured === true || site.latitude != null)
    );
    const currentSelection = siteSelect.value;
    siteSelect.innerHTML = '<option value="">출근지를 선택하세요</option>' + availableSites
      .map(site => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)} · 반경 ${site.radius_m}m</option>`)
      .join('');
    if (availableSites.some(site => site.id === currentSelection)) siteSelect.value = currentSelection;
    if (isAdmin) {
      document.getElementById('attendanceEditSite').innerHTML = sites
        .map(site => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}${site.enabled ? '' : ' (보관됨)'}</option>`)
        .join('');
    }
    checkInButton.disabled = busy || !availableSites.length;
    checkOutButton.disabled = busy || !availableSites.length;
    if (!availableSites.length) {
      siteSelect.innerHTML = '<option value="">관리자가 출근지를 설정해야 합니다</option>';
    }
  }

  function renderTodayStatus() {
    const record = todayRecord;
    const title = todayStatus.querySelector('strong');
    const detail = todayStatus.querySelector('span');
    if (!record) {
      title.textContent = '미출근';
      detail.textContent = '출근지를 선택하고 출근을 등록해 주세요.';
    } else if (!record.check_out_at) {
      title.textContent = '근무 중';
      detail.textContent = `${record.location_name} · 출근 ${formatDateTime(record.check_in_at)}`;
      siteSelect.value = record.location_id;
    } else {
      title.textContent = '퇴근 완료';
      detail.textContent = `${record.location_name} · ${formatDateTime(record.check_in_at)} ~ ${formatDateTime(record.check_out_at)}`;
      siteSelect.value = record.location_id;
    }
    const hasCheckIn = Boolean(record);
    const hasCheckOut = Boolean(record?.check_out_at);
    checkInButton.hidden = hasCheckIn;
    checkOutButton.hidden = !hasCheckIn || hasCheckOut;
    if (record) siteSelect.disabled = true;
    else siteSelect.disabled = busy;
  }

  function renderRecords() {
    actionHeading.hidden = !isAdmin;
    if (!records.length) {
      recordsBody.innerHTML = `<tr><td class="attendance-empty" colspan="${isAdmin ? 6 : 5}">해당 기간의 출퇴근 기록이 없습니다.</td></tr>`;
      return;
    }
    recordsBody.innerHTML = records.map(record => `
      <tr>
        <td>${escapeHtml(record.work_date)}${isAdmin ? `<span class="attendance-secondary">${escapeHtml(record.username)}</span>` : ''}</td>
        <td>${escapeHtml(record.location_name)}</td>
        <td>${escapeHtml(formatDateTime(record.check_in_at))}<span class="attendance-secondary">정확도 ${Math.round(record.check_in_accuracy_m)}m · 거리 ${Math.round(record.check_in_distance_m)}m</span></td>
        <td>${escapeHtml(formatDateTime(record.check_out_at))}${record.check_out_at ? `<span class="attendance-secondary">정확도 ${Math.round(record.check_out_accuracy_m)}m · 거리 ${Math.round(record.check_out_distance_m)}m</span>` : ''}</td>
        <td>${record.check_out_at ? '퇴근 완료' : '근무 중'}${record.note ? `<span class="attendance-secondary">${escapeHtml(record.note)}</span>` : ''}</td>
        ${isAdmin ? `<td><button class="attendance-button" type="button" data-edit-attendance="${escapeHtml(record.id)}">수정</button></td>` : ''}
      </tr>
    `).join('');
  }

  function renderSiteSettings() {
    siteFields.innerHTML = sites.length ? sites.map((site, index) => `
      <article class="attendance-site ${site.enabled ? '' : 'archived'}" data-site-index="${index}">
        <h3>${site.site_number ? `출근지 ${site.site_number}` : '새 출근지'}</h3>
        ${site.enabled ? '' : '<p class="attendance-site-status">보관됨 · 과거 출퇴근 기록은 유지됩니다.</p>'}
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
          ${site.id ? `<button class="attendance-button" type="button" data-toggle-site>${site.enabled ? '삭제 (기록 보존)' : '출근지 복구'}</button>` : '<button class="attendance-button" type="button" data-remove-new-site>추가 취소</button>'}
        </div>
      </article>
    `).join('') : '<p class="attendance-empty">등록된 출근지가 없습니다. 출근지를 추가해 주세요.</p>';
  }

  function updateMapPreview(latitude, longitude, radius) {
    if (!window.L || !mapPicker) return;
    const point = [latitude, longitude];
    if (!mapMarker) mapMarker = window.L.marker(point).addTo(mapPicker);
    else mapMarker.setLatLng(point);
    if (!mapRadius) {
      mapRadius = window.L.circle(point, { radius, color: '#197a52', fillOpacity: 0.12 }).addTo(mapPicker);
    } else {
      mapRadius.setLatLng(point);
      mapRadius.setRadius(radius);
    }
  }

  function openSiteMap(card) {
    mapTargetCard = card;
    mapMessage.textContent = '';
    mapSelection = null;
    mapConfirmButton.disabled = true;
    mapDialog.showModal();
    if (!window.L) {
      mapMessage.textContent = '지도를 불러오지 못했습니다. 위도와 경도를 직접 입력해 주세요.';
      return;
    }

    const latitudeValue = card.querySelector('[data-site-latitude]').value;
    const longitudeValue = card.querySelector('[data-site-longitude]').value;
    const latitude = Number(latitudeValue);
    const longitude = Number(longitudeValue);
    const hasCoordinates = latitudeValue !== '' && longitudeValue !== ''
      && Number.isFinite(latitude) && Number.isFinite(longitude);
    if (!mapPicker) {
      mapPicker = window.L.map('attendanceMap').setView(
        hasCoordinates ? [latitude, longitude] : [36.5, 127.5],
        hasCoordinates ? 16 : 7
      );
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapPicker);
      mapPicker.on('click', event => {
        mapSelection = event.latlng;
        updateMapPreview(event.latlng.lat, event.latlng.lng, Number(mapTargetCard?.querySelector('[data-site-radius]').value) || 100);
        mapMessage.textContent = `선택한 좌표: ${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}`;
        mapConfirmButton.disabled = false;
      });
    }
    mapPicker.setView(hasCoordinates ? [latitude, longitude] : [36.5, 127.5], hasCoordinates ? 16 : 7);
    if (hasCoordinates) {
      mapSelection = { lat: latitude, lng: longitude };
      updateMapPreview(latitude, longitude, Number(card.querySelector('[data-site-radius]').value) || 100);
      mapMessage.textContent = `현재 좌표: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      mapConfirmButton.disabled = false;
    } else if (mapMarker) {
      mapPicker.removeLayer(mapMarker);
      mapMarker = null;
      if (mapRadius) {
        mapPicker.removeLayer(mapRadius);
        mapRadius = null;
      }
    }

    window.setTimeout(() => mapPicker.invalidateSize(), 0);
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
    recordsBody.innerHTML = `<tr><td class="attendance-empty" colspan="${isAdmin ? 6 : 5}">기록을 불러오는 중입니다.</td></tr>`;
    try {
      const result = await request(`/records?${params}`);
      records = result.records || [];
      isAdmin = result.isAdmin === true;
      renderRecords();
    } catch (error) {
      console.error('근태 기록 조회 오류:', error);
      historyMessage.textContent = error.message || '근태 기록을 불러오지 못했습니다.';
      recordsBody.innerHTML = `<tr><td class="attendance-empty" colspan="${isAdmin ? 6 : 5}">기록을 불러오지 못했습니다.</td></tr>`;
    }
  }

  async function loadTodayRecord() {
    const today = getKstDate();
    const params = new URLSearchParams({ start: today, end: today });
    if (isAdmin) params.set('user_id', currentUserId);
    const result = await request(`/records?${params}`);
    todayRecord = (result.records || []).find(item => item.user_id === currentUserId) || null;
    renderTodayStatus();
  }

  async function punch(action) {
    if (busy) return;
    punchMessage.textContent = '';
    if (!siteSelect.value) {
      punchMessage.textContent = '출근지를 선택해 주세요.';
      return;
    }
    setBusy(true);
    try {
      const position = await getVerifiedPosition();
      await request(`/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          location_id: siteSelect.value,
          ...position,
          note: noteInput.value.trim()
        })
      });
      punchMessage.textContent = action === 'check-in' ? '출근이 기록되었습니다.' : '퇴근이 기록되었습니다.';
      punchMessage.style.color = 'var(--primary)';
      await Promise.all([loadRecords(), loadTodayRecord()]);
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
    userFilter.innerHTML = '<option value="">전체 직원</option>' + users
      .filter(user => !['guest', 'monitor'].includes(user.role))
      .map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name || user.username || '이름 없음')}</option>`)
      .join('');
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
      .select('role')
      .eq('id', currentUserId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || ['guest', 'monitor'].includes(profile.role)) {
      document.getElementById('attendancePunchCard').hidden = true;
      document.querySelector('.attendance-heading p').textContent = '이 계정은 근태 기능을 사용할 수 없습니다.';
      historyMessage.textContent = '근태 기능을 사용할 권한이 없습니다.';
      return;
    }
    isAdmin = profile.role === 'admin';
    siteSettings.hidden = !isAdmin;
    userFilterField.hidden = !isAdmin;
    actionHeading.hidden = !isAdmin;
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
    await Promise.all([loadRecords(), loadTodayRecord()]);
  } catch (error) {
    console.error('근태 관리 화면 초기화 오류:', error);
    historyMessage.textContent = error.message || '근태 관리 화면을 불러오지 못했습니다.';
    punchMessage.textContent = error.message || '출근지 설정을 불러오지 못했습니다.';
  }

  checkInButton.addEventListener('click', () => punch('check-in'));
  checkOutButton.addEventListener('click', () => punch('check-out'));
  document.getElementById('attendanceReload').addEventListener('click', loadRecords);
  monthInput.addEventListener('change', () => {
    if (monthInput.value) loadRecords();
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
      openSiteMap(card);
      return;
    }
    const toggleButton = event.target.closest('[data-toggle-site]');
    if (toggleButton) {
      if (site.enabled && !window.confirm('이 출근지를 보관 처리할까요? 과거 출퇴근 기록은 유지됩니다.')) return;
      site.enabled = !site.enabled;
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
  document.getElementById('attendanceMapCancel').addEventListener('click', () => mapDialog.close());
  mapDialog.addEventListener('click', event => {
    if (event.target === mapDialog) mapDialog.close();
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
    const button = event.target.closest('[data-edit-attendance]');
    if (!button || !isAdmin) return;
    const record = records.find(item => item.id === button.dataset.editAttendance);
    if (record) openEditDialog(record);
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
});
