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
  const totalUserCountEl = document.getElementById('totalUserCount');

  // 모달 관련 요소
  const userModal = document.getElementById('userModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const userForm = document.getElementById('userForm');
  const modalTitle = document.getElementById('modalTitle');
  const submitUserBtn = document.getElementById('submitUserBtn');
  const deleteUserBtn = document.getElementById('deleteUserBtn');
  const passwordLabel = document.getElementById('passwordLabel');

  // 폼 입력 필드
  const editUserId = document.getElementById('editUserId');
  const newUsername = document.getElementById('newUsername');
  const newPassword = document.getElementById('newPassword');
  const newRole = document.getElementById('newRole');
  const newContractType = document.getElementById('newContractType');
  const newWorkLocation = document.getElementById('newWorkLocation');
  const newHireDate = document.getElementById('newHireDate');
  const newAnnualBaseDate = document.getElementById('newAnnualBaseDate');
  const newPhone = document.getElementById('newPhone');
  const newColor = document.getElementById('newColor');         // 💡 추가된 컬러 피커 요소
  const colorHexText = document.getElementById('colorHexText'); // 💡 컬러 텍스트 표시 요소 (선택사항)

  // API 엔드포인트 설정
  const WORKER_LIST_USERS_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/users/list';
  const WORKER_CREATE_USER_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/users/create';
  const WORKER_DELETE_USER_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/users/delete';
  
  let allUsers = [];
  let isAdmin = false;

  // 컬러 피커 조작 시 HEX 텍스트 실시간 동기화
  if (newColor && colorHexText) {
    newColor.addEventListener('input', (e) => {
      colorHexText.textContent = e.target.value;
    });
  }

  // 2. 현재 로그인 사용자 권한 체크 (관리자 여부 확인)
  async function checkAdminRole() {
    try {
      const { data: myProfile } = await supabaseClient
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (myProfile && myProfile.role === 'admin') {
        isAdmin = true;
        if (addUserBtn) addUserBtn.style.display = 'block';
      }
    } catch (err) {
      console.error('권한 확인 에러:', err);
    }
  }

  // 모달 제어 함수
  function openAddModal() {
    modalTitle.textContent = '신규 회원 등록';
    submitUserBtn.textContent = '등록 완료';
    deleteUserBtn.style.display = 'none';
    passwordLabel.textContent = '비밀번호 *';
    newPassword.required = true;
    userForm.reset();
    editUserId.value = '';
    if (newColor) newColor.value = '#38bdf8';
    if (colorHexText) colorHexText.textContent = '#38bdf8';
    userModal.classList.add('active');
  }

  function openEditModal(user) {
    if (!isAdmin) {
      alert('관리자만 회원 정보를 수정할 수 있습니다.');
      return;
    }

    modalTitle.textContent = '회원 정보 수정';
    submitUserBtn.textContent = '수정 완료';
    deleteUserBtn.style.display = 'block';
    passwordLabel.textContent = '새 비밀번호 (변경시에만 입력)';
    newPassword.required = false;

    editUserId.value = user.id;
    newUsername.value = user.name || user.username || '';
    newRole.value = user.role || 'user';
    newContractType.value = user.contract_type || '정규직';
    newWorkLocation.value = user.work_location || '';
    newHireDate.value = user.hire_date ? user.hire_date.split('T')[0] : '';
    newAnnualBaseDate.value = user.annual_base_date ? user.annual_base_date.split('T')[0] : '';
    newPhone.value = user.phone || '';
    
    // 💡 컬러 값 세팅
    const userColor = user.color || '#38bdf8';
    if (newColor) newColor.value = userColor;
    if (colorHexText) colorHexText.textContent = userColor;

    newPassword.value = '';

    userModal.classList.add('active');
  }

  function closeModal() {
    userModal.classList.remove('active');
    userForm.reset();
  }

  if (addUserBtn) addUserBtn.addEventListener('click', openAddModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (userModal) {
    userModal.addEventListener('click', (e) => {
      if (e.target === userModal) closeModal();
    });
  }

  // 3. 전체 회원 목록 불러오기
  async function fetchUsers() {
    try {
      const response = await fetch(WORKER_LIST_USERS_API);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '회원 목록을 불러오는 데 실패했습니다.');
      }

      allUsers = data || [];
      if (totalUserCountEl) totalUserCountEl.textContent = allUsers.length;
      renderUsers(allUsers);
    } catch (err) {
      console.error('회원 목록 조회 에러:', err);
      userListContainer.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
  }

  // 4. 회원 목록 카드 렌더링 (관리자일 때만 수정 버튼 노출 + 컬러 정보 표시)
  function renderUsers(users) {
    if (!users || users.length === 0) {
      userListContainer.innerHTML = `<div class="empty-state">조회된 회원이 없습니다.</div>`;
      return;
    }

    userListContainer.innerHTML = users.map(user => {
      const userColor = user.color || '#38bdf8';
      return `
        <div class="user-card" style="border-left: 4px solid ${userColor};">
          <div class="user-card-header">
            <div class="user-name-box">
              <span class="user-name">${user.name || user.username || '이름 없음'}</span>
              <span class="role-badge ${user.role === 'admin' ? 'admin' : 'user'}">
                ${user.role === 'admin' ? '관리자' : '회원'}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="status-badge">${user.status || '재직'}</span>
              ${isAdmin ? `<button type="button" class="btn-card-edit" data-id="${user.id}">수정</button>` : ''}
            </div>
          </div>

          <div class="user-details">
            <div>근무지: <span>${user.work_location || '-'}</span></div>
            <div>계약형태: <span>${user.contract_type || '-'}</span></div>
            <div>연락처: <span>${user.phone || '-'}</span></div>
            <div>입사일: <span>${user.hire_date ? user.hire_date.split('T')[0] : '-'}</span></div>
            <!-- 💡 조회 화면에 컬러 코드 표시 -->
            <div>컬러: <span style="color: ${userColor}; font-weight: bold;">${userColor}</span></div>
          </div>
        </div>
      `;
    }).join('');

    // 카드별 수정 버튼 이벤트 바인딩
    if (isAdmin) {
      userListContainer.querySelectorAll('.btn-card-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const userId = e.target.getAttribute('data-id');
          const targetUser = allUsers.find(u => u.id == userId);
          if (targetUser) openEditModal(targetUser);
        });
      });
    }
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

  // 6. 회원 등록 및 수정 폼 제출 이벤트 (C / U)
  if (userForm) {
    userForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!isAdmin) {
        alert('관리자 권한이 없습니다.');
        return;
      }

      const userId = editUserId.value;
      const username = newUsername.value.trim();
      const password = newPassword.value.trim();
      const role = newRole.value;
      const contractType = newContractType.value;
      const workLocation = newWorkLocation.value.trim();
      const hireDate = newHireDate.value;
      const annualBaseDate = newAnnualBaseDate.value;
      const phone = newPhone.value.trim();
      const color = newColor ? newColor.value : '#38bdf8'; // 💡 선택한 컬러 값 가져오기

      submitUserBtn.textContent = userId ? '수정 중...' : '등록 중...';
      submitUserBtn.disabled = true;

      try {
        if (userId) {
          // --- 수정 로직 (Supabase users 테이블 직접 업데이트) ---
          const updateData = {
            name: username,
            role: role,
            contract_type: contractType,
            work_location: workLocation,
            hire_date: hireDate || null,
            annual_base_date: annualBaseDate || null,
            phone: phone,
            color: color // 💡 컬러 값 업데이트 반영
          };

          const { error } = await supabaseClient
            .from('users')
            .update(updateData)
            .eq('id', userId);

          if (error) throw error;
          alert('회원 정보가 성공적으로 수정되었습니다.');

        } else {
          // --- 등록 로직 (Cloudflare Worker API 활용) ---
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
              phone: phone,
              color: color // 💡 신규 등록 시 컬러 값 전달
            })
          });

          const result = await response.json();
          if (!response.ok) throw new Error(result.error || '회원 등록에 실패했습니다.');
          alert('신규 회원이 성공적으로 등록되었습니다.');
        }

        closeModal();
        fetchUsers(); // 목록 새로고침

      } catch (err) {
        alert(`오류: ${err.message}`);
      } finally {
        submitUserBtn.textContent = userId ? '수정 완료' : '등록 완료';
        submitUserBtn.disabled = false;
      }
    });
  }

  // 7. 회원 삭제 이벤트 (D)
  if (deleteUserBtn) {
    deleteUserBtn.addEventListener('click', async () => {
      if (!isAdmin) {
        alert('관리자 권한이 없습니다.');
        return;
      }

      const userId = editUserId.value;
      const userName = newUsername.value;

      if (!confirm(`정말 [${userName}] 회원을 완전히 삭제하시겠습니까?`)) return;

      deleteUserBtn.disabled = true;

      try {
        const response = await fetch(`${WORKER_DELETE_USER_API}/${userId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '회원 삭제에 실패했습니다.');

        alert('회원이 성공적으로 삭제되었습니다.');
        closeModal();
        fetchUsers();

      } catch (err) {
        alert(`삭제 오류: ${err.message}`);
      } finally {
        deleteUserBtn.disabled = false;
      }
    });
  }

  // 초기화 실행
  await checkAdminRole();
  await fetchUsers();
});