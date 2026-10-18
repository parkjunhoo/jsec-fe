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

  let allVehicles = [];
  let currentPrefix = 'ALL';

  // 2. 탭 메뉴 HTML을 검색창 바로 아래에 동적으로 생성
  function initPrefixTabMenu() {
    let tabContainer = document.getElementById('prefixTabMenu');
    if (!tabContainer) {
      tabContainer = document.createElement('div');
      tabContainer.id = 'prefixTabMenu';
      tabContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 20px;
        background: rgba(30, 41, 59, 0.5);
        padding: 8px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      `;

      // search-box 바로 뒤에 삽입
      const searchBox = document.querySelector('.search-box');
      if (searchBox) {
        searchBox.parentNode.insertBefore(tabContainer, searchBox.nextSibling);
      } else {
        container.insertBefore(tabContainer, vehicleList);
      }
    }

    renderPrefixTabs();
  }

  // 3. 0~9 번호대 탭 버튼 렌더링
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
        <button type="button" data-prefix="${p}" class="tab-btn" style="
          flex: 1;
          min-width: 38px;
          height: 38px;
          border-radius: 8px;
          border: 1px solid;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          ${activeStyle}
        ">${label}</button>
      `;
    }).join('');

    // 탭 클릭 이벤트 연결
    tabContainer.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentPrefix = e.target.getAttribute('data-prefix');
        renderPrefixTabs();
        
        // 검색창 초기화 후 탭 기준 필터링
        if (searchInput) searchInput.value = '';
        filterAndRenderVehicles();
      });
    });
  }

  // 4. Supabase DB에서 전체 데이터 불러오기
  async function fetchAllVehicles() {
    vehicleList.innerHTML = `<div class="empty-state">차량 목록 불러오는 중...</div>`;

    try {
      const { data, error } = await supabaseClient
        .from('skicar_data')
        .select('*')
        .order('number', { ascending: true }); // number 기준 오름차순 정렬

      if (error) throw error;

      allVehicles = data || [];
      filterAndRenderVehicles();

    } catch (err) {
      console.error('차량 목록 조회 오류:', err);
      vehicleList.innerHTML = `<div class="empty-state">차량 정보를 불러오는 중 오류가 발생했습니다.</div>`;
    }
  }

  // 5. 탭 선택 및 검색어에 따라 데이터 필터링 후 출력
  function filterAndRenderVehicles() {
    const keyword = searchInput ? searchInput.value.trim() : '';

    let list = [...allVehicles];

    // 1) 입력된 검색어가 있는 경우 (오직 number 컬럼만 대조!)
    if (keyword) {
      list = list.filter(item => {
        const numStr = (item.number || '').toString().trim();
        return numStr.includes(keyword); // full_number 등은 절대 검색하지 않음
      });
    } 
    // 2) 검색어가 없고 특정 탭(0~9)이 선택된 경우
    else if (currentPrefix !== 'ALL') {
      list = list.filter(item => {
        const numStr = (item.number || '').toString().trim();
        return numStr.startsWith(currentPrefix);
      });
    }

    renderVehicleCards(list);
  }

  // 6. 개별 차량 카드 리스트 렌더링
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
        margin-bottom: 10px;
      ">
        <div class="vehicle-card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span class="car-number" style="font-size: 17px; font-weight: 800; color: #38bdf8;">${item.full_number || item.number || '번호 없음'}</span>
          <span class="car-type-badge" style="font-size: 11px; padding: 4px 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.08); color: #94a3b8; font-weight: 600;">${item.car_name || '차종 미기재'}</span>
        </div>

        <div class="vehicle-details" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 13px; color: #94a3b8; background: rgba(15, 23, 42, 0.4); padding: 10px 12px; border-radius: 10px;">
          <div>소유자: <span style="color: #f8fafc; font-weight: 600;">${item.name || '-'}</span></div>
          <div>부서: <span style="color: #f8fafc; font-weight: 600;">${item.department || '-'}</span></div>
          <div style="grid-column: span 2;">연락처: <span style="color: #f8fafc; font-weight: 600;">${item.phone ? `<a href="tel:${item.phone}" style="color:#38bdf8; text-decoration:none;">${item.phone}</a>` : '-'}</span></div>
          ${item.notes ? `<div style="grid-column: span 2;">비고: <span style="color: #f8fafc;">${item.notes}</span></div>` : ''}
        </div>
      </div>
    `).join('');
  }

  // 7. 실시간 타이핑 입력 이벤트 (엔터 불필요)
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      // 타이핑 시 전체/탭 모드 자동 조정
      filterAndRenderVehicles();
    });
  }

  // 초기화 실행
  initPrefixTabMenu();
  fetchAllVehicles();
});