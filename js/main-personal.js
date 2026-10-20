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
  const monthStart = `${todayParts.year}-${todayParts.month}-01`;
  const monthEnd = `${todayParts.year}-${todayParts.month}-${String(
    new Date(Number(todayParts.year), Number(todayParts.month), 0).getDate()
  ).padStart(2, '0')}`;
  monthLabel.textContent = `${todayParts.year}년 ${Number(todayParts.month)}월`;

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
    vacationPanel.hidden = !showVacation;
    allowancePanel.hidden = showVacation;
  }

  vacationTab.addEventListener('click', () => showTab(vacationTab));
  allowanceTab.addEventListener('click', () => showTab(allowanceTab));
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

  async function loadVacations() {
    try {
      const params = new URLSearchParams({ start: monthStart, end: monthEnd });
      const vacations = await request(`/vacations?${params.toString()}`);
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
      const rows = mine.slice(0, 6).map(vacation => {
        const detail = vacation.leave_type === '시간차'
          ? (vacation.time_detail === '시간지정'
            ? `${vacation.hours_used || ''}시간`
            : vacation.time_detail || '종일')
          : vacation.time_detail || '종일';
        return `<div class="personal-row">
          <div class="personal-row-main">
            <div class="personal-row-title">${escapeHtml(formatVacationDate(vacation.date))}</div>
            <div class="personal-row-detail">${escapeHtml(vacation.leave_type || '휴무')} · ${escapeHtml(detail)}</div>
          </div>
          <span class="personal-row-value">${vacation.date === today ? '오늘' : vacation.date < today ? '지난 일정' : '예정'}</span>
        </div>`;
      }).join('');

      vacationSummary.innerHTML = `<div class="personal-stats">
        <strong>${mine.length}건</strong>
        <span>이번 달 휴무${typeSummary ? ` · ${typeSummary}` : ''}</span>
      </div>
      ${rows
        ? `<div class="personal-list">${rows}</div>${mine.length > 6 ? `<p class="personal-row-detail">외 ${mine.length - 6}건의 일정</p>` : ''}`
        : '<div class="personal-empty">이번 달 등록된 휴무 일정이 없습니다.</div>'}
      <p class="personal-row-detail">${upcoming.length ? `이번 달 남은 일정 ${upcoming.length}건` : '이번 달 남은 휴무 일정이 없습니다.'}</p>`;
    } catch (error) {
      console.error('내 휴무 요약 조회 오류:', error);
      vacationError.textContent = '휴무 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
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
    dutyList.querySelectorAll('[data-duty]').forEach(button => {
      const duty = duties.find(item => item.key === button.dataset.duty);
      const mine = todayAvailability.find(entry =>
        entry.user_id === session.user.id && matchingDuty(entry, duty)
      );
      const takenByOther = todayAvailability.some(entry =>
        entry.user_id !== session.user.id && matchingDuty(entry, duty)
      );
      const state = button.querySelector('.duty-state');
      button.setAttribute('aria-pressed', String(Boolean(mine)));
      button.setAttribute('aria-label', `${duty.label}: ${
        !allowanceDataReady
          ? '상태 조회 불가'
          : mine
            ? '등록됨, 다시 누르면 취소'
            : takenByOther
              ? '다른 직원 등록'
              : '등록하기'
      }`);
      state.textContent = !allowanceDataReady
        ? '조회 불가'
        : mine
          ? '등록됨 · 눌러서 취소'
          : takenByOther
            ? '다른 직원 등록'
            : '등록하기';
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
      <span>이번 달 내 수당 · ${mine.length}건</span>
    </div>
    ${rows ? `<div class="personal-list">${rows}</div>` : '<div class="personal-empty">이번 달 등록된 수당 내역이 없습니다.</div>'}`;
  }

  async function loadAllowanceData() {
    allowanceDataReady = false;
    renderDuties();
    try {
      const monthParams = new URLSearchParams({ start: monthStart, end: monthEnd });
      const todayParams = new URLSearchParams({ start: today, end: today });
      const [entries, availability] = await Promise.all([
        request(`/allowances?${monthParams.toString()}`),
        request(`/allowances/availability?${todayParams.toString()}`)
      ]);
      allowanceEntries = entries;
      todayAvailability = availability;
      allowanceDataReady = true;
      allowanceError.textContent = '';
      renderAllowanceSummary();
    } catch (error) {
      console.error('내 수당 요약 조회 오류:', error);
      allowanceError.textContent = '수당 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    }
    renderDuties();
  }

  dutyList.addEventListener('click', async event => {
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
      await loadAllowanceData();
    } catch (error) {
      console.error('오늘 수당 등록 변경 오류:', error);
      dutyStatus.textContent = error.message || '등록을 변경하지 못했습니다.';
      await loadAllowanceData();
    } finally {
      busyDuties.delete(duty.key);
      renderDuties();
    }
  });

  const { data: profile, error: profileError } = await supabaseClient
    .from('users')
    .select('name, username')
    .eq('id', session.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('개인 메뉴 사용자 정보 조회 오류:', profileError);
  } else if (profile) {
    const name = profile.name || profile.username;
    if (name) document.getElementById('personalWelcome').textContent = `${name}님, 이번 달 내 일정과 수당을 확인하세요.`;
  }

  await Promise.all([loadVacations(), loadAllowanceData()]);
});
