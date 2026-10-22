document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/annual-leave';
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
  let annualBalances = [];
  let employeeDeductions = [];
  let annualRequestId = 0;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  async function request(path = '', options = {}) {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
    const response = await fetch(`${API_URL}${path}`, {
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

  function renderBalances(balances, isAdmin) {
    annualDateControls.hidden = !isAdmin;
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
    annualChart.innerHTML = eligible.length
        ? groupByWorkplace(eligible).map(([workplace, group]) => `<section class="annual-chart-group">
          <h3><span class="annual-workplace-label">근무지</span>${escapeHtml(workplace)} <span>${group.length}명</span></h3>
          ${group.map(item => `<div class="annual-chart-row" title="${escapeHtml(item.name)}: ${item.usage_rate}% 사용">
            <span class="annual-chart-name">${escapeHtml(item.name)}</span>
            <span class="annual-track"><span class="annual-fill" style="display:block;width:${item.usage_rate}%"></span></span>
            <span class="annual-chart-value">${item.usage_rate}% · ${item.used_days}/${item.entitled_days}일</span>
          </div>`).join('')}
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
    annualTableWrap.hidden = false;
  }

  async function loadAnnualLeave(asOfDate = '') {
    const requestId = ++annualRequestId;
    annualLoadError.textContent = '';
    try {
      const path = asOfDate ? `?as_of=${encodeURIComponent(asOfDate)}` : '';
      const result = await request(path);
      if (requestId !== annualRequestId) return;
      annualAsOfDate.value = result.isAdmin ? result.asOfDate : '';
      annualSettingsCard.hidden = !result.isAdmin;
      annualDeductionsCard.hidden = !result.isAdmin;
      annualBalances = result.balances || [];
      employeeDeductions = result.employeeDeductions || [];
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

  annualAsOfDate.addEventListener('change', () => {
    if (annualAsOfDate.value) loadAnnualLeave(annualAsOfDate.value);
  });

  annualDeductionEmployee.addEventListener('change', renderDeductionFields);

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
