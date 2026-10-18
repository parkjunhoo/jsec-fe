document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return;
  }

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

  const editVacationId = document.getElementById('editVacationId');
  const vDate = document.getElementById('vDate');
  const vLeaveType = document.getElementById('vLeaveType');
  const vTimeDetail = document.getElementById('vTimeDetail');
  const vMemo = document.getElementById('vMemo');

  // 필터 및 정렬 요소
  const sortSelect = document.getElementById('sortSelect');
  const locationCheckboxes = document.querySelectorAll('input[name="locFilter"]');

  let currentDate = new Date();
  let allVacations = [];
  let userColorMap = {}; // 사용자별 컬러 매핑 객체 (user_id 또는 username 기준)

  // 1. users 테이블에서 전체 팀원들의 고유 color 정보 미리 가져오기
  async function fetchUserColors() {
    try {
      const { data, error } = await supabaseClient
        .from('users')
        .select('id, name, username, color');

      if (!error && data) {
        data.forEach(u => {
          const keyName = u.name || u.username;
          if (keyName) userColorMap[keyName] = u.color || '#38bdf8';
          if (u.id) userColorMap[u.id] = u.color || '#38bdf8';
        });
      }
    } catch (err) {
      console.error('유저 컬러 로드 오류:', err);
    }
  }

  function openAddModal(selectedDateStr = '') {
    modalTitle.textContent = '휴무 일정 등록';
    submitBtn.textContent = '등록 완료';
    deleteBtn.style.display = 'none';
    vacationForm.reset();
    editVacationId.value = '';
    vDate.value = selectedDateStr || getKSTDateString();
    vacationModal.classList.add('active');
  }

  function openEditModal(vacation) {
    if (vacation.user_id !== userId && userRole !== 'admin') {
      alert('본인이 등록한 일정만 수정할 수 있습니다.');
      return;
    }

    modalTitle.textContent = '휴무 일정 수정 / 삭제';
    submitBtn.textContent = '수정 완료';
    deleteBtn.style.display = 'block';

    editVacationId.value = vacation.id;
    vDate.value = vacation.date;
    vLeaveType.value = vacation.leave_type;
    vTimeDetail.value = vacation.time_detail || '종일';
    vMemo.value = vacation.memo || '';

    vacationModal.classList.add('active');
  }

  function closeModal() {
    vacationModal.classList.remove('active');
    vacationForm.reset();
  }

  if (openModalBtn) openModalBtn.addEventListener('click', () => openAddModal());
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (vacationModal) {
    vacationModal.addEventListener('click', (e) => {
      if (e.target === vacationModal) closeModal();
    });
  }

  vLeaveType.addEventListener('change', (e) => {
    if (e.target.value === '연차' || e.target.value === '휴무') {
      vTimeDetail.innerHTML = '<option value="종일">종일</option>';
    } else {
      vTimeDetail.innerHTML = `
        <option value="오전반차">오전반차</option>
        <option value="오후반차">오후반차</option>
        <option value="시간지정">시간지정</option>
      `;
    }
  });

  prevMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    fetchMonthData();
  });
  nextMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    fetchMonthData();
  });

  async function fetchMonthData() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    currentMonthDisplay.textContent = `${year}년 ${month + 1}월`;

    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDayNum = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

    try {
      // 캘린더 휴무 데이터 및 유저 정보 조인(또는 별도 유저 상세정보)을 위해 users 정보와 함께 혹은 개별 매칭
      const { data, error } = await supabaseClient
        .from('vacations')
        .select(`
          *,
          users:user_id (work_location, color)
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (error) throw error;
      
      allVacations = data || [];
      renderCalendarGrid();
    } catch (err) {
      console.error('휴무 데이터 조회 오류:', err);
    }
  }

  function renderCalendarGrid() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const prevLastDay = new Date(year, month, 0).getDate();

    const todayStr = getKSTDateString();

    // 1. 체크된 필터 조건 수집
    const checkedLocations = Array.from(locationCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    // 2. 정렬 기준 가져오기
    const sortVal = sortSelect ? sortSelect.value : 'name_asc';

    let gridHTML = `
      <div class="day-name">일</div>
      <div class="day-name">월</div>
      <div class="day-name">화</div>
      <div class="day-name">수</div>
      <div class="day-name">목</div>
      <div class="day-name">금</div>
      <div class="day-name">토</div>
    `;

    // 이전 달 공백 채우기
    for (let i = firstDayIndex; i > 0; i--) {
      const dayNum = prevLastDay - i + 1;
      gridHTML += `<div class="calendar-cell other-month"><div class="cell-date">${dayNum}</div></div>`;
    }

    // 이번 달 날짜 채우기
    for (let i = 1; i <= lastDay; i++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(i).padStart(2, '0');
      const dateString = `${year}-${monthStr}-${dayStr}`;
      const isToday = (dateString === todayStr);

      // 해당 날짜 이벤트 필터링
      let dayEvents = allVacations.filter(v => v.date === dateString);

      // 근무지/주야간 필터링 적용
      dayEvents = dayEvents.filter(ev => {
        const userLoc = ev.users ? (ev.users.work_location || '') : '';
        
        // 백맨과 현관은 동일 처리 (백맨이거나 현관이면 '백맨/현관' 혹은 둘 중 하나로 매칭)
        // 사용자가 체크한 필터 조건 중 하나라도 유저의 근무지 문자열에 포함되는지 확인
        return checkedLocations.some(filterWord => {
          if (filterWord === '백맨/현관') {
            return userLoc.includes('백맨') || userLoc.includes('현관');
          }
          return userLoc.includes(filterWord);
        });
      });

      // 정렬 적용 (이름순 또는 등록순/입사일순 등)
      dayEvents.sort((a, b) => {
        if (sortVal === 'name_asc') {
          const nameA = a.username || '';
          const nameB = b.username || '';
          return nameA.localeCompare(nameB);
        }
        return 0; // 기본
      });

      gridHTML += `
        <div class="calendar-cell ${isToday ? 'today' : ''}" data-date="${dateString}">
          <div class="cell-date">${i}</div>
          <div class="cell-events">
            ${dayEvents.map(ev => {
              // 컬러 값 가져오기 (users 테이블 조인 결과 or 컬러 맵 활용)
              const userColor = (ev.users && ev.users.color) ? ev.users.color : (userColorMap[ev.user_id] || userColorMap[ev.username] || '#38bdf8');
              
              return `
                <div class="event-pill ${ev.leave_type}" data-id="${ev.id}" title="${ev.username} (${ev.leave_type} -${ev.time_detail})" style="border-left: 3px solid ${userColor}; background:${userColor}20; color: #fff;">
                  ${ev.username}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // 다음 달 여분 칸 채우기
    const totalCells = firstDayIndex + lastDay;
    const nextDaysCount = totalCells <= 35 ? (35 - totalCells) : (42 - totalCells);
    for (let i = 1; i <= nextDaysCount; i++) {
      gridHTML += `<div class="calendar-cell other-month"><div class="cell-date">${i}</div></div>`;
    }

    calendarGrid.innerHTML = gridHTML;

    // 날짜 및 칩 클릭 이벤트 핸들러
    calendarGrid.querySelectorAll('.calendar-cell').forEach(cell => {
      const dateStr = cell.getAttribute('data-date');
      if (!dateStr) return;

      cell.addEventListener('click', (e) => {
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

  // 필터나 정렬 변경 시 달력 즉시 갱신
  if (sortSelect) sortSelect.addEventListener('change', renderCalendarGrid);
  locationCheckboxes.forEach(cb => {
    cb.addEventListener('change', renderCalendarGrid);
  });

  if (vacationForm) {
    vacationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const vacId = editVacationId.value;
      const date = vDate.value;
      const leave_type = vLeaveType.value;
      const time_detail = vTimeDetail.value;
      const memo = vMemo.value.trim();

      if (!date) {
        alert('날짜를 선택해 주세요.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '처리 중...';

      try {
        if (vacId) {
          const { error } = await supabaseClient
            .from('vacations')
            .update({ date, leave_type, time_detail, memo })
            .eq('id', vacId);

          if (error) throw error;
          alert('휴무 일정이 수정되었습니다.');
        } else {
          const { error } = await supabaseClient
            .from('vacations')
            .insert([{ user_id: userId, username: userName, date, leave_type, time_detail, memo }]);

          if (error) throw error;
          alert('휴무 일정이 등록되었습니다.');
        }

        closeModal();
        fetchMonthData();
      } catch (err) {
        alert(`오류: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const vacId = editVacationId.value;
      if (!confirm('정말 이 휴무 일정을 삭제하시겠습니까?')) return;

      deleteBtn.disabled = true;
      try {
        const { error } = await supabaseClient
          .from('vacations')
          .delete()
          .eq('id', vacId);

        if (error) throw error;
        alert('삭제되었습니다.');
        closeModal();
        fetchMonthData();
      } catch (err) {
        alert(`삭제 실패: ${err.message}`);
      } finally {
        deleteBtn.disabled = false;
      }
    });
  }

  await fetchUserColors();
  fetchMonthData();
});