document.addEventListener('DOMContentLoaded', async () => {
  // 1. 세션 확인
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return;
  }

  const searchInput = document.getElementById('carSearchInput');
  const searchBtn = document.getElementById('searchBtn');
  const vehicleList = document.getElementById('vehicleList');

  // 백엔드 Workers API URL (만약 백엔드 API를 쓰신다면 유지, 아니면 Supabase 직접 조회가 메인으로 동작)
  const WORKER_API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/vehicles';

  // 2. 차량 검색 실행 함수
  async function searchVehicles() {
    const query = searchInput.value.trim();

    if (!query) {
      vehicleList.innerHTML = `<div class="empty-state">차량번호 또는 소유자 이름을 입력해 주세요.</div>`;
      return;
    }

    vehicleList.innerHTML = `<div class="empty-state">차량 정보 조회 중...</div>`;

    try {
      let data = [];
      
      // 1차: 백엔드 Worker API 호출 시도
      try {
        const response = await fetch(`${WORKER_API_URL}?query=${encodeURIComponent(query)}`);
        if (response.ok) {
          data = await response.json();
        }
      } catch (e) {
        console.warn('Worker API 호출 실패, Supabase 직접 조회로 전환합니다.');
      }

      // 2차: 데이터가 없거나 API 실패 시 Supabase skicar_data 직접 조회 (.or 조건으로 실제 컬럼 검색)
      if (!data || data.length === 0) {
        const { data: dbData, error } = await supabaseClient
          .from('skicar_data')
          .select('*')
          .or(`full_number.ilike.%${query}%,number.ilike.%${query}%,car_name.ilike.%${query}%,name.ilike.%${query}%`);
        
        if (error) throw error;
        data = dbData || [];
      }

      renderVehicles(data);

    } catch (err) {
      console.error('차량 조회 중 오류 발생:', err);
      vehicleList.innerHTML = `<div class="empty-state">차량 정보를 불러오는 중 오류가 발생했습니다.</div>`;
    }
  }

  // 3. 검색 결과 렌더링 함수 (실제 DB 컬럼 매핑)
  function renderVehicles(list) {
    if (!list || list.length === 0) {
      vehicleList.innerHTML = `<div class="empty-state">검색 결과가 없습니다.</div>`;
      return;
    }

    vehicleList.innerHTML = list.map(item => `
      <div class="vehicle-card">
        <div class="vehicle-card-header">
          <span class="car-number">${item.full_number || item.number || '번호 미등록'}</span>
          <span class="car-type-badge">${item.car_name || '차종 미기재'}</span>
        </div>

        <div class="vehicle-details">
          <div>소유자/소속: <span>${item.name || '-'}</span></div>
          <div>부서/근무지: <span>${item.department || '-'}</span></div>
          <div>연락처: <span>${item.phone || '-'}</span></div>
          <div>등록구분: <span>등록차량</span></div>
        </div>
      </div>
    `).join('');
  }

  // 이벤트 연결 (버튼 클릭 및 엔터키)
  searchBtn.addEventListener('click', searchVehicles);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchVehicles();
    }
  });
});