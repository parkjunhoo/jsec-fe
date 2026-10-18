document.addEventListener('DOMContentLoaded', async () => {
  // 1. 로그인 세션 체크
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return;
  }

  // DOM 요소 참조
  const searchInput = document.getElementById('searchInput');
  const userListContainer = document.getElementById('userList');
  const addUserBtn = document.getElementById('addUserBtn');

  let allUsers = [];

  // 2. 현재 로그인한 사용자 권한 확인 (관리자일 때만 회원 등록 버튼 표시)
  async function checkAdminRole() {
    const { data: myProfile } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (myProfile && myProfile.role === 'admin') {
      if (addUserBtn) {
        addUserBtn.style.display = 'block';
        addUserBtn.addEventListener('click', () => {
          // 관리자용 회원 등록 로직 또는 모달 연동 위치
          alert('관리자 전용 신규 회원 등록 기능입니다.');
        });
      }
    }
  }

  // 3. users 테이블에서 회원 전체 목록 불러오기
  async function fetchUsers() {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('회원 목록 조회 에러:', error);
      userListContainer.innerHTML = `<div class="empty-state">회원 목록을 불러오는 데 실패했습니다.</div>`;
      return;
    }

    allUsers = data || [];
    renderUsers(allUsers);
  }

  // 4. 회원 목록 화면 렌더링 함수
  function renderUsers(users) {
    if (!users || users.length === 0) {
      userListContainer.innerHTML = `<div class="empty-state">조회된 회원이 없습니다.</div>`;
      return;
    }

    userListContainer.innerHTML = users.map(user => `
      <div class="user-card">
        <div class="user-card-header">
          <div class="user-name-box">
            <span class="user-name">${user.name || user.username || '이름 없음'}</span>
            <span class="role-badge ${user.role === 'admin' ? 'admin' : 'user'}">
              ${user.role === 'admin' ? '관리자' : '회원'}
            </span>
          </div>
          <span class="status-badge">${user.status || '재직'}</span>
        </div>

        <div class="user-details">
          <div>근무지: <span>${user.work_location || '-'}</span></div>
          <div>계약형태: <span>${user.contract_type || '-'}</span></div>
          <div>연락처: <span>${user.phone || '-'}</span></div>
          <div>입사일: <span>${user.hire_date || '-'}</span></div>
        </div>
      </div>
    `).join('');
  }

  // 5. 실시간 검색 기능 (이름 및 근무지 검색)
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const keyword = e.target.value.toLowerCase().trim();
      const filtered = allUsers.filter(u => 
        (u.name && u.name.toLowerCase().includes(keyword)) ||
        (u.username && u.username.toLowerCase().includes(keyword)) ||
        (u.work_location && u.work_location.toLowerCase().includes(keyword))
      );
      renderUsers(filtered);
    });
  }

  // 초기화 함수 실행
  checkAdminRole();
  fetchUsers();
});