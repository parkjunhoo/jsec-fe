document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/allowances';
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !session) {
    window.location.href = '/index.html';
    return;
  }

  const monthInput = document.getElementById('allowanceMonth');
  const userFilter = document.getElementById('allowanceUserFilter');
  const addButton = document.getElementById('addAllowanceBtn');
  const exportButton = document.getElementById('allowanceExportBtn');
  const tabs = document.querySelectorAll('[data-tab]');
  const summaryContainer = document.getElementById('allowanceSummary');
  const detailsContainer = document.getElementById('allowanceDetails');
  const errorContainer = document.getElementById('allowanceError');
  const modal = document.getElementById('allowanceModal');
  const form = document.getElementById('allowanceForm');
  const modalTitle = document.getElementById('allowanceModalTitle');
  const entryIdInput = document.getElementById('allowanceEntryId');
  const typeSelect = document.getElementById('allowanceType');
  const dateInput = document.getElementById('allowanceDate');
  const shiftGroup = document.getElementById('allowanceShiftGroup');
  const shiftSelect = document.getElementById('allowanceShift');
  const rateLabel = document.getElementById('allowanceRate');
  const noteInput = document.getElementById('allowanceNote');
  const saveButton = document.getElementById('saveAllowanceBtn');
  const closeButton = document.getElementById('closeAllowanceModal');
  const cancelButton = document.getElementById('cancelAllowanceModal');

  let profile = null;
  let isAdmin = false;
  let allowanceTypes = [];
  let teamMembers = [];
  let entries = [];
  let activeTab = 'journal';

  function getKstParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    return Object.fromEntries(parts.map(part => [part.type, part.value]));
  }

  function getCurrentMonth() {
    const { year, month } = getKstParts();
    return `${year}-${month}`;
  }

  function getTodayKst() {
    const { year, month, day } = getKstParts();
    return `${year}-${month}-${day}`;
  }

  function getMonthRange(monthValue) {
    const [year, month] = monthValue.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function formatMoney(value) {
    return `${new Intl.NumberFormat('ko-KR').format(Number(value) || 0)}원`;
  }

  function shiftLabel(value) {
    return value === 'morning' ? '오전' : value === 'afternoon' ? '오후' : '일반';
  }

  function setError(message = '') {
    errorContainer.textContent = message;
    errorContainer.hidden = !message;
  }

  async function request(path = '', options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  async function loadTypes() {
    allowanceTypes = await request('/types');
    typeSelect.innerHTML = allowanceTypes.map(type =>
      `<option value="${escapeHtml(type.code)}">${escapeHtml(type.label)}</option>`
    ).join('');
  }

  async function loadProfileAndMembers() {
    const { data, error } = await supabaseClient
      .from('users')
      .select('id, name, username, role')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    profile = data;
    isAdmin = profile?.role === 'admin';

    if (!isAdmin) {
      teamMembers = [{
        id: session.user.id,
        name: profile?.name || profile?.username || '내 수당'
      }];
      return;
    }

    userFilter.hidden = false;
    const { data: users, error: usersError } = await supabaseClient
      .from('users')
      .select('id, name, username')
      .order('name', { ascending: true });
    if (usersError) throw usersError;
    teamMembers = (users || []).map(user => ({
      id: user.id,
      name: user.name || user.username || '이름 없음'
    }));
    userFilter.innerHTML = '<option value="">전체 직원</option>' + teamMembers.map(user =>
      `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}</option>`
    ).join('');
  }

  async function loadEntries() {
    setError();
    const { start, end } = getMonthRange(monthInput.value);
    const params = new URLSearchParams({ start, end });
    if (isAdmin && userFilter.value) params.set('user_id', userFilter.value);
    entries = await request(`?${params.toString()}`);
    render();
  }

  function getVisibleEntries() {
    if (activeTab === 'ball_pickup' || activeTab === 'caddie_shuttle') {
      return entries.filter(entry => entry.type_code === activeTab);
    }
    return entries;
  }

  function buildSummaries(sourceEntries) {
    const visibleMembers = isAdmin
      ? teamMembers.filter(user => !userFilter.value || user.id === userFilter.value)
      : teamMembers;
    const summaryById = new Map(visibleMembers.map(user => [user.id, {
      userId: user.id,
      name: user.name,
      countByType: {},
      amountByType: {},
      countByShift: {},
      amountByShift: {},
      totalCount: 0,
      totalAmount: 0
    }]));

    sourceEntries.forEach(entry => {
      if (!summaryById.has(entry.user_id)) {
        summaryById.set(entry.user_id, {
          userId: entry.user_id,
          name: entry.username || '이름 없음',
          countByType: {},
          amountByType: {},
          countByShift: {},
          amountByShift: {},
          totalCount: 0,
          totalAmount: 0
        });
      }
      const summary = summaryById.get(entry.user_id);
      const amount = Number(entry.unit_amount) || 0;
      summary.countByType[entry.type_code] = (summary.countByType[entry.type_code] || 0) + 1;
      summary.amountByType[entry.type_code] = (summary.amountByType[entry.type_code] || 0) + amount;
      if (entry.shift) {
        const shiftKey = `${entry.type_code}_${entry.shift}`;
        summary.countByShift[shiftKey] = (summary.countByShift[shiftKey] || 0) + 1;
        summary.amountByShift[shiftKey] = (summary.amountByShift[shiftKey] || 0) + amount;
      }
      summary.totalCount += 1;
      summary.totalAmount += amount;
    });

    return [...summaryById.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  function summaryColumns() {
    if (activeTab === 'ball_pickup') {
      return [
        { label: '이름', value: row => row.name },
        { label: '횟수', value: row => `${row.countByType.ball_pickup || 0}회` },
        { label: '지급액', value: row => formatMoney(row.amountByType.ball_pickup || 0), amount: true }
      ];
    }
    if (activeTab === 'caddie_shuttle') {
      return [
        { label: '이름', value: row => row.name },
        { label: '오전', value: row => `${row.countByShift.caddie_shuttle_morning || 0}회` },
        { label: '오전 지급액', value: row => formatMoney(row.amountByShift.caddie_shuttle_morning || 0), amount: true },
        { label: '오후', value: row => `${row.countByShift.caddie_shuttle_afternoon || 0}회` },
        { label: '오후 지급액', value: row => formatMoney(row.amountByShift.caddie_shuttle_afternoon || 0), amount: true },
        { label: '합계', value: row => formatMoney(row.amountByType.caddie_shuttle || 0), amount: true }
      ];
    }

    const columns = [{ label: '이름', value: row => row.name }];
    allowanceTypes.forEach(type => {
      if (type.shift_options?.length) {
        type.shift_options.forEach(shift => {
          const shiftKey = `${type.code}_${shift}`;
          columns.push({ label: `${type.label} ${shiftLabel(shift)}`, value: row => `${row.countByShift[shiftKey] || 0}회` });
          columns.push({ label: `${shiftLabel(shift)} 지급액`, value: row => formatMoney(row.amountByShift[shiftKey] || 0), amount: true });
        });
      } else {
        columns.push({ label: `${type.label} 횟수`, value: row => `${row.countByType[type.code] || 0}회` });
        columns.push({ label: `${type.label} 지급액`, value: row => formatMoney(row.amountByType[type.code] || 0), amount: true });
      }
    });
    columns.push({ label: '총 지급액', value: row => formatMoney(row.totalAmount), amount: true });
    return columns;
  }

  function renderSummary(sourceEntries) {
    const summaries = buildSummaries(sourceEntries);
    const columns = summaryColumns();
    const totalAmount = sourceEntries.reduce((total, entry) => total + (Number(entry.unit_amount) || 0), 0);
    const viewLabel = activeTab === 'ball_pickup'
      ? '볼수거 월간 합계'
      : activeTab === 'caddie_shuttle'
        ? '캐디 셔틀 월간 합계'
        : activeTab === 'settlement' ? '월말 정산' : '사람별 월간 합계';

    summaryContainer.innerHTML = `
      <div class="allowance-summary-heading">
        <h2>${viewLabel}</h2>
        <div class="allowance-total"><span>${sourceEntries.length}건 지급</span><strong>${formatMoney(totalAmount)}</strong></div>
      </div>
      <div class="allowance-table-wrap">
        <table class="allowance-table summary-table">
          <thead><tr>${columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
          <tbody>${summaries.length
            ? summaries.map(row => `<tr>${columns.map(column => `<td class="${column.amount ? 'amount' : ''}">${escapeHtml(column.value(row))}</td>`).join('')}</tr>`).join('')
            : `<tr><td class="allowance-empty" colspan="${columns.length}">정산할 직원이 없습니다.</td></tr>`
          }</tbody>
        </table>
      </div>
    `;
  }

  function renderDetails(sourceEntries) {
    const isSettlement = activeTab === 'settlement';
    const title = isSettlement ? '월간 수당 일지' : '상세 일지';
    const body = sourceEntries.length
      ? sourceEntries.map(entry => {
        const canManage = isAdmin || entry.user_id === session.user.id;
        return `<tr>
          <td class="date">${escapeHtml(entry.work_date)}</td>
          <td>${escapeHtml(entry.username)}</td>
          <td>${escapeHtml(entry.type_label)}</td>
          <td class="shift">${escapeHtml(entry.shift ? shiftLabel(entry.shift) : '-')}</td>
          <td class="amount">${formatMoney(entry.unit_amount)}</td>
          <td class="note">${escapeHtml(entry.note || '-')}</td>
          <td>${canManage ? `<div class="allowance-actions">
            <button class="allowance-row-action" type="button" data-action="edit" data-id="${escapeHtml(entry.id)}">수정</button>
            <button class="allowance-row-action delete" type="button" data-action="delete" data-id="${escapeHtml(entry.id)}">삭제</button>
          </div>` : '<span aria-label="관리 권한 없음">-</span>'}</td>
        </tr>`;
      }).join('')
      : '<tr><td class="allowance-empty" colspan="7">해당 월에 등록된 수당이 없습니다.</td></tr>';

    detailsContainer.innerHTML = `
      <div class="allowance-summary-heading allowance-secondary-heading">
        <h2>${title}</h2><p>한 줄이 수당 1건입니다.</p>
      </div>
      <div class="allowance-table-wrap">
        <table class="allowance-table">
          <thead><tr><th>날짜</th><th>이름</th><th>수당</th><th>구분</th><th>지급액</th><th>비고</th><th>관리</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function render() {
    const visibleEntries = getVisibleEntries();
    tabs.forEach(tab => {
      const selected = tab.dataset.tab === activeTab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    renderSummary(visibleEntries);
    renderDetails(visibleEntries);
  }

  function renderShiftOptions(type, selected = '') {
    const options = type?.shift_options || [];
    shiftGroup.hidden = options.length === 0;
    shiftSelect.required = options.length > 0;
    shiftSelect.innerHTML = options.map(shift =>
      `<option value="${escapeHtml(shift)}">${shiftLabel(shift)}</option>`
    ).join('');
    if (options.length) shiftSelect.value = options.includes(selected) ? selected : options[0];
  }

  function updateRate() {
    const type = allowanceTypes.find(item => item.code === typeSelect.value);
    if (!type) {
      rateLabel.textContent = '';
      return;
    }
    rateLabel.textContent = `1회 ${formatMoney(type.unit_amount)}`;
    renderShiftOptions(type, shiftSelect.value);
  }

  function openModal(entry = null) {
    form.reset();
    entryIdInput.value = entry?.id || '';
    modalTitle.textContent = entry ? '수당 기록 수정' : '수당 입력';
    saveButton.textContent = entry ? '수정 저장' : '등록';

    const allowedTypes = activeTab === 'ball_pickup' || activeTab === 'caddie_shuttle'
      ? allowanceTypes.filter(type => type.code === activeTab)
      : allowanceTypes;
    typeSelect.innerHTML = allowedTypes.map(type =>
      `<option value="${escapeHtml(type.code)}">${escapeHtml(type.label)}</option>`
    ).join('');
    typeSelect.disabled = allowedTypes.length === 1;
    if (entry) typeSelect.value = entry.type_code;

    const today = getTodayKst();
    const selectedMonth = monthInput.value;
    dateInput.value = entry?.work_date || (today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`);
    noteInput.value = entry?.note || '';
    updateRate();
    if (entry?.shift) shiftSelect.value = entry.shift;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    typeSelect.focus();
  }

  function closeModal() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    form.reset();
    typeSelect.disabled = false;
  }

  async function deleteEntry(entry) {
    const result = window.Swal?.fire
      ? await window.Swal.fire({
        icon: 'warning',
        title: '수당 기록 삭제',
        text: `${entry.username} · ${entry.type_label} · ${entry.work_date} 기록을 삭제할까요?`,
        showCancelButton: true,
        confirmButtonText: '삭제',
        cancelButtonText: '취소',
        reverseButtons: true
      })
      : { isConfirmed: window.confirm('이 수당 기록을 삭제할까요?') };
    if (!result.isConfirmed) return;

    try {
      await request(`/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      await loadEntries();
    } catch (error) {
      setError(`삭제하지 못했습니다: ${error.message}`);
    }
  }

  function exportWorkbook() {
    if (!window.XLSX) {
      setError('엑셀 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
      return;
    }

    const visibleEntries = getVisibleEntries();
    const summaries = buildSummaries(visibleEntries);
    const details = visibleEntries.map(entry => ({
      날짜: entry.work_date,
      이름: entry.username,
      수당: entry.type_label,
      구분: entry.shift ? shiftLabel(entry.shift) : '-',
      지급액: Number(entry.unit_amount) || 0,
      비고: entry.note || ''
    }));
    const summaryRows = summaries.map(summary => {
      const row = { 이름: summary.name };
      allowanceTypes.forEach(type => {
        if (type.shift_options?.length) {
          type.shift_options.forEach(shift => {
            const key = `${type.code}_${shift}`;
            row[`${type.label} ${shiftLabel(shift)} 횟수`] = summary.countByShift[key] || 0;
            row[`${type.label} ${shiftLabel(shift)} 지급액`] = summary.amountByShift[key] || 0;
          });
        } else {
          row[`${type.label} 횟수`] = summary.countByType[type.code] || 0;
          row[`${type.label} 지급액`] = summary.amountByType[type.code] || 0;
        }
      });
      row['총 지급액'] = summary.totalAmount;
      return row;
    });

    const workbook = XLSX.utils.book_new();
    const detailSheet = XLSX.utils.json_to_sheet(details.length ? details : [{ 안내: '해당 월 수당 기록이 없습니다.' }]);
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows.length ? summaryRows : [{ 안내: '정산할 기록이 없습니다.' }]);
    XLSX.utils.book_append_sheet(workbook, detailSheet, '수당 일지');
    XLSX.utils.book_append_sheet(workbook, summarySheet, '사람별 정산');

    const { start } = getMonthRange(monthInput.value);
    const month = start.slice(0, 7);
    const fileName = `수당_${month}_${activeTab}.xlsx`;
    const fileData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    if (window.AndroidExcelExporter) {
      const bytes = new Uint8Array(fileData);
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      window.AndroidExcelExporter.saveExcel(btoa(binary), fileName);
      return;
    }

    const blob = new Blob([fileData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }

  typeSelect.addEventListener('change', updateRate);
  monthInput.addEventListener('change', loadEntries);
  userFilter.addEventListener('change', loadEntries);
  tabs.forEach(tab => tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    render();
  }));
  addButton.addEventListener('click', () => openModal());
  exportButton.addEventListener('click', exportWorkbook);
  closeButton.addEventListener('click', closeModal);
  cancelButton.addEventListener('click', closeModal);
  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal();
  });
  detailsContainer.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const entry = entries.find(item => item.id === button.dataset.id);
    if (!entry || (!isAdmin && entry.user_id !== session.user.id)) return;
    if (button.dataset.action === 'edit') openModal(entry);
    if (button.dataset.action === 'delete') deleteEntry(entry);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {
      type_code: typeSelect.value,
      work_date: dateInput.value,
      shift: shiftGroup.hidden ? null : shiftSelect.value,
      note: noteInput.value.trim()
    };
    const entryId = entryIdInput.value;
    saveButton.disabled = true;
    saveButton.textContent = '저장 중...';
    try {
      await request(entryId ? `/${encodeURIComponent(entryId)}` : '', {
        method: entryId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload)
      });
      closeModal();
      await loadEntries();
    } catch (error) {
      setError(`저장하지 못했습니다: ${error.message}`);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = entryId ? '수정 저장' : '등록';
    }
  });

  async function initialize() {
    try {
      monthInput.value = getCurrentMonth();
      await loadProfileAndMembers();
      await loadTypes();
      await loadEntries();
    } catch (error) {
      setError(`수당 정보를 불러오지 못했습니다: ${error.message}`);
      summaryContainer.innerHTML = '';
      detailsContainer.innerHTML = '';
    }
  }

  await initialize();
});
