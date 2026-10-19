document.addEventListener('DOMContentLoaded', async () => {
  // 1. 세션 확인
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return;
  }

  const searchInput = document.getElementById('carSearchInput');
  const vehicleList = document.getElementById('vehicleList');
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

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  // --- 모달 제어 함수 ---
  function openAddModal() {
    modalTitle.textContent = '신규 차량 등록';
    submitBtn.textContent = '등록 완료';
    deleteBtn.style.display = 'none';
    vehicleForm.reset();
    editCarId.value = '';
    vehicleModal.classList.add('active');
  }

  function openEditModal(car) {
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
      const activeStyle = isActive 
        ? 'background: #38bdf8; color: #0f172a; font-weight: 800; border-color: #38bdf8;' 
        : 'background: rgba(15, 23, 42, 0.6); color: #94a3b8; border-color: rgba(255, 255, 255, 0.1);';

      return `
        <button type="button" data-prefix="${p}" class="tab-btn" aria-pressed="${isActive}" style="
          border: 1px solid;
          ${activeStyle}
        ">${label}</button>
      `;
    }).join('');

    tabContainer.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentPrefix = e.target.getAttribute('data-prefix');
        renderPrefixTabs();
        if (searchInput) searchInput.value = '';
        filterAndRenderVehicles();
      });
    });
  }

  // 3. Supabase DB에서 전체 데이터 불러오기
  async function fetchAllVehicles() {
    vehicleList.innerHTML = `<div class="empty-state">차량 목록 불러오는 중...</div>`;

    try {
      const { data, error } = await supabaseClient
        .from('skicar_data')
        .select('*')
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
    let list = [...allVehicles];

    if (keyword) {
      list = list.filter(item => {
        const numStr = (item.number || '').toString().trim();
        return numStr.includes(keyword);
      });
    } else if (currentPrefix !== 'ALL') {
      list = list.filter(item => {
        const numStr = (item.number || '').toString().trim();
        return numStr.startsWith(currentPrefix);
      });
    }

    if (displayCountEl) displayCountEl.textContent = list.length;
    renderVehicleCards(list);
  }

  // 5. 차량 카드 리스트 렌더링 (수정/삭제 버튼 내장)
  function renderVehicleCards(list) {
    if (!list || list.length === 0) {
      vehicleList.innerHTML = `<div class="empty-state">조건에 해당하는 차량이 없습니다.</div>`;
      return;
    }

    vehicleList.innerHTML = list.map(item => `
      <div class="vehicle-card" style="
        background: rgba(30, 41, 59, 0.7);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      ">
        <div class="vehicle-card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span class="car-number" style="font-size: 17px; font-weight: 800; color: #38bdf8;">${escapeHtml(item.full_number || item.number || '번호 없음')}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="car-type-badge" style="font-size: 11px; padding: 4px 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.08); color: #94a3b8; font-weight: 600;">${escapeHtml(item.car_name || '차종 미기재')}</span>
            <button type="button" class="btn-edit-card" data-id="${escapeHtml(item.id || item.full_number)}" style="
              background: rgba(56, 189, 248, 0.15);
              border: 1px solid rgba(56, 189, 248, 0.3);
              color: #38bdf8;
              padding: 4px 10px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 700;
              cursor: pointer;
            ">수정</button>
          </div>
        </div>

        <div class="vehicle-details" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 13px; color: #94a3b8; background: rgba(15, 23, 42, 0.4); padding: 10px 12px; border-radius: 10px;">
          <div>소유자: <span style="color: #f8fafc; font-weight: 600;">${escapeHtml(item.name || '-')}</span></div>
          <div>부서: <span style="color: #f8fafc; font-weight: 600;">${escapeHtml(item.department || '-')}</span></div>
          <div style="grid-column: span 2;">연락처: <span style="color: #f8fafc; font-weight: 600;">${escapeHtml(item.phone || '-')}</span></div>
          ${item.notes ? `<div style="grid-column: span 2;">비고: <span style="color: #f8fafc;">${escapeHtml(item.notes)}</span></div>` : ''}
        </div>
      </div>
    `).join('');

    // 카드별 수정 버튼 이벤트 연결
    vehicleList.querySelectorAll('.btn-edit-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        const targetCar = allVehicles.find(c => (c.id == id || c.full_number == id));
        if (targetCar) openEditModal(targetCar);
      });
    });
  }

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
          // --- 수정 (UPDATE) ---
          let query = supabaseClient.from('skicar_data').update({
            number, full_number, name, department, car_name, phone, notes
          });

          // ID가 숫자인지 full_number인지 분기
          if (!isNaN(carId)) {
            query = query.eq('id', carId);
          } else {
            query = query.eq('full_number', carId);
          }

          const { error } = await query;
          if (error) throw error;
          await Swal.fire({
            icon: 'success',
            text: '차량 정보가 수정되었습니다.'
          });

        } else {
          // --- 추가 (INSERT) ---
          const { error } = await supabaseClient
            .from('skicar_data')
            .insert([{ number, full_number, name, department, car_name, phone, notes }]);

          if (error) throw error;
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
        let query = supabaseClient.from('skicar_data').delete();

        if (!isNaN(carId)) {
          query = query.eq('id', carId);
        } else {
          query = query.eq('full_number', carId);
        }

        const { error } = await query;
        if (error) throw error;

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
  fetchAllVehicles();
});