document.addEventListener('DOMContentLoaded', async () => {
  // 1. 로그인 세션 체크
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return;
  }

  const searchInput = document.getElementById('searchInput');
  const userListContainer = document.getElementById('userList');
  const addUserBtn = document.getElementById('addUserBtn');

  // 모달 관련 요소
  const addUserModal = document.getElementById('addUserModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const createUserForm = document.getElementById('createUserForm');
  const submitUserBtn = document.getElementById('submitUserBtn');

  const WORKER_CREATE_USER_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/users/create';
  const WORKER_LIST_USERS_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/users/list';
  
  let allUsers = [];

  // 모달 열기/닫기
  function openModal() { addUserModal.classList.add('active'); }
  function closeModal() { addUserModal.classList.remove('active'); createUserForm.reset(); }

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (addUserModal) {
    addUserModal.addEventListener('click', (e) => {
      if (e.target === addUserModal) closeModal();
    });
  }

  // 2. 현재 로그인 사용자 권한 체크 (관리자 시 등록 버튼 노출)
  async function checkAdminRole() {
    const { data: myProfile } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (myProfile && myProfile.role === 'admin') {
      if (addUserBtn) {
        addUserBtn.style.display = 'block';
        addUserBtn.addEventListener('click', openModal);
      }
    }
  }

// 3. 전체 회원 목록 불러오기 (Worker API 통해 조회)
  async function fetchUsers() {
    try {
      const response = await fetch(WORKER_LIST_USERS_API);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '회원 목록을 불러오는 데 실패했습니다.');
      }

      allUsers = data || [];
      renderUsers(allUsers);
    } catch (err) {
      console.error('회원 목록 조회 에러:', err);
      userListContainer.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
  }
  // 4. 회원 목록 카드 렌더링
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

  // 5. 검색 기능
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

  // 6. 신규 회원 등록 폼 제출 이벤트
  if (createUserForm) {
    createUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('newUsername').value.trim();
      const password = document.getElementById('newPassword').value.trim();
      const role = document.getElementById('newRole').value;
      const contractType = document.getElementById('newContractType').value;
      const workLocation = document.getElementById('newWorkLocation').value.trim();
      const hireDate = document.getElementById('newHireDate').value;
      const annualBaseDate = document.getElementById('newAnnualBaseDate').value;
      const phone = document.getElementById('newPhone').value.trim();

      submitUserBtn.textContent = '등록 중...';
      submitUserBtn.disabled = true;

      try {
        const response = await fetch(WORKER_CREATE_USER_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username,
            name: username,
            password: password,
            role: role,
            contract_type: contractType,
            work_location: workLocation,
            hire_date: hireDate || null,
            annual_base_date: annualBaseDate || null,
            phone: phone
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || '회원 등록에 실패했습니다.');
        }

        alert('신규 회원이 성공적으로 등록되었습니다.');
        closeModal();
        fetchUsers(); // 목록 새로고침

      } catch (err) {
        alert(`오류: ${err.message}`);
      } finally {
        submitUserBtn.textContent = '등록 완료';
        submitUserBtn.disabled = false;
      }
    });
  }

  // 초기화
  checkAdminRole();
  fetchUsers();
});