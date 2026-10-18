document.addEventListener('DOMContentLoaded', async () => {
  const navContainer = document.getElementById('navbar');
  if (!navContainer) return;

  // 현재 페이지 파일명 확인 (메뉴 활성화용)
  const currentPath = window.location.pathname;

  // 공통 CSS 스타일 자동 주입 (톱니바퀴 버튼 스타일 포함)
  const navStyle = document.createElement('style');
  navStyle.textContent = `
    .nav-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 100;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .nav-title {
      font-size: 18px;
      font-weight: 700;
      color: #f8fafc;
    }
    .hamburger-btn {
      background: none;
      border: none;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 6px;
    }
    .hamburger-btn span {
      width: 22px;
      height: 2px;
      background-color: #f8fafc;
      border-radius: 2px;
      transition: all 0.3s ease;
    }
    .drawer-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 200;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    .drawer-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }
    .drawer-menu {
      position: fixed;
      top: 0;
      right: -280px;
      width: 280px;
      height: 100vh;
      background: #1e293b;
      z-index: 201;
      padding: 30px 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      border-left: 1px solid rgba(255, 255, 255, 0.1);
      box-sizing: border-box;
    }
    .drawer-menu.active { right: 0; }
    .drawer-header { margin-bottom: 30px; }
    
    /* 톱니바퀴 및 유저 정보 행 스타일 */
    .drawer-user-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 4px;
    }
    .drawer-user-name { font-size: 18px; font-weight: 700; color: #f8fafc; }
    .btn-settings-gear {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 8px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      text-decoration: none;
      font-size: 16px;
      transition: background 0.2s;
    }
    .btn-settings-gear:hover {
      background: rgba(56, 189, 248, 0.2);
    }
    .drawer-user-role { font-size: 12px; color: #38bdf8; font-weight: 600; }
    
    .drawer-links { display: flex; flex-direction: column; gap: 8px; }
    .drawer-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      color: #94a3b8;
      text-decoration: none;
      font-size: 15px;
      font-weight: 600;
      border-radius: 12px;
      transition: all 0.2s;
    }
    .drawer-item.active, .drawer-item:active {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
    }
    .btn-nav-logout {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 14px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
      text-align: center;
    }
  `;
  document.head.appendChild(navStyle);

  // 현재 페이지 타이틀 설정
  let pageTitle = '지산리조트 보안팀';
  if (currentPath.includes('main.html')) pageTitle = '메인 메뉴';
  else if (currentPath.includes('users.html')) pageTitle = '회원 조회 및 관리';
  else if (currentPath.includes('vehicle.html')) pageTitle = '차량 조회';
  else if (currentPath.includes('calendar.html')) pageTitle = '휴무 캘린더';

  // 공통 HTML 템플릿 주입 (톱니바퀴 아이콘 포함)
  navContainer.innerHTML = `
    <header class="nav-header">
      <div class="nav-title">${pageTitle}</div>
      <button class="hamburger-btn" id="openNavDrawer">
        <span></span><span></span><span></span>
      </button>
    </header>

    <div class="drawer-overlay" id="navDrawerOverlay"></div>
    <div class="drawer-menu" id="navDrawerMenu">
      <div>
        <div class="drawer-header">
          <div class="drawer-user-row">
            <div>
              <div class="drawer-user-name" id="navUserName">회원 정보 로딩중...</div>
              <div class="drawer-user-role" id="navUserRole">Jisan Security Team</div>
            </div>
            <a href="/pages/settings.html" class="btn-settings-gear" title="내 정보 수정">⚙️</a>
          </div>
        </div>

        <nav class="drawer-links">
          <a href="/pages/main.html" class="drawer-item ${currentPath.includes('main.html') ? 'active' : ''}">
            <span>🏠</span> 메인 메뉴
          </a>
          <a href="/pages/users.html" class="drawer-item ${currentPath.includes('users.html') ? 'active' : ''}">
            <span>📋</span> 회원 조회 및 관리
          </a>
          <a href="/pages/vehicle.html" class="drawer-item ${currentPath.includes('vehicle.html') ? 'active' : ''}">
            <span>🚗</span> 차량 조회
          </a>
          <a href="/pages/calendar.html" class="drawer-item ${currentPath.includes('calendar.html') ? 'active' : ''}">
            <span>📅</span> 휴무 캘린더
          </a>
        </nav>
      </div>

      <button class="btn-nav-logout" id="navLogoutBtn">로그아웃</button>
    </div>
  `;

  // 이벤트 연결 및 유저 정보 로드
  const openBtn = document.getElementById('openNavDrawer');
  const overlay = document.getElementById('navDrawerOverlay');
  const drawer = document.getElementById('navDrawerMenu');
  const logoutBtn = document.getElementById('navLogoutBtn');

  function toggleDrawer() {
    overlay.classList.toggle('active');
    drawer.classList.toggle('active');
  }

  if (openBtn) openBtn.addEventListener('click', toggleDrawer);
  if (overlay) overlay.addEventListener('click', toggleDrawer);

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (typeof supabaseClient !== 'undefined') {
        await supabaseClient.auth.signOut();
      }
      window.location.href = '/index.html';
    });
  }

  // 로그인 사용자 이름 불러오기
  if (typeof supabaseClient !== 'undefined') {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      const { data: profile } = await supabaseClient
        .from('users')
        .select('name, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile) {
        const userNameEl = document.getElementById('navUserName');
        const userRoleEl = document.getElementById('navUserRole');
        if (userNameEl) userNameEl.textContent = `${profile.name} 님`;
        if (userRoleEl) userRoleEl.textContent = profile.role === 'admin' ? '관리자 (Admin)' : '일반 회원';
      }
    }
  }
});