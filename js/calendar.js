document.addEventListener('DOMContentLoaded', async () => {
  // 1. 세션 확인
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return;
  }

  const userId = session.user.id;
  let userRole = 'user';
  let userName = '팀원';

  // 내 프로필 정보(이름, 권한) 조회
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

  const vacationList = document.getElementById('vacationList');
  const openModalBtn = document.getElementById('openModalBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const vacationModal = document.getElementById('vacationModal');
  const vacationForm = document.getElementById('vacationForm');
  
  const prevMonthBtn = document.getElementById('prevMonthBtn');
  const nextMonthBtn = document.getElementById('nextMonthBtn');
  const currentMonthDisplay = document.getElementById('currentMonthDisplay');

  const vDate = document.getElementById('vDate');
  const vLeaveType = document.getElementById('vLeaveType');
  const vTimeDetail = document.getElementById('vTimeDetail');
  const vMemo = document.getElementById('vMemo');

  // 현재 기준 연/월 관리
  let currentDate = new Date();
  let allVacations = [];

  // 모달 제어
  function openModal() {
    vDate.value = new Date().toISOString().split('T')[0];
    vacationModal.classList.add('active');
  }
  function closeModal() {
    vacationModal.classList.remove('active');
    vacationForm.reset();
  }

  if (openModalBtn) openModalBtn.addEventListener('click', openModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (vacationModal) {
    vacationModal.addEventListener('click', (e) => {
      if (e.target === vacationModal) closeModal();
    });
  }

  // 휴무 구분 변경 시 세부시간 옵션 제어
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

  // 월 이동 버튼 이벤트
  prevMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    fetchVacations();
  });
  nextMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    fetchVacations();
  });

  // 2. 휴무 데이터 불러오기
  async function fetchVacations() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); // 0~11

    currentMonthDisplay.textContent = `${year}년 ${month + 1}월`;

    // 해당 월의 시작일과 종료일 계산
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    vacationList.innerHTML = `<div class="empty-state">일정을 불러오는 중...</div>`;

    try {
      const { data, error } = await supabaseClient
        .from('vacations')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (error) throw error;

      allVacations = data || [];
      renderVacations(allVacations);

    } catch (err) {
      console.error('휴무 목록 조회 오류:', err);
      vacationList.innerHTML = `<div class="empty-state">데이터를 불러오는 중 오류가 발생했습니다.</div>`;
    }
  }

  // 3. 휴무 카드 렌더링
  function renderVacations(list) {
    if (!list || list.length === 0) {
      vacationList.innerHTML = `<div class="empty-state">이번 달 등록된 휴무 일정이 없습니다.</div>`;
      return;
    }

    vacationList.innerHTML = list.map(item => {
      // 삭제 권한: 본인 글이거나 관리자(admin)인 경우 허용
      const canDelete = (item.user_id === userId || userRole === 'admin');

      return `
        <div class="vacation-card">
          <div class="vacation-info">
            <span class="vacation-user">${item.username}</span>
            <span class="vacation-date">📅 ${item.date} ${item.memo ? `(${item.memo})` : ''}</span>
          </div>
          <div class="vacation-badges">
            <span class="type-badge ${item.leave_type}">${item.leave_type}</span>
            <span class="time-badge">${item.time_detail || '종일'}</span>
            ${canDelete ? `<button type="button" class="btn-delete-vacation" data-id="${item.id}">삭제</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // 삭제 버튼 이벤트 바인딩
    vacationList.querySelectorAll('.btn-delete-vacation').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const vacationId = e.target.getAttribute('data-id');
        if (!confirm('정말 해당 휴무 일정을 삭제하시겠습니까?')) return;

        try {
          const { error } = await supabaseClient
            .from('vacations')
            .delete()
            .eq('id', vacationId);

          if (error) throw error;
          alert('휴무 일정이 삭제되었습니다.');
          fetchVacations();
        } catch (err) {
          alert(`삭제 실패: ${err.message}`);
        }
      });
    });
  }

  // 4. 휴무 등록 폼 제출 (INSERT)
  if (vacationForm) {
    vacationForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const date = vDate.value;
      const leave_type = vLeaveType.value;
      const time_detail = vTimeDetail.value;
      const memo = vMemo.value.trim();

      if (!date) {
        alert('날짜를 선택해 주세요.');
        return;
      }

      const submitBtn = document.getElementById('submitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = '등록 중...';

      try {
        const { error } = await supabaseClient
          .from('vacations')
          .insert([{
            user_id: userId,
            username: userName,
            date: date,
            leave_type: leave_type,
            time_detail: time_detail,
            memo: memo
          }]);

        if (error) throw error;

        alert('휴무 일정이 성공적으로 등록되었습니다.');
        closeModal();
        fetchVacations();

      } catch (err) {
        alert(`등록 오류: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '등록 완료';
      }
    });
  }

  // 초기 실행
  fetchVacations();
});