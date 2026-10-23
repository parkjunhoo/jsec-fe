document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/annual-leave';
  const ANNUAL_REQUEST_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/annual-leave-requests';
  const annualApplicationCard = document.getElementById('annualApplication');
  const annualApplicationForm = document.getElementById('annualApplicationForm');
  const annualApplicationType = document.getElementById('annualApplicationType');
  const annualApplicationStartDate = document.getElementById('annualApplicationStartDate');
  const annualApplicationStartTime = document.getElementById('annualApplicationStartTime');
  const annualApplicationEndDate = document.getElementById('annualApplicationEndDate');
  const annualApplicationEndTime = document.getElementById('annualApplicationEndTime');
  const annualApplicationDays = document.getElementById('annualApplicationDays');
  const annualApplicationBalance = document.getElementById('annualApplicationBalance');
  const annualApplicationMessage = document.getElementById('annualApplicationMessage');
  const submitAnnualApplication = document.getElementById('submitAnnualApplication');
  const annualSummary = document.getElementById('annualSummary');
  const annualChart = document.getElementById('annualChart');
  const annualTableWrap = document.getElementById('annualTableWrap');
  const annualTableBody = document.getElementById('annualTableBody');
  const annualDateControls = document.getElementById('annualDateControls');
  const annualAsOfDate = document.getElementById('annualAsOfDate');
  const annualSettingsCard = document.getElementById('annualSettingsCard');
  const annualSettingsFields = document.getElementById('annualSettingsFields');
  const annualSettingsForm = document.getElementById('annualSettingsForm');
  const annualLoadError = document.getElementById('annualLoadError');
  const annualSettingsMessage = document.getElementById('annualSettingsMessage');
  const saveButton = document.getElementById('saveAnnualSettings');
  const annualDeductionsCard = document.getElementById('annualDeductionsCard');
  const annualDeductionsForm = document.getElementById('annualDeductionsForm');
  const annualDeductionEmployee = document.getElementById('annualDeductionEmployee');
  const annualDeductionFields = document.getElementById('annualDeductionFields');
  const annualDeductionsMessage = document.getElementById('annualDeductionsMessage');
  const saveDeductionsButton = document.getElementById('saveAnnualDeductions');
  const annualAdminActions = document.getElementById('annualAdminActions');
  const annualSettingsDialog = document.getElementById('annualSettingsDialog');
  const annualDeductionsDialog = document.getElementById('annualDeductionsDialog');
  const openAnnualSettingsButton = document.getElementById('openAnnualSettings');
  const openAnnualDeductionsButton = document.getElementById('openAnnualDeductions');
  let annualBalances = [];
  let employeeDeductions = [];
  let annualRequestId = 0;
  let currentUserId = '';
  let currentUserRole = 'user';
  let currentAnnualBalance = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  async function request(path = '', options = {}, baseUrl = API_URL) {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `요청에 실패했습니다. (HTTP ${response.status})`);
    return result;
  }

  function getKSTDateString(dateObj = new Date()) {
    const parts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(dateObj);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function countAnnualWeekdays(startDate, endDate) {
    if (!startDate || !endDate || endDate < startDate) return 0;
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) return 0;
    let count = 0;
    for (let date = start; date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      const day = date.getUTCDay();
      if (day !== 0 && day !== 6) count += 1;
    }
    return count;
  }

  function calculateAnnualHours() {
    if (!annualApplicationStartTime.value || !annualApplicationEndTime.value) return 0;
    const [startHour, startMinute] = annualApplicationStartTime.value.split(':').map(Number);
    const [endHour, endMinute] = annualApplicationEndTime.value.split(':').map(Number);
    const minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    return minutes > 0 ? minutes / 60 : 0;
  }

  function updateAnnualApplicationAmount() {
    if (annualApplicationType.value === '시간차') {
      annualApplicationEndDate.value = annualApplicationStartDate.value;
      annualApplicationEndDate.disabled = true;
      annualApplicationStartTime.readOnly = false;
      annualApplicationEndTime.readOnly = false;
      annualApplicationDays.min = '0.25';
      annualApplicationDays.max = '24';
      annualApplicationDays.step = '0.25';
      document.getElementById('annualApplicationAmountLabel').textContent = '사용 시간 (시간) *';
      document.getElementById('annualApplicationAmountHint').textContent = '시간차는 하루 안에서 시작·종료 시간을 입력해 주세요. 신청 시간은 자동 계산됩니다. (15분 단위)';
      annualApplicationDays.value = String(calculateAnnualHours());
    } else {
      annualApplicationEndDate.disabled = false;
      annualApplicationStartTime.value = '00:00';
      annualApplicationEndTime.value = '00:00';
      annualApplicationStartTime.readOnly = true;
      annualApplicationEndTime.readOnly = true;
      annualApplicationDays.min = '1';
      annualApplicationDays.max = '31';
      annualApplicationDays.step = '1';
      document.getElementById('annualApplicationAmountLabel').textContent = '총 연차 일수 *';
      document.getElementById('annualApplicationAmountHint').textContent = '기간 내 주말을 제외한 평일 수입니다. 승인 시 해당 평일 일정이 연차로 등록됩니다.';
      annualApplicationDays.value = String(countAnnualWeekdays(
        annualApplicationStartDate.value,
        annualApplicationEndDate.value
      ));
    }
    updateAnnualApplicationBalance();
  }

  function updateAnnualApplicationBalance() {
    const balance = currentAnnualBalance;
    if (!balance || !balance.service_year) {
      annualApplicationBalance.textContent = '연차 기준일이 등록되어 있지 않아 연차를 신청할 수 없습니다. 관리자에게 문의해 주세요.';
      annualApplicationBalance.dataset.type = 'error';
      submitAnnualApplication.disabled = true;
      return;
    }

    const requestedDays = annualApplicationType.value === '시간차'
      ? calculateAnnualHours() / balance.hours_per_day
      : Number(annualApplicationDays.value) || 0;
    const datesInCycle = annualApplicationStartDate.value >= balance.cycle_start
      && annualApplicationEndDate.value <= balance.cycle_end;
    const canApply = datesInCycle && requestedDays > 0 && requestedDays <= balance.remaining_days;
    annualApplicationBalance.innerHTML = `현재 <strong>${balance.service_year}년차</strong> · 보유 ${balance.entitled_days}일 · 사용 ${balance.used_days}일 · 신청 대기 ${balance.pending_days}일 · 신청 가능 잔여 <strong>${balance.remaining_days}일</strong><br>기준기간 ${escapeHtml(balance.cycle_start)} ~ ${escapeHtml(balance.cycle_end)} · 현재 근무지는 ${balance.hours_per_day}시간을 연차 1일로 계산합니다.`;
    annualApplicationBalance.dataset.type = canApply ? '' : 'error';
    if (!datesInCycle) {
      annualApplicationBalance.insertAdjacentHTML('beforeend', '<br>신청 기간은 현재 연차 기준기간 안에 있어야 합니다.');
    } else if (requestedDays <= 0) {
      annualApplicationBalance.insertAdjacentHTML('beforeend', '<br>신청 가능한 평일 또는 시간을 입력해 주세요.');
    } else if (requestedDays > balance.remaining_days) {
      annualApplicationBalance.insertAdjacentHTML('beforeend', '<br>신청 일수가 잔여 연차를 초과합니다.');
    }
    submitAnnualApplication.disabled = !canApply;
  }

  function renderSettings(settings) {
    const additionalDays = new Map(settings.map(item => [Number(item.service_year), Number(item.additional_days)]));
    annualSettingsFields.innerHTML = Array.from({ length: 10 }, (_, index) => {
      const year = index + 1;
      return `<label class="annual-setting">${year}년차 가산연차 (일)
        <input type="number" min="0" max="30" step="1" required data-service-year="${year}" value="${additionalDays.get(year) ?? 0}">
      </label>`;
    }).join('');
  }

  function renderDeductionFields() {
    const userId = annualDeductionEmployee.value;
    if (!userId) {
      annualDeductionFields.replaceChildren();
      return;
    }
    const deductionsByYear = new Map(employeeDeductions
      .filter(item => item.user_id === userId)
      .map(item => [Number(item.service_year), Number(item.deduction_days)]));
    annualDeductionFields.innerHTML = Array.from({ length: 10 }, (_, index) => {
      const year = index + 1;
      return `<label class="annual-setting">${year}년차 기본연차 차감 (일)
        <input type="number" min="0" max="12" step="1" required data-service-year="${year}" value="${deductionsByYear.get(year) ?? 0}">
      </label>`;
    }).join('');
  }

  function renderDeductionEmployees(balances) {
    const selectedUserId = annualDeductionEmployee.value;
    annualDeductionEmployee.innerHTML = '<option value="">직원을 선택하세요</option>' +
      groupByWorkplace(balances).map(([workplace, group]) =>
        `<optgroup label="${escapeHtml(workplace)}">${group
          .map(item => `<option value="${escapeHtml(item.user_id)}">${escapeHtml(item.name)}</option>`)
          .join('')}</optgroup>`
      ).join('');
    annualDeductionEmployee.value = balances.some(item => item.user_id === selectedUserId) ? selectedUserId : '';
    renderDeductionFields();
  }

  function groupByWorkplace(balances) {
    const groups = new Map();
    balances.forEach(balance => {
      const workplace = balance.department || '근무지 미등록';
      if (!groups.has(workplace)) groups.set(workplace, []);
      groups.get(workplace).push(balance);
    });
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, 'ko'));
  }

  function getUsageMetrics(balance) {
    const baseDays = Number(balance.base_days) || 12;
    const additionalDays = Number(balance.additional_days) || 0;
    const deductionDays = Number(balance.deduction_days) || 0;
    const usedDays = Number(balance.used_days) || 0;
    const grossEntitledDays = Number.isFinite(Number(balance.gross_entitled_days))
      && balance.gross_entitled_days != null
      ? Number(balance.gross_entitled_days)
      : baseDays + additionalDays;
    const usageCountedDays = Number.isFinite(Number(balance.usage_counted_days))
      && balance.usage_counted_days != null
      ? Number(balance.usage_counted_days)
      : deductionDays + usedDays;
    return {
      baseDays,
      additionalDays,
      deductionDays,
      usedDays,
      grossEntitledDays,
      usageCountedDays,
      usageRate: grossEntitledDays
        ? Number(Math.min(100, usageCountedDays / grossEntitledDays * 100).toFixed(1))
        : 0
    };
  }

  function formatDays(value) {
    return Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }

  function getCycleCheck(balance, metrics) {
    if (!balance.service_year || !balance.cycle_end) {
      const hasBaseDate = Boolean(balance.annual_base_date);
      return {
        state: 'missing',
        label: hasBaseDate ? '산정 기준일 이전' : '연차 기준일 등록 필요',
        detail: hasBaseDate ? `연차 기준일 ${balance.annual_base_date}` : '연차 주기 확인 불가',
        closingSoon: false
      };
    }

    const reference = new Date(`${annualAsOfDate.value}T00:00:00Z`);
    const cycleEnd = new Date(`${balance.cycle_end}T00:00:00Z`);
    const daysUntilEnd = Math.max(0, Math.ceil((cycleEnd - reference) / 86400000));
    const remainingDays = Number(balance.remaining_days) || 0;
    const pendingDays = Number(balance.pending_days) || 0;
    const actualCompletion = metrics.usageCountedDays >= metrics.grossEntitledDays - 0.005;
    const pendingCompletion = metrics.usageCountedDays + pendingDays >= metrics.grossEntitledDays - 0.005;

    if (actualCompletion) {
      return {
        state: 'complete',
        label: '소진 완료',
        detail: `기준기간 종료 ${balance.cycle_end}`,
        closingSoon: false
      };
    }
    if (pendingCompletion) {
      return {
        state: 'pending',
        label: '신청 대기 포함 소진 예정',
        detail: `승인 후 잔여 확인 · 기준기간 종료 ${balance.cycle_end}`,
        closingSoon: daysUntilEnd <= 30
      };
    }

    return {
      state: 'remaining',
      label: `잔여 ${formatDays(remainingDays)}일`,
      detail: daysUntilEnd === 0
        ? `기준기간 오늘 종료 · ${balance.cycle_end}`
        : `기준기간 종료까지 ${daysUntilEnd}일 · ${balance.cycle_end}`,
      closingSoon: daysUntilEnd <= 30
    };
  }

  function renderBalances(balances, isAdmin) {
    annualDateControls.hidden = !isAdmin;
    annualSummary.hidden = false;
    if (!balances.length) {
      annualSummary.innerHTML = '<div class="annual-empty">표시할 직원 연차 현황이 없습니다.</div>';
      annualChart.replaceChildren();
      annualTableWrap.hidden = true;
      return;
    }
    const missingAnnualBaseDate = balances.filter(item => !item.service_year);
    if (!isAdmin && balances.length === 1) {
      const balance = balances[0];
      annualSummary.innerHTML = balance.service_year
        ? `<div class="annual-summary-grid">
            <div class="annual-summary"><span>근속연차</span><strong>${balance.service_year}년차</strong></div>
            <div class="annual-summary"><span>총 보유</span><strong>${balance.entitled_days}일</strong></div>
            <div class="annual-summary"><span>사용 · 대기</span><strong>${balance.used_days} · ${balance.pending_days}일</strong></div>
            <div class="annual-summary"><span>신청 가능 잔여</span><strong>${balance.remaining_days}일</strong></div>
          </div>
          <p class="annual-card-description">기준기간 ${escapeHtml(balance.cycle_start)} ~ ${escapeHtml(balance.cycle_end)} · 사용률 ${balance.usage_rate}% · 시간차 ${balance.hours_per_day}시간 = 1일</p>`
        : '<div class="annual-empty">연차 기준일이 등록되어 있지 않아 연차를 계산할 수 없습니다. 관리자에게 회원 정보에 연차 기준일을 등록해 달라고 요청해 주세요.</div>';
      annualChart.replaceChildren();
      annualTableWrap.hidden = true;
      return;
    }

    const eligible = balances.filter(item => item.service_year);
    const workplaceGroups = groupByWorkplace(balances);
    if (isAdmin) {
      annualSummary.hidden = missingAnnualBaseDate.length === 0;
      annualSummary.innerHTML = missingAnnualBaseDate.length
        ? `<p class="annual-message">${missingAnnualBaseDate.length}명은 연차 기준일이 없어 연차를 계산하지 못했습니다.</p>`
        : '';
    } else {
      annualSummary.innerHTML = `<div class="annual-summary-grid">
        <div class="annual-summary"><span>직원</span><strong>${balances.length}명</strong></div>
        <div class="annual-summary"><span>연차 산정 가능</span><strong>${eligible.length}명</strong></div>
        <div class="annual-summary"><span>총 보유 일수</span><strong>${eligible.reduce((sum, item) => sum + item.entitled_days, 0)}일</strong></div>
        <div class="annual-summary"><span>사용 일수</span><strong>${eligible.reduce((sum, item) => sum + item.used_days, 0).toFixed(2)}일</strong></div>
      </div><div class="annual-workplace-summary">${workplaceGroups.map(([workplace, group]) => {
        const eligibleGroup = group.filter(item => item.service_year);
        const used = eligibleGroup.reduce((sum, item) => sum + item.used_days, 0);
        const pending = eligibleGroup.reduce((sum, item) => sum + item.pending_days, 0);
        const remaining = eligibleGroup.reduce((sum, item) => sum + item.remaining_days, 0);
        return `<section class="annual-workplace-card">
          <h3><span class="annual-workplace-label">근무지</span>${escapeHtml(workplace)} <span>${group.length}명</span></h3>
          <p>산정 가능 ${eligibleGroup.length}명 · 사용 ${used.toFixed(2)}일 · 대기 ${pending.toFixed(2)}일 · 잔여 ${remaining.toFixed(2)}일</p>
        </section>`;
      }).join('')}</div>${missingAnnualBaseDate.length
        ? `<p class="annual-message">${missingAnnualBaseDate.length}명은 연차 기준일이 없어 연차를 계산하지 못했습니다.</p>`
        : ''}`;
    }
    annualChart.innerHTML = balances.length
      ? groupByWorkplace(balances).map(([workplace, group]) => `<section class="annual-chart-group">
          <h3><span class="annual-workplace-label">근무지</span>${escapeHtml(workplace)} <span>${group.length}명</span></h3>
          ${group.map(item => {
            if (!item.service_year) {
              const cycleCheck = getCycleCheck(item, {});
              return `<article class="annual-chart-row" data-cycle-state="${cycleCheck.state}" aria-label="${escapeHtml(item.name)} 연차 기준일 상태">
                <div class="annual-chart-main">
                  <div class="annual-chart-name"><strong>${escapeHtml(item.name)}</strong></div>
                  <div class="annual-chart-remaining"><span>남은 연차</span><strong>-</strong></div>
                </div>
                <div class="annual-cycle-check"><strong class="annual-cycle-status" data-state="${cycleCheck.state}">${cycleCheck.label}</strong><span>${cycleCheck.detail}</span></div>
              </article>`;
            }
            const metrics = getUsageMetrics(item);
            const cycleCheck = getCycleCheck(item, metrics);
            return `<article class="annual-chart-row" data-cycle-state="${cycleCheck.state}" data-closing-soon="${cycleCheck.closingSoon}" aria-label="${escapeHtml(item.name)} 연차 현황">
              <div class="annual-chart-main">
                <div class="annual-chart-name"><strong>${escapeHtml(item.name)}</strong><span>${item.service_year}년차</span></div>
                <div class="annual-chart-remaining"><span>남은 연차</span><strong>${formatDays(item.remaining_days)}일</strong></div>
              </div>
              <div class="annual-chart-metrics">
                <div><span>실제 사용</span><strong>${formatDays(metrics.usedDays)}일</strong></div>
                <div><span>차감 포함 소진</span><strong>${formatDays(metrics.usageCountedDays)} / ${formatDays(metrics.grossEntitledDays)}일</strong></div>
                <div><span>신청 대기</span><strong>${formatDays(item.pending_days)}일</strong></div>
              </div>
              <div class="annual-chart-allocation">기본 ${formatDays(metrics.baseDays)}일 − 차감 ${formatDays(metrics.deductionDays)}일 + 가산 ${formatDays(metrics.additionalDays)}일</div>
              <div class="annual-cycle-check"><strong class="annual-cycle-status" data-state="${cycleCheck.state}">${cycleCheck.label}</strong><span>${cycleCheck.detail}</span></div>
              <div class="annual-chart-usage"><span>소진율 (차감 포함)</span><strong>${metrics.usageRate}%</strong></div>
              <span class="annual-track" aria-label="차감 포함 소진율 ${metrics.usageRate}%"><span class="annual-fill" style="display:block;width:${metrics.usageRate}%"></span></span>
            </article>`;
          }).join('')}
        </section>`).join('')
      : '<div class="annual-empty">연차 기준일이 등록된 재직 직원이 없습니다.</div>';
    annualTableBody.innerHTML = workplaceGroups.map(([workplace, group]) => `
      <tr class="annual-workplace-row"><th colspan="11"><span class="annual-workplace-label">근무지</span>${escapeHtml(workplace)} · ${group.length}명</th></tr>
      ${group.map(item => `<tr>
        <td class="annual-person"><span class="annual-person-label">직원</span>${escapeHtml(item.name)}</td>
        <td>${item.service_year ? `${item.service_year}년차` : '연차 기준일 미등록'}</td>
        <td>${item.base_days}일</td><td>${item.deduction_days || 0}일</td><td>${item.additional_days}일</td>
        <td>${item.entitled_days == null ? '-' : `${item.entitled_days}일`}</td>
        <td>${item.used_days}일</td><td>${item.pending_days}일</td>
        <td>${item.remaining_days == null ? '-' : `${item.remaining_days}일`}</td>
        <td>${item.hours_per_day}시간</td>
        <td>${item.usage_rate == null ? '-' : `${item.usage_rate}%`}</td>
      </tr>`).join('')}`).join('');
    annualTableWrap.hidden = isAdmin;
  }

  async function loadAnnualLeave(asOfDate = '') {
    const requestId = ++annualRequestId;
    annualLoadError.textContent = '';
    try {
      if (!currentUserId) {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
        const { data: profile, error: profileError } = await supabaseClient
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        currentUserId = session.user.id;
        currentUserRole = profile?.role || 'user';
      }
      const path = asOfDate ? `?as_of=${encodeURIComponent(asOfDate)}` : '';
      const result = await request(path);
      if (requestId !== annualRequestId) return;
      annualAsOfDate.value = result.isAdmin ? result.asOfDate : '';
      annualAdminActions.hidden = !result.isAdmin;
      annualSettingsCard.hidden = !result.isAdmin;
      annualDeductionsCard.hidden = !result.isAdmin;
      annualApplicationCard.hidden = currentUserRole === 'guest' || currentUserRole === 'monitor';
      annualBalances = result.balances || [];
      employeeDeductions = result.employeeDeductions || [];
      currentAnnualBalance = annualBalances.find(balance => balance.user_id === currentUserId) || null;
      updateAnnualApplicationBalance();
      renderSettings(result.settings || []);
      if (result.isAdmin) renderDeductionEmployees(annualBalances);
      renderBalances(annualBalances, result.isAdmin);
    } catch (error) {
      if (requestId !== annualRequestId) return;
      console.error('연차 관리 화면 초기화 오류:', error);
      annualSummary.textContent = '연차 현황을 불러오지 못했습니다.';
      annualLoadError.textContent = error.message || '연차 현황을 불러오지 못했습니다.';
    }
  }

  annualApplicationType.addEventListener('change', updateAnnualApplicationAmount);
  annualApplicationStartDate.addEventListener('change', updateAnnualApplicationAmount);
  annualApplicationEndDate.addEventListener('change', updateAnnualApplicationAmount);
  annualApplicationStartTime.addEventListener('change', updateAnnualApplicationAmount);
  annualApplicationEndTime.addEventListener('change', updateAnnualApplicationAmount);
  annualApplicationForm.addEventListener('submit', async event => {
    event.preventDefault();
    annualApplicationMessage.textContent = '';
    annualApplicationMessage.classList.remove('success');
    const leaveType = annualApplicationType.value;
    const hoursUsed = calculateAnnualHours();
    if (leaveType === '시간차'
      && (annualApplicationStartDate.value !== annualApplicationEndDate.value
        || hoursUsed < 0.25
        || hoursUsed > 24
        || !Number.isInteger(hoursUsed * 4))) {
      annualApplicationMessage.textContent = '시간차는 같은 날짜에 15분 단위로 0.25~24시간을 신청해 주세요.';
      return;
    }

    submitAnnualApplication.disabled = true;
    submitAnnualApplication.textContent = '신청 중...';
    try {
      const result = await request('', {
        method: 'POST',
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: annualApplicationStartDate.value,
          start_time: annualApplicationStartTime.value,
          end_date: annualApplicationEndDate.value,
          end_time: annualApplicationEndTime.value,
          total_days: leaveType === '시간차' ? 1 : Number(annualApplicationDays.value),
          hours_used: leaveType === '시간차' ? hoursUsed : null,
          details: document.getElementById('annualApplicationDetails').value.trim()
        })
      }, ANNUAL_REQUEST_API);
      await loadAnnualLeave(annualAsOfDate.value);
      window.dispatchEvent(new Event('annual-leave:requests-refresh'));
      annualApplicationMessage.textContent = result.notificationWarning
        || '연차 신청이 접수되었습니다. 관리자 승인 후 휴무 일정에 등록됩니다.';
      if (!result.notificationWarning) annualApplicationMessage.classList.add('success');
    } catch (error) {
      console.error('연차 신청 등록 오류:', error);
      annualApplicationMessage.textContent = error.message || '연차 신청을 등록하지 못했습니다.';
    } finally {
      submitAnnualApplication.textContent = '신청하기';
      updateAnnualApplicationBalance();
    }
  });

  const today = getKSTDateString();
  annualApplicationStartDate.value = today;
  annualApplicationEndDate.value = today;
  updateAnnualApplicationAmount();

  annualAsOfDate.addEventListener('change', () => {
    if (annualAsOfDate.value) loadAnnualLeave(annualAsOfDate.value);
  });
  window.addEventListener('annual-leave:updated', () => loadAnnualLeave(annualAsOfDate.value));

  annualDeductionEmployee.addEventListener('change', renderDeductionFields);

  openAnnualSettingsButton.addEventListener('click', () => annualSettingsDialog.showModal());
  openAnnualDeductionsButton.addEventListener('click', () => annualDeductionsDialog.showModal());
  document.querySelectorAll('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => {
      document.getElementById(button.dataset.closeDialog).close();
    });
  });
  [annualSettingsDialog, annualDeductionsDialog].forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
  });

  annualSettingsForm.addEventListener('submit', async event => {
    event.preventDefault();
    annualSettingsMessage.textContent = '';
    saveButton.disabled = true;
    try {
      const settings = Array.from(annualSettingsFields.querySelectorAll('[data-service-year]'))
        .map(input => ({
          service_year: Number(input.dataset.serviceYear),
          additional_days: Number(input.value)
        }));
      const result = await request('/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings })
      });
      renderSettings(result.settings);
      annualSettingsMessage.textContent = '가산연차 설정을 저장했습니다.';
      annualSettingsMessage.classList.add('success');
      await loadAnnualLeave(annualAsOfDate.value);
    } catch (error) {
      console.error('가산연차 설정 저장 오류:', error);
      annualSettingsMessage.textContent = error.message || '설정을 저장하지 못했습니다.';
      annualSettingsMessage.classList.remove('success');
    } finally {
      saveButton.disabled = false;
    }
  });

  annualDeductionsForm.addEventListener('submit', async event => {
    event.preventDefault();
    annualDeductionsMessage.textContent = '';
    saveDeductionsButton.disabled = true;
    try {
      const deductions = Array.from(annualDeductionFields.querySelectorAll('[data-service-year]'))
        .map(input => ({
          service_year: Number(input.dataset.serviceYear),
          deduction_days: Number(input.value)
        }));
      const result = await request('/deductions', {
        method: 'PUT',
        body: JSON.stringify({ user_id: annualDeductionEmployee.value, deductions })
      });
      employeeDeductions = employeeDeductions.filter(item => item.user_id !== annualDeductionEmployee.value)
        .concat(result.deductions || []);
      renderDeductionFields();
      await loadAnnualLeave(annualAsOfDate.value);
      annualDeductionsMessage.textContent = '직원별 기본연차 차감 설정을 저장했습니다.';
      annualDeductionsMessage.classList.add('success');
    } catch (error) {
      console.error('직원별 연차 차감 설정 저장 오류:', error);
      annualDeductionsMessage.textContent = error.message || '직원별 차감 설정을 저장하지 못했습니다.';
      annualDeductionsMessage.classList.remove('success');
    } finally {
      saveDeductionsButton.disabled = false;
    }
  });

  await loadAnnualLeave();
});
