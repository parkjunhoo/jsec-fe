document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api';
  const adminMenuTab = document.getElementById('adminMenuTab');
  const adminMenuPanel = document.getElementById('adminMenuPanel');
  const adminMenuRefresh = document.getElementById('adminMenuRefresh');
  const adminMenuUpdatedAt = document.getElementById('adminMenuUpdatedAt');
  const adminAnnualDueList = document.getElementById('adminAnnualDueList');
  const adminAnnualDueCount = document.getElementById('adminAnnualDueCount');
  const adminPendingLeaveList = document.getElementById('adminPendingLeaveList');
  const adminPendingLeaveCount = document.getElementById('adminPendingLeaveCount');
  const adminPendingItemList = document.getElementById('adminPendingItemList');
  const adminPendingItemCount = document.getElementById('adminPendingItemCount');
  const vacationTab = document.getElementById('personalVacationTab');
  const attendanceTab = document.getElementById('personalAttendanceTab');
  const annualLeaveTab = document.getElementById('personalAnnualLeaveTab');
  const allowanceTab = document.getElementById('personalAllowanceTab');
  const teamVacationTab = document.getElementById('teamVacationTab');
  const teamAllowanceTab = document.getElementById('teamAllowanceTab');
  const vacationPanel = document.getElementById('personalVacationPanel');
  const attendancePanel = document.getElementById('personalAttendancePanel');
  const annualLeavePanel = document.getElementById('personalAnnualLeavePanel');
  const allowancePanel = document.getElementById('personalAllowancePanel');
  const vacationSummary = document.getElementById('personalVacationSummary');
  const annualLeaveSummary = document.getElementById('personalAnnualLeaveSummary');
  const annualLeaveError = document.getElementById('personalAnnualLeaveError');
  const teamAnnualLeaveArea = document.getElementById('teamAnnualLeaveArea');
  const teamAnnualLeaveAsOf = document.getElementById('teamAnnualLeaveAsOf');
  const teamAnnualLeaveSelect = document.getElementById('teamAnnualLeaveSelect');
  const teamAnnualLeaveDetail = document.getElementById('teamAnnualLeaveDetail');
  const allowanceSummary = document.getElementById('personalAllowanceSummary');
  const vacationError = document.getElementById('personalVacationError');
  const allowanceError = document.getElementById('personalAllowanceError');
  const dutyStatus = document.getElementById('personalDutyStatus');
  const dutyList = document.getElementById('personalDutyList');
  const monthLabel = document.getElementById('personalMonth');
  const monthNavigation = document.getElementById('personalMonthNav');
  const previousMonthButton = document.getElementById('personalPreviousMonth');
  const nextMonthButton = document.getElementById('personalNextMonth');
  const welcomeMessage = document.getElementById('personalWelcome');
  const personalTitle = document.getElementById('personalTitle');
  const teamDashboard = document.getElementById('teamDashboard');
  const teamVacationPanel = document.getElementById('teamVacationPanel');
  const teamAllowancePanel = document.getElementById('teamAllowancePanel');
  const teamVacationContent = document.getElementById('teamVacationContent');
  const teamAllowanceContent = document.getElementById('teamAllowanceContent');
  const homeFavoritesSection = document.getElementById('homeFavoritesSection');
  const homeFavoritesGrid = document.getElementById('homeFavoritesGrid');
  const homeFavoritesStatus = document.getElementById('homeFavoritesStatus');

  function getKstParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    return Object.fromEntries(parts.map(part => [part.type, part.value]));
  }

  const todayParts = getKstParts();
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  teamAnnualLeaveAsOf.value = today;
  let selectedMonth = new Date(Number(todayParts.year), Number(todayParts.month) - 1, 1);
  let monthRequestId = 0;
  let isGuest = false;
  let isAdmin = false;
  let activeTab = vacationTab;
  let allVacations = [];
  let annualLeaveBalances = [];
  let annualLeaveLoaded = false;
  let annualLeaveRequestId = 0;
  let adminMenuRequestId = 0;
  let guestVacationState = 'loading';
  let guestAllowanceState = 'loading';

  function getSelectedMonthRange() {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    const monthString = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    return {
      start: `${year}-${monthString}-01`,
      end: `${year}-${monthString}-${String(lastDay).padStart(2, '0')}`,
      label: `${year}년 ${month}월`
    };
  }

  monthLabel.textContent = getSelectedMonthRange().label;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function getMenuFavoriteKey(anchor) {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return '';
    const url = new URL(href, window.location.origin);
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : url.href;
  }

  function renderHomeFavorites() {
    if (!homeFavoritesSection || !window.userPreferences) return;
    const favorites = window.userPreferences.getFavorites().filter(item => item.type === 'menu');
    const cards = new Map([...document.querySelectorAll('.service-group .menu-card')]
      .map(anchor => [getMenuFavoriteKey(anchor), anchor])
      .filter(([key]) => key));
    homeFavoritesGrid.replaceChildren();
    const visibleFavorites = favorites.filter(item => cards.has(item.key));
    if (!visibleFavorites.length) {
      homeFavoritesGrid.innerHTML = '<div class="personal-empty">아직 즐겨찾기한 메뉴가 없습니다. 서비스 메뉴의 별표를 눌러 추가하세요.</div>';
    } else {
      visibleFavorites.forEach(item => {
        const card = cards.get(item.key).cloneNode(true);
        card.classList.add('favorite-shortcut');
        homeFavoritesGrid.append(card);
      });
    }
    homeFavoritesSection.hidden = false;
    document.querySelectorAll('[data-menu-favorite]').forEach(button => {
      const favorite = favorites.some(item => item.key === button.dataset.menuFavorite);
      button.setAttribute('aria-pressed', String(favorite));
      button.textContent = favorite ? '★' : '☆';
      button.title = favorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가';
      button.setAttribute('aria-label', `${button.dataset.menuLabel} ${button.title}`);
    });
  }

  function initializeMenuFavorites() {
    if (!homeFavoritesGrid || !window.userPreferences) return;
    document.querySelectorAll('.service-group .menu-card').forEach(anchor => {
      const favoriteKey = getMenuFavoriteKey(anchor);
      if (!favoriteKey || anchor.parentElement.classList.contains('menu-card-shell')) return;
      const shell = document.createElement('div');
      shell.className = 'menu-card-shell';
      anchor.parentNode.insertBefore(shell, anchor);
      shell.append(anchor);
      const favoriteButton = document.createElement('button');
      favoriteButton.type = 'button';
      favoriteButton.className = 'menu-favorite-toggle';
      favoriteButton.dataset.menuFavorite = favoriteKey;
      favoriteButton.dataset.menuLabel = anchor.querySelector('.menu-title')?.textContent.trim() || '메뉴';
      favoriteButton.setAttribute('aria-pressed', 'false');
      favoriteButton.textContent = '☆';
      shell.append(favoriteButton);
    });
    renderHomeFavorites();
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-menu-favorite]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    homeFavoritesStatus.textContent = '';
    try {
      await window.userPreferences.toggleFavorite('menu', button.dataset.menuFavorite);
    } catch (error) {
      console.error('메뉴 즐겨찾기 저장 오류:', error);
      homeFavoritesStatus.textContent = error.message || '즐겨찾기를 저장하지 못했습니다.';
    } finally {
      button.disabled = false;
    }
  });

  window.addEventListener('jsec:favorites-changed', renderHomeFavorites);

  function formatMoney(value) {
    return `${new Intl.NumberFormat('ko-KR').format(Number(value) || 0)}원`;
  }

  function animateMonthChange(direction) {
    const panelByTab = new Map([
      [adminMenuTab, adminMenuPanel],
      [vacationTab, vacationPanel],
      [attendanceTab, attendancePanel],
      [annualLeaveTab, annualLeavePanel],
      [allowanceTab, allowancePanel],
      [teamVacationTab, teamVacationPanel],
      [teamAllowanceTab, teamAllowancePanel]
    ]);
    const activePanel = panelByTab.get(activeTab);
    activePanel.classList.remove('month-slide-next', 'month-slide-previous');
    void activePanel.offsetWidth;
    activePanel.classList.add(direction > 0 ? 'month-slide-next' : 'month-slide-previous');
    activePanel.addEventListener('animationend', () => {
      activePanel.classList.remove('month-slide-next', 'month-slide-previous');
    }, { once: true });
  }

  async function changeMonth(offset) {
    selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + offset, 1);
    const { start, end, label } = getSelectedMonthRange();
    const requestId = ++monthRequestId;
    monthLabel.textContent = label;
    welcomeMessage.textContent = isGuest
      ? `${label} 팀 휴무 현황입니다.`
      : `${label} 내 휴무 일정을 확인하세요.`;
    animateMonthChange(offset);
    await loadVacations(start, end, requestId);
  }

  function formatVacationDate(value) {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'Asia/Seoul'
    }).format(new Date(`${value}T12:00:00+09:00`));
  }

  function showTab(selectedTab) {
    activeTab = selectedTab;
    monthNavigation.hidden = selectedTab === annualLeaveTab || selectedTab === adminMenuTab || selectedTab === attendanceTab;
    if (isAdmin) teamDashboard.hidden = selectedTab !== teamVacationTab && selectedTab !== teamAllowanceTab;
    const panelByTab = new Map([
      [adminMenuTab, adminMenuPanel],
      [vacationTab, vacationPanel],
      [attendanceTab, attendancePanel],
      [annualLeaveTab, annualLeavePanel],
      [allowanceTab, allowancePanel],
      [teamVacationTab, teamVacationPanel],
      [teamAllowanceTab, teamAllowancePanel]
    ]);
    [adminMenuTab, vacationTab, attendanceTab, annualLeaveTab, allowanceTab, teamVacationTab, teamAllowanceTab].forEach(tab => {
      const selected = tab === selectedTab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panelByTab.get(tab).hidden = !selected;
    });
    if (selectedTab === adminMenuTab) loadAdminMenu();
    if (selectedTab === annualLeaveTab) loadAnnualLeave();
  }

  adminMenuTab.addEventListener('click', () => showTab(adminMenuTab));
  vacationTab.addEventListener('click', () => showTab(vacationTab));
  attendanceTab.addEventListener('click', () => showTab(attendanceTab));
  annualLeaveTab.addEventListener('click', () => showTab(annualLeaveTab));
  allowanceTab.addEventListener('click', () => showTab(allowanceTab));
  teamVacationTab.addEventListener('click', () => showTab(teamVacationTab));
  teamAllowanceTab.addEventListener('click', () => showTab(teamAllowanceTab));
  previousMonthButton.addEventListener('click', () => changeMonth(-1));
  nextMonthButton.addEventListener('click', () => changeMonth(1));
  let swipeStart = null;
  [vacationPanel, annualLeavePanel, allowancePanel, teamVacationPanel, teamAllowancePanel].forEach(panel => {
    panel.addEventListener('touchstart', event => {
      if (event.touches.length !== 1 || event.target.closest('button, a, input, select, textarea')) {
        swipeStart = null;
        return;
      }
      swipeStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }, { passive: true });
    panel.addEventListener('touchend', event => {
      if (!swipeStart || event.changedTouches.length !== 1) return;
      const deltaX = event.changedTouches[0].clientX - swipeStart.x;
      const deltaY = event.changedTouches[0].clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
      changeMonth(deltaX < 0 ? 1 : -1);
    }, { passive: true });
    panel.addEventListener('touchcancel', () => { swipeStart = null; }, { passive: true });
  });
  [adminMenuTab, vacationTab, attendanceTab, annualLeaveTab, allowanceTab, teamVacationTab, teamAllowanceTab].forEach(tab => {
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const availableTabs = [adminMenuTab, vacationTab, attendanceTab, annualLeaveTab, allowanceTab, teamVacationTab, teamAllowanceTab]
        .filter(availableTab => !availableTab.hidden);
      const currentIndex = availableTabs.indexOf(tab);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? availableTabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + availableTabs.length) % availableTabs.length;
      const nextTab = availableTabs[nextIndex];
      showTab(nextTab);
      nextTab.focus();
    });
  });

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) {
    console.error('개인 메뉴 세션 확인 오류:', sessionError);
    vacationError.textContent = '로그인 정보를 확인하지 못했습니다. 새로고침해 주세요.';
    allowanceError.textContent = '로그인 정보를 확인하지 못했습니다. 새로고침해 주세요.';
    dutyList.querySelectorAll('button').forEach(button => { button.disabled = true; });
    return;
  }
  const session = sessionData.session;
  if (!session) {
    window.location.replace('/index.html');
    return;
  }
  const { data: profile, error: profileError } = await supabaseClient
    .from('users')
    .select('name, username, role')
    .eq('id', session.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('개인 메뉴 사용자 정보 조회 오류:', profileError);
  } else if (profile) {
    isGuest = profile.role === 'guest' || profile.role === 'monitor';
    isAdmin = profile.role === 'admin';
    attendanceTab.hidden = isGuest;
    const name = profile.name || profile.username;
    if (name) welcomeMessage.textContent = isGuest
      ? `${name}님, ${getSelectedMonthRange().label} 팀 현황입니다.`
      : `${name}님, ${getSelectedMonthRange().label} 내 휴무 일정을 확인하세요.`;
  }
  allowanceTab.hidden = true;
  adminMenuTab.hidden = !isAdmin;
  annualLeaveTab.hidden = isGuest;
  teamAllowanceTab.hidden = true;
  allowancePanel.hidden = true;
  annualLeavePanel.hidden = false;
  teamAnnualLeaveArea.hidden = !isAdmin;
  teamAllowancePanel.hidden = true;
  dutyList.hidden = true;
  dutyList.style.display = 'none';
  dutyStatus.hidden = true;
  dutyStatus.style.display = 'none';
  annualLeaveSummary.hidden = isAdmin;
  if (isGuest) {
    personalTitle.textContent = '팀 운영 대시보드';
    adminMenuTab.hidden = true;
    vacationTab.hidden = true;
    allowanceTab.hidden = true;
    teamVacationTab.hidden = false;
    teamAllowanceTab.hidden = true;
    teamVacationTab.setAttribute('aria-label', '휴무 통계');
    teamAllowanceTab.setAttribute('aria-label', '수당 통계');
    vacationPanel.hidden = true;
    annualLeavePanel.hidden = true;
    allowancePanel.hidden = true;
    teamDashboard.hidden = false;
    showTab(teamVacationTab);
    dutyList.hidden = true;
    dutyList.style.display = 'none';
    dutyStatus.hidden = true;
    dutyStatus.style.display = 'none';
    welcomeMessage.textContent = `${getSelectedMonthRange().label} 팀 휴무 현황입니다.`;
  } else if (isAdmin) {
    teamVacationTab.hidden = false;
    teamAllowanceTab.hidden = true;
    teamDashboard.hidden = false;
    showTab(adminMenuTab);
  } else {
    adminMenuTab.hidden = true;
    teamDashboard.hidden = true;
    showTab(vacationTab);
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  function formatAdminDate(value) {
    if (!value) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-');
      return `${year}.${month}.${day}`;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '-'
      : new Intl.DateTimeFormat('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Seoul'
      }).format(date);
  }

  function renderAdminRequestList(listElement, countElement, items, renderItem, error) {
    if (error) {
      countElement.textContent = '!';
      listElement.innerHTML = '<div class="admin-menu-error">목록을 불러오지 못했습니다.</div>';
      return;
    }
    countElement.textContent = String(items.length);
    listElement.innerHTML = items.length
      ? `${items.slice(0, 5).map(renderItem).join('')}${items.length > 5
        ? `<div class="admin-menu-empty">외 ${items.length - 5}건</div>`
        : ''}`
      : '<div class="admin-menu-empty">대기 중인 항목이 없습니다.</div>';
  }

  async function loadAdminMenu() {
    if (!isAdmin) return;
    const requestId = ++adminMenuRequestId;
    adminMenuUpdatedAt.textContent = '관리자 확인 항목을 불러오는 중입니다.';
    const todayDate = new Date(`${today}T00:00:00Z`);
    const cutoffDate = new Date(todayDate);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() + 30);
    const cutoff = cutoffDate.toISOString().slice(0, 10);
    const [balanceResult, leaveResult, itemResult] = await Promise.allSettled([
      request(`/annual-leave?as_of=${encodeURIComponent(today)}`),
      request('/annual-leave-requests'),
      request('/item-requests')
    ]);
    if (requestId !== adminMenuRequestId) return;

    if (balanceResult.status === 'fulfilled') {
      const dueBalances = (balanceResult.value.balances || [])
        .filter(balance => balance.service_year
          && balance.cycle_end >= today
          && balance.cycle_end <= cutoff
          && (Number(balance.remaining_days) + Number(balance.pending_days)) > 0)
        .sort((left, right) => left.cycle_end.localeCompare(right.cycle_end));
      renderAdminRequestList(
        adminAnnualDueList,
        adminAnnualDueCount,
        dueBalances,
        balance => `<a class="admin-menu-row" href="/pages/annual-leave.html">
          <span class="admin-menu-row-main"><strong>${escapeHtml(balance.name)} · ${balance.service_year}년차</strong>
          <span>기준기간 종료 ${formatAdminDate(balance.cycle_end)} · 미소진 ${formatAnnualDays(Number(balance.remaining_days) + Number(balance.pending_days))}일 · 신청 대기 ${formatAnnualDays(balance.pending_days)}일</span></span>
          <span class="admin-menu-row-value">${formatAnnualDays(balance.remaining_days)}일<br>잔여</span>
        </a>`,
        null
      );
    } else {
      renderAdminRequestList(adminAnnualDueList, adminAnnualDueCount, [], () => '', balanceResult.reason);
    }

    if (leaveResult.status === 'fulfilled') {
      const pendingLeaves = (leaveResult.value || []).filter(item => item.status === 'pending');
      renderAdminRequestList(
        adminPendingLeaveList,
        adminPendingLeaveCount,
        pendingLeaves,
        item => `<a class="admin-menu-row" href="/pages/annual-leave.html#annualRequests">
          <span class="admin-menu-row-main"><strong>${escapeHtml(item.username || '이름 없음')} · ${escapeHtml(item.leave_type || '연차')}</strong>
          <span>${formatAdminDate(item.start_date)}${item.end_date !== item.start_date ? ` ~ ${formatAdminDate(item.end_date)}` : ''} · 신청 ${formatAdminDate(item.created_at)}</span></span>
          <span class="admin-menu-row-value">${item.leave_type === '시간차'
            ? `${formatAnnualDays(item.hours_used)}시간`
            : `${formatAnnualDays(item.total_days)}일`}</span>
        </a>`,
        null
      );
    } else {
      renderAdminRequestList(adminPendingLeaveList, adminPendingLeaveCount, [], () => '', leaveResult.reason);
    }

    if (itemResult.status === 'fulfilled') {
      const pendingItems = (itemResult.value || []).filter(item => item.status === 'pending');
      renderAdminRequestList(
        adminPendingItemList,
        adminPendingItemCount,
        pendingItems,
        item => `<a class="admin-menu-row" href="/pages/item-requests.html">
          <span class="admin-menu-row-main"><strong>${escapeHtml(item.item_name || '물품')}</strong>
          <span>${escapeHtml(item.username || '이름 없음')} · 신청 ${formatAdminDate(item.created_at)}${item.specification ? ` · ${escapeHtml(item.specification)}` : ''}</span></span>
          <span class="admin-menu-row-value">${formatAnnualDays(item.quantity)}개</span>
        </a>`,
        null
      );
    } else {
      renderAdminRequestList(adminPendingItemList, adminPendingItemCount, [], () => '', itemResult.reason);
    }

    adminMenuUpdatedAt.textContent = `기준일 ${formatAdminDate(today)} · 마지막 확인 ${formatAdminDate(new Date().toISOString())}`;
  }

  adminMenuRefresh.addEventListener('click', loadAdminMenu);

  function formatAnnualDays(value) {
    return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }

  function groupAnnualLeaveByWorkplace(balances) {
    const groups = new Map();
    balances.forEach(balance => {
      const workplace = balance.department || '근무지 미등록';
      if (!groups.has(workplace)) groups.set(workplace, []);
      groups.get(workplace).push(balance);
    });
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, 'ko'));
  }

  function renderAnnualLeaveEmployee(balance) {
    if (!balance) {
      teamAnnualLeaveDetail.innerHTML = '<div class="personal-empty">직원을 선택하면 연차 상세를 확인할 수 있습니다.</div>';
      return;
    }
    if (!balance.service_year) {
      teamAnnualLeaveDetail.innerHTML = `<div class="personal-empty">${escapeHtml(balance.name)} 직원은 연차 기준일이 등록되지 않아 계산할 수 없습니다.</div>`;
      return;
    }
    teamAnnualLeaveDetail.innerHTML = `
      <div class="personal-annual-grid">
        <div class="personal-annual-stat"><span>근속연차</span><strong>${balance.service_year}년차</strong></div>
        <div class="personal-annual-stat"><span>총 보유</span><strong>${formatAnnualDays(balance.entitled_days)}일</strong></div>
        <div class="personal-annual-stat"><span>사용 · 신청 대기</span><strong>${formatAnnualDays(balance.used_days)} · ${formatAnnualDays(balance.pending_days)}일</strong></div>
        <div class="personal-annual-stat"><span>신청 가능 잔여</span><strong>${formatAnnualDays(balance.remaining_days)}일</strong></div>
      </div>
      <p class="personal-annual-note">연차 기준일 ${escapeHtml(balance.annual_base_date)} · 산정 기준일 ${escapeHtml(teamAnnualLeaveAsOf.value)} · 기준기간 ${escapeHtml(balance.cycle_start)} ~ ${escapeHtml(balance.cycle_end)} · 소진율 ${balance.usage_rate}% · 시간차 1일 기준 ${balance.hours_per_day}시간</p>`;
  }

  function renderAnnualLeave(balances) {
    if (isAdmin) {
      annualLeaveSummary.hidden = true;
      const selectedUserId = teamAnnualLeaveSelect.value;
      teamAnnualLeaveSelect.innerHTML = '<option value="">직원을 선택하세요</option>' +
        groupAnnualLeaveByWorkplace(balances).map(([workplace, group]) =>
          `<optgroup label="${escapeHtml(workplace)}">${group
            .map(balance => `<option value="${escapeHtml(balance.user_id)}">${escapeHtml(balance.name)}</option>`)
            .join('')}</optgroup>`
        ).join('');
      teamAnnualLeaveSelect.value = balances.some(balance => balance.user_id === selectedUserId)
        ? selectedUserId
        : '';
      renderAnnualLeaveEmployee(balances.find(balance => balance.user_id === teamAnnualLeaveSelect.value));
      return;
    }
    annualLeaveSummary.hidden = false;
    if (!balances.length) {
      annualLeaveSummary.innerHTML = '<div class="personal-empty">표시할 연차 현황이 없습니다.</div>';
      return;
    }
    const balance = balances[0];
    if (!balance.service_year) {
      annualLeaveSummary.innerHTML = '<div class="personal-empty">연차 기준일이 등록되어 있지 않아 연차를 계산할 수 없습니다. 관리자에게 문의해 주세요.</div>';
      return;
    }
    annualLeaveSummary.innerHTML = `<div class="personal-annual-grid">
      <div class="personal-annual-stat"><span>근속연차</span><strong>${balance.service_year}년차</strong></div>
      <div class="personal-annual-stat"><span>총 보유</span><strong>${formatAnnualDays(balance.entitled_days)}일</strong></div>
      <div class="personal-annual-stat"><span>사용 · 신청 대기</span><strong>${formatAnnualDays(balance.used_days)} · ${formatAnnualDays(balance.pending_days)}일</strong></div>
      <div class="personal-annual-stat"><span>신청 가능 잔여</span><strong>${formatAnnualDays(balance.remaining_days)}일</strong></div>
    </div>
    <p class="personal-annual-note">기준기간 ${escapeHtml(balance.cycle_start)} ~ ${escapeHtml(balance.cycle_end)} · 소진율 ${balance.usage_rate}% · 시간차 1일 기준 ${balance.hours_per_day}시간</p>`;
  }

  async function loadAnnualLeave(force = false) {
    if (annualLeaveLoaded && !force) return;
    const requestId = ++annualLeaveRequestId;
    annualLeaveError.textContent = '';
    if (!isAdmin) annualLeaveSummary.innerHTML = '<div class="personal-empty">연차 현황을 불러오는 중입니다.</div>';
    try {
      const params = new URLSearchParams();
      if (isAdmin) params.set('as_of', teamAnnualLeaveAsOf.value);
      const result = await request(`/annual-leave${params.size ? `?${params}` : ''}`);
      if (requestId !== annualLeaveRequestId) return;
      annualLeaveBalances = result.balances || [];
      isAdmin = result.isAdmin;
      teamAnnualLeaveArea.hidden = !isAdmin;
      renderAnnualLeave(annualLeaveBalances);
      annualLeaveLoaded = true;
    } catch (error) {
      if (requestId !== annualLeaveRequestId) return;
      annualLeaveLoaded = false;
      console.error('내 메뉴 연차 현황 조회 오류:', error);
      annualLeaveError.textContent = error.message || '연차 현황을 불러오지 못했습니다.';
      annualLeaveSummary.innerHTML = '<div class="personal-empty">연차 현황을 불러오지 못했습니다. 연차 관리 페이지에서 다시 시도해 주세요.</div>';
    }
  }

  teamAnnualLeaveSelect.addEventListener('change', () => {
    const balance = annualLeaveBalances.find(item => item.user_id === teamAnnualLeaveSelect.value);
    renderAnnualLeaveEmployee(balance);
  });

  teamAnnualLeaveAsOf.addEventListener('change', () => {
    if (!teamAnnualLeaveAsOf.value) {
      teamAnnualLeaveAsOf.value = today;
      return;
    }
    annualLeaveLoaded = false;
    teamAnnualLeaveDetail.innerHTML = '<div class="personal-empty">선택한 기준일로 연차 현황을 다시 계산하고 있습니다.</div>';
    loadAnnualLeave();
  });

  async function loadVacations(start, end, requestId) {
    if (isGuest || isAdmin) {
      guestVacationState = 'loading';
      renderGuestDashboard();
    }
    try {
      const params = new URLSearchParams({ start, end });
      const vacations = await request(`/vacations?${params.toString()}`);
      if (requestId !== monthRequestId) return;
      allVacations = vacations;
      if (isGuest || isAdmin) {
        guestVacationState = 'ready';
        renderGuestDashboard();
      }
      if (isGuest) return;
      const mine = vacations.filter(vacation => vacation.user_id === session.user.id);
      const typeCounts = mine.reduce((counts, vacation) => {
        counts[vacation.leave_type] = (counts[vacation.leave_type] || 0) + 1;
        return counts;
      }, {});
      const typeSummary = Object.entries(typeCounts)
        .map(([type, count]) => `${escapeHtml(type)} ${count}건`)
        .join(' · ');
      const upcoming = mine
        .filter(vacation => vacation.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));
      const sortedMine = [...mine].sort((a, b) => a.date.localeCompare(b.date));
      const rows = sortedMine.slice(0, 6).map(vacation => {
        const isPast = vacation.date < today;
        const isToday = vacation.date === today;
        const detail = vacation.leave_type === '시간차'
          ? (vacation.time_detail === '시간지정'
            ? `${vacation.hours_used || ''}시간`
            : vacation.time_detail || '종일')
          : vacation.time_detail || '종일';
        return `<div class="personal-row personal-vacation-row${isPast ? ' past' : ''}${isToday ? ' today' : ''}">
          <div class="personal-row-main">
            <div class="personal-row-title">${escapeHtml(formatVacationDate(vacation.date))}</div>
            <div class="personal-row-detail">${escapeHtml(vacation.leave_type || '휴무')} · ${escapeHtml(detail)}</div>
          </div>
          <span class="personal-row-value">${isToday ? '오늘' : isPast ? '지난 일정' : '예정'}</span>
        </div>`;
      }).join('');

      vacationSummary.innerHTML = `<div class="personal-stats">
        <strong>${mine.length}건</strong>
        <span>${getSelectedMonthRange().label} 휴무${typeSummary ? ` · ${typeSummary}` : ''}</span>
      </div>
      ${rows
        ? `<div class="personal-list personal-vacation-list">${rows}</div>${mine.length > 6 ? `<p class="personal-row-detail">외 ${mine.length - 6}건의 일정</p>` : ''}`
        : `<div class="personal-empty">${getSelectedMonthRange().label} 등록된 휴무 일정이 없습니다.</div>`}
      <p class="personal-row-detail">${upcoming.length ? `${getSelectedMonthRange().label} 남은 일정 ${upcoming.length}건` : `${getSelectedMonthRange().label} 남은 휴무 일정이 없습니다.`}</p>`;
    } catch (error) {
      if (requestId !== monthRequestId) return;
      console.error('내 휴무 요약 조회 오류:', error);
      if (isGuest || isAdmin) {
        guestVacationState = 'error';
        renderGuestDashboard();
      }
      if (!isGuest) {
        vacationError.textContent = '휴무 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
      }
    }
  }

  const duties = [
    { key: 'shuttle-morning', label: '오전셔틀', type: 'caddie_shuttle', shift: 'morning' },
    { key: 'shuttle-afternoon', label: '오후셔틀', type: 'caddie_shuttle', shift: 'afternoon' },
    { key: 'ball-1', label: '볼줍기', type: 'ball_pickup', slot: 1 },
    { key: 'ball-2', label: '볼줍기2', type: 'ball_pickup', slot: 2 }
  ];
  let allowanceEntries = [];
  let todayAvailability = [];
  let allowanceDataReady = false;
  const busyDuties = new Set();

  function matchingDuty(entry, duty) {
    return entry.type_code === duty.type
      && (duty.shift ? entry.shift === duty.shift : Number(entry.slot_no) === duty.slot);
  }

  function renderDuties() {
    if (isGuest) return;
    dutyList.querySelectorAll('[data-duty]').forEach(button => {
      const duty = duties.find(item => item.key === button.dataset.duty);
      const mine = todayAvailability.find(entry =>
        entry.user_id === session.user.id && matchingDuty(entry, duty)
      );
      const takenByOther = todayAvailability.some(entry =>
        entry.user_id !== session.user.id && matchingDuty(entry, duty)
      );
      const otherEntry = todayAvailability.find(entry =>
        entry.user_id !== session.user.id && matchingDuty(entry, duty)
      );
      const otherName = otherEntry?.username || '다른 직원';
      const state = button.querySelector('.duty-state');
      button.setAttribute('aria-pressed', String(Boolean(mine)));
      button.setAttribute('aria-label', `${duty.label}: ${
        !allowanceDataReady
          ? '상태 조회 불가'
          : mine
            ? '등록됨, 다시 누르면 취소'
            : takenByOther
              ? `${otherName} 등록`
              : '등록하기'
      }`);
      state.textContent = !allowanceDataReady
        ? '조회 불가'
        : mine
          ? '등록됨 · 눌러서 취소'
          : takenByOther
            ? `${otherName} 등록`
            : '등록하기';
      button.title = takenByOther ? `${otherName} 님이 등록했습니다.` : '';
      button.disabled = !allowanceDataReady || busyDuties.has(duty.key) || (!mine && takenByOther);
    });
  }

  function renderAllowanceSummary() {
    const mine = allowanceEntries.filter(entry => entry.user_id === session.user.id);
    const totalAmount = mine.reduce((total, entry) => total + (Number(entry.unit_amount) || 0), 0);
    const totalsByType = new Map();
    mine.forEach(entry => {
      const summary = totalsByType.get(entry.type_code) || {
        label: entry.type_label || '기타 수당',
        count: 0,
        amount: 0
      };
      summary.count += 1;
      summary.amount += Number(entry.unit_amount) || 0;
      totalsByType.set(entry.type_code, summary);
    });
    const rows = [...totalsByType.values()].map(summary => `
      <div class="personal-row">
        <div class="personal-row-main">
          <div class="personal-row-title">${escapeHtml(summary.label)}</div>
          <div class="personal-row-detail">${summary.count}건</div>
        </div>
        <span class="personal-row-value">${formatMoney(summary.amount)}</span>
      </div>`).join('');
    allowanceSummary.innerHTML = `<div class="personal-stats">
      <strong>${formatMoney(totalAmount)}</strong>
      <span>${getSelectedMonthRange().label} 내 수당 · ${mine.length}건</span>
    </div>
    ${rows ? `<div class="personal-list">${rows}</div>` : `<div class="personal-empty">${getSelectedMonthRange().label} 등록된 수당 내역이 없습니다.</div>`}`;
  }

  function renderGuestDashboard() {
    const allowanceTotal = allowanceEntries.reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0);
    const leaveCounts = new Map();
    const leaveByWeekday = new Map(['일', '월', '화', '수', '목', '금', '토'].map(day => [day, 0]));
    const daysInMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
    const weekCount = Math.ceil(daysInMonth / 7);
    const leaveByWeek = new Map(Array.from({ length: weekCount }, (_, index) => [`${index + 1}주차`, 0]));
    const leaveMembers = new Set();
    allVacations.forEach(vacation => {
      const type = vacation.leave_type || '기타';
      leaveCounts.set(type, (leaveCounts.get(type) || 0) + 1);
      const date = new Date(`${vacation.date}T00:00:00Z`);
      if (!Number.isNaN(date.getTime())) {
        const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getUTCDay()];
        const week = `${Math.ceil(date.getUTCDate() / 7)}주차`;
        leaveByWeekday.set(weekday, leaveByWeekday.get(weekday) + 1);
        leaveByWeek.set(week, leaveByWeek.get(week) + 1);
      }
      leaveMembers.add(vacation.user_id || vacation.username || vacation.id);
    });
    const allowanceTotals = new Map();
    const allowanceByUser = new Map();
    allowanceEntries.forEach(entry => {
      const label = entry.type_label || '기타 수당';
      allowanceTotals.set(label, (allowanceTotals.get(label) || 0) + (Number(entry.unit_amount) || 0));
      const userId = entry.user_id || entry.username || 'unknown';
      const userSummary = allowanceByUser.get(userId) || {
        name: entry.username || '이름 없음',
        count: 0,
        amount: 0
      };
      userSummary.count += 1;
      userSummary.amount += Number(entry.unit_amount) || 0;
      allowanceByUser.set(userId, userSummary);
    });

    const renderBars = (items, formatter) => {
      const populatedItems = items.filter(([, value]) => value > 0);
      if (!populatedItems.length) return '<div class="personal-empty">해당 기간에 데이터가 없습니다.</div>';
      const max = Math.max(...populatedItems.map(([, value]) => value), 1);
      return `<div class="guest-bar-list">${populatedItems.map(([label, value]) => `
        <div class="guest-bar-row">
          <span class="guest-bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <span class="guest-bar-track" aria-hidden="true"><span class="guest-bar-fill" style="display:block;width:${Math.max(value > 0 ? 2 : 0, value / max * 100)}%"></span></span>
          <span class="guest-bar-value">${formatter(value)}</span>
        </div>`).join('')}</div>`;
    };

    const leaveRows = [...leaveCounts.entries()].sort((a, b) => b[1] - a[1]);
    const weekdayRows = [...leaveByWeekday.entries()];
    const weekRows = [...leaveByWeek.entries()];
    const allowanceRows = [...allowanceTotals.entries()].sort((a, b) => b[1] - a[1]);
    const rankedUsers = [...allowanceByUser.values()]
      .sort((a, b) => b.amount - a.amount || b.count - a.count || a.name.localeCompare(b.name));
    const rankingRows = rankedUsers.map((user, index) => `
      <div class="guest-ranking-row">
        <span class="guest-ranking-place">${index + 1}</span>
        <div>
          <div class="guest-ranking-name">${escapeHtml(user.name)}</div>
          <div class="guest-ranking-count">${user.count}건</div>
        </div>
        <span class="guest-ranking-amount">${formatMoney(user.amount)}</span>
      </div>`).join('');

    teamVacationContent.innerHTML = guestVacationState === 'loading'
      ? '<div class="personal-empty">이번 달 휴무 통계를 불러오는 중입니다.</div>'
      : guestVacationState === 'error'
        ? '<div class="personal-empty" role="alert">팀 휴무 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>'
        : `
      <div class="guest-kpis single">
        <article class="guest-kpi"><span class="guest-kpi-label">이번 달 휴무 등록</span><strong class="guest-kpi-value">${allVacations.length}건</strong></article>
        <article class="guest-kpi"><span class="guest-kpi-label">휴무 등록 인원</span><strong class="guest-kpi-value">${leaveMembers.size}명</strong></article>
      </div>
      <div class="guest-dashboard-grid">
        <section class="guest-chart-card" aria-label="휴무 유형별 건수">
          <h3>휴무 유형별 현황</h3>
          ${renderBars(leaveRows, value => `${value}건`)}
        </section>
        <section class="guest-chart-card" aria-label="요일별 휴무 건수">
          <h3>요일별 휴무 현황</h3>
          ${renderBars(weekdayRows, value => `${value}건`)}
        </section>
        <section class="guest-chart-card" aria-label="주차별 휴무 건수">
          <h3>주차별 휴무 현황</h3>
          ${renderBars(weekRows, value => `${value}건`)}
        </section>
      </div>
      <nav class="guest-dashboard-links" aria-label="모니터링 바로가기">
        <a class="guest-dashboard-link" href="/pages/calendar.html">전체 휴무 일정 보기 ↗</a>
      </nav>`;
    teamAllowanceContent.innerHTML = guestAllowanceState === 'loading'
      ? '<div class="personal-empty">이번 달 수당 통계를 불러오는 중입니다.</div>'
      : guestAllowanceState === 'error'
        ? '<div class="personal-empty" role="alert">팀 수당 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>'
        : `
      <div class="guest-kpis">
        <article class="guest-kpi"><span class="guest-kpi-label">이번 달 수당 기록</span><strong class="guest-kpi-value">${allowanceEntries.length}건</strong></article>
        <article class="guest-kpi"><span class="guest-kpi-label">이번 달 수당 합계</span><strong class="guest-kpi-value">${formatMoney(allowanceTotal)}</strong></article>
      </div>
      <div class="guest-dashboard-grid">
        <section class="guest-chart-card" aria-label="수당 종류별 금액">
          <h3>수당 종류별 금액</h3>
          ${renderBars(allowanceRows, formatMoney)}
        </section>
        <section class="guest-chart-card" aria-label="개인별 수당">
          <h3>개인별 수당</h3>
          ${rankingRows
            ? `<div class="guest-ranking-list">${rankingRows}</div>`
            : '<div class="personal-empty">해당 기간의 수당 기록이 없습니다.</div>'}
        </section>
      </div>
      `;
  }

  async function loadAllowanceData(start, end, requestId) {
    if (isGuest || isAdmin) {
      guestAllowanceState = 'loading';
      renderGuestDashboard();
    }
    try {
      const monthParams = new URLSearchParams({ start, end });
      const entries = await request(`/allowances?${monthParams.toString()}`);
      if (requestId !== monthRequestId) return;
      allowanceEntries = entries;
      allowanceError.textContent = '';
      if (isGuest || isAdmin) {
        guestAllowanceState = 'ready';
        renderGuestDashboard();
      }
      if (!isGuest) renderAllowanceSummary();
    } catch (error) {
      if (requestId !== monthRequestId) return;
      console.error('내 수당 요약 조회 오류:', error);
      if (isGuest || isAdmin) {
        guestAllowanceState = 'error';
        renderGuestDashboard();
      }
      if (!isGuest) {
        allowanceError.textContent = '수당 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
      }
    }
  }

  async function loadTodayAvailability() {
    allowanceDataReady = false;
    renderDuties();
    try {
      const todayParams = new URLSearchParams({ start: today, end: today });
      todayAvailability = await request(`/allowances/availability?${todayParams.toString()}`);
      allowanceDataReady = true;
    } catch (error) {
      console.error('오늘 수당 등록 현황 조회 오류:', error);
      dutyStatus.textContent = '오늘 할 일 현황을 불러오지 못했습니다. 새로고침해 주세요.';
    }
    renderDuties();
  }

  dutyList.addEventListener('click', async event => {
    if (isGuest) return;
    const button = event.target.closest('[data-duty]');
    if (!button || button.disabled) return;
    const duty = duties.find(item => item.key === button.dataset.duty);
    const entry = todayAvailability.find(item =>
      item.user_id === session.user.id && matchingDuty(item, duty)
    );
    busyDuties.add(duty.key);
    dutyStatus.textContent = '';
    dutyStatus.classList.remove('success');
    renderDuties();
    try {
      if (entry) {
        await request(`/allowances/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
        dutyStatus.textContent = `${duty.label} 등록을 취소했습니다.`;
      } else {
        const confirmation = await Swal.fire({
          icon: 'warning',
          title: '등록 확인',
          text: `오늘 ${duty.label} 등록을 진행할까요?`,
          showCancelButton: true,
          confirmButtonText: '등록',
          cancelButtonText: '취소',
          reverseButtons: true
        });
        if (!confirmation.isConfirmed) return;

        await request('/allowances', {
          method: 'POST',
          body: JSON.stringify({
            type_code: duty.type,
            work_date: today,
            shift: duty.shift || null,
            slot_no: duty.slot || null
          })
        });
        dutyStatus.textContent = `${duty.label} 등록을 완료했습니다.`;
      }
      dutyStatus.classList.add('success');
      const monthRange = getSelectedMonthRange();
      const requestId = ++monthRequestId;
      await Promise.all([
        loadAllowanceData(monthRange.start, monthRange.end, requestId),
        loadTodayAvailability()
      ]);
    } catch (error) {
      console.error('오늘 수당 등록 변경 오류:', error);
      dutyStatus.textContent = error.message || '등록을 변경하지 못했습니다.';
      const monthRange = getSelectedMonthRange();
      const requestId = ++monthRequestId;
      await Promise.all([
        loadAllowanceData(monthRange.start, monthRange.end, requestId),
        loadTodayAvailability()
      ]);
    } finally {
      busyDuties.delete(duty.key);
      renderDuties();
    }
  });

  const initialMonth = getSelectedMonthRange();
  const initialRequestId = ++monthRequestId;
  await window.userPreferences?.load();
  initializeMenuFavorites();
  await loadVacations(initialMonth.start, initialMonth.end, initialRequestId);
});
