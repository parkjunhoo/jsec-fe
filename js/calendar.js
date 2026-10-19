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
  const totalMonthVacationCount = document.getElementById('totalMonthVacationCount');
  const statsGridContainer = document.getElementById('statsGridContainer');

  const editVacationId = document.getElementById('editVacationId');
  const vDate = document.getElementById('vDate');
  const vLeaveType = document.getElementById('vLeaveType');
  const vTimeDetail = document.getElementById('vTimeDetail');
  const vMemo = document.getElementById('vMemo');
  const targetUserFormGroup = document.getElementById('targetUserFormGroup');
  const vTargetUserId = document.getElementById('vTargetUserId');

  // 필터 요소
  const locationCheckboxes = document.querySelectorAll('input[name="locFilter"]');
  const selectAllLocBtn = document.getElementById('selectAllLocBtn');
  const userFilterChipsContainer = document.getElementById('userFilterChipsContainer');
  const selectAllUserBtn = document.getElementById('selectAllUserBtn');

  let currentDate = new Date();
  let allVacations = [];
  let userMap = {}; 
  let allTeamMembers = []; 

  // ★ 수정: leaveType에 따라 아이콘 또는 색상 점 HTML을 반환하는 함수
  function getLeaveIndicator(leaveType = '', userColor = '#38bdf8') {
    if (leaveType === '연차') return '🌴';
    if (leaveType === '시간차') return '⏳';
    // 일반 휴무인 경우 userColor로 채워진 작은 동그라미(Dot) 반환
    return `<span style="display: inline-block; width: 8px; height: 8px; background-color: ${userColor}; border-radius: 50%; margin-right: 2px; vertical-align: middle;"></span>`;
  }

  function updateTimeDetailOptions(leaveType, selectedValue = '') {
    if (!vTimeDetail) return;

    const timeDetails = leaveType === '시간차'
      ? ['오전반차', '오후반차', '시간지정']
      : ['종일'];

    vTimeDetail.innerHTML = timeDetails
      .map(timeDetail => `<option value="${timeDetail}">${timeDetail}</option>`)
      .join('');
    vTimeDetail.value = timeDetails.includes(selectedValue) ? selectedValue : timeDetails[0];
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
            color: u.color || '#38bdf8'
          };
          if (keyName) userMap[keyName] = userInfo;
          if (u.id) userMap[u.id] = userInfo;
        });

        // 1. 캘린더 팀원 필터 칩 생성
        if (userFilterChipsContainer) {
          userFilterChipsContainer.innerHTML = data.map(u => {
            const memberName = u.name || u.username;
            return `
              <label class="filter-chip">
                <input type="checkbox" name="userFilter" value="${memberName}" checked>
                <span class="chip-label" style="border-color: ${u.color || 'var(--border-color)'};">${memberName}</span>
              </label>
            `;
          }).join('');

          document.querySelectorAll('input[name="userFilter"]').forEach(cb => {
            cb.addEventListener('change', () => {
              renderCalendarGrid();
              renderStatistics();
            });
          });
        }

        // 2. 관리자용 모달 팀원 선택 드롭다운 생성
        if (vTargetUserId) {
          vTargetUserId.innerHTML = data.map(u => {
            const memberName = u.name || u.username;
            return `<option value="${u.id}" data-name="${memberName}">${memberName}</option>`;
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
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (vacationForm) vacationForm.reset();
    if (editVacationId) editVacationId.value = '';
    if (vDate) vDate.value = selectedDateStr || getKSTDateString();
    if (vLeaveType) updateTimeDetailOptions(vLeaveType.value, '종일');

    if (userRole === 'admin') {
      if (targetUserFormGroup) targetUserFormGroup.style.display = 'block';
      if (vTargetUserId) vTargetUserId.value = userId;
    } else {
      if (targetUserFormGroup) targetUserFormGroup.style.display = 'none';
    }

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
    if (submitBtn) submitBtn.textContent = '수정 완료';
    if (deleteBtn) deleteBtn.style.display = 'block';

    if (editVacationId) editVacationId.value = vacation.id;
    if (vDate) vDate.value = vacation.date;
    if (vLeaveType) {
      vLeaveType.value = vacation.leave_type;
      updateTimeDetailOptions(vLeaveType.value, vacation.time_detail || '종일');
    }
    if (vMemo) vMemo.value = vacation.memo || '';

    if (userRole === 'admin') {
      if (targetUserFormGroup) targetUserFormGroup.style.display = 'block';
      if (vTargetUserId) vTargetUserId.value = vacation.user_id;
    } else {
      if (targetUserFormGroup) targetUserFormGroup.style.display = 'none';
    }

    if (vacationModal) vacationModal.classList.add('active');
  }

  function closeModal() {
    if (vacationModal) vacationModal.classList.remove('active');
    if (vacationForm) vacationForm.reset();
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
      const { data, error } = await supabaseClient
        .from('vacations')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (error) throw error;
      
      allVacations = data || [];
      renderCalendarGrid();
      renderStatistics();
    } catch (err) {
      console.error('휴무 데이터 조회 오류:', err);
    }
  }

  function renderStatistics() {
    if (!statsGridContainer) return;

    const userCheckboxes = document.querySelectorAll('input[name="userFilter"]');
    const checkedUsers = Array.from(userCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    const targetMembers = allTeamMembers.filter(m => checkedUsers.includes(m.name || m.username));

    if (targetMembers.length === 0) {
      statsGridContainer.innerHTML = `<div style="color: var(--text-sub); font-size: 13px; text-align: center; padding: 15px; grid-column: span 2;">선택된 팀원이 없습니다.</div>`;
      if (totalMonthVacationCount) totalMonthVacationCount.textContent = '총 0건 사용';
      return;
    }

    let totalMonthCount = 0;

    statsGridContainer.innerHTML = targetMembers.map(member => {
      const mName = member.name || member.username;
      const mColor = member.color || '#38bdf8';

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
            <div class="stat-name">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${mColor}; display: inline-block;"></span>
              ${mName}
            </div>
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
            <span class="stat-dates-list">${datesString}</span>
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

    const userCheckboxes = document.querySelectorAll('input[name="userFilter"]');
    const checkedUsers = Array.from(userCheckboxes)
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
        return checkedLocations.some(filterWord => userLoc.includes(filterWord));
      });

      dayEvents = dayEvents.filter(ev => {
        return checkedUsers.includes(ev.username);
      });

      dayEvents.sort((a, b) => (a.username || '').localeCompare(b.username || ''));

      gridHTML += `
        <div class="calendar-cell ${isToday ? 'today' : ''}" data-date="${dateString}">
          <div class="cell-date">${i}</div>
          <div class="cell-events">
            ${dayEvents.map(ev => {
              const userInfo = userMap[ev.user_id] || userMap[ev.username] || { color: '#38bdf8' };
              const userColor = userInfo.color;
              
              // ★ 수정: getLeaveIndicator 호출 시 userColor 전달
              const leaveIndicator = getLeaveIndicator(ev.leave_type, userColor);
              
              return `
                <div class="event-pill ${ev.leave_type}" data-id="${ev.id}" title="${ev.username} (${ev.leave_type} -${ev.time_detail})" style="background:${userColor}20; color: #fff;">
                  ${leaveIndicator}${ev.username}
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

  locationCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      renderCalendarGrid();
      renderStatistics();
    });
  });

  if (selectAllLocBtn) {
    selectAllLocBtn.addEventListener('click', () => {
      const allChecked = Array.from(locationCheckboxes).every(cb => cb.checked);
      locationCheckboxes.forEach(cb => { cb.checked = !allChecked; });
      selectAllLocBtn.textContent = allChecked ? '전체 선택' : '전체 해제';
      renderCalendarGrid();
      renderStatistics();
    });
  }

  if (selectAllUserBtn) {
    selectAllUserBtn.addEventListener('click', () => {
      const userCheckboxes = document.querySelectorAll('input[name="userFilter"]');
      const allChecked = Array.from(userCheckboxes).every(cb => cb.checked);
      userCheckboxes.forEach(cb => { cb.checked = !allChecked; });
      selectAllUserBtn.textContent = allChecked ? '전체 선택' : '전체 해제';
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
        if (vacId) {
          const updatePayload = { date, leave_type, time_detail, memo };
          if (userRole === 'admin') {
            updatePayload.user_id = targetUserId;
            updatePayload.username = targetUserName;
          }

          const { data, error } = await supabaseClient
            .from('vacations')
            .update(updatePayload)
            .eq('id', vacId)
            .select('id')
            .maybeSingle();

          if (error) throw error;
          if (!data) {
            throw new Error('수정된 행이 없습니다. Supabase vacations 테이블의 UPDATE RLS 정책에서 현재 사용자에게 해당 행의 수정이 허용되는지 확인해 주세요.');
          }
          await Swal.fire({
            icon: 'success',
            text: '휴무 일정이 수정되었습니다.'
          });
        } else {
          const { error } = await supabaseClient
            .from('vacations')
            .insert([{ 
              user_id: targetUserId, 
              username: targetUserName, 
              date, 
              leave_type, 
              time_detail, 
              memo 
            }]);

          if (error) throw error;
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
        const { error } = await supabaseClient
          .from('vacations')
          .delete()
          .eq('id', vacId);

        if (error) throw error;
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

  await fetchUsersInfo();
  fetchMonthData();
});