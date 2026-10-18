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

  let allVehicles = [];

  // 2. 초기 데이터 전체 불러오기 (접속 시 전체 리스트 출력)
  async function fetchAllVehicles() {
    vehicleList.innerHTML = `<div class="empty-state">차량 목록 불러오는 중...</div>`;

    try {
      const { data, error } = await supabaseClient
        .from('skicar_data')
        .select('*')
        .order('number', { ascending: true }); // 번호 순 기본 정렬

      if (error) throw error;

      allVehicles = data || [];
      renderGroupedVehicles(allVehicles);

    } catch (err) {
      console.error('차량 목록 조회 오류:', err);
      vehicleList.innerHTML = `<div class="empty-state">차량 정보를 불러오는 중 오류가 발생했습니다.</div>`;
    }
  }

  // 3. 첫째 자리(0~9) 기준으로 그룹화하여 렌더링하는 함수
  function renderGroupedVehicles(list) {
    if (!list || list.length === 0) {
      vehicleList.innerHTML = `<div class="empty-state">검색 결과가 없습니다.</div>`;
      return;
    }

    // 0부터 9까지의 숫자로 시작하는 그룹 객체 생성
    const groups = {};
    for (let i = 0; i <= 9; i++) {
      groups[i] = [];
    }
    const etcGroup = []; // 숫자로 시작하지 않는 예외 차량

    list.forEach(item => {
      const numStr = (item.number || item.full_number || '').toString().trim();
      const firstChar = numStr.charAt(0);

      if (groups[firstChar]) {
        groups[firstChar].push(item);
      } else {
        etcGroup.push(item);
      }
    });

    let htmlOutput = '';

    // 0부터 9까지 순회하며 그룹별 HTML 생성
    for (let i = 0; i <= 9; i++) {
      const groupItems = groups[i];
      if (groupItems.length > 0) {
        htmlOutput += `
          <div class="vehicle-group-section" style="margin-bottom: 24px;">
            <div style="font-size: 15px; font-weight: 800; color: #38bdf8; margin-bottom: 10px; padding-left: 6px; border-left: 3px solid #38bdf8; line-height: 1;">
              [ ${i}번 대 ] (${groupItems.length}대)
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${groupItems.map(item => renderCard(item)).join('')}
            </div>
          </div>
        `;
      }
    }

    // 기타 그룹 처리
    if (etcGroup.length > 0) {
      htmlOutput += `
        <div class="vehicle-group-section" style="margin-bottom: 24px;">
          <div style="font-size: 15px; font-weight: 800; color: #94a3b8; margin-bottom: 10px; padding-left: 6px; border-left: 3px solid #94a3b8; line-height: 1;">
            [ 기타 ] (${etcGroup.length}대)
          </div>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${etcGroup.map(item => renderCard(item)).join('')}
          </div>
        </div>
      `;
    }

    vehicleList.innerHTML = htmlOutput;
  }

  // 4. 개별 카드 HTML 생성 헬퍼 함수
  function renderCard(item) {
    return `
      <div class="vehicle-card" style="background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px;">
        <div class="vehicle-card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span class="car-number" style="font-size: 17px; font-weight: 800; color: #38bdf8;">${item.full_number || item.number || '번호 없음'}</span>
          <span class="car-type-badge" style="font-size: 11px; padding: 4px 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.08); color: #94a3b8; font-weight: 600;">${item.car_name || '차종 미기재'}</span>
        </div>

        <div class="vehicle-details" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 13px; color: #94a3b8; background: rgba(15, 23, 42, 0.4); padding: 10px 12px; border-radius: 10px;">
          <div>소유자: <span style="color: #f8fafc; font-weight: 600;">${item.name || '-'}</span></div>
          <div>부서: <span style="color: #f8fafc; font-weight: 600;">${item.department || '-'}</span></div>
          <div style="grid-column: span 2;">연락처: <span style="color: #f8fafc; font-weight: 600;">${item.phone || '-'}</span></div>
        </div>
      </div>
    `;
  }

  // 5. 실시간 검색 필터링 이벤트 (엔터 불필요, 타이핑 즉시 반응)
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const keyword = e.target.value.trim();

      if (!keyword) {
        renderGroupedVehicles(allVehicles);
        return;
      }

      const filtered = allVehicles.filter(item => {
        const num = (item.number || '').toString();
        const fullNum = (item.full_number || '').toString();
        return num.includes(keyword) || fullNum.includes(keyword);
      });

      renderGroupedVehicles(filtered);
    });
  }

  // 초기 실행: 접속 시 전체 리스트 로드
  fetchAllVehicles();
});