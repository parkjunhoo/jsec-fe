document.addEventListener('DOMContentLoaded', async () => {
  // 1. 세션 확인
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return;
  }

  const searchInput = document.getElementById('carSearchInput');
  const vehicleList = document.getElementById('vehicleList');
  const viewButtons = document.querySelectorAll('[data-vehicle-view]');
  const container = document.querySelector('.container') || document.body;

  // 건수 카운트 요소
  const totalCountEl = document.getElementById('totalCount');
  const displayCountEl = document.getElementById('displayCount');

  // 모달 관련 요소
  const vehicleModal = document.getElementById('vehicleModal');
  const addVehicleBtn = document.getElementById('addVehicleBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const vehicleForm = document.getElementById('vehicleForm');
  const modalTitle = document.getElementById('modalTitle');
  const submitBtn = document.getElementById('submitBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const { data: profile, error: profileError } = await supabaseClient
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  const isMonitor = profile?.role === 'monitor';
  if (isMonitor && addVehicleBtn) addVehicleBtn.style.display = 'none';

  // 폼 입력 필드
  const editCarId = document.getElementById('editCarId');
  const formNumber = document.getElementById('formNumber');
  const formFullNumber = document.getElementById('formFullNumber');
  const formName = document.getElementById('formName');
  const formDepartment = document.getElementById('formDepartment');
  const formCarName = document.getElementById('formCarName');
  const formPhone = document.getElementById('formPhone');
  const formNotes = document.getElementById('formNotes');

  let allVehicles = [];
  let currentPrefix = 'ALL';
  let currentView = 'table';
  const VEHICLE_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/vehicles';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  async function mutateVehicle(path, method, vehicle) {
    const { data: { session: activeSession }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!activeSession) throw new Error('로그인이 필요합니다.');

    const response = await fetch(`${VEHICLE_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${activeSession.access_token}`,
        ...(vehicle ? { 'Content-Type': 'application/json' } : {})
      },
      body: vehicle ? JSON.stringify(vehicle) : undefined
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  // --- 모달 제어 함수 ---
  function openAddModal() {
    if (isMonitor) return;
    modalTitle.textContent = '신규 차량 등록';
    submitBtn.textContent = '등록 완료';
    deleteBtn.style.display = 'none';
    vehicleForm.reset();
    editCarId.value = '';
    vehicleModal.classList.add('active');
  }

  function openEditModal(car) {
    if (isMonitor) return;
    modalTitle.textContent = '차량 정보 수정';
    submitBtn.textContent = '수정 완료';
    deleteBtn.style.display = 'block';

    editCarId.value = car.id || car.full_number;
    formNumber.value = car.number || '';
    formFullNumber.value = car.full_number || '';
    formName.value = car.name || '';
    formDepartment.value = car.department || '';
    formCarName.value = car.car_name || '';
    formPhone.value = car.phone || '';
    formNotes.value = car.notes || '';

    vehicleModal.classList.add('active');
  }

  function closeModal() {
    vehicleModal.classList.remove('active');
    vehicleForm.reset();
  }

  if (addVehicleBtn) addVehicleBtn.addEventListener('click', openAddModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (vehicleModal) {
    vehicleModal.addEventListener('click', (e) => {
      if (e.target === vehicleModal) closeModal();
    });
  }

  // 2. 0~9 번호대 탭 메뉴 동적 생성
  function initPrefixTabMenu() {
    let tabContainer = document.getElementById('prefixTabMenu');
    if (!tabContainer) {
      tabContainer = document.createElement('div');
      tabContainer.id = 'prefixTabMenu';

      const searchBox = document.querySelector('.search-box');
      if (searchBox) {
        searchBox.parentNode.insertBefore(tabContainer, searchBox.nextSibling);
      } else {
        container.insertBefore(tabContainer, vehicleList);
      }
    }

    renderPrefixTabs();
  }

  function renderPrefixTabs() {
    const tabContainer = document.getElementById('prefixTabMenu');
    if (!tabContainer) return;

    const prefixes = ['ALL', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    tabContainer.innerHTML = prefixes.map(p => {
      const isActive = currentPrefix === p;
      const label = p === 'ALL' ? '전체' : `${p}`;

      return `
        <button type="button" data-prefix="${p}" class="tab-btn" aria-pressed="${isActive}">${label}</button>
      `;
    }).join('');

    tabContainer.onclick = event => {
      const button = event.target.closest('[data-prefix]');
      if (!button) return;
      currentPrefix = button.getAttribute('data-prefix');
      renderPrefixTabs();
      if (searchInput) searchInput.value = '';
      filterAndRenderVehicles();
    };
  }

  function setView(view) {
    currentView = view === 'table' ? 'table' : 'cards';
    vehicleList.dataset.view = currentView;
    viewButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.vehicleView === currentView));
    });
  }

  // 3. Supabase DB에서 전체 데이터 불러오기
  async function fetchAllVehicles() {
    vehicleList.innerHTML = `<div class="empty-state">차량 목록 불러오는 중...</div>`;

    try {
      const { data, error } = await supabaseClient
        .from('skicar_data')
        .select('id, number, full_number, name, department, car_name, phone, notes')
        .order('number', { ascending: true });

      if (error) throw error;

      allVehicles = data || [];
      if (totalCountEl) totalCountEl.textContent = allVehicles.length;

      filterAndRenderVehicles();

    } catch (err) {
      console.error('차량 목록 조회 오류:', err);
      vehicleList.innerHTML = `<div class="empty-state">차량 정보를 불러오는 중 오류가 발생했습니다.</div>`;
    }
  }

  // 4. 필터링 및 건수 업데이트
  function filterAndRenderVehicles() {
    const keyword = searchInput ? searchInput.value.trim() : '';
    let list = allVehicles;

    if (keyword) {
      list = list
        .map((item, index) => ({ item, index, number: String(item.number ?? '').trim() }))
        .filter(({ number }) => number.includes(keyword))
        .sort((a, b) =>
          Number(!a.number.startsWith(keyword)) - Number(!b.number.startsWith(keyword))
          || a.index - b.index
        )
        .map(({ item }) => item);
    } else if (currentPrefix !== 'ALL') {
      list = list.filter(item => {
        const numStr = String(item.number ?? '').trim();
        return numStr.startsWith(currentPrefix);
      });
    }

    if (displayCountEl) displayCountEl.textContent = list.length;
    renderVehicles(list);
  }

  function renderVehicles(list) {
    if (!list || list.length === 0) {
      vehicleList.innerHTML = `<div class="empty-state">조건에 해당하는 차량이 없습니다.</div>`;
      return;
    }

    if (currentView === 'table') {
      vehicleList.innerHTML = `
        <table class="vehicle-table">
          <thead><tr>
            <th scope="col">차량 번호</th><th scope="col">차종</th><th scope="col">소유자</th>
            <th scope="col">부서</th><th scope="col">연락처</th><th scope="col">비고</th><th scope="col">관리</th>
          </tr></thead>
          <tbody>${list.map(item => `
            <tr>
              <td class="vehicle-table-number">${escapeHtml(item.full_number || item.number || '번호 없음')}</td>
              <td>${escapeHtml(item.car_name || '-')}</td>
              <td>${escapeHtml(item.name || '-')}</td>
              <td>${escapeHtml(item.department || '-')}</td>
              <td>${escapeHtml(item.phone || '-')}</td>
              <td>${escapeHtml(item.notes || '-')}</td>
              <td><button type="button" class="btn-edit-card" data-id="${escapeHtml(item.id || item.full_number)}">수정</button></td>
            </tr>
          `).join('')}</tbody>
        </table>
      `;
      return;
    }

    vehicleList.innerHTML = list.map(item => `
      <div class="vehicle-card">
        <div class="vehicle-card-header">
          <span class="car-number">${escapeHtml(item.full_number || item.number || '번호 없음')}</span>
          <div class="vehicle-card-actions">
            <span class="car-type-badge">${escapeHtml(item.car_name || '차종 미기재')}</span>
            <button type="button" class="btn-edit-card" data-id="${escapeHtml(item.id || item.full_number)}">수정</button>
          </div>
        </div>

        <div class="vehicle-details">
          <div>소유자: <span class="vehicle-detail-value">${escapeHtml(item.name || '-')}</span></div>
          <div>부서: <span class="vehicle-detail-value">${escapeHtml(item.department || '-')}</span></div>
          <div>연락처: <span class="vehicle-detail-value">${escapeHtml(item.phone || '-')}</span></div>
          ${item.notes ? `<div>비고: <span class="vehicle-detail-value">${escapeHtml(item.notes)}</span></div>` : ''}
        </div>
      </div>
    `).join('');
  }

  viewButtons.forEach(button => {
    button.addEventListener('click', () => {
      setView(button.dataset.vehicleView);
      filterAndRenderVehicles();
    });
  });

  vehicleList.addEventListener('click', event => {
    const button = event.target.closest('.btn-edit-card');
    if (!button) return;
    const id = button.getAttribute('data-id');
    const targetCar = allVehicles.find(car => String(car.id) === id || car.full_number === id);
    if (targetCar) openEditModal(targetCar);
  });

  // 6. 실시간 검색 이벤트
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      filterAndRenderVehicles();
    });
  }

  // 7. 차량 추가 및 수정 폼 제출 (C / U)
  if (vehicleForm) {
    vehicleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isMonitor) return;

      const carId = editCarId.value;
      const number = formNumber.value.trim();
      const full_number = formFullNumber.value.trim();
      const name = formName.value.trim();
      const department = formDepartment.value.trim();
      const car_name = formCarName.value.trim();
      const phone = formPhone.value.trim();
      const notes = formNotes.value.trim();

      if (!number || number.length !== 4) {
        await Swal.fire({
          icon: 'warning',
          text: '검색용 뒷자리 4자리를 정확히 입력해 주세요.'
        });
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '저장 중...';

      try {
        if (carId) {
          await mutateVehicle(`/${encodeURIComponent(carId)}`, 'PATCH', {
            number, full_number, name, department, car_name, phone, notes
          });
          await Swal.fire({
            icon: 'success',
            text: '차량 정보가 수정되었습니다.'
          });

        } else {
          await mutateVehicle('', 'POST', { number, full_number, name, department, car_name, phone, notes });
          await Swal.fire({
            icon: 'success',
            text: '신규 차량이 성공적으로 등록되었습니다.'
          });
        }

        closeModal();
        fetchAllVehicles(); // 리스트 갱신

      } catch (err) {
        await Swal.fire({
          icon: 'error',
          text: `오류: ${err.message}`
        });
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // 8. 차량 삭제 (D)
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (isMonitor) return;
      const carId = editCarId.value;
      const fullNum = formFullNumber.value;

      const result = await Swal.fire({
        icon: 'warning',
        text: `정말 [${fullNum || '해당'}] 차량 정보를 삭제하시겠습니까?`,
        showCancelButton: true,
        confirmButtonText: '삭제',
        cancelButtonText: '취소',
        reverseButtons: true
      });
      if (!result.isConfirmed) return;

      deleteBtn.disabled = true;

      try {
        await mutateVehicle(`/${encodeURIComponent(carId)}`, 'DELETE');

        await Swal.fire({
          icon: 'success',
          text: '차량 정보가 삭제되었습니다.'
        });
        closeModal();
        fetchAllVehicles(); // 리스트 갱신

      } catch (err) {
        await Swal.fire({
          icon: 'error',
          text: `삭제 오류: ${err.message}`
        });
      } finally {
        deleteBtn.disabled = false;
      }
    });
  }

  // 초기화 실행
  initPrefixTabMenu();
  setView(currentView);
  fetchAllVehicles();
});