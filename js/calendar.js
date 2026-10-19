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
  const targetUserFormGroup = document.getElementById('targetUserFormGroup');
  const vTargetUserId = document.getElementById('vTargetUserId');
  const VACATIONS_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/vacations';
  const CALENDAR_NOTES_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/calendar-notes';
  const CALENDAR_NOTE_EMOJIS = ['📌', '📣', '🎉', '⚠️', '📅', '🎂', '🏖️', '🏥', '🚨', '✅', '⭐', '🎁', '🍀', '☕', '📝', '💡'];

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
  let activeModalTab = 'schedule';
  let selectedNoteEmoji = '';

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
      const { data, error } = await supabaseClient
        .from('users')
        .select('id, name, username, work_location, color')
        .order('name', { ascending: true });

      if (!error && data) {
        allTeamMembers = data;
        data.forEach(u => {
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
          vTargetUserId.innerHTML = data.map(u => {
            const memberName = u.name || u.username;
            return `<option value="${escapeHtml(u.id)}" data-name="${escapeHtml(memberName)}">${escapeHtml(memberName)}</option>`;
          }).join('');
        }
      }
    } catch (err) {
      console.error('유저 정보 로드 오류:', err);
    }
  }

  function openAddModal(selectedDateStr = '') {
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
      const canManage = vacation.user_id === userId || userRole === 'admin';
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
  if (vacationModal) {
    vacationModal.addEventListener('click', (e) => {
      if (e.target === vacationModal) closeModal();
    });
  }
  if (vacationForm) {
    vacationForm.addEventListener('keydown', (e) => {
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
      const [{ data, error }, noteResult] = await Promise.all([
        supabaseClient
          .from('vacations')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true }),
        requestCalendarNotes(`?start=${startDate}&end=${endDate}`)
      ]);

      if (error) throw error;
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

      const priority = { '시간차': 1, '연차': 2, '휴무': 3 };
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
          <table class="schedule-preview-table"><tbody>${body}</tbody></table>
        </div>
      `;
    } catch (error) {
      console.error('직원 근무표 미리보기 오류:', error);
      schedulePreview.innerHTML = `<div class="schedule-preview-message">${escapeHtml(`미리보기를 불러오지 못했습니다: ${error.message}`)}</div>`;
    }
  }

  async function exportWorkSchedule() {
    if (!window.XLSX || !window.JSZip) {
      throw new Error('엑셀 라이브러리를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    }

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

    const { year, month } = selection.value;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const { data: vacations, error } = await supabaseClient
      .from('vacations')
      .select('username, date, leave_type, time_detail, hours_used')
      .gte('date', startDate)
      .lte('date', endDate);
    if (error) throw error;

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
    const priority = { '시간차': 1, '연차': 2, '휴무': 3 };
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

    const checkedLocations = Array.from(locationCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    const targetMembers = allTeamMembers.filter(member =>
      matchesLocationFilter(member.work_location, checkedLocations)
    );

    if (targetMembers.length === 0) {
      statsGridContainer.innerHTML = `<div style="color: var(--text-sub); font-size: 13px; text-align: center; padding: 15px; grid-column: span 2;">선택된 팀원이 없습니다.</div>`;
      if (totalMonthVacationCount) totalMonthVacationCount.textContent = '총 0건 사용';
      return;
    }

    let totalMonthCount = 0;

    statsGridContainer.innerHTML = targetMembers.map(member => {
      const mName = member.name || member.username || '이름 없음';
      const mColor = safeMemberColor(member.color);

      const memberVacations = allVacations.filter(v => v.username === mName);
      totalMonthCount += memberVacations.length;

      let offCount = 0;
      let annualCount = 0;
      let timeCount = 0;
      const dayList = [];

      memberVacations.forEach(v => {
        if (v.leave_type === '연차') annualCount++;
        else if (v.leave_type === '시간차') timeCount++;
        else offCount++;

        const dayNum = parseInt(v.date.split('-')[2], 10);
        if (!dayList.includes(dayNum)) dayList.push(dayNum);
      });

      dayList.sort((a, b) => a - b);
      const datesString = dayList.length > 0 ? dayList.join(', ') : '사용일 없음';

      const usageCount = memberVacations.length;
      const gaugePercent = Math.min(Math.round((usageCount / 5) * 100), 100);

      return `
        <div class="stat-card" style="border-left: 3px solid ${mColor};">
          <div class="stat-card-top">
            <div class="stat-name">${escapeHtml(mName)}</div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <div style="background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.3); padding: 2px 8px; border-radius: 8px; font-size: 13px; font-weight: 800; color: var(--primary);">
                총 <span style="font-size: 15px;">${usageCount}</span>일
              </div>
            </div>
          </div>

          <div class="stat-badges" style="font-size: 11px; color: var(--text-sub);">
            <span>휴무 ${offCount}</span> • <span>연차 ${annualCount}</span> ${timeCount > 0 ? `• <span>시간차 ${timeCount}</span>` : ''}
          </div>
          
          <div style="width: 100%; background: rgba(255,255,255,0.08); height: 7px; border-radius: 4px; overflow: hidden;">
            <div style="width: ${gaugePercent}%; background: ${usageCount > 5 ? '#f87171' : mColor}; height: 100%; border-radius: 4px; transition: width 0.4s ease;"></div>
          </div>

          <div class="stat-dates">
            <span class="stat-dates-title">📅 사용일:</span>
            <span class="stat-dates-list">${escapeHtml(datesString)}</span>
          </div>
        </div>
      `;
    }).join('');

    if (totalMonthVacationCount) {
      totalMonthVacationCount.textContent = `총 ${totalMonthCount}건 사용`;
    }
  }

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
              const leaveTypeClass = ['휴무', '연차', '시간차'].includes(ev.leave_type) ? ev.leave_type : '';
              
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