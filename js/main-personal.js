document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api';
  const vacationTab = document.getElementById('personalVacationTab');
  const allowanceTab = document.getElementById('personalAllowanceTab');
  const vacationPanel = document.getElementById('personalVacationPanel');
  const allowancePanel = document.getElementById('personalAllowancePanel');
  const vacationSummary = document.getElementById('personalVacationSummary');
  const allowanceSummary = document.getElementById('personalAllowanceSummary');
  const vacationError = document.getElementById('personalVacationError');
  const allowanceError = document.getElementById('personalAllowanceError');
  const dutyStatus = document.getElementById('personalDutyStatus');
  const dutyList = document.getElementById('personalDutyList');
  const monthLabel = document.getElementById('personalMonth');
  const previousMonthButton = document.getElementById('personalPreviousMonth');
  const nextMonthButton = document.getElementById('personalNextMonth');
  const welcomeMessage = document.getElementById('personalWelcome');
  const personalTitle = document.getElementById('personalTitle');
  const guestDashboard = document.getElementById('guestDashboard');
  const guestVacationPanel = document.getElementById('guestVacationPanel');
  const guestAllowancePanel = document.getElementById('guestAllowancePanel');
  const guestVacationContent = document.getElementById('guestVacationContent');
  const guestAllowanceContent = document.getElementById('guestAllowanceContent');

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
  let selectedMonth = new Date(Number(todayParts.year), Number(todayParts.month) - 1, 1);
  let monthRequestId = 0;
  let isGuest = false;
  let allVacations = [];
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

  function formatMoney(value) {
    return `${new Intl.NumberFormat('ko-KR').format(Number(value) || 0)}원`;
  }

  function animateMonthChange(direction) {
    const activePanel = isGuest
      ? guestVacationPanel.hidden ? guestAllowancePanel : guestVacationPanel
      : vacationPanel.hidden ? allowancePanel : vacationPanel;
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
      ? `${label} 팀 휴무와 수당 현황입니다.`
      : `${label} 내 일정과 수당을 확인하세요.`;
    animateMonthChange(offset);
    await Promise.all([
      loadVacations(start, end, requestId),
      loadAllowanceData(start, end, requestId)
    ]);
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
    const showVacation = selectedTab === vacationTab;
    vacationTab.setAttribute('aria-selected', String(showVacation));
    allowanceTab.setAttribute('aria-selected', String(!showVacation));
    vacationTab.tabIndex = showVacation ? 0 : -1;
    allowanceTab.tabIndex = showVacation ? -1 : 0;
    if (isGuest) {
      guestVacationPanel.hidden = !showVacation;
      guestAllowancePanel.hidden = showVacation;
      vacationPanel.hidden = true;
      allowancePanel.hidden = true;
    } else {
      vacationPanel.hidden = !showVacation;
      allowancePanel.hidden = showVacation;
    }
  }

  vacationTab.addEventListener('click', () => showTab(vacationTab));
  allowanceTab.addEventListener('click', () => showTab(allowanceTab));
  previousMonthButton.addEventListener('click', () => changeMonth(-1));
  nextMonthButton.addEventListener('click', () => changeMonth(1));
  let swipeStart = null;
  [vacationPanel, allowancePanel, guestVacationPanel, guestAllowancePanel].forEach(panel => {
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
  [vacationTab, allowanceTab].forEach(tab => {
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextTab = event.key === 'Home'
        ? vacationTab
        : event.key === 'End'
          ? allowanceTab
          : tab === vacationTab
            ? allowanceTab
            : vacationTab;
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
    const name = profile.name || profile.username;
    if (name) welcomeMessage.textContent = `${name}님, ${getSelectedMonthRange().label} 내 일정과 수당을 확인하세요.`;
  }
  if (isGuest) {
    personalTitle.textContent = '팀 운영 대시보드';
    vacationTab.parentElement.setAttribute('aria-label', '팀 통계');
    vacationTab.textContent = '휴무 통계';
    allowanceTab.textContent = '수당 통계';
    vacationTab.setAttribute('aria-controls', 'guestVacationPanel');
    allowanceTab.setAttribute('aria-controls', 'guestAllowancePanel');
    vacationPanel.hidden = true;
    allowancePanel.hidden = true;
    guestDashboard.hidden = false;
    showTab(vacationTab);
    dutyList.hidden = true;
    dutyList.style.display = 'none';
    dutyStatus.hidden = true;
    dutyStatus.style.display = 'none';
    welcomeMessage.textContent = `${getSelectedMonthRange().label} 팀 휴무와 수당 현황입니다.`;
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

  async function loadVacations(start, end, requestId) {
    if (isGuest) {
      guestVacationState = 'loading';
      renderGuestDashboard();
    }
    try {
      const params = new URLSearchParams({ start, end });
      const vacations = await request(`/vacations?${params.toString()}`);
      if (requestId !== monthRequestId) return;
      allVacations = vacations;
      if (isGuest) {
        guestVacationState = 'ready';
        renderGuestDashboard();
        return;
      }
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
      if (isGuest) {
        guestVacationState = 'error';
        renderGuestDashboard();
      } else {
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
    if (!isGuest) return;
    const allowanceTotal = allowanceEntries.reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0);
    const upcoming = allVacations
      .filter(vacation => vacation.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const leaveCounts = new Map();
    allVacations.forEach(vacation => {
      const type = vacation.leave_type || '기타';
      leaveCounts.set(type, (leaveCounts.get(type) || 0) + 1);
    });
    const allowanceTotals = new Map();
    allowanceEntries.forEach(entry => {
      const label = entry.type_label || '기타 수당';
      allowanceTotals.set(label, (allowanceTotals.get(label) || 0) + (Number(entry.unit_amount) || 0));
    });

    const renderBars = (items, formatter) => {
      if (!items.length) return '<div class="personal-empty">해당 기간에 데이터가 없습니다.</div>';
      const max = Math.max(...items.map(([, value]) => value), 1);
      return `<div class="guest-bar-list">${items.map(([label, value]) => `
        <div class="guest-bar-row">
          <span class="guest-bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <span class="guest-bar-track" aria-hidden="true"><span class="guest-bar-fill" style="display:block;width:${Math.max(value > 0 ? 2 : 0, value / max * 100)}%"></span></span>
          <span class="guest-bar-value">${formatter(value)}</span>
        </div>`).join('')}</div>`;
    };

    const leaveRows = [...leaveCounts.entries()].sort((a, b) => b[1] - a[1]);
    const allowanceRows = [...allowanceTotals.entries()].sort((a, b) => b[1] - a[1]);
    const upcomingRows = upcoming.slice(0, 6).map(vacation => `
      <article class="guest-upcoming-item">
        <div class="guest-upcoming-date">${escapeHtml(formatVacationDate(vacation.date))}</div>
        <div class="guest-upcoming-name">${escapeHtml(vacation.username || '직원')}</div>
        <div class="guest-upcoming-type">${escapeHtml(vacation.leave_type || '휴무')} · ${escapeHtml(vacation.time_detail || '종일')}</div>
      </article>`).join('');

    guestVacationContent.innerHTML = guestVacationState === 'loading'
      ? '<div class="personal-empty">이번 달 휴무 통계를 불러오는 중입니다.</div>'
      : guestVacationState === 'error'
        ? '<div class="personal-empty" role="alert">팀 휴무 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>'
        : `
      <div class="guest-kpis">
        <article class="guest-kpi"><span class="guest-kpi-label">이번 달 휴무 등록</span><strong class="guest-kpi-value">${allVacations.length}건</strong></article>
        <article class="guest-kpi"><span class="guest-kpi-label">앞으로 예정된 휴무</span><strong class="guest-kpi-value">${upcoming.length}건</strong></article>
      </div>
      <div class="guest-dashboard-grid">
        <section class="guest-chart-card" aria-label="휴무 유형별 건수">
          <h3>휴무 유형별 현황</h3>
          ${renderBars(leaveRows, value => `${value}건`)}
        </section>
      </div>
      <section class="guest-upcoming">
        <h3>다가오는 휴무 일정</h3>
        ${upcomingRows
          ? `<div class="guest-upcoming-list">${upcomingRows}</div>`
          : '<div class="personal-empty">남은 휴무 일정이 없습니다.</div>'}
      </section>
      <nav class="guest-dashboard-links" aria-label="모니터링 바로가기">
        <a class="guest-dashboard-link" href="/pages/calendar.html">전체 휴무 일정 보기 ↗</a>
      </nav>`;
    guestAllowanceContent.innerHTML = guestAllowanceState === 'loading'
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
      </div>
      <nav class="guest-dashboard-links" aria-label="모니터링 바로가기">
        <a class="guest-dashboard-link" href="/pages/allowances.html">수당 상세 및 엑셀 ↗</a>
      </nav>`;
  }

  async function loadAllowanceData(start, end, requestId) {
    if (isGuest) {
      guestAllowanceState = 'loading';
      renderGuestDashboard();
    }
    try {
      const monthParams = new URLSearchParams({ start, end });
      const entries = await request(`/allowances?${monthParams.toString()}`);
      if (requestId !== monthRequestId) return;
      allowanceEntries = entries;
      allowanceError.textContent = '';
      if (isGuest) {
        guestAllowanceState = 'ready';
        renderGuestDashboard();
      }
      else renderAllowanceSummary();
    } catch (error) {
      if (requestId !== monthRequestId) return;
      console.error('내 수당 요약 조회 오류:', error);
      if (isGuest) {
        guestAllowanceState = 'error';
        renderGuestDashboard();
      } else {
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
  await Promise.all([
    loadVacations(initialMonth.start, initialMonth.end, initialRequestId),
    loadAllowanceData(initialMonth.start, initialMonth.end, initialRequestId),
    isGuest ? Promise.resolve() : loadTodayAvailability()
  ]);
});
