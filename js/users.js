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
  const userCountLabel = document.getElementById('userCountLabel');
  const categoryTabs = document.getElementById('userCategoryTabs');
  const categoryTabButtons = document.querySelectorAll('[data-user-category]');
  const sortSelect = document.getElementById('sortSelect');
  const viewButtons = document.querySelectorAll('[data-user-view]');
  const locationCheckboxes = document.querySelectorAll('input[name="locFilter"]');
  const shiftFilterValues = ['주간', '야간'];
  const otherLocationFilter = 'other';
  const locationFilterValues = Array.from(locationCheckboxes)
    .map(checkbox => checkbox.value)
    .filter(value => value !== otherLocationFilter && !shiftFilterValues.includes(value));
  const selectAllBtn = document.getElementById('selectAllBtn');
  const filterBox = document.querySelector('.filter-box');

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
  const newJobTitle = document.getElementById('newJobTitle');
  const newContractType = document.getElementById('newContractType');
  const employmentStatusGroup = document.getElementById('employmentStatusGroup');
  const newStatus = document.getElementById('newStatus');
  const newWorkLocation = document.getElementById('newWorkLocation');
  const newHireDate = document.getElementById('newHireDate');
  const newAnnualBaseDate = document.getElementById('newAnnualBaseDate');
  const newPhone = document.getElementById('newPhone');
  const newColor = document.getElementById('newColor');
  const colorHexText = document.getElementById('colorHexText');

  // API 엔드포인트 설정
  const WORKER_LIST_USERS_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/users/list';
  const WORKER_CREATE_USER_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/users/create';
  const WORKER_DELETE_USER_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/users/delete';
  const WORKER_UPDATE_USER_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/users';
  
  let allUsers = [];
  let isAdmin = false;
  let currentView = 'table';
  let currentCategory = 'workers';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function safeUserColor(value) {
    return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : '#38bdf8';
  }

  function jobTitleForName(name) {
    if (name === '지은석') return '소장';
    if (name === '김동석') return '부소장';
    return '사원';
  }

  async function workerHeaders(json = false) {
    const { data: { session: activeSession }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!activeSession?.access_token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
    return {
      Authorization: `Bearer ${activeSession.access_token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {})
    };
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

  function setView(view) {
    currentView = view === 'table' ? 'table' : 'cards';
    userListContainer.dataset.view = currentView;
    viewButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.userView === currentView));
    });
  }

  setView(currentView);

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
        if (categoryTabs) categoryTabs.hidden = false;
      }
    } catch (err) {
      console.error('권한 확인 에러:', err);
    }
  }

  // 모달 제어 함수
  function openAddModal() {
    const isObserverCategory = currentCategory === 'observers';
    modalTitle.textContent = isObserverCategory ? '옵저버 계정 등록' : '신규 회원 등록';
    submitUserBtn.textContent = '등록 완료';
    deleteUserBtn.style.display = 'none';
    passwordLabel.textContent = '비밀번호 *';
    newPassword.required = true;
    userForm.reset();
    editUserId.value = '';
    newRole.value = isObserverCategory ? 'monitor' : 'user';
    if (employmentStatusGroup) employmentStatusGroup.style.display = 'none';
    if (newColor) newColor.value = '#38bdf8';
    if (colorHexText) colorHexText.textContent = '#38bdf8';
    if (newJobTitle) {
      newJobTitle.value = jobTitleForName(newUsername.value.trim());
      newJobTitle.disabled = true;
    }
    userModal.classList.add('active');
  }

  function openEditModal(user) {
    if (!isAdmin) {
      Swal.fire({
        icon: 'warning',
        text: '관리자만 회원 정보를 수정할 수 있습니다.'
      });
      return;
    }

    modalTitle.textContent = user.role === 'monitor' ? '옵저버 계정 수정' : '회원 정보 수정';
    submitUserBtn.textContent = '수정 완료';
    deleteUserBtn.style.display = 'block';
    passwordLabel.textContent = '새 비밀번호 (변경시에만 입력)';
    newPassword.required = false;

    editUserId.value = user.id;
    newUsername.value = user.name || user.username || '';
    newRole.value = user.role || 'user';
    if (newJobTitle) {
      newJobTitle.value = user.job_title || '사원';
      newJobTitle.disabled = false;
    }
    newContractType.value = user.contract_type || '정규직';
    if (employmentStatusGroup) employmentStatusGroup.style.display = '';
    if (newStatus) newStatus.value = user.status || '재직';
    newWorkLocation.value = user.work_location || '';
    newHireDate.value = user.hire_date ? user.hire_date.split('T')[0] : '';
    newAnnualBaseDate.value = user.annual_base_date ? user.annual_base_date.split('T')[0] : '';
    newPhone.value = user.phone || '';
    
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
  newUsername.addEventListener('input', () => {
    if (!editUserId.value && newJobTitle) newJobTitle.value = jobTitleForName(newUsername.value.trim());
  });
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (userModal) {
    userModal.addEventListener('click', (e) => {
      if (e.target === userModal) closeModal();
    });
  }

  // 3. 전체 회원 목록 불러오기
  async function fetchUsers() {
    try {
      const response = await fetch(WORKER_LIST_USERS_API, {
        headers: await workerHeaders()
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '회원 목록을 불러오는 데 실패했습니다.');
      }

      allUsers = data || [];
      filterAndRenderUsers();
    } catch (err) {
      console.error('회원 목록 조회 에러:', err);
      userListContainer.innerHTML = `<div class="empty-state">${escapeHtml(err.message || '회원 목록을 불러오지 못했습니다.')}</div>`;
    }
  }

  // 4. 필터 및 정렬 통합 처리 함수
  function filterAndRenderUsers() {
    const keyword = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const checkedLocations = Array.from(locationCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    const categoryUsers = allUsers.filter(user => currentCategory === 'observers'
      ? user.role === 'monitor'
      : user.role !== 'monitor');
    if (totalUserCountEl) totalUserCountEl.textContent = categoryUsers.length;
    if (userCountLabel) userCountLabel.textContent = currentCategory === 'observers' ? '옵저버 계정' : '근무자';
    if (filterBox) {
      filterBox.hidden = currentCategory === 'observers';
      filterBox.style.display = currentCategory === 'observers' ? 'none' : '';
    }
    if (addUserBtn) addUserBtn.textContent = currentCategory === 'observers' ? '+ 옵저버 등록' : '+ 회원 등록';

    let result = categoryUsers.filter(u => {
      const name = (u.name || u.username || '').toLowerCase();
      const location = (u.work_location || '').toLowerCase();
      const jobTitle = (u.job_title || '').toLowerCase();

      const matchesKeyword = !keyword || name.includes(keyword)
        || (currentCategory === 'workers' && (location.includes(keyword) || jobTitle.includes(keyword)));

      if (currentCategory === 'observers') return matchesKeyword;
      if (checkedLocations.length === 0) return false;
      const matchesCheckbox = matchesLocationFilter(location, checkedLocations);

      return matchesKeyword && matchesCheckbox;
    });

    const sortVal = sortSelect ? sortSelect.value : 'name_asc';
    result.sort((a, b) => {
      if (sortVal === 'name_asc') {
        const nameA = a.name || a.username || '';
        const nameB = b.name || b.username || '';
        return nameA.localeCompare(nameB);
      } else if (sortVal === 'hire_desc') {
        const dateA = a.hire_date ? new Date(a.hire_date) : new Date(0);
        const dateB = b.hire_date ? new Date(b.hire_date) : new Date(0);
        return dateB - dateA;
      } else if (sortVal === 'hire_asc') {
        const dateA = a.hire_date ? new Date(a.hire_date) : new Date(0);
        const dateB = b.hire_date ? new Date(b.hire_date) : new Date(0);
        return dateA - dateB;
      }
      return 0;
    });

    renderUsers(result);
  }

  // 5. 회원 목록 카드 렌더링
  function renderUsers(users) {
    if (!users || users.length === 0) {
      userListContainer.innerHTML = `<div class="empty-state">조건에 일치하는 회원이 없습니다.</div>`;
      return;
    }

    if (currentView === 'table') {
      userListContainer.innerHTML = `
        <table class="user-table">
          <thead><tr>
            <th scope="col">이름</th><th scope="col">직책</th><th scope="col">권한</th>
            <th scope="col">근무지</th><th scope="col">계약 형태</th><th scope="col">상태</th>
            <th scope="col">연락처</th><th scope="col">입사일</th>${isAdmin ? '<th scope="col">관리</th>' : ''}
          </tr></thead>
          <tbody>${users.map(user => `
            <tr>
              <td class="user-table-name">${escapeHtml(user.name || user.username || '이름 없음')}</td>
              <td class="user-table-title">${escapeHtml(user.job_title || '사원')}</td>
              <td>${user.role === 'admin' ? '관리자' : user.role === 'monitor' ? '본사 모니터링' : '회원'}</td>
              <td>${escapeHtml(user.work_location || '-')}</td>
              <td>${escapeHtml(user.contract_type || '-')}</td>
              <td>${escapeHtml(user.status || '재직')}</td>
              <td>${escapeHtml(user.phone || '-')}</td>
              <td>${escapeHtml(user.hire_date ? user.hire_date.split('T')[0] : '-')}</td>
              ${isAdmin ? `<td><button type="button" class="btn-card-edit" data-id="${escapeHtml(user.id)}">수정</button></td>` : ''}
            </tr>
          `).join('')}</tbody>
        </table>
      `;
      return;
    }

    userListContainer.innerHTML = users.map(user => {
      const userColor = safeUserColor(user.color);
      return `
        <div class="user-card" style="border-left: 4px solid ${userColor};">
          <div class="user-card-header">
            <div class="user-name-box">
              <span class="user-name">${escapeHtml(user.name || user.username || '이름 없음')}</span>
              <span class="role-badge ${user.role === 'admin' ? 'admin' : 'user'}">
                ${user.role === 'admin' ? '관리자' : user.role === 'monitor' ? '본사 모니터링' : '회원'}
              </span>
              <span class="role-badge user">${escapeHtml(user.job_title || '사원')}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="status-badge">${escapeHtml(user.status || '재직')}</span>
              ${isAdmin ? `<button type="button" class="btn-card-edit" data-id="${escapeHtml(user.id)}">수정</button>` : ''}
            </div>
          </div>

          <div class="user-details">
            <div>근무지: <span>${escapeHtml(user.work_location || '-')}</span></div>
            <div>계약형태: <span>${escapeHtml(user.contract_type || '-')}</span></div>
            <div>연락처: <span>${escapeHtml(user.phone || '-')}</span></div>
            <div>입사일: <span>${escapeHtml(user.hire_date ? user.hire_date.split('T')[0] : '-')}</span></div>
          </div>
        </div>
      `;
    }).join('');

  }

  viewButtons.forEach(button => {
    button.addEventListener('click', () => {
      setView(button.dataset.userView);
      filterAndRenderUsers();
    });
  });

  categoryTabButtons.forEach(button => {
    button.addEventListener('click', () => {
      currentCategory = button.dataset.userCategory;
      categoryTabButtons.forEach(tab => {
        tab.setAttribute('aria-selected', String(tab === button));
      });
      filterAndRenderUsers();
    });
  });

  userListContainer.addEventListener('click', event => {
    const button = event.target.closest('.btn-card-edit');
    if (!button || !isAdmin) return;
    const targetUser = allUsers.find(user => String(user.id) === button.dataset.id);
    if (targetUser) openEditModal(targetUser);
  });

  // 이벤트 리스너 연결
  if (searchInput) searchInput.addEventListener('input', filterAndRenderUsers);
  if (sortSelect) sortSelect.addEventListener('change', filterAndRenderUsers);
  locationCheckboxes.forEach(cb => {
    cb.addEventListener('change', filterAndRenderUsers);
  });

  // 전체 선택 / 해제 버튼 제어
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      const allChecked = Array.from(locationCheckboxes).every(cb => cb.checked);
      locationCheckboxes.forEach(cb => {
        cb.checked = !allChecked;
      });
      selectAllBtn.textContent = allChecked ? '전체 선택' : '전체 해제';
      filterAndRenderUsers();
    });

    locationCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const allChecked = Array.from(locationCheckboxes).every(c => c.checked);
        selectAllBtn.textContent = allChecked ? '전체 해제' : '전체 선택';
      });
    });
  }

  // 6. 회원 등록 및 수정 폼 제출 이벤트 (C / U)
  if (userForm) {
    userForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!isAdmin) {
        await Swal.fire({
          icon: 'warning',
          text: '관리자 권한이 없습니다.'
        });
        return;
      }

      const userId = editUserId.value;
      const username = newUsername.value.trim();
      const password = newPassword.value.trim();
      const role = newRole.value;
      const jobTitle = newJobTitle ? newJobTitle.value : '사원';
      const contractType = newContractType.value;
      const status = newStatus ? newStatus.value : '재직';
      const workLocation = newWorkLocation.value.trim();
      const hireDate = newHireDate.value;
      const annualBaseDate = newAnnualBaseDate.value;
      const phone = newPhone.value.trim();
      const color = newColor ? newColor.value : '#38bdf8';

      submitUserBtn.textContent = userId ? '수정 중...' : '등록 중...';
      submitUserBtn.disabled = true;

      try {
        if (userId) {
          const updateData = {
            name: username,
            role: role,
            job_title: jobTitle,
            contract_type: contractType,
            status: status,
            work_location: workLocation,
            hire_date: hireDate || null,
            annual_base_date: annualBaseDate || null,
            phone: phone || '',
            color: color
          };

          const response = await fetch(`${WORKER_UPDATE_USER_API}/${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            headers: await workerHeaders(true),
            body: JSON.stringify(updateData)
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || '회원 정보 수정에 실패했습니다.');
          await Swal.fire({
            icon: 'success',
            text: '회원 정보가 성공적으로 수정되었습니다.'
          });

        } else {
          const response = await fetch(WORKER_CREATE_USER_API, {
            method: 'POST',
            headers: await workerHeaders(true),
            body: JSON.stringify({
              username: username,
              name: username,
              password: password,
              role: role,
              job_title: jobTitle,
              contract_type: contractType,
              work_location: workLocation,
              hire_date: hireDate || null,
              annual_base_date: annualBaseDate || null,
              phone: phone || '',
              color: color
            })
          });

          const result = await response.json();
          if (!response.ok) throw new Error(result.error || '회원 등록에 실패했습니다.');
          await Swal.fire({
            icon: 'success',
            text: '신규 회원이 성공적으로 등록되었습니다.'
          });
        }

        closeModal();
        fetchUsers();

      } catch (err) {
        await Swal.fire({
          icon: 'error',
          text: `오류: ${err.message}`
        });
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
        await Swal.fire({
          icon: 'warning',
          text: '관리자 권한이 없습니다.'
        });
        return;
      }

      const userId = editUserId.value;
      const userName = newUsername.value;

      const result = await Swal.fire({
        icon: 'warning',
        text: `정말 [${userName}] 회원을 완전히 삭제하시겠습니까?`,
        showCancelButton: true,
        confirmButtonText: '삭제',
        cancelButtonText: '취소',
        reverseButtons: true
      });
      if (!result.isConfirmed) return;

      deleteUserBtn.disabled = true;

      try {
        const response = await fetch(`${WORKER_DELETE_USER_API}/${userId}`, {
          method: 'DELETE',
          headers: await workerHeaders()
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '회원 삭제에 실패했습니다.');

        await Swal.fire({
          icon: 'success',
          text: '회원이 성공적으로 삭제되었습니다.'
        });
        closeModal();
        fetchUsers();

      } catch (err) {
        await Swal.fire({
          icon: 'error',
          text: `삭제 오류: ${err.message}`
        });
      } finally {
        deleteUserBtn.disabled = false;
      }
    });
  }

  // 초기화 실행
  await checkAdminRole();
  await fetchUsers();
});