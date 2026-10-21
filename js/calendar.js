document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return;
  }

  const preferences = window.userPreferences;
  if (preferences) await preferences.load();

  const userId = session.user.id;
  let userRole = 'user';
  let userName = '팀원';

  try {
    const { data: profile } = await supabaseClient
      .from('users')
      .select('name, username, role')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      userName = profile.name || profile.username || '팀원';
      userRole = profile.role || 'user';
    }
  } catch (err) {
    console.error('프로필 조회 오류:', err);
  }

  // ★ 대한민국 서울 표준시(KST) YYYY-MM-DD 추출 함수
  function getKSTDateString(dateObj = new Date()) {
    const options = {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    };
    const formatter = new Intl.DateTimeFormat('ko-KR', options);
    const parts = formatter.formatToParts(dateObj);
    
    let year = '', month = '', day = '';
    for (const part of parts) {
      if (part.type === 'year') year = part.value;
      if (part.type === 'month') month = part.value;
      if (part.type === 'day') day = part.value;
    }
    return `${year}-${month}-${day}`;
  }

  const calendarGrid = document.getElementById('calendarGrid');
  const dateDetailsModal = document.getElementById('dateDetailsModal');
  const dateDetailsTitle = document.getElementById('dateDetailsTitle');
  const dateDetailsList = document.getElementById('dateDetailsList');
  const closeDateDetailsBtn = document.getElementById('closeDateDetailsBtn');
  const addAllMonthEventsBtn = document.getElementById('addAllMonthEventsBtn');
  const openModalBtn = document.getElementById('openModalBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const vacationModal = document.getElementById('vacationModal');
  const vacationForm = document.getElementById('vacationForm');
  const modalTitle = document.getElementById('modalTitle');
  const submitBtn = document.getElementById('submitBtn');
  const deleteBtn = document.getElementById('deleteBtn');

  const prevMonthBtn = document.getElementById('prevMonthBtn');
  const nextMonthBtn = document.getElementById('nextMonthBtn');
  const currentMonthDisplay = document.getElementById('currentMonthDisplay');
  const totalMonthVacationCount = document.getElementById('totalMonthVacationCount');
  const statsGridContainer = document.getElementById('statsGridContainer');
  const statsTitle = document.getElementById('statsTitle');
  const statsViewButtons = document.querySelectorAll('[data-stats-view]');
  const schedulePreview = document.getElementById('schedulePreview');

  const editVacationId = document.getElementById('editVacationId');
  const editCalendarNote = document.getElementById('editCalendarNote');
  const vDate = document.getElementById('vDate');
  const modalDateLabel = document.getElementById('modalDateLabel');
  const modalTabButtons = document.querySelectorAll('[data-modal-tab]');
  const scheduleTabPanel = document.getElementById('scheduleTabPanel');
  const noteTabPanel = document.getElementById('noteTabPanel');
  const calendarNoteEmojiPicker = document.getElementById('calendarNoteEmojiPicker');
  const calendarNoteContent = document.getElementById('calendarNoteContent');
  const vLeaveType = document.getElementById('vLeaveType');
  const vTimeDetail = document.getElementById('vTimeDetail');
  const vHoursUsedGroup = document.getElementById('vHoursUsedGroup');
  const vHoursUsed = document.getElementById('vHoursUsed');
  const vMemo = document.getElementById('vMemo');
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const openBulkVacationBtn = document.getElementById('openBulkVacationBtn');
  const bulkVacationModal = document.getElementById('bulkVacationModal');
  const bulkVacationForm = document.getElementById('bulkVacationForm');
  const bulkDaysInput = document.getElementById('bulkDaysInput');
  const bulkCalendarGrid = document.getElementById('bulkCalendarGrid');
  const bulkMonthLabel = document.getElementById('bulkMonthLabel');
  const bulkSelectedCount = document.getElementById('bulkSelectedCount');
  const bulkMemoInput = document.getElementById('bulkMemo');
  const bulkTargetUserGroup = document.getElementById('bulkTargetUserGroup');
  const bulkTargetUserId = document.getElementById('bulkTargetUserId');
  const submitBulkVacationBtn = document.getElementById('submitBulkVacationBtn');
  const targetUserFormGroup = document.getElementById('targetUserFormGroup');
  const vTargetUserId = document.getElementById('vTargetUserId');
  const VACATIONS_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/vacations';
  const CALENDAR_NOTES_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/calendar-notes';
  const CALENDAR_NOTE_EMOJIS = ['📌', '📣', '🎉', '⚠️', '📅', '🎂', '🏖️', '🏥', '🚨', '✅', '⭐', '🎁', '🍀', '☕', '📝', '💡'];
  if (userRole === 'guest' || userRole === 'monitor') {
    if (openModalBtn) openModalBtn.style.display = 'none';
    if (openBulkVacationBtn) openBulkVacationBtn.hidden = true;
  }

  async function mutateVacation(path, method, payload) {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error('로그인이 필요합니다.');

    const response = await fetch(`${VACATIONS_API}/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  async function listVacations(start, end) {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error('로그인이 필요합니다.');

    const params = new URLSearchParams({ start, end });
    const response = await fetch(`${VACATIONS_API}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  async function listUsers() {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error('로그인이 필요합니다.');

    const response = await fetch('https://jsec-serverless.adobephotoshop.workers.dev/api/users/list', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  async function requestCalendarNotes(path, method = 'GET', payload) {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error('로그인이 필요합니다.');

    const response = await fetch(`${CALENDAR_NOTES_API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  // 필터 요소
  const locationCheckboxes = document.querySelectorAll('input[name="locFilter"]');
  const shiftFilterValues = ['주간', '야간'];
  const otherLocationFilter = 'other';
  const locationFilterValues = Array.from(locationCheckboxes)
    .map(checkbox => checkbox.value)
    .filter(value => value !== otherLocationFilter && !shiftFilterValues.includes(value));
  const selectAllLocBtn = document.getElementById('selectAllLocBtn');
  const savedLocationFilters = preferences?.getSettings().calendar_location_filters;
  if (Array.isArray(savedLocationFilters)) {
    locationCheckboxes.forEach(checkbox => {
      checkbox.checked = savedLocationFilters.includes(checkbox.value);
    });
  }

  let currentDate = new Date();
  let allVacations = [];
  let allCalendarNotes = [];
  let scheduleTemplateBuffer;
  let userMap = {}; 
  let allTeamMembers = []; 
  let currentStatsView = 'cards';
  let activeModalTab = 'schedule';
  let selectedNoteEmoji = '';

  if (statsGridContainer) statsGridContainer.dataset.view = currentStatsView;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function safeMemberColor(value) {
    return typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)
      ? value
      : '#38bdf8';
  }

  function matchesLocationFilter(location, checkedLocations) {
    const normalizedLocation = (location || '').toLowerCase();
    const selectedShifts = checkedLocations.filter(value => shiftFilterValues.includes(value));
    const selectedLocations = checkedLocations.filter(value =>
      value !== otherLocationFilter && !shiftFilterValues.includes(value)
    );
    const isNightShift = normalizedLocation.includes('야간');
    const matchesShift = selectedShifts.some(value => value === '야간' ? isNightShift : !isNightShift);
    const matchesLocation = selectedLocations.some(value => normalizedLocation.includes(value.toLowerCase()))
      || (checkedLocations.includes(otherLocationFilter)
        && !locationFilterValues.some(value => normalizedLocation.includes(value.toLowerCase())));

    return matchesShift && matchesLocation;
  }

  function renderEmojiPicker() {
    if (!calendarNoteEmojiPicker) return;
    calendarNoteEmojiPicker.innerHTML = `
      <button type="button" class="emoji-choice emoji-none ${selectedNoteEmoji ? '' : 'selected'}"
        data-emoji="" aria-label="이모지 없음">없음</button>
      ${CALENDAR_NOTE_EMOJIS.map(emoji => `
      <button type="button" class="emoji-choice ${emoji === selectedNoteEmoji ? 'selected' : ''}"
        data-emoji="${escapeHtml(emoji)}" aria-label="${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>
      `).join('')}
    `;
    calendarNoteEmojiPicker.querySelectorAll('[data-emoji]').forEach(button => {
      button.disabled = userRole !== 'admin';
      button.addEventListener('click', () => {
        selectedNoteEmoji = button.dataset.emoji;
        renderEmojiPicker();
      });
    });
  }

  function switchModalTab(tab) {
    activeModalTab = tab;
    modalTabButtons.forEach(button => button.classList.toggle('active', button.dataset.modalTab === tab));
    if (scheduleTabPanel) scheduleTabPanel.style.display = tab === 'schedule' ? 'block' : 'none';
    if (noteTabPanel) noteTabPanel.style.display = tab === 'note' ? 'block' : 'none';
    if (modalDateLabel) modalDateLabel.textContent = tab === 'note' ? '메모 날짜' : '휴무 날짜 *';
    if (vDate) vDate.disabled = tab === 'note' && Boolean(editCalendarNote?.value);
    if (vTargetUserId) vTargetUserId.required = tab === 'schedule' && userRole === 'admin';
    if (vLeaveType) vLeaveType.required = tab === 'schedule';
    if (vHoursUsed) {
      vHoursUsed.required = tab === 'schedule'
        && vLeaveType?.value === '시간차'
        && vTimeDetail?.value === '시간지정';
    }
    if (modalTitle) {
      modalTitle.textContent = tab === 'note'
        ? (editCalendarNote?.value ? '달력 메모 수정' : '달력 메모 등록')
        : (editVacationId?.value ? '휴무 일정 수정 / 삭제' : '휴무 일정 등록');
    }
    if (deleteBtn) deleteBtn.style.display = tab === 'note'
      ? (userRole === 'admin' && editCalendarNote?.value ? 'block' : 'none')
      : (editVacationId?.value ? 'block' : 'none');
    if (submitBtn) {
      submitBtn.style.display = tab === 'note' && userRole !== 'admin' ? 'none' : '';
      submitBtn.textContent = tab === 'note'
        ? (editCalendarNote?.value ? '메모 수정' : '메모 등록')
        : (editVacationId?.value ? '수정 완료' : '등록 완료');
    }
    renderEmojiPicker();
  }

  modalTabButtons.forEach(button => {
    button.addEventListener('click', () => switchModalTab(button.dataset.modalTab));
  });

  // ★ 수정: leaveType에 따라 아이콘 또는 색상 점 HTML을 반환하는 함수
  function getLeaveIndicator(leaveType = '', userColor = '#38bdf8') {
    if (leaveType === '연차') return '🌴';
    if (leaveType === '시간차') return '⏳';
    if (leaveType === '공가') return '🏛️';
    return '';
  }

  function updateTimeDetailOptions(leaveType, selectedValue = '') {
    if (!vTimeDetail) return;

    const timeDetails = leaveType === '시간차' ? ['시간지정'] : ['종일'];

    vTimeDetail.innerHTML = timeDetails
      .map(timeDetail => `<option value="${timeDetail}">${timeDetail === '시간지정' ? 'N시간 사용' : timeDetail}</option>`)
      .join('');
    vTimeDetail.value = timeDetails.includes(selectedValue) ? selectedValue : timeDetails[0];
    updateHoursUsedInput(leaveType, vTimeDetail.value);
  }

  function updateHoursUsedInput(leaveType, timeDetail, selectedHours = '') {
    const showHours = leaveType === '시간차' && timeDetail === '시간지정';
    if (vHoursUsedGroup) vHoursUsedGroup.style.display = showHours ? 'block' : 'none';
    if (vHoursUsed) {
      vHoursUsed.required = showHours && activeModalTab === 'schedule';
      vHoursUsed.value = showHours ? selectedHours ?? '' : '';
    }
  }

  async function fetchUsersInfo() {
    try {
      const data = await listUsers();

      if (data) {
        allTeamMembers = data.filter(user => user.role !== 'guest' && user.role !== 'monitor');
        allTeamMembers.forEach(u => {
          const keyName = u.name || u.username;
          const userInfo = {
            id: u.id,
            name: keyName,
            work_location: u.work_location || '',
            color: safeMemberColor(u.color)
          };
          if (keyName) userMap[keyName] = userInfo;
          if (u.id) userMap[u.id] = userInfo;
        });

        // 관리자용 모달 팀원 선택 드롭다운 생성
        if (vTargetUserId) {
          vTargetUserId.innerHTML = allTeamMembers.map(u => {
            const memberName = u.name || u.username;
            return `<option value="${escapeHtml(u.id)}" data-name="${escapeHtml(memberName)}">${escapeHtml(memberName)}</option>`;
          }).join('');
        }
      }
    } catch (err) {
      console.error('유저 정보 로드 오류:', err);
    }
  }

  const bulkSelectedDays = new Set();

  function getBulkTargetUserId() {
    return userRole === 'admin' ? bulkTargetUserId.value : userId;
  }

  function getExistingBulkVacations(targetId = getBulkTargetUserId()) {
    return allVacations.filter(vacation =>
      vacation.user_id === targetId
      && vacation.leave_type === '휴무'
      && vacation.time_detail !== '시간지정'
    );
  }

  function selectExistingBulkVacationDays() {
    bulkSelectedDays.clear();
    getExistingBulkVacations().forEach(vacation => {
      const day = Number(vacation.date.slice(-2));
      if (Number.isInteger(day)) bulkSelectedDays.add(day);
    });
    bulkDaysInput.value = [...bulkSelectedDays].sort((a, b) => a - b).join(', ');
    bulkDaysInput.setCustomValidity('');
    updateBulkCalendarSelection();
  }

  function updateBulkCalendarSelection() {
    bulkSelectedCount.textContent = `${bulkSelectedDays.size}일 선택`;
    bulkCalendarGrid.querySelectorAll('[data-bulk-day]').forEach(button => {
      const selected = bulkSelectedDays.has(Number(button.dataset.bulkDay));
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function renderBulkCalendar() {
    if (!bulkCalendarGrid) return;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    bulkMonthLabel.textContent = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long'
    }).format(currentDate);
    bulkCalendarGrid.replaceChildren();

    ['일', '월', '화', '수', '목', '금', '토'].forEach(dayName => {
      const heading = document.createElement('span');
      heading.className = 'bulk-calendar-day-name';
      heading.textContent = dayName;
      bulkCalendarGrid.appendChild(heading);
    });
    for (let index = 0; index < firstDay; index += 1) {
      const blank = document.createElement('button');
      blank.type = 'button';
      blank.className = 'bulk-calendar-day';
      blank.disabled = true;
      blank.tabIndex = -1;
      blank.setAttribute('aria-hidden', 'true');
      bulkCalendarGrid.appendChild(blank);
    }
    for (let day = 1; day <= lastDay; day += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bulk-calendar-day';
      button.dataset.bulkDay = String(day);
      button.textContent = String(day);
      button.setAttribute('aria-label', `${month + 1}월 ${day}일`);
      button.addEventListener('click', () => {
        if (bulkSelectedDays.has(day)) bulkSelectedDays.delete(day);
        else bulkSelectedDays.add(day);
        bulkDaysInput.value = [...bulkSelectedDays].sort((a, b) => a - b).join(', ');
        bulkDaysInput.setCustomValidity('');
        updateBulkCalendarSelection();
      });
      bulkCalendarGrid.appendChild(button);
    }
    updateBulkCalendarSelection();
  }

  if (bulkDaysInput) {
    bulkDaysInput.addEventListener('input', () => {
      const rawDays = bulkDaysInput.value.trim();
      const tokens = rawDays ? rawDays.split(/[,\s]+/).filter(Boolean) : [];
      const days = tokens.map(token => /^\d+$/.test(token) ? Number(token) : NaN);
      const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      const isValid = (!rawDays || tokens.length > 0)
        && days.every(day => Number.isInteger(day) && day >= 1 && day <= lastDay);
      bulkDaysInput.setCustomValidity(isValid ? '' : `1부터 ${lastDay} 사이의 날짜만 입력해 주세요.`);
      bulkSelectedDays.clear();
      if (isValid) days.forEach(day => bulkSelectedDays.add(day));
      updateBulkCalendarSelection();
    });
  }

  function openBulkVacationModal() {
    if (userRole === 'guest' || userRole === 'monitor') return;
    bulkMemoInput.value = '';
    if (userRole === 'admin') {
      bulkTargetUserGroup.style.display = 'block';
      bulkTargetUserId.innerHTML = vTargetUserId.innerHTML;
      bulkTargetUserId.value = userId;
      bulkTargetUserId.required = true;
    } else {
      bulkTargetUserGroup.style.display = 'none';
      bulkTargetUserId.required = false;
    }
    bulkSelectedDays.clear();
    bulkDaysInput.value = '';
    bulkDaysInput.setCustomValidity('');
    renderBulkCalendar();
    selectExistingBulkVacationDays();
    bulkVacationModal.classList.add('active');
    bulkVacationModal.setAttribute('aria-hidden', 'false');
  }

  if (bulkTargetUserId) {
    bulkTargetUserId.addEventListener('change', selectExistingBulkVacationDays);
  }

  function closeBulkVacationModal() {
    bulkVacationModal.classList.remove('active');
    bulkVacationModal.setAttribute('aria-hidden', 'true');
  }

  function openAddModal(selectedDateStr = '') {
    if (userRole === 'guest' || userRole === 'monitor') return;
    if (modalTitle) modalTitle.textContent = '휴무 일정 등록';
    if (submitBtn) submitBtn.textContent = '등록 완료';
    if (vacationForm) vacationForm.reset();
    if (editVacationId) editVacationId.value = '';
    if (editCalendarNote) editCalendarNote.value = '';
    if (vDate) vDate.value = selectedDateStr || getKSTDateString();
    if (vLeaveType) updateTimeDetailOptions(vLeaveType.value, '종일');
    if (calendarNoteContent) {
      calendarNoteContent.value = '';
      calendarNoteContent.readOnly = userRole !== 'admin';
    }
    selectedNoteEmoji = '';

    if (userRole === 'admin') {
      if (targetUserFormGroup) targetUserFormGroup.style.display = 'block';
      if (vTargetUserId) vTargetUserId.value = userId;
    } else {
      if (targetUserFormGroup) targetUserFormGroup.style.display = 'none';
    }

    if (vTargetUserId) vTargetUserId.required = userRole === 'admin';
    if (vLeaveType) vLeaveType.required = true;
    switchModalTab('schedule');
    if (vacationModal) vacationModal.classList.add('active');
  }

  function openCalendarNoteModal(date) {
    if (userRole !== 'admin') return;
    const note = allCalendarNotes.find(item => item.date === date);
    if (vacationForm) vacationForm.reset();
    if (editVacationId) editVacationId.value = '';
    if (editCalendarNote) editCalendarNote.value = note ? note.date : '';
    if (vDate) vDate.value = date;
    if (targetUserFormGroup) targetUserFormGroup.style.display = 'none';
    if (calendarNoteContent) {
      calendarNoteContent.value = note?.content || '';
      calendarNoteContent.readOnly = userRole !== 'admin';
    }
    selectedNoteEmoji = note?.emoji || '';
    if (modalTitle) modalTitle.textContent = note ? '달력 메모' : '달력 메모 등록';
    if (vTargetUserId) vTargetUserId.required = false;
    switchModalTab('note');
    if (vacationModal) vacationModal.classList.add('active');
  }

  function openEditModal(vacation) {
    if (userRole === 'guest' || userRole === 'monitor') return;
    if (vacation.user_id !== userId && userRole !== 'admin') {
      Swal.fire({
        icon: 'warning',
        text: '본인이 등록한 일정만 수정할 수 있습니다.'
      });
      return;
    }

    if (modalTitle) modalTitle.textContent = '휴무 일정 수정 / 삭제';
    if (editCalendarNote) editCalendarNote.value = '';

    if (editVacationId) editVacationId.value = vacation.id;
    if (vDate) vDate.value = vacation.date;
    if (vLeaveType) {
      vLeaveType.value = vacation.leave_type;
      updateTimeDetailOptions(vLeaveType.value, vacation.time_detail || '종일');
      updateHoursUsedInput(vLeaveType.value, vTimeDetail.value, vacation.hours_used);
    }
    if (vMemo) vMemo.value = vacation.memo || '';

    if (userRole === 'admin') {
      if (targetUserFormGroup) targetUserFormGroup.style.display = 'block';
      if (vTargetUserId) vTargetUserId.value = vacation.user_id;
    } else {
      if (targetUserFormGroup) targetUserFormGroup.style.display = 'none';
    }

    if (vTargetUserId) vTargetUserId.required = userRole === 'admin';
    switchModalTab('schedule');
    if (vacationModal) vacationModal.classList.add('active');
  }

  function closeModal() {
    if (vacationModal) vacationModal.classList.remove('active');
    if (vacationForm) vacationForm.reset();
  }

  function closeDateDetails() {
    if (!dateDetailsModal) return;
    dateDetailsModal.classList.remove('active');
    dateDetailsModal.setAttribute('aria-hidden', 'true');
  }

  function openDateDetails(date) {
    if (!dateDetailsModal || !dateDetailsList || !dateDetailsTitle) return;

    const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });
    const dayVacations = allVacations.filter(vacation => vacation.date === date);
    const dayNote = allCalendarNotes.find(note => note.date === date);
    dateDetailsTitle.textContent = dateLabel;
    dateDetailsModal.dataset.date = date;

    const vacationItems = dayVacations.map(vacation => {
      const canManage = userRole !== 'guest' && userRole !== 'monitor'
        && (vacation.user_id === userId || userRole === 'admin');
      const detail = [vacation.leave_type, vacation.time_detail]
        .filter(Boolean)
        .join(' · ');
      const hours = vacation.hours_used ? ` · ${escapeHtml(vacation.hours_used)}시간` : '';
      const memo = vacation.memo
        ? `<p class="date-detail-memo">${escapeHtml(vacation.memo)}</p>`
        : '';
      const actions = canManage ? `
        <div class="date-detail-actions">
          <button class="date-detail-action" type="button" data-detail-action="edit-vacation" data-id="${escapeHtml(vacation.id)}">수정</button>
          <button class="date-detail-action delete" type="button" data-detail-action="delete-vacation" data-id="${escapeHtml(vacation.id)}">삭제</button>
        </div>
      ` : '';
      const calendarAction = window.AndroidCalendar ? `
        <div class="date-detail-actions">
          <button class="date-detail-action" type="button" data-detail-action="add-calendar" data-id="${escapeHtml(vacation.id)}">기기 캘린더에 추가</button>
        </div>
      ` : '';

      return `
        <article class="date-detail-item">
          <div class="date-detail-heading">
            <div>
              <div class="date-detail-name">${escapeHtml(vacation.username || '이름 없음')}</div>
              <div class="date-detail-meta">${escapeHtml(detail)}${hours}</div>
            </div>
            ${actions}
          </div>
          ${memo}
          ${calendarAction}
        </article>
      `;
    });

    if (dayNote) {
      const noteActions = userRole === 'admin' ? `
        <div class="date-detail-actions">
          <button class="date-detail-action" type="button" data-detail-action="edit-note">수정</button>
          <button class="date-detail-action delete" type="button" data-detail-action="delete-note">삭제</button>
        </div>
      ` : '';
      vacationItems.push(`
        <article class="date-detail-item">
          <div class="date-detail-heading">
            <div>
              <div class="date-detail-name">${dayNote.emoji ? `${escapeHtml(dayNote.emoji)} ` : ''}달력 메모</div>
              <p class="date-detail-note">${escapeHtml(dayNote.content || '내용 없음')}</p>
            </div>
            ${noteActions}
          </div>
        </article>
      `);
    }

    dateDetailsList.innerHTML = vacationItems.length
      ? vacationItems.join('')
      : '<div class="date-details-empty">등록된 휴가나 메모가 없습니다.</div>';
    dateDetailsModal.classList.add('active');
    dateDetailsModal.setAttribute('aria-hidden', 'false');
  }

  async function deleteVacationFromDetails(vacation) {
    if (userRole === 'guest' || userRole === 'monitor') return;
    if (vacation.user_id !== userId && userRole !== 'admin') return;
    const result = await Swal.fire({
      icon: 'warning',
      text: `${vacation.username || '이 일정'}의 휴무 일정을 삭제하시겠습니까?`,
      showCancelButton: true,
      confirmButtonText: '삭제',
      cancelButtonText: '취소',
      reverseButtons: true
    });
    if (!result.isConfirmed) return;

    try {
      await mutateVacation(`delete/${encodeURIComponent(vacation.id)}`, 'DELETE');
      closeDateDetails();
      await fetchMonthData();
      await Swal.fire({ icon: 'success', text: '휴무 일정이 삭제되었습니다.' });
    } catch (error) {
      await Swal.fire({ icon: 'error', text: `삭제 실패: ${error.message}` });
    }
  }

  async function deleteNoteFromDetails(date) {
    if (userRole !== 'admin') return;
    const result = await Swal.fire({
      icon: 'warning',
      text: '이 날짜의 달력 메모를 삭제하시겠습니까?',
      showCancelButton: true,
      confirmButtonText: '삭제',
      cancelButtonText: '취소',
      reverseButtons: true
    });
    if (!result.isConfirmed) return;

    try {
      await requestCalendarNotes(`/${encodeURIComponent(date)}`, 'DELETE');
      closeDateDetails();
      await fetchMonthData();
      await Swal.fire({ icon: 'success', text: '달력 메모가 삭제되었습니다.' });
    } catch (error) {
      await Swal.fire({ icon: 'error', text: `메모 삭제 실패: ${error.message}` });
    }
  }

  if (closeDateDetailsBtn) closeDateDetailsBtn.addEventListener('click', closeDateDetails);
  if (addAllMonthEventsBtn && window.AndroidCalendar) {
    addAllMonthEventsBtn.style.display = 'block';
  }
  if (addAllMonthEventsBtn) {
    addAllMonthEventsBtn.addEventListener('click', async () => {
      if (!window.AndroidCalendar) return;
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
      const monthVacations = allVacations.filter(
        vacation => vacation.date >= monthStart && vacation.date <= monthEnd
      );
      if (monthVacations.length === 0) {
        Swal.fire({ icon: 'info', text: '현재 선택한 달에 등록된 휴무 일정이 없습니다.' });
        return;
      }

      const locationOptions = Array.from(locationCheckboxes)
        .filter(checkbox => !shiftFilterValues.includes(checkbox.value))
        .map(checkbox => ({
          value: checkbox.value,
          label: checkbox.closest('label')?.querySelector('.chip-label')?.textContent.trim()
            || checkbox.value
        }));
      const shiftOptions = Array.from(locationCheckboxes)
        .filter(checkbox => shiftFilterValues.includes(checkbox.value))
        .map(checkbox => ({
          value: checkbox.value,
          label: checkbox.closest('label')?.querySelector('.chip-label')?.textContent.trim()
            || checkbox.value
        }));
      const memberEvents = new Map();
      monthVacations.forEach(vacation => {
        const key = String(vacation.user_id || vacation.username || '');
        if (!key) return;
        const event = memberEvents.get(key) || { count: 0, name: vacation.username || '이름 없음' };
        event.count += 1;
        memberEvents.set(key, event);
      });
      const members = Array.from(memberEvents, ([id, event]) => {
        const profile = userMap[id] || userMap[event.name] || {};
        return {
          id,
          name: profile.name || event.name,
          workLocation: profile.work_location || '',
          color: safeMemberColor(profile.color),
          count: event.count
        };
      }).sort((left, right) => left.name.localeCompare(right.name, 'ko'));
      const memberById = new Map(members.map(member => [member.id, member]));
      const selectedMemberIds = new Set();
      const selectedLocations = new Set(locationOptions.map(option => option.value));
      const selectedShifts = new Set(shiftOptions.map(option => option.value));
      let visibleMemberIds = [];
      const monthLabel = `${year}년 ${month + 1}월`;
      const selectionResult = await Swal.fire({
        title: `${monthLabel} 일정 추가`,
        html: `
          <div class="calendar-export-picker">
            <section class="calendar-export-group" aria-label="근무지 선택">
              <div class="calendar-export-group-heading">
                <strong>근무지</strong>
                <button type="button" data-bulk-select="locations">전체 선택</button>
              </div>
              <div class="calendar-export-options">
                ${locationOptions.map(option => `
                  <label class="calendar-export-chip">
                    <input type="checkbox" data-location-filter value="${escapeHtml(option.value)}" checked>
                    <span>${escapeHtml(option.label)}</span>
                  </label>
                `).join('')}
              </div>
            </section>
            <section class="calendar-export-group" aria-label="근무 시간 선택">
              <div class="calendar-export-group-heading">
                <strong>근무 시간</strong>
                <button type="button" data-bulk-select="shifts">전체 선택</button>
              </div>
              <div class="calendar-export-options">
                ${shiftOptions.map(option => `
                  <label class="calendar-export-chip">
                    <input type="checkbox" data-shift-filter value="${escapeHtml(option.value)}" checked>
                    <span>${escapeHtml(option.label)}</span>
                  </label>
                `).join('')}
              </div>
            </section>
            <section class="calendar-export-group" aria-label="직원 선택">
              <div class="calendar-export-group-heading">
                <strong>직원 <span data-member-selection-count>0명 선택</span></strong>
                <button type="button" data-bulk-select="visible-members">표시 직원 모두 선택</button>
              </div>
              <div class="calendar-export-member-list" data-member-list></div>
            </section>
            <p class="calendar-export-help">선택한 직원의 ${monthLabel} 일정만 기기 캘린더에 추가합니다.</p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: '선택 일정 추가',
        cancelButtonText: '취소',
        focusConfirm: false,
        customClass: { popup: 'calendar-export-dialog' },
        didOpen: () => {
          const popup = Swal.getPopup();
          const list = popup.querySelector('[data-member-list]');
          const selectionCount = popup.querySelector('[data-member-selection-count]');
          const updateMemberList = () => {
            const visibleMembers = members.filter(member => {
              const location = member.workLocation.toLowerCase();
              const locationMatches = locationOptions.some(option =>
                selectedLocations.has(option.value) &&
                (option.value === otherLocationFilter
                  ? !locationFilterValues.some(value => location.includes(value.toLowerCase()))
                  : location.includes(option.value.toLowerCase()))
              );
              const isNightShift = location.includes('야간');
              const shiftMatches = shiftOptions.some(option =>
                selectedShifts.has(option.value) &&
                (option.value === '야간' ? isNightShift : !isNightShift)
              );
              return locationMatches && shiftMatches;
            });
            visibleMemberIds = visibleMembers.map(member => member.id);
            list.innerHTML = visibleMembers.length
              ? visibleMembers.map(member => `
                <label class="calendar-export-member">
                  <input type="checkbox" data-member-id="${escapeHtml(member.id)}"
                    ${selectedMemberIds.has(member.id) ? 'checked' : ''}>
                  <span class="calendar-export-member-color" style="--member-color: ${member.color}"></span>
                  <span class="calendar-export-member-name">${escapeHtml(member.name)}</span>
                  <span class="calendar-export-member-count">${member.count}건</span>
                </label>
              `).join('')
              : '<p class="calendar-export-empty">선택한 조건에 해당하는 직원이 없습니다.</p>';
            const visibleSelectedCount = visibleMembers.filter(member => selectedMemberIds.has(member.id)).length;
            selectionCount.textContent = `${visibleSelectedCount}명 선택`;
            const toggleButton = popup.querySelector('[data-bulk-select="visible-members"]');
            toggleButton.textContent = visibleMembers.length > 0 &&
              visibleSelectedCount === visibleMembers.length
              ? '표시 직원 선택 해제'
              : '표시 직원 모두 선택';
            list.querySelectorAll('[data-member-id]').forEach(checkbox => {
              checkbox.addEventListener('change', () => {
                if (checkbox.checked) selectedMemberIds.add(checkbox.dataset.memberId);
                else selectedMemberIds.delete(checkbox.dataset.memberId);
                updateMemberList();
              });
            });
          };

          popup.querySelectorAll('[data-location-filter]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
              if (checkbox.checked) selectedLocations.add(checkbox.value);
              else selectedLocations.delete(checkbox.value);
              updateMemberList();
            });
          });
          popup.querySelectorAll('[data-shift-filter]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
              if (checkbox.checked) selectedShifts.add(checkbox.value);
              else selectedShifts.delete(checkbox.value);
              updateMemberList();
            });
          });
          popup.querySelectorAll('[data-bulk-select="locations"], [data-bulk-select="shifts"]').forEach(button => {
            button.addEventListener('click', () => {
              const options = button.dataset.bulkSelect === 'locations' ? locationOptions : shiftOptions;
              const selected = button.dataset.bulkSelect === 'locations' ? selectedLocations : selectedShifts;
              if (selected.size === options.length) selected.clear();
              else options.forEach(option => selected.add(option.value));
              button.textContent = selected.size === options.length ? '전체 해제' : '전체 선택';
              popup.querySelectorAll(
                button.dataset.bulkSelect === 'locations' ? '[data-location-filter]' : '[data-shift-filter]'
              ).forEach(checkbox => { checkbox.checked = selected.has(checkbox.value); });
              updateMemberList();
            });
          });
          const updateFilterToggleLabels = () => {
            popup.querySelector('[data-bulk-select="locations"]').textContent =
              selectedLocations.size === locationOptions.length ? '전체 해제' : '전체 선택';
            popup.querySelector('[data-bulk-select="shifts"]').textContent =
              selectedShifts.size === shiftOptions.length ? '전체 해제' : '전체 선택';
          };
          popup.querySelectorAll('[data-location-filter], [data-shift-filter]').forEach(checkbox => {
            checkbox.addEventListener('change', updateFilterToggleLabels);
          });
          popup.querySelector('[data-bulk-select="visible-members"]').addEventListener('click', () => {
            const visibleIds = Array.from(list.querySelectorAll('[data-member-id]'))
              .map(checkbox => checkbox.dataset.memberId);
            const allVisibleSelected = visibleIds.every(id => selectedMemberIds.has(id));
            visibleIds.forEach(id => {
              if (allVisibleSelected) selectedMemberIds.delete(id);
              else selectedMemberIds.add(id);
            });
            updateFilterToggleLabels();
            updateMemberList();
          });
          updateMemberList();
        },
        preConfirm: () => {
          const selectedVisibleIds = visibleMemberIds.filter(id => selectedMemberIds.has(id));
          if (selectedVisibleIds.length === 0) {
            Swal.showValidationMessage('캘린더에 추가할 직원을 한 명 이상 선택해 주세요.');
            return false;
          }
          return selectedVisibleIds;
        }
      });
      if (!selectionResult.isConfirmed) return;

      const selectedIds = new Set(selectionResult.value);
      const selectedEvents = monthVacations
        .filter(vacation => selectedIds.has(String(vacation.user_id || vacation.username || '')))
        .map(vacation => {
          const key = String(vacation.user_id || vacation.username || '');
          const member = memberById.get(key);
          return {
            date: vacation.date,
            title: `${vacation.username || '휴무 일정'} - ${vacation.leave_type || '휴무'}`,
            description: [
              `종류: ${vacation.leave_type || '휴무'}`,
              vacation.time_detail ? `세부 시간: ${vacation.time_detail}` : '',
              vacation.hours_used ? `사용 시간: ${vacation.hours_used}시간` : '',
              vacation.memo ? `메모: ${vacation.memo}` : ''
            ].filter(Boolean).join('\n'),
            color: member?.color || '#38bdf8'
          };
        });
      if (selectedEvents.length === 0) {
        Swal.fire({ icon: 'info', text: '선택한 직원의 해당 월 일정이 없습니다.' });
        return;
      }
      window.AndroidCalendar.addAllMonthEvents(JSON.stringify(selectedEvents));
    });
  }
  if (dateDetailsModal) {
    dateDetailsModal.addEventListener('click', event => {
      if (event.target === dateDetailsModal) closeDateDetails();
    });
  }
  if (dateDetailsList) {
    dateDetailsList.addEventListener('click', event => {
      const button = event.target.closest('[data-detail-action]');
      if (!button) return;

      const action = button.dataset.detailAction;
      const vacation = allVacations.find(item => String(item.id) === button.dataset.id);
      if (action === 'edit-vacation' && vacation
        && (vacation.user_id === userId || userRole === 'admin')) {
        closeDateDetails();
        openEditModal(vacation);
      } else if (action === 'delete-vacation' && vacation) {
        deleteVacationFromDetails(vacation);
      } else if (action === 'add-calendar' && vacation && window.AndroidCalendar) {
        const title = `${vacation.username || '휴무 일정'} - ${vacation.leave_type || '휴무'}`;
        const description = [
          `종류: ${vacation.leave_type || '휴무'}`,
          vacation.time_detail ? `세부 시간: ${vacation.time_detail}` : '',
          vacation.hours_used ? `사용 시간: ${vacation.hours_used}시간` : '',
          vacation.memo ? `메모: ${vacation.memo}` : ''
        ].filter(Boolean).join('\n');
        const member = userMap[vacation.user_id] || userMap[vacation.username] || {};
        window.AndroidCalendar.addAllDayEvent(
          vacation.date,
          title,
          description,
          safeMemberColor(member.color)
        );
      } else if (action === 'edit-note' && userRole === 'admin') {
        closeDateDetails();
        openCalendarNoteModal(dateDetailsModal.dataset.date);
      } else if (action === 'delete-note' && userRole === 'admin') {
        deleteNoteFromDetails(dateDetailsModal.dataset.date);
      }
    });
  }

  if (openModalBtn) openModalBtn.addEventListener('click', () => openAddModal());
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (openBulkVacationBtn) openBulkVacationBtn.addEventListener('click', openBulkVacationModal);
  document.getElementById('closeBulkVacationBtn')?.addEventListener('click', closeBulkVacationModal);
  document.getElementById('cancelBulkVacationBtn')?.addEventListener('click', closeBulkVacationModal);
  if (bulkVacationModal) {
    bulkVacationModal.addEventListener('click', event => {
      if (event.target === bulkVacationModal) closeBulkVacationModal();
    });
  }
  if (vacationModal) {
    vacationModal.addEventListener('click', (e) => {
      if (e.target === vacationModal) closeModal();
    });
  }
  if (vacationForm) {
    vacationForm.addEventListener('keydown', (e) => {
      if (userRole === 'guest' || userRole === 'monitor') {
        e.preventDefault();
        return;
      }
      if (
        e.key !== 'Enter' ||
        e.isComposing ||
        e.target.matches('button, textarea, [type="submit"], [type="button"]') ||
        submitBtn.disabled
      ) return;

      e.preventDefault();
      vacationForm.requestSubmit(submitBtn);
    });
  }

  if (vLeaveType) {
    vLeaveType.addEventListener('change', () => {
      updateTimeDetailOptions(vLeaveType.value);
    });
  }

  if (vTargetUserId) vTargetUserId.required = false;
  if (vTimeDetail) {
    vTimeDetail.addEventListener('change', () => {
      updateHoursUsedInput(vLeaveType.value, vTimeDetail.value);
    });
  }

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      fetchMonthData();
    });
  }
  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      fetchMonthData();
    });
  }

  async function fetchMonthData() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (currentMonthDisplay) {
      currentMonthDisplay.textContent = `${year}년 ${month + 1}월`;
    }

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDayNum = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

    try {
      const [data, noteResult] = await Promise.all([
        listVacations(startDate, endDate),
        requestCalendarNotes(`?start=${startDate}&end=${endDate}`)
      ]);

      allVacations = data || [];
      allCalendarNotes = noteResult || [];
      renderCalendarGrid();
      renderStatistics();
      await renderSchedulePreview(year, month + 1);
    } catch (err) {
      console.error('휴무 데이터 조회 오류:', err);
      await Swal.fire({
        icon: 'error',
        text: `달력 데이터를 불러오지 못했습니다: ${err.message}`
      });
    }
  }

  async function renderSchedulePreview(year, month) {
    if (!schedulePreview) return;
    schedulePreview.innerHTML = '<div class="schedule-preview-message">엑셀 미리보기를 불러오는 중...</div>';

    try {
      if (!window.XLSX) throw new Error('엑셀 라이브러리를 불러오지 못했습니다.');
      if (!scheduleTemplateBuffer) {
        const response = await fetch(encodeURI('/templates/휴무일정표.xlsx'));
        if (!response.ok) throw new Error(`엑셀 양식을 불러오지 못했습니다. (HTTP ${response.status})`);
        scheduleTemplateBuffer = await response.arrayBuffer();
      }

      const workbook = XLSX.read(scheduleTemplateBuffer, { type: 'array', cellStyles: true });
      const sheet = workbook.Sheets['직원근무표'];
      if (!sheet) throw new Error('직원근무표 시트를 찾을 수 없습니다.');
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        range: 'A2:AH22',
        defval: '',
        raw: true
      });
      const lastDay = new Date(year, month, 0).getDate();
      const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
      rows[1][1] = month;
      rows[1][33] = year;

      for (let day = 1; day <= 31; day += 1) {
        const column = day + 1;
        rows[2][column] = day <= lastDay ? weekDays[new Date(year, month - 1, day).getDay()] : '';
        rows[3][column] = day <= lastDay ? day : '';
      }

      const employeeRows = new Map();
      for (let excelRow = 6; excelRow <= 21; excelRow += 1) {
        const rowIndex = excelRow - 2;
        const name = String(rows[rowIndex]?.[1] || '').trim();
        if (!name) continue;
        employeeRows.set(name, rowIndex);
        for (let day = 1; day <= 31; day += 1) rows[rowIndex][day + 1] = '';
      }

      const priority = { '시간차': 1, '연차': 2, '공가': 3, '휴무': 4 };
      const dateCells = new Map();
      allVacations.forEach(vacation => {
        const name = (vacation.username || '').trim();
        const rowIndex = employeeRows.get(name);
        if (rowIndex === undefined) return;

        const day = Number(vacation.date.slice(-2));
        if (!Number.isInteger(day) || day < 1 || day > lastDay) return;
        let value;
        if (vacation.leave_type === '휴무') value = '휴';
        else if (vacation.leave_type === '연차') value = '연';
        else if (vacation.leave_type === '공가') value = '공';
        else if (vacation.leave_type === '시간차') {
          value = Number(vacation.hours_used);
          if (!Number.isFinite(value) || value <= 0) {
            throw new Error(`${name} 님의 ${vacation.date} 시간차 사용 시간이 기록되지 않았습니다.`);
          }
        } else return;

        const key = `${rowIndex}:${day}`;
        const existing = dateCells.get(key);
        if (!existing || priority[vacation.leave_type] > existing.priority) {
          dateCells.set(key, { rowIndex, day, value, type: vacation.leave_type, priority: priority[vacation.leave_type] });
        } else if (existing.type === '시간차' && vacation.leave_type === '시간차') {
          existing.value += value;
        }
      });

      dateCells.forEach(({ rowIndex, day, value }) => {
        rows[rowIndex][day + 1] = value;
      });

      let totalCount = 0;
      for (let rowIndex = 4; rowIndex <= 19; rowIndex += 1) {
        if (!String(rows[rowIndex]?.[1] || '').trim()) continue;
        const count = rows[rowIndex].slice(2, 33).filter(value => value !== '').length;
        rows[rowIndex][33] = count;
        totalCount += count;
      }
      if (rows[20]) rows[20][33] = totalCount;

      const columnCount = Math.max(...rows.map(row => row.length));
      const body = rows.map((row, rowIndex) => {
        if (rowIndex === 0) {
          return `<tr><th class="schedule-title" colspan="${columnCount}">${escapeHtml(row[1] || '직원근무표')}</th></tr>`;
        }
        if (row.every(value => value === '')) {
          return `<tr class="schedule-preview-spacer"><td colspan="${columnCount}"></td></tr>`;
        }
        if (rowIndex === 1) {
          return `<tr>${row.map(value => `<td class="schedule-meta">${escapeHtml(value)}</td>`).join('')}</tr>`;
        }
        const isDayHeader = rowIndex === 2 || rowIndex === 3;
        const isEmployee = rowIndex >= 4 && rowIndex <= 19;
        const isGrandTotal = rowIndex === 20;
        const cells = row.map((value, columnIndex) => {
          const classes = [];
          if (isDayHeader) classes.push('schedule-header');
          if (isEmployee && columnIndex === 0) classes.push('schedule-shift');
          if (columnIndex === 33 && (isEmployee || isGrandTotal)) classes.push('schedule-total');
          if (isDayHeader && columnIndex >= 2 && columnIndex <= 32) {
            const day = columnIndex - 1;
            const dayOfWeek = new Date(year, month - 1, day).getDay();
            if (dayOfWeek === 0) classes.push('schedule-weekend');
            if (dayOfWeek === 6) classes.push('schedule-saturday');
          }
          const cellValue = typeof value === 'number' ? value.toLocaleString('ko-KR') : value;
          const tag = isDayHeader ? 'th' : 'td';
          return `<${tag}${classes.length ? ` class="${classes.join(' ')}"` : ''}>${escapeHtml(cellValue)}</${tag}>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

      schedulePreview.innerHTML = `
        <header class="schedule-preview-heading">
          <h3>직원 근무표 미리보기</h3>
          <span>${year}년 ${month}월 · 엑셀 시트 미리보기</span>
        </header>
        <div class="schedule-preview-scroll">
          <table class="schedule-preview-table">
            <colgroup>${Array.from({ length: columnCount }, (_, index) => {
              const className = index === 0
                ? 'schedule-shift-column'
                : index === 1
                  ? 'schedule-name-column'
                  : index === columnCount - 1
                    ? 'schedule-total-column'
                    : 'schedule-day-column';
              return `<col class="${className}">`;
            }).join('')}</colgroup>
            <tbody>${body}</tbody>
          </table>
        </div>
      `;
    } catch (error) {
      console.error('직원 근무표 미리보기 오류:', error);
      schedulePreview.innerHTML = `<div class="schedule-preview-message">${escapeHtml(`미리보기를 불러오지 못했습니다: ${error.message}`)}</div>`;
    }
  }

  async function exportWorkSchedule() {
    if (!window.XLSX) throw new Error('엑셀 라이브러리를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');

    const now = new Date();
    const monthOptions = Array.from({ length: 12 }, (_, index) =>
      `<option value="${index + 1}" ${index + 1 === now.getMonth() + 1 ? 'selected' : ''}>${index + 1}월</option>`
    ).join('');
    const selection = await Swal.fire({
      title: '직원 근무표 엑셀 내보내기',
      html: `
        <label for="exportYear" style="display:block;text-align:left;margin:8px 0 4px;">년도</label>
        <input id="exportYear" class="swal2-input" type="number" min="1900" max="9999" value="${now.getFullYear()}">
        <label for="exportMonth" style="display:block;text-align:left;margin:8px 0 4px;">월</label>
        <select id="exportMonth" class="swal2-select">${monthOptions}</select>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: '엑셀 다운로드',
      cancelButtonText: '취소',
      preConfirm: () => {
        const year = Number(document.getElementById('exportYear').value);
        const month = Number(document.getElementById('exportMonth').value);
        if (!Number.isInteger(year) || year < 1900 || year > 9999) {
          Swal.showValidationMessage('년도를 1900~9999 사이 숫자로 입력해 주세요.');
          return false;
        }
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          Swal.showValidationMessage('월을 선택해 주세요.');
          return false;
        }
        return { year, month };
      }
    });
    if (!selection.isConfirmed) return;

    await window.appLoading.loadScript('/lib/jszip/jszip.min.js');

    const { year, month } = selection.value;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const vacations = await listVacations(startDate, endDate);

    const templateResponse = await fetch(encodeURI('/templates/휴무일정표.xlsx'));
    if (!templateResponse.ok) {
      throw new Error(`엑셀 양식을 불러오지 못했습니다. (HTTP ${templateResponse.status})`);
    }

    const templateBuffer = await templateResponse.arrayBuffer();
    const workbook = XLSX.read(templateBuffer, { type: 'array', cellStyles: true });
    const workbookSheet = workbook.Sheets['직원근무표'];
    if (!workbookSheet) throw new Error('직원근무표 시트를 찾을 수 없습니다.');

    const zip = await JSZip.loadAsync(templateBuffer);
    const workbookPath = 'xl/workbook.xml';
    const relationshipsPath = 'xl/_rels/workbook.xml.rels';
    const workbookXml = new DOMParser().parseFromString(
      await zip.file(workbookPath).async('text'),
      'application/xml'
    );
    const relationshipsXml = new DOMParser().parseFromString(
      await zip.file(relationshipsPath).async('text'),
      'application/xml'
    );
    if (workbookXml.querySelector('parsererror') || relationshipsXml.querySelector('parsererror')) {
      throw new Error('엑셀 양식의 통합 문서 구조를 읽지 못했습니다.');
    }

    const relationshipNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const worksheetEntry = Array.from(workbookXml.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'sheet'
    )).find(sheet => sheet.getAttribute('name') === '직원근무표');
    if (!worksheetEntry) throw new Error('직원근무표 시트를 찾을 수 없습니다.');

    const relationshipId = worksheetEntry.getAttributeNS(relationshipNamespace, 'id');
    const relationship = Array.from(relationshipsXml.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/package/2006/relationships',
      'Relationship'
    )).find(item => item.getAttribute('Id') === relationshipId);
    if (!relationship) throw new Error('직원근무표 시트 경로를 찾을 수 없습니다.');

    const worksheetPath = `xl/${relationship.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, '')}`;
    const worksheetFile = zip.file(worksheetPath);
    if (!worksheetFile) throw new Error('직원근무표 시트 파일을 찾을 수 없습니다.');
    const spreadsheetNamespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const worksheetXml = new DOMParser().parseFromString(await worksheetFile.async('text'), 'application/xml');
    if (worksheetXml.querySelector('parsererror')) throw new Error('직원근무표 시트 XML을 읽지 못했습니다.');

    function setCellValue(cellAddress, value, inlineString = false) {
      if (value === '' && !inlineString) {
        delete workbookSheet[cellAddress];
      } else {
        workbookSheet[cellAddress] = inlineString
          ? { t: 's', v: String(value) }
          : { t: 'n', v: Number(value) };
      }

      const rowNumber = Number(cellAddress.match(/\d+$/)[0]);
      const row = Array.from(worksheetXml.getElementsByTagNameNS(spreadsheetNamespace, 'row'))
        .find(item => Number(item.getAttribute('r')) === rowNumber);
      if (!row) throw new Error(`엑셀 양식에서 ${rowNumber}행을 찾을 수 없습니다.`);

      let cell = Array.from(row.getElementsByTagNameNS(spreadsheetNamespace, 'c'))
        .find(item => item.getAttribute('r') === cellAddress);
      if (!cell) {
        cell = worksheetXml.createElementNS(spreadsheetNamespace, 'c');
        cell.setAttribute('r', cellAddress);
        const columnNumber = columnToNumber(cellAddress.replace(/\d+$/, ''));
        const styledCell = Array.from(row.getElementsByTagNameNS(spreadsheetNamespace, 'c'))
          .find(item => columnToNumber(item.getAttribute('r').replace(/\d+$/, '')) === columnNumber - 1);
        if (styledCell && styledCell.hasAttribute('s')) cell.setAttribute('s', styledCell.getAttribute('s'));

        const nextCell = Array.from(row.getElementsByTagNameNS(spreadsheetNamespace, 'c'))
          .find(item => columnToNumber(item.getAttribute('r').replace(/\d+$/, '')) > columnNumber);
        row.insertBefore(cell, nextCell || null);
      }

      cell.removeAttribute('t');
      for (const child of Array.from(cell.childNodes)) {
        if (child.nodeType === 1 && ['f', 'v', 'is'].includes(child.localName)) cell.removeChild(child);
      }

      const sheetCell = workbookSheet[cellAddress];
      if (!sheetCell) return;

      if (sheetCell.t === 's') {
        cell.setAttribute('t', 'inlineStr');
        const inlineValue = worksheetXml.createElementNS(spreadsheetNamespace, 'is');
        const text = worksheetXml.createElementNS(spreadsheetNamespace, 't');
        text.textContent = String(sheetCell.v);
        inlineValue.appendChild(text);
        cell.appendChild(inlineValue);
      } else {
        const numericValue = worksheetXml.createElementNS(spreadsheetNamespace, 'v');
        numericValue.textContent = String(sheetCell.v);
        cell.appendChild(numericValue);
      }
    }

    function columnToNumber(column) {
      return column.toUpperCase().split('').reduce((number, character) =>
        number * 26 + character.charCodeAt(0) - 64, 0);
    }

    setCellValue('B3', month);
    setCellValue('AH3', year);
    const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
    for (let day = 1; day <= 31; day += 1) {
      const column = numberToColumn(day + 2);
      if (day <= lastDay) {
        setCellValue(`${column}4`, weekdayLabels[new Date(year, month - 1, day).getDay()], true);
        setCellValue(`${column}5`, day);
      } else {
        setCellValue(`${column}4`, '');
        setCellValue(`${column}5`, '');
      }
    }
    const employeeRows = new Map();
    for (let row = 6; row <= 21; row++) {
      const employeeName = String(workbookSheet[`B${row}`]?.v || '').trim();
      if (!employeeName) continue;
      employeeRows.set(employeeName, row);
      for (let day = 1; day <= 31; day++) {
        setCellValue(`${numberToColumn(day + 2)}${row}`, '', false);
      }
    }

    function numberToColumn(number) {
      let column = '';
      while (number > 0) {
        const remainder = (number - 1) % 26;
        column = String.fromCharCode(65 + remainder) + column;
        number = Math.floor((number - 1) / 26);
      }
      return column;
    }

    const dateCells = new Map();
    const priority = { '시간차': 1, '연차': 2, '공가': 3, '휴무': 4 };
    const unmatchedNames = new Set();
    (vacations || []).forEach(vacation => {
      const name = (vacation.username || '').trim();
      const row = employeeRows.get(name);
      if (!row) {
        if (name) unmatchedNames.add(name);
        return;
      }

      const day = Number(vacation.date.slice(-2));
      if (!Number.isInteger(day) || day < 1 || day > lastDay) return;
      let cellValue;
      if (vacation.leave_type === '휴무') {
        cellValue = '휴';
      } else if (vacation.leave_type === '연차') {
        cellValue = '연';
      } else if (vacation.leave_type === '공가') {
        cellValue = '공';
      } else if (vacation.leave_type === '시간차') {
        const hours = Number(vacation.hours_used);
        if (!Number.isFinite(hours) || hours <= 0) {
          throw new Error(`${name} 님의 ${vacation.date} 시간차 사용 시간이 기록되지 않았습니다. 해당 일정을 수정해 사용 시간을 입력해 주세요.`);
        }
        cellValue = hours;
      } else {
        return;
      }

      const key = `${row}:${day}`;
      const existing = dateCells.get(key);
      if (!existing || priority[vacation.leave_type] > existing.priority) {
        dateCells.set(key, {
          row,
          day,
          value: cellValue,
          type: vacation.leave_type,
          priority: priority[vacation.leave_type]
        });
      } else if (existing.type === '시간차' && vacation.leave_type === '시간차') {
        existing.value += cellValue;
      }
    });

    dateCells.forEach(({ row, day, value }) => {
      setCellValue(`${numberToColumn(day + 2)}${row}`, value, typeof value === 'string');
    });

    const calcChainRelationship = Array.from(relationshipsXml.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/package/2006/relationships',
      'Relationship'
    )).find(item => item.getAttribute('Type').endsWith('/calcChain'));
    if (calcChainRelationship) {
      const calcChainTarget = calcChainRelationship.getAttribute('Target');
      const calcChainPathParts = (calcChainTarget.startsWith('/')
        ? calcChainTarget.slice(1)
        : `xl/${calcChainTarget}`).split('/');
      const normalizedCalcChainPath = [];
      calcChainPathParts.forEach(part => {
        if (part === '..') normalizedCalcChainPath.pop();
        else if (part !== '.' && part !== '') normalizedCalcChainPath.push(part);
      });
      const calcChainPath = normalizedCalcChainPath.join('/');
      const contentTypesPath = '[Content_Types].xml';
      const contentTypesFile = zip.file(contentTypesPath);
      if (!contentTypesFile) throw new Error('엑셀 양식의 콘텐츠 형식 정보를 찾을 수 없습니다.');

      const contentTypesXml = new DOMParser().parseFromString(
        await contentTypesFile.async('text'),
        'application/xml'
      );
      if (contentTypesXml.querySelector('parsererror')) {
        throw new Error('엑셀 양식의 콘텐츠 형식 정보를 읽지 못했습니다.');
      }

      const contentTypesNamespace = 'http://schemas.openxmlformats.org/package/2006/content-types';
      const calcChainOverride = Array.from(contentTypesXml.getElementsByTagNameNS(
        contentTypesNamespace,
        'Override'
      )).find(item => item.getAttribute('PartName') === `/${calcChainPath}`);
      if (calcChainOverride) calcChainOverride.parentNode.removeChild(calcChainOverride);

      calcChainRelationship.parentNode.removeChild(calcChainRelationship);
      zip.remove(calcChainPath);
      zip.file(contentTypesPath, new XMLSerializer().serializeToString(contentTypesXml));
      zip.file(relationshipsPath, new XMLSerializer().serializeToString(relationshipsXml));
    }

    const calculation = workbookXml.getElementsByTagNameNS(spreadsheetNamespace, 'calcPr')[0]
      || workbookXml.createElementNS(spreadsheetNamespace, 'calcPr');
    calculation.setAttribute('calcMode', 'auto');
    calculation.setAttribute('fullCalcOnLoad', '1');
    calculation.setAttribute('forceFullCalc', '1');
    if (!calculation.parentNode) workbookXml.documentElement.appendChild(calculation);

    zip.file(workbookPath, new XMLSerializer().serializeToString(workbookXml));
    zip.file(worksheetPath, new XMLSerializer().serializeToString(worksheetXml));
    const output = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const fileName = `직원근무표_${year}년_${month}월.xlsx`;
    if (window.AndroidExcelExporter) {
      const bytes = output;
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      window.AndroidExcelExporter.saveExcel(btoa(binary), fileName);
    } else {
      const blob = new Blob([output], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    }

    if (unmatchedNames.size > 0) {
      await Swal.fire({
        icon: 'warning',
        title: '엑셀 다운로드 완료',
        text: `양식에서 이름을 찾지 못해 제외된 직원: ${[...unmatchedNames].join(', ')}`
      });
    }
  }

  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', async () => {
      exportExcelBtn.disabled = true;
      try {
        await exportWorkSchedule();
      } catch (error) {
        await Swal.fire({ icon: 'error', text: `엑셀 내보내기 실패: ${error.message}` });
      } finally {
        exportExcelBtn.disabled = false;
      }
    });
  }

  function renderStatistics() {
    if (!statsGridContainer) return;

    if (statsTitle) {
      statsTitle.textContent = `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월 팀원별 휴무/연차 통계`;
    }

    const checkedLocations = Array.from(locationCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    const targetMembers = allTeamMembers.filter(member =>
      matchesLocationFilter(member.work_location, checkedLocations)
    );

    if (targetMembers.length === 0) {
      statsGridContainer.innerHTML = '<div class="stats-empty">선택된 팀원이 없습니다. 근무지 필터를 확인해 주세요.</div>';
      if (totalMonthVacationCount) totalMonthVacationCount.textContent = '총 0건 사용';
      return;
    }

    const memberStats = targetMembers.map(member => {
      const mName = member.name || member.username || '이름 없음';
      const mColor = safeMemberColor(member.color);
      const normalizedLocation = (member.work_location || '').toLowerCase();
      const workplace = locationFilterValues.find(location =>
        normalizedLocation.includes(location.toLowerCase())
      ) || '기타';

      const memberVacations = allVacations.filter(v =>
        member.id ? v.user_id === member.id : v.username === mName
      );

      let offCount = 0;
      let annualCount = 0;
      let timeCount = 0;
      let officialCount = 0;
      const dayList = [];

      memberVacations.forEach(v => {
        if (v.leave_type === '연차') annualCount++;
        else if (v.leave_type === '시간차') timeCount++;
        else if (v.leave_type === '공가') officialCount++;
        else offCount++;

        const dayNum = parseInt(v.date.split('-')[2], 10);
        if (!dayList.includes(dayNum)) dayList.push(dayNum);
      });

      dayList.sort((a, b) => a - b);
      const datesString = dayList.length > 0 ? dayList.join(', ') : '사용일 없음';

      return {
        name: mName,
        color: mColor,
        workplace,
        usageCount: memberVacations.length,
        offCount,
        annualCount,
        timeCount,
        officialCount,
        datesString
      };
    });
    const totalMonthCount = memberStats.reduce((total, member) => total + member.usageCount, 0);
    const workplaceOrder = [...locationFilterValues, '기타'];
    const workplaceGroups = workplaceOrder
      .map(workplace => ({
        workplace,
        members: memberStats.filter(member => member.workplace === workplace)
      }))
      .filter(group => group.members.length > 0);
    const workplaceColors = {
      스키장: '#38bdf8',
      골프장: '#86efac',
      현관: '#fbbf24',
      기타: '#c4b5fd'
    };

    if (currentStatsView === 'table') {
      statsGridContainer.innerHTML = `
        ${workplaceGroups.map(group => `
          <section class="stats-location-group" style="--group-color: ${workplaceColors[group.workplace] || '#c4b5fd'};">
            <header class="stats-group-heading">
              <h4>${escapeHtml(group.workplace)} 근무처</h4>
              <span class="stats-group-meta">${group.members.length}명 · ${group.members.reduce((sum, member) => sum + member.usageCount, 0)}건</span>
            </header>
            <div class="stats-table-wrap">
              <table class="stats-table">
                <thead>
                  <tr>
                    <th scope="col">팀원</th>
                    <th scope="col">전체</th>
                    <th scope="col">휴무</th>
                    <th scope="col">연차</th>
                    <th scope="col">시간차</th>
                    <th scope="col">공가</th>
                    <th scope="col">사용일</th>
                  </tr>
                </thead>
                <tbody>
                  ${group.members.map(member => `
                    <tr>
                      <td class="stats-table-name" style="border-left: 3px solid ${member.color};">${escapeHtml(member.name)}</td>
                      <td class="stats-table-total">${member.usageCount}건</td>
                      <td>${member.offCount}</td>
                      <td>${member.annualCount}</td>
                      <td>${member.timeCount}</td>
                      <td>${member.officialCount}</td>
                      <td class="stats-table-dates">${escapeHtml(member.datesString)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </section>
        `).join('')}
      `;
    } else {
      statsGridContainer.innerHTML = workplaceGroups.map(group => {
        const maxUsage = Math.max(...group.members.map(member => member.usageCount), 1);
        return `
          <section class="stats-location-group" style="--group-color: ${workplaceColors[group.workplace] || '#c4b5fd'};">
            <header class="stats-group-heading">
              <h4>${escapeHtml(group.workplace)} 근무처</h4>
              <span class="stats-group-meta">${group.members.length}명 · ${group.members.reduce((sum, member) => sum + member.usageCount, 0)}건</span>
            </header>
            <div class="stats-location-cards">
              ${group.members.map(member => {
                const gaugePercent = Math.round((member.usageCount / maxUsage) * 100);
                return `
                  <article class="stat-card" style="--member-color: ${member.color}; --usage-width: ${gaugePercent}%;">
                    <div class="stat-card-top">
                      <div class="stat-name">${escapeHtml(member.name)}</div>
                      <span class="stats-total">${member.usageCount}건</span>
                    </div>

                    <div class="stat-badges" aria-label="휴무 유형별 사용 건수">
                      <span class="stat-badge-item" data-type="휴무">휴무 <strong>${member.offCount}</strong></span>
                      <span class="stat-badge-item" data-type="연차">연차 <strong>${member.annualCount}</strong></span>
                      <span class="stat-badge-item" data-type="시간차">시간차 <strong>${member.timeCount}</strong></span>
                      <span class="stat-badge-item" data-type="공가">공가 <strong>${member.officialCount}</strong></span>
                    </div>

                    <div>
                      <div class="stat-usage"><span>근무처 내 사용량</span><strong>${member.usageCount}건</strong></div>
                      <div class="stat-usage-track" aria-hidden="true"><div class="stat-usage-bar"></div></div>
                    </div>

                    <div class="stat-dates">
                      <span class="stat-dates-title">사용 날짜</span>
                      <span class="stat-dates-list">${escapeHtml(member.datesString)}</span>
                    </div>
                  </article>
                `;
              }).join('')}
            </div>
          </section>
        `;
      }).join('');
    }

    if (totalMonthVacationCount) {
      totalMonthVacationCount.textContent = `총 ${totalMonthCount}건 사용`;
    }
  }

  statsViewButtons.forEach(button => {
    button.addEventListener('click', () => {
      currentStatsView = button.dataset.statsView === 'table' ? 'table' : 'cards';
      if (statsGridContainer) statsGridContainer.dataset.view = currentStatsView;
      statsViewButtons.forEach(viewButton => {
        viewButton.setAttribute('aria-pressed', String(viewButton.dataset.statsView === currentStatsView));
      });
      renderStatistics();
    });
  });

  function renderCalendarGrid() {
    if (!calendarGrid) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const prevLastDay = new Date(year, month, 0).getDate();

    const todayStr = getKSTDateString();

    const checkedLocations = Array.from(locationCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    let gridHTML = `
      <div class="day-name">일</div>
      <div class="day-name">월</div>
      <div class="day-name">화</div>
      <div class="day-name">수</div>
      <div class="day-name">목</div>
      <div class="day-name">금</div>
      <div class="day-name">토</div>
    `;

    for (let i = firstDayIndex; i > 0; i--) {
      const dayNum = prevLastDay - i + 1;
      gridHTML += `<div class="calendar-cell other-month"><div class="cell-date">${dayNum}</div></div>`;
    }

    for (let i = 1; i <= lastDay; i++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(i).padStart(2, '0');
      const dateString = `${year}-${monthStr}-${dayStr}`;
      const isToday = (dateString === todayStr);

      let dayEvents = allVacations.filter(v => v.date === dateString);

      dayEvents = dayEvents.filter(ev => {
        const userInfo = userMap[ev.user_id] || userMap[ev.username] || { work_location: '' };
        const userLoc = userInfo.work_location;
        return matchesLocationFilter(userLoc, checkedLocations);
      });

      dayEvents.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
      const calendarNote = allCalendarNotes.find(item => item.date === dateString);
      const noteSummary = calendarNote
        ? `${calendarNote.emoji ? `<span class="calendar-note-indicator" title="${escapeHtml(`${calendarNote.emoji} ${calendarNote.content}`)}" aria-label="달력 메모: ${escapeHtml(calendarNote.content)}">${escapeHtml(calendarNote.emoji)}</span>` : ''}<span class="calendar-note-text" title="${escapeHtml(calendarNote.content)}">${escapeHtml(calendarNote.content)}</span>`
        : '';

      gridHTML += `
        <div class="calendar-cell ${isToday ? 'today' : ''}" data-date="${dateString}">
          <div class="cell-date">
            <span>${i}</span>
            ${noteSummary}
          </div>
          <div class="cell-events">
            ${dayEvents.map(ev => {
              const userInfo = userMap[ev.user_id] || userMap[ev.username] || { color: '#38bdf8' };
              const userColor = safeMemberColor(userInfo.color);
              const leaveTypeClass = ['휴무', '연차', '시간차', '공가'].includes(ev.leave_type) ? ev.leave_type : '';
              
              // ★ 수정: getLeaveIndicator 호출 시 userColor 전달
              const leaveIndicator = getLeaveIndicator(ev.leave_type, userColor);
              
              return `
                <div class="event-pill ${leaveTypeClass}" data-id="${escapeHtml(ev.id)}" title="${escapeHtml(`${ev.username || '이름 없음'} (${ev.leave_type || '휴무'} -${ev.time_detail || '종일'})`)}" style="--event-color: ${userColor};">
                  ${leaveIndicator}${escapeHtml(ev.username || '이름 없음')}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    const totalCells = firstDayIndex + lastDay;
    const nextDaysCount = totalCells <= 35 ? (35 - totalCells) : (42 - totalCells);
    for (let i = 1; i <= nextDaysCount; i++) {
      gridHTML += `<div class="calendar-cell other-month"><div class="cell-date">${i}</div></div>`;
    }

    calendarGrid.innerHTML = gridHTML;

    calendarGrid.querySelectorAll('.calendar-cell').forEach(cell => {
      const dateStr = cell.getAttribute('data-date');
      if (!dateStr) return;

      let longPressTimer;
      let longPressTriggered = false;
      let pointerStartX = 0;
      let pointerStartY = 0;

      function cancelLongPress() {
        window.clearTimeout(longPressTimer);
      }

      cell.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        longPressTriggered = false;
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        cancelLongPress();
        longPressTimer = window.setTimeout(() => {
          longPressTriggered = true;
          openDateDetails(dateStr);
        }, 550);
      });
      cell.addEventListener('pointermove', event => {
        if (Math.abs(event.clientX - pointerStartX) > 12 || Math.abs(event.clientY - pointerStartY) > 12) {
          cancelLongPress();
        }
      });
      cell.addEventListener('pointerup', cancelLongPress);
      cell.addEventListener('pointercancel', () => {
        cancelLongPress();
        longPressTriggered = false;
      });
      cell.addEventListener('pointerleave', cancelLongPress);

      cell.addEventListener('click', (e) => {
        if (longPressTriggered) {
          longPressTriggered = false;
          e.preventDefault();
          return;
        }
        if (e.target.closest('.calendar-note-indicator, .calendar-note-text')) {
          openCalendarNoteModal(dateStr);
          return;
        }
        const pill = e.target.closest('.event-pill');
        if (pill) {
          const evId = pill.getAttribute('data-id');
          const targetEv = allVacations.find(v => v.id == evId);
          if (targetEv) openEditModal(targetEv);
          return;
        }
        openAddModal(dateStr);
      });
    });
  }

  locationCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const checkedLocations = Array.from(locationCheckboxes)
        .filter(checkbox => checkbox.checked)
        .map(checkbox => checkbox.value);
      if (preferences) preferences.saveCalendarFilters(checkedLocations);
      if (selectAllLocBtn) {
        selectAllLocBtn.textContent = Array.from(locationCheckboxes).every(checkbox => checkbox.checked)
          ? '전체 해제'
          : '전체 선택';
      }
      renderCalendarGrid();
      renderStatistics();
    });
  });

  if (selectAllLocBtn) {
    selectAllLocBtn.addEventListener('click', () => {
      const allChecked = Array.from(locationCheckboxes).every(cb => cb.checked);
      locationCheckboxes.forEach(cb => { cb.checked = !allChecked; });
      selectAllLocBtn.textContent = allChecked ? '전체 선택' : '전체 해제';
      if (preferences) {
        preferences.saveCalendarFilters(Array.from(locationCheckboxes)
          .filter(checkbox => checkbox.checked)
          .map(checkbox => checkbox.value));
      }
      renderCalendarGrid();
      renderStatistics();
    });
  }

  if (vacationForm) {
    vacationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (userRole === 'guest' || userRole === 'monitor') return;
      const vacId = editVacationId ? editVacationId.value : '';
      const date = vDate ? vDate.value : '';
      const leave_type = vLeaveType ? vLeaveType.value : '휴무';
      const time_detail = vTimeDetail ? vTimeDetail.value : '종일';
      const hours_used = leave_type === '시간차' ? Number(vHoursUsed.value) : null;
      const memo = vMemo ? vMemo.value.trim() : '';

      let targetUserId = userId;
      let targetUserName = userName;

      if (userRole === 'admin' && vTargetUserId && vTargetUserId.value) {
        targetUserId = vTargetUserId.value;
        const selectedOption = vTargetUserId.options[vTargetUserId.selectedIndex];
        if (selectedOption) {
          targetUserName = selectedOption.getAttribute('data-name');
        }
      }

      if (!date) {
        await Swal.fire({
          icon: 'warning',
          text: '날짜를 선택해 주세요.'
        });
        return;
      }

      const originalSubmitText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '처리 중...';
      }

      try {
        if (activeModalTab === 'note') {
          if (userRole !== 'admin') throw new Error('관리자만 달력 메모를 등록할 수 있습니다.');
          const content = calendarNoteContent ? calendarNoteContent.value.trim() : '';
          await requestCalendarNotes('', 'PUT', {
            date,
            emoji: selectedNoteEmoji,
            content
          });
          await Swal.fire({
            icon: 'success',
            text: editCalendarNote?.value ? '달력 메모가 수정되었습니다.' : '달력 메모가 등록되었습니다.'
          });
          closeModal();
          await fetchMonthData();
          return;
        }

        if (vacId) {
          const updatePayload = { date, leave_type, time_detail, hours_used, memo };
          if (userRole === 'admin') {
            updatePayload.user_id = targetUserId;
            updatePayload.username = targetUserName;
          }

          await mutateVacation(encodeURIComponent(vacId), 'PATCH', updatePayload);
          await Swal.fire({
            icon: 'success',
            text: '휴무 일정이 수정되었습니다.'
          });
        } else {
          await mutateVacation('create', 'POST', {
            user_id: targetUserId,
            username: targetUserName,
            date,
            leave_type,
            time_detail,
            hours_used,
            memo
          });
          await Swal.fire({
            icon: 'success',
            text: '휴무 일정이 등록되었습니다.'
          });
        }

        closeModal();
        const [year, month] = date.split('-').map(Number);
        currentDate = new Date(year, month - 1, 1);
        await fetchMonthData();
      } catch (err) {
        await Swal.fire({
          icon: 'error',
          text: `오류: ${err.message}`
        });
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalSubmitText;
        }
      }
    });
  }

  if (bulkVacationForm) {
    bulkVacationForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (userRole === 'guest' || userRole === 'monitor') return;
      if (bulkDaysInput.validationMessage) {
        bulkDaysInput.reportValidity();
        return;
      }

      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const selectedDates = [...bulkSelectedDays]
        .sort((a, b) => a - b)
        .map(day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      const targetId = getBulkTargetUserId();
      const existingVacations = getExistingBulkVacations(targetId);
      const selectedDateSet = new Set(selectedDates);
      const existingDateSet = new Set(existingVacations.map(vacation => vacation.date));
      const vacationsToDelete = existingVacations.filter(vacation => !selectedDateSet.has(vacation.date));
      const datesToCreate = selectedDates.filter(date => !existingDateSet.has(date));

      if (selectedDates.length === 0 && vacationsToDelete.length === 0) {
        await Swal.fire({ icon: 'warning', text: '등록하거나 삭제할 휴무가 없습니다.' });
        return;
      }

      submitBulkVacationBtn.disabled = true;
      submitBulkVacationBtn.textContent = '저장 중...';
      let changed = false;
      try {
        for (const vacation of vacationsToDelete) {
          await mutateVacation(`delete/${encodeURIComponent(vacation.id)}`, 'DELETE');
          changed = true;
        }

        let addedCount = 0;
        if (datesToCreate.length > 0) {
          const payload = {
            dates: datesToCreate,
            memo: bulkMemoInput.value.trim()
          };
          if (userRole === 'admin') payload.user_id = targetId;
          const result = await mutateVacation('bulk', 'POST', payload);
          addedCount = result.count;
          changed = true;
        }

        closeBulkVacationModal();
        await fetchMonthData();
        await Swal.fire({
          icon: 'success',
          text: `휴무 일정을 반영했습니다. (등록 ${addedCount}건, 삭제 ${vacationsToDelete.length}건)`
        });
      } catch (error) {
        await Swal.fire({
          icon: 'error',
          text: `휴무 일괄 등록 실패: ${error.message}`
        });
        if (changed) await fetchMonthData();
      } finally {
        submitBulkVacationBtn.disabled = false;
        submitBulkVacationBtn.textContent = '변경사항 저장';
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (activeModalTab === 'note') {
        const noteDate = vDate ? vDate.value : '';
        const result = await Swal.fire({
          icon: 'warning',
          text: '이 날짜의 달력 메모를 삭제하시겠습니까?',
          showCancelButton: true,
          confirmButtonText: '삭제',
          cancelButtonText: '취소',
          reverseButtons: true
        });
        if (!result.isConfirmed) return;

        deleteBtn.disabled = true;
        try {
          await requestCalendarNotes(`/${encodeURIComponent(noteDate)}`, 'DELETE');
          await Swal.fire({ icon: 'success', text: '달력 메모가 삭제되었습니다.' });
          closeModal();
          await fetchMonthData();
        } catch (err) {
          await Swal.fire({ icon: 'error', text: `메모 삭제 실패: ${err.message}` });
        } finally {
          deleteBtn.disabled = false;
        }
        return;
      }

      const vacId = editVacationId ? editVacationId.value : '';
      const result = await Swal.fire({
        icon: 'warning',
        text: '정말 이 휴무 일정을 삭제하시겠습니까?',
        showCancelButton: true,
        confirmButtonText: '삭제',
        cancelButtonText: '취소',
        reverseButtons: true
      });
      if (!result.isConfirmed) return;

      deleteBtn.disabled = true;
      try {
        await mutateVacation(`delete/${encodeURIComponent(vacId)}`, 'DELETE');
        await Swal.fire({
          icon: 'success',
          text: '삭제되었습니다.'
        });
        closeModal();
        fetchMonthData();
      } catch (err) {
        await Swal.fire({
          icon: 'error',
          text: `삭제 실패: ${err.message}`
        });
      } finally {
        deleteBtn.disabled = false;
      }
    });
  }

  if (selectAllLocBtn) {
    selectAllLocBtn.textContent = Array.from(locationCheckboxes).every(checkbox => checkbox.checked)
      ? '전체 해제'
      : '전체 선택';
  }
  await fetchUsersInfo();
  fetchMonthData();
});