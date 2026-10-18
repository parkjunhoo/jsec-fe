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

  // 백엔드 Workers API URL 또는 Supabase 다이렉트 조회
  const WORKER_API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/vehicles';

  // 2. 차량 검색 실행 함수
  async function searchVehicles() {
    const query = searchInput.value.trim();

    if (!query) {
      vehicleList.innerHTML = `<div class="empty-state">차량번호를 입력해 주세요.</div>`;
      return;
    }

    vehicleList.innerHTML = `<div class="empty-state">차량 정보 조회 중...</div>`;

    try {
      // Worker API 호출 (또는 Supabase skicar_data 직접 조회 fallback)
      let data = [];
      
      // 1차: 백엔드 Worker API 호출
      const response = await fetch(`${WORKER_API_URL}?query=${encodeURIComponent(query)}`);
      
      if (response.ok) {
        data = await response.json();
      } else {
        // Fallback: 백엔드 API 실패 시 Supabase skicar_data 직접 조회
        const { data: dbData, error } = await supabaseClient
          .from('skicar_data')
          .select('*')
          .ilike('car_number', `%${query}%`);
        
        if (error) throw error;
        data = dbData || [];
      }

      renderVehicles(data);

    } catch (err) {
      console.error('차량 조회 중 오류 발생:', err);
      vehicleList.innerHTML = `<div class="empty-state">차량 정보를 불러오는 중 오류가 발생했습니다.</div>`;
    }
  }

  // 3. 검색 결과 렌더링 함수
  function renderVehicles(list) {
    if (!list || list.length === 0) {
      vehicleList.innerHTML = `<div class="empty-state">검색 결과가 없습니다.</div>`;
      return;
    }

    vehicleList.innerHTML = list.map(item => `
      <div class="vehicle-card">
        <div class="vehicle-card-header">
          <span class="car-number">${item.car_number || item.carno || '번호 미등록'}</span>
          <span class="car-type-badge">${item.car_model || item.model || '차종 미기재'}</span>
        </div>

        <div class="vehicle-details">
          <div>소유자/소속: <span>${item.owner || item.name || '-'}</span></div>
          <div>부서/근무지: <span>${item.department || item.dept || '-'}</span></div>
          <div>연락처: <span>${item.phone || '-'}</span></div>
          <div>등록구분: <span>${item.type || '등록차량'}</span></div>
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