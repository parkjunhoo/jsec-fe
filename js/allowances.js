document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/allowances';
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !session) {
    window.location.href = '/index.html';
    return;
  }

  const monthInput = document.getElementById('allowanceMonth');
  const userFilter = document.getElementById('allowanceUserFilter');
  const exportButton = document.getElementById('allowanceExportBtn');
  const tabs = document.querySelectorAll('[data-tab]');
  const summaryContainer = document.getElementById('allowanceSummary');
  const detailsContainer = document.getElementById('allowanceDetails');
  const errorContainer = document.getElementById('allowanceError');
  const entryView = document.getElementById('allowanceEntryView');
  const categoryCalendarHead = document.getElementById('allowanceCategoryCalendarHead');
  const categoryCalendarTitle = document.getElementById('allowanceCategoryCalendarTitle');
  const calendarTitle = document.getElementById('entryCalendarTitle');
  const calendar = document.getElementById('allowanceEntryCalendar');
  const sheetPreview = document.getElementById('allowanceSheetPreview');
  const dayPanel = document.getElementById('allowanceDayPanel');
  const selectedDateHeading = document.getElementById('entrySelectedDate');
  const daySlots = document.getElementById('allowanceDaySlots');
  const targetControl = document.getElementById('entryTargetControl');
  const targetUser = document.getElementById('entryTargetUser');

  let profile = null;
  let isAdmin = false;
  let allowanceTypes = [];
  let teamMembers = [];
  let entries = [];
  let availability = [];
  let activeTab = 'journal';
  let selectedDate = '';

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
      year,
      month,
      days: lastDay,
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

  function getMemberColor(memberId) {
    const color = teamMembers.find(user => user.id === memberId)?.color;
    return typeof color === 'string' && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)
      ? color
      : '#38bdf8';
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
  }

  async function loadProfileAndMembers() {
    const { data, error } = await supabaseClient
      .from('users')
      .select('id, name, username, role, color')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    profile = data;
    isAdmin = profile?.role === 'admin';

    const { data: users, error: usersError } = await supabaseClient
      .from('users')
      .select('id, name, username, color')
      .order('name', { ascending: true });
    if (usersError) throw usersError;
    teamMembers = (users || []).map(user => ({
      id: user.id,
      name: user.name || user.username || '이름 없음',
      color: user.color || '#38bdf8'
    }));
    if (!isAdmin) {
      userFilter.hidden = true;
      targetControl.hidden = true;
      targetUser.innerHTML = `<option value="${escapeHtml(session.user.id)}">${escapeHtml(profile?.name || profile?.username || '내 수당')}</option>`;
      targetUser.value = session.user.id;
      return;
    }

    userFilter.hidden = false;
    targetControl.hidden = false;
    const options = teamMembers.map(user =>
      `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}</option>`
    ).join('');
    userFilter.innerHTML = '<option value="">전체 직원</option>' + options;
    targetUser.innerHTML = options;
    targetUser.value = session.user.id;
  }

  async function loadEntries() {
    setError();
    const { start, end } = getMonthRange(monthInput.value);
    const params = new URLSearchParams({ start, end });
    const availabilityParams = new URLSearchParams({ start, end });
    const [loadedEntries, loadedAvailability] = await Promise.all([
      request(`?${params.toString()}`),
      request(`/availability?${availabilityParams.toString()}`)
    ]);
    entries = loadedEntries;
    availability = loadedAvailability;
    render();
  }

  function getVisibleEntries() {
    return entries.filter(entry => {
      if (isAdmin && userFilter.value && entry.user_id !== userFilter.value) return false;
      if (activeTab === 'ball_pickup' || activeTab === 'caddie_shuttle') {
        return entry.type_code === activeTab;
      }
      return true;
    });
  }

  function emptySummary(user) {
    return {
      userId: user.id,
      name: user.name,
      countByType: {},
      amountByType: {},
      countByShift: {},
      amountByShift: {},
      totalCount: 0,
      totalAmount: 0
    };
  }

  function buildSummaries(sourceEntries) {
    const visibleMembers = isAdmin
      ? teamMembers.filter(user => !userFilter.value || user.id === userFilter.value)
      : teamMembers;
    const summaryById = new Map(visibleMembers.map(user => [user.id, emptySummary(user)]));

    sourceEntries.forEach(entry => {
      if (!summaryById.has(entry.user_id)) {
        summaryById.set(entry.user_id, emptySummary({
          id: entry.user_id,
          name: entry.username || '이름 없음'
        }));
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

    return [...summaryById.values()]
      .filter(summary => summary.totalCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  function summaryColumns() {
    if (activeTab === 'ball_pickup') {
      return [
        { label: '이름', value: row => row.name },
        {
          label: '연습장 볼수거',
          value: row => `${row.countByType.ball_pickup || 0}회 (${formatMoney(row.amountByType.ball_pickup || 0)})`
        }
      ];
    }
    if (activeTab === 'caddie_shuttle') {
      return [
        { label: '이름', value: row => row.name },
        {
          label: '캐디 셔틀',
          value: row => `${(row.countByShift.caddie_shuttle_morning || 0)
            + (row.countByShift.caddie_shuttle_afternoon || 0)}회 (${formatMoney(row.amountByType.caddie_shuttle || 0)})`
        }
      ];
    }

    return [
      { label: '이름', value: row => row.name },
      {
        label: '연습장 볼수거',
        value: row => `${row.countByType.ball_pickup || 0}회 (${formatMoney(row.amountByType.ball_pickup || 0)})`
      },
      {
        label: '캐디 셔틀',
        value: row => `${(row.countByShift.caddie_shuttle_morning || 0)
          + (row.countByShift.caddie_shuttle_afternoon || 0)}회 (${formatMoney(row.amountByType.caddie_shuttle || 0)})`
      },
      { label: '총 수당', value: row => formatMoney(row.totalAmount), amount: true }
    ];
  }

  function renderSummary(sourceEntries) {
    const summaries = buildSummaries(sourceEntries);
    const columns = summaryColumns();
    const totalAmount = sourceEntries.reduce((total, entry) => total + (Number(entry.unit_amount) || 0), 0);
    const viewLabel = activeTab === 'ball_pickup'
      ? '볼수거 월간 합계'
      : activeTab === 'caddie_shuttle'
        ? '셔틀 월간 합계'
        : '사람별 월간 합계';

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

  function renderDetails(sourceEntries) {
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
            <button class="allowance-row-action delete" type="button" data-action="delete" data-id="${escapeHtml(entry.id)}">삭제</button>
          </div>` : '<span aria-label="관리 권한 없음">-</span>'}</td>
        </tr>`;
      }).join('')
      : '<tr><td class="allowance-empty" colspan="7">해당 월에 등록된 수당이 없습니다.</td></tr>';

    detailsContainer.innerHTML = `
      <div class="allowance-summary-heading allowance-secondary-heading">
        <h2>상세 일지</h2><p>한 줄이 수당 1건입니다.</p>
      </div>
      <div class="allowance-table-wrap">
        <table class="allowance-table">
          <thead><tr><th>날짜</th><th>이름</th><th>수당</th><th>구분</th><th>지급액</th><th>비고</th><th>관리</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function getEntriesForDate(date) {
    return availability.filter(entry => entry.work_date === date);
  }

  function getEntriesForCalendarTab(date) {
    return getEntriesForDate(date).filter(entry =>
      activeTab !== 'ball_pickup' && activeTab !== 'caddie_shuttle'
      || entry.type_code === activeTab
    );
  }

  function getSelectedMembers() {
    return (isAdmin && !userFilter.value
      ? teamMembers
      : teamMembers.filter(user => !isAdmin || user.id === userFilter.value));
  }

  function getWorkbookPreview() {
    const selectedMembers = getSelectedMembers();
    const golfMembers = selectedMembers.filter(user => entries.some(entry =>
      entry.user_id === user.id && entry.type_code === 'ball_pickup'));
    const shuttleMembers = selectedMembers.filter(user => entries.some(entry =>
      entry.user_id === user.id && entry.type_code === 'caddie_shuttle'));
    const shuttleColumns = shuttleMembers.flatMap(user =>
      ['morning', 'afternoon']
        .filter(shift => entries.some(entry => entry.user_id === user.id
          && entry.type_code === 'caddie_shuttle' && entry.shift === shift))
        .map(shift => ({ ...user, shift })));
    const monthMembers = selectedMembers.filter(user => entries.some(entry => entry.user_id === user.id));
    const monthParts = getMonthRange(monthInput.value);

    if (activeTab === 'ball_pickup') {
      return { kind: 'golf', rows: makeGolfRows(golfMembers, monthParts) };
    }
    if (activeTab === 'caddie_shuttle') {
      return { kind: 'shuttle', rows: makeShuttleRows(shuttleColumns, monthParts) };
    }
    return { kind: 'month', rows: makeMonthRows(monthMembers, monthParts) };
  }

  function renderSheetPreview() {
    if (activeTab === 'entry') {
      sheetPreview.hidden = true;
      sheetPreview.innerHTML = '';
      return;
    }
    const { kind, rows } = getWorkbookPreview();
    const { year, month } = getMonthRange(monthInput.value);
    const columnCount = Math.max(1, ...rows.map(row => row.length));
    const totalRow = rows.length - 1;
    const body = rows.map((row, rowIndex) => {
      if (rowIndex === 1 && !row.length) {
        return `<tr><td class="sheet-spacer" colspan="${columnCount}"></td></tr>`;
      }
      if (rowIndex === 0) {
        return `<tr><th class="sheet-title" colspan="${columnCount}">${escapeHtml(row[0])}</th></tr>`;
      }
      const isTotal = rowIndex === totalRow;
      return `<tr class="${isTotal ? 'sheet-total' : ''}">${row.map((value, columnIndex) => {
        const isHeader = kind === 'golf' && rowIndex === 2
          || kind === 'shuttle' && (rowIndex === 2 || rowIndex === 3)
          || kind === 'month' && rowIndex === 1;
        const isSubheading = kind === 'shuttle' && rowIndex === 3;
        const isLabel = columnIndex === 0 && !isHeader;
        const classes = [
          isHeader ? (isSubheading ? 'sheet-subheading' : 'sheet-heading') : '',
          isLabel ? 'sheet-label' : '',
          typeof value === 'number' ? 'sheet-money' : ''
        ].filter(Boolean).join(' ');
        const cellValue = typeof value === 'number' ? formatMoney(value) : value;
        const tag = isHeader ? 'th' : 'td';
        return `<${tag} class="${classes}">${escapeHtml(cellValue)}</${tag}>`;
      }).join('')}</tr>`;
    }).join('');

    const title = kind === 'golf' ? '연습장 볼수거 일지'
      : kind === 'shuttle' ? '캐디 셔틀 일지' : '월말 수당 정산';
    sheetPreview.innerHTML = `
      <header class="allowance-sheet-preview-heading">
        <h2>${title}</h2><span>${year}년 ${month}월 · 엑셀 시트 미리보기</span>
      </header>
      <div class="allowance-sheet-table-wrap">
        <table class="allowance-sheet-table"><tbody>${body}</tbody></table>
      </div>
    `;
    sheetPreview.hidden = false;
  }

  function getAllowanceOrdinals() {
    const ordinalBySlot = new Map();
    const ordinalEntries = availability.filter(entry =>
      activeTab !== 'ball_pickup' && activeTab !== 'caddie_shuttle'
      || entry.type_code === activeTab
    ).slice()
      .sort((a, b) => a.work_date.localeCompare(b.work_date)
        || (Number(a.slot_no) || 0) - (Number(b.slot_no) || 0));
    const countsByMemberAndType = new Map();
    ordinalEntries.forEach(entry => {
      const memberKey = `${entry.user_id || session.user.id}:${entry.type_code}`;
      const ordinal = (countsByMemberAndType.get(memberKey) || 0) + 1;
      countsByMemberAndType.set(memberKey, ordinal);
      const slotKey = `${entry.work_date}:${entry.type_code}:${entry.shift || ''}:${entry.slot_no || ''}`;
      ordinalBySlot.set(slotKey, ordinal);
    });
    return ordinalBySlot;
  }

  function getAllowanceSlotKey(entry) {
    return `${entry.work_date}:${entry.type_code}:${entry.shift || ''}:${entry.slot_no || ''}`;
  }

  function renderCalendar() {
    const { year, month, days } = getMonthRange(monthInput.value);
    const firstDay = new Date(year, month - 1, 1).getDay();
    calendarTitle.textContent = `${year}년 ${month}월`;
    const calendarLabel = activeTab === 'ball_pickup' ? '연습장 볼수거 달력'
      : activeTab === 'caddie_shuttle' ? '캐디 셔틀 달력'
        : activeTab === 'journal' ? '수당 일지 달력' : '수당 입력 달력';
    categoryCalendarTitle.textContent = `${calendarLabel} · ${year}년 ${month}월`;
    const ordinalBySlot = getAllowanceOrdinals();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토']
      .map(day => `<div class="allowance-weekday">${day}</div>`).join('');
    const cells = Array.from({ length: firstDay }, () => '<div aria-hidden="true"></div>');
    for (let day = 1; day <= days; day += 1) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEntries = getEntriesForCalendarTab(date);
      const renderEntries = (typeCode, getIcon) => dayEntries
        .filter(entry => entry.type_code === typeCode)
        .map(entry => {
          const member = teamMembers.find(user => user.id === entry.user_id);
          const name = member?.name || entry.username || '직원';
          const ordinal = ordinalBySlot.get(getAllowanceSlotKey(entry));
          const color = getMemberColor(entry.user_id);
          return `<span class="allowance-person-tag" style="--member-color:${color}">${getIcon(entry)} ${escapeHtml(name)} <strong>${ordinal || '-'}회</strong></span>`;
        });
      const shuttleEntries = renderEntries('caddie_shuttle', entry => entry.shift === 'afternoon' ? '🚘' : '🚗');
      const ballEntries = renderEntries('ball_pickup', () => '⛳');
      const status = [
        shuttleEntries.length ? `<span>${shuttleEntries.join(', ')}</span>` : '',
        ballEntries.length ? `<span>${ballEntries.join(', ')}</span>` : ''
      ].filter(Boolean).join('');
      const classes = [
        'allowance-day-cell',
        selectedDate === date ? 'selected' : '',
        getTodayKst() === date ? 'today' : ''
      ].filter(Boolean).join(' ');
      cells.push(`<button class="${classes}" type="button" data-date="${date}" aria-pressed="${selectedDate === date}">
        <span class="allowance-day-number">${day}</span>
        <span class="allowance-day-summary">${status}</span>
      </button>`);
    }
    calendar.innerHTML = weekdays + cells.join('');
    if (activeTab === 'entry') renderDaySlots();
  }

  function renderDaySlots() {
    const date = selectedDate;
    if (!date) {
      selectedDateHeading.textContent = '날짜를 선택해 주세요';
      daySlots.innerHTML = '';
      return;
    }
    const [year, month, day] = date.split('-').map(Number);
    selectedDateHeading.textContent = `${month}월 ${day}일 수당 체크`;
    const records = getEntriesForDate(date);
    const ordinalBySlot = getAllowanceOrdinals();
    const slots = [
      { type: 'caddie_shuttle', shift: 'morning', title: '오전 셔틀', slot: null },
      { type: 'caddie_shuttle', shift: 'afternoon', title: '오후 셔틀', slot: null },
      { type: 'ball_pickup', shift: null, title: '연습장 볼수거 1', slot: 1 },
      { type: 'ball_pickup', shift: null, title: '연습장 볼수거 2', slot: 2 }
    ];

    daySlots.innerHTML = slots.map(slot => {
      const record = records.find(entry => entry.type_code === slot.type
        && (slot.shift ? entry.shift === slot.shift : Number(entry.slot_no) === slot.slot));
      const ownEntry = !isAdmin && record
        ? entries.find(entry => entry.work_date === date
          && entry.type_code === slot.type
          && (slot.shift ? entry.shift === slot.shift : Number(entry.slot_no) === slot.slot))
        : null;
      const type = allowanceTypes.find(item => item.code === slot.type);
      let status = '비어 있음';
      let statusColor = '';
      let action = `<button class="allowance-slot-button claim" type="button" data-action="claim"
        data-type="${slot.type}" data-shift="${slot.shift || ''}" data-slot="${slot.slot || ''}">${isAdmin ? '선택 직원 등록' : '내가 하기'}</button>`;
      if (record) {
        const assignedMember = teamMembers.find(user => user.id === record.user_id);
        const name = assignedMember?.name || record.username || '직원';
        const ordinal = ordinalBySlot.get(getAllowanceSlotKey(record));
        status = `${name} · ${ordinal || '-'}회`;
        statusColor = getMemberColor(record.user_id);
        if (isAdmin || ownEntry) {
          const entryId = isAdmin ? record.id : ownEntry.id;
          action = `<button class="allowance-slot-button delete" type="button" data-action="remove" data-id="${escapeHtml(entryId)}">취소</button>`;
        } else {
          action = '';
        }
      }
      return `<article class="allowance-slot">
        <div class="allowance-slot-info">
          <div class="allowance-slot-title">${slot.title}</div>
          <div class="allowance-slot-status ${record ? 'taken' : ''}" ${statusColor ? `style="--member-color:${statusColor}"` : ''}>${escapeHtml(status)} · ${formatMoney(type?.unit_amount)}</div>
        </div>
        <div class="allowance-slot-actions">${action}</div>
      </article>`;
    }).join('');
  }

  function render() {
    const isEntryTab = activeTab === 'entry';
    categoryCalendarHead.hidden = isEntryTab;
    summaryContainer.hidden = isEntryTab;
    detailsContainer.hidden = isEntryTab;
    entryView.hidden = false;
    dayPanel.hidden = !isEntryTab;
    tabs.forEach(tab => {
      const selected = tab.dataset.tab === activeTab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    if (isEntryTab) {
      renderCalendar();
      renderSheetPreview();
      return;
    }
    const visibleEntries = getVisibleEntries();
    renderSummary(visibleEntries);
    renderDetails(visibleEntries);
    renderCalendar();
    renderSheetPreview();
  }

  async function setMonth(monthValue) {
    monthInput.value = monthValue;
    const { start } = getMonthRange(monthValue);
    selectedDate = selectedDate.startsWith(monthValue) ? selectedDate : start;
    await loadEntries();
  }

  async function moveMonth(offset) {
    const [year, month] = monthInput.value.split('-').map(Number);
    const nextMonth = new Date(year, month - 1 + offset, 1);
    await setMonth(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`);
  }

  async function changeEntry(actionButton) {
    const action = actionButton.dataset.action;
    try {
      if (action === 'remove') {
        const entry = entries.find(item => item.id === actionButton.dataset.id);
        if (entry) await deleteEntry(entry);
        return;
      }
      if (action !== 'claim') return;

      const payload = {
        type_code: actionButton.dataset.type,
        work_date: selectedDate,
        shift: actionButton.dataset.shift || null,
        slot_no: actionButton.dataset.slot ? Number(actionButton.dataset.slot) : null,
        note: ''
      };
      if (isAdmin) payload.user_id = targetUser.value;
      actionButton.disabled = true;
      await request('', { method: 'POST', body: JSON.stringify(payload) });
      await loadEntries();
    } catch (error) {
      setError(`수당을 저장하지 못했습니다: ${error.message}`);
    } finally {
      actionButton.disabled = false;
    }
  }

  function makeGolfRows(members, monthParts) {
    const rows = [
      [`${monthParts.year}년 ${monthParts.month}월 골프연습장 일지`],
      [],
      ['일자', ...members.map(user => user.name)]
    ];
    for (let day = 1; day <= monthParts.days; day += 1) {
      const date = `${monthInput.value}-${String(day).padStart(2, '0')}`;
      const entriesForDate = entries.filter(entry => entry.work_date === date && entry.type_code === 'ball_pickup');
      rows.push([
        `${monthParts.month}월 ${String(day).padStart(2, '0')}일`,
        ...members.map(user => {
          const amount = entriesForDate
            .filter(entry => entry.user_id === user.id)
            .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0);
          return amount ? amount : 'ㅡ';
        })
      ]);
    }
    rows.push(['합계', ...members.map(user => entries
      .filter(entry => entry.user_id === user.id && entry.type_code === 'ball_pickup')
      .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0))]);
    return rows;
  }

  function makeShuttleRows(columns, monthParts) {
    const rows = [
      [`${monthParts.year}년 ${monthParts.month}월 셔틀운행 일지`],
      [],
      ['날짜', ...columns.map(user => user.name)],
      ['', ...columns.map(user => `${shiftLabel(user.shift)}셔틀`)]
    ];
    for (let day = 1; day <= monthParts.days; day += 1) {
      const date = `${monthInput.value}-${String(day).padStart(2, '0')}`;
      const entriesForDate = entries.filter(entry => entry.work_date === date && entry.type_code === 'caddie_shuttle');
      rows.push([
        day === 1 ? `${monthParts.month}월1일` : day,
        ...columns.map(user => {
          const record = entriesForDate.find(entry => entry.user_id === user.id && entry.shift === user.shift);
          return record ? Number(record.unit_amount) || 0 : 'ㅡ';
        })
      ]);
    }
    rows.push(['금액', ...columns.map(user => entries
      .filter(entry => entry.user_id === user.id && entry.type_code === 'caddie_shuttle' && entry.shift === user.shift)
      .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0))]);
    return rows;
  }

  function makeMonthRows(members, monthParts) {
    const rows = [
      [`${monthParts.year}년 ${monthParts.month}월 골프연습장/셔틀운행`],
      [`${monthParts.month}월`, ...members.map(user => user.name)],
      ['골프연습장', ...members.map(user => entries
        .filter(entry => entry.user_id === user.id && entry.type_code === 'ball_pickup')
        .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0))],
      ['셔틀운행', ...members.map(user => entries
        .filter(entry => entry.user_id === user.id && entry.type_code === 'caddie_shuttle')
        .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0))],
      ['합계', ...members.map(user => entries
        .filter(entry => entry.user_id === user.id)
        .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0))]
    ];
    return rows;
  }

  async function fetchTemplate(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path} 템플릿을 불러오지 못했습니다. (HTTP ${response.status})`);
    return XLSX.read(await response.arrayBuffer(), { type: 'array' });
  }

  function columnName(index) {
    let column = '';
    while (index > 0) {
      const remainder = (index - 1) % 26;
      column = String.fromCharCode(65 + remainder) + column;
      index = Math.floor((index - 1) / 26);
    }
    return column;
  }

  function setFormula(sheet, address, formula, value) {
    sheet[address] = { t: 'n', f: formula, v: value };
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const cell = XLSX.utils.decode_cell(address);
    range.e.r = Math.max(range.e.r, cell.r);
    range.e.c = Math.max(range.e.c, cell.c);
    sheet['!ref'] = XLSX.utils.encode_range(range);
  }

  function addTitleMerge(sheet, columnCount) {
    sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, columnCount - 1) } }];
  }

  function createStyledSheet(rows, columnCount, widths, heights) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    addTitleMerge(sheet, columnCount);
    sheet['!cols'] = widths.map(width => ({ wch: width }));
    sheet['!rows'] = heights;
    rows.forEach((row, rowIndex) => {
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const address = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
        if (!sheet[address]) sheet[address] = { t: 's', v: '' };
      }
    });
    sheet['!ref'] = `A1:${columnName(columnCount)}${rows.length}`;
    return sheet;
  }

  function configureFormulas(workbookSheets, monthParts, names, membersByType) {
    const golfSheet = workbookSheets.golf;
    const golfTotalRow = monthParts.days + 4;
    membersByType.golf.forEach((member, index) => {
      const letter = columnName(index + 2);
      setFormula(golfSheet, `${letter}${golfTotalRow}`, `SUM(${letter}4:${letter}${golfTotalRow - 1})`,
        entries.filter(entry => entry.type_code === 'ball_pickup' && entry.user_id === member.id)
          .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0));
    });

    const shuttleSheet = workbookSheets.shuttle;
    const shuttleTotalRow = monthParts.days + 5;
    membersByType.shuttleColumns.forEach((column, index) => {
      const letter = columnName(index + 2);
      const total = entries.filter(entry => entry.type_code === 'caddie_shuttle'
        && entry.user_id === column.id && entry.shift === column.shift)
        .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0);
      setFormula(shuttleSheet, `${letter}${shuttleTotalRow}`,
        `SUM(${letter}5:${letter}${shuttleTotalRow - 1})`, total);
    });

    const monthSheet = workbookSheets.month;
    const golfName = names.golf.replace(/'/g, "''");
    const shuttleName = names.shuttle.replace(/'/g, "''");
    membersByType.month.forEach((member, index) => {
      const column = columnName(index + 2);
      const golfTotal = entries.filter(entry => entry.type_code === 'ball_pickup' && entry.user_id === member?.id)
        .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0);
      const shuttleTotal = entries.filter(entry => entry.type_code === 'caddie_shuttle' && entry.user_id === member?.id)
        .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0);
      const golfIndex = membersByType.golf.findIndex(candidate => candidate.id === member.id);
      const shuttleColumns = membersByType.shuttleColumns
        .map((column, columnIndex) => ({ ...column, columnIndex }))
        .filter(column => column.id === member.id);
      const golfFormula = golfIndex < 0 ? '0' : `'${golfName}'!${columnName(golfIndex + 2)}${golfTotalRow}`;
      const shuttleFormula = shuttleColumns.length
        ? `SUM(${shuttleColumns.map(column => `'${shuttleName}'!${columnName(column.columnIndex + 2)}${shuttleTotalRow}`).join(',')})`
        : '0';
      setFormula(monthSheet, `${column}3`, golfFormula, golfTotal);
      setFormula(monthSheet, `${column}4`, shuttleFormula, shuttleTotal);
      setFormula(monthSheet, `${column}5`, `SUM(${column}3:${column}4)`, golfTotal + shuttleTotal);
    });
  }

  function applyPrintSettings(zip, workbookSheetNames, sheetRanges) {
    const spreadsheetNamespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const workbookPath = 'xl/workbook.xml';
    return Promise.all(workbookSheetNames.map(async (sheetName, index) => {
      const worksheetPath = `xl/worksheets/sheet${index + 1}.xml`;
      const worksheetFile = zip.file(worksheetPath);
      if (!worksheetFile) throw new Error(`${sheetName} 시트 파일을 찾을 수 없습니다.`);
      const worksheetXml = new DOMParser().parseFromString(await worksheetFile.async('text'), 'application/xml');
      if (worksheetXml.querySelector('parsererror')) throw new Error(`${sheetName} 시트 서식을 적용하지 못했습니다.`);

      const sheetData = worksheetXml.getElementsByTagNameNS(spreadsheetNamespace, 'sheetData')[0];
      if (!sheetData) throw new Error(`${sheetName} 시트에 데이터가 없습니다.`);
      const titleRow = worksheetXml.getElementsByTagNameNS(spreadsheetNamespace, 'row')[0];
      if (titleRow) {
        titleRow.setAttribute('ht', '30');
        titleRow.setAttribute('customHeight', '1');
      }
      const rows = Array.from(worksheetXml.getElementsByTagNameNS(spreadsheetNamespace, 'row'));
      rows.forEach(row => {
        const rowNumber = Number(row.getAttribute('r'));
        if (rowNumber > 1) {
          row.setAttribute('ht', index === 2 && rowNumber === 2 ? '35' : rowNumber === 2 ? '8' : '22');
          row.setAttribute('customHeight', '1');
        }
        Array.from(row.getElementsByTagNameNS(spreadsheetNamespace, 'c')).forEach(cell => {
          const match = cell.getAttribute('r').match(/^([A-Z]+)(\d+)$/);
          if (!match) return;
          const col = match[1];
          const rowIndex = Number(match[2]);
          let style = 5;
          if (rowIndex === 1) style = 1;
          else if (index === 0 && rowIndex === 3) style = 2;
          else if (index === 1 && rowIndex === 3) style = 2;
          else if (index === 1 && rowIndex === 4) style = 3;
          else if (index === 2 && rowIndex === 2) style = col === 'A' ? 3 : 2;
          else if (index === 2 && (rowIndex === 3 || rowIndex === 4) && col === 'A') style = 3;
          else if (rowIndex === sheetRanges[index].totalRow) style = col === 'A' ? 4 : 8;
          else if ((index === 0 || index === 1) && col === 'A') style = 6;
          else if (index === 2 && col !== 'A' && rowIndex >= 3) style = 7;
          else if ((index === 0 && rowIndex > 3 && col !== 'A')
            || (index === 1 && rowIndex > 4 && col !== 'A')) style = 7;
          cell.setAttribute('s', String(style));
        });
      });

      let mergeCells = worksheetXml.getElementsByTagNameNS(spreadsheetNamespace, 'mergeCells')[0];
      if (!mergeCells) {
        mergeCells = worksheetXml.createElementNS(spreadsheetNamespace, 'mergeCells');
        worksheetXml.documentElement.insertBefore(mergeCells, sheetData.nextSibling);
      }
      const mergeCell = mergeCells.getElementsByTagNameNS(spreadsheetNamespace, 'mergeCell')[0]
        || worksheetXml.createElementNS(spreadsheetNamespace, 'mergeCell');
      mergeCell.setAttribute('ref', `A1:${sheetRanges[index].lastColumn}1`);
      while (mergeCells.firstChild) mergeCells.removeChild(mergeCells.firstChild);
      mergeCells.appendChild(mergeCell);
      mergeCells.setAttribute('count', '1');

      let sheetPr = worksheetXml.getElementsByTagNameNS(spreadsheetNamespace, 'sheetPr')[0];
      if (!sheetPr) {
        sheetPr = worksheetXml.createElementNS(spreadsheetNamespace, 'sheetPr');
        worksheetXml.documentElement.insertBefore(sheetPr, worksheetXml.documentElement.firstChild);
      }
      let pageSetupProperties = sheetPr.getElementsByTagNameNS(spreadsheetNamespace, 'pageSetUpPr')[0];
      if (!pageSetupProperties) {
        pageSetupProperties = worksheetXml.createElementNS(spreadsheetNamespace, 'pageSetUpPr');
        sheetPr.appendChild(pageSetupProperties);
      }
      pageSetupProperties.setAttribute('fitToPage', '1');
      ['printOptions', 'pageMargins', 'pageSetup'].forEach(tag => {
        const existing = worksheetXml.getElementsByTagNameNS(spreadsheetNamespace, tag)[0];
        if (existing) existing.parentNode.removeChild(existing);
      });
      const ignoredErrors = worksheetXml.getElementsByTagNameNS(spreadsheetNamespace, 'ignoredErrors')[0];
      const printOptions = worksheetXml.createElementNS(spreadsheetNamespace, 'printOptions');
      printOptions.setAttribute('horizontalCentered', '1');
      const pageMargins = worksheetXml.createElementNS(spreadsheetNamespace, 'pageMargins');
      pageMargins.setAttribute('left', '0.25');
      pageMargins.setAttribute('right', '0.25');
      pageMargins.setAttribute('top', '0.45');
      pageMargins.setAttribute('bottom', '0.45');
      pageMargins.setAttribute('header', '0.2');
      pageMargins.setAttribute('footer', '0.2');
      const pageSetup = worksheetXml.createElementNS(spreadsheetNamespace, 'pageSetup');
      pageSetup.setAttribute('paperSize', '9');
      pageSetup.setAttribute('orientation', index === 1 || index === 2 ? 'landscape' : 'portrait');
      pageSetup.setAttribute('fitToWidth', '1');
      pageSetup.setAttribute('fitToHeight', '1');
      [printOptions, pageMargins, pageSetup].forEach(element => {
        worksheetXml.documentElement.insertBefore(element, ignoredErrors || null);
      });
      zip.file(worksheetPath, new XMLSerializer().serializeToString(worksheetXml));
    })).then(async () => {
      const workbookFile = zip.file(workbookPath);
      const workbookXml = new DOMParser().parseFromString(await workbookFile.async('text'), 'application/xml');
      if (workbookXml.querySelector('parsererror')) throw new Error('인쇄 영역을 설정하지 못했습니다.');
      const existingDefinedNames = workbookXml.getElementsByTagNameNS(spreadsheetNamespace, 'definedNames')[0];
      if (existingDefinedNames) existingDefinedNames.parentNode.removeChild(existingDefinedNames);
      const definedNames = workbookXml.createElementNS(spreadsheetNamespace, 'definedNames');
      workbookSheetNames.forEach((sheetName, index) => {
        const name = workbookXml.createElementNS(spreadsheetNamespace, 'definedName');
        name.setAttribute('name', '_xlnm.Print_Area');
        name.setAttribute('localSheetId', String(index));
        name.textContent = `'${sheetName.replace(/'/g, "''")}'!$A$1:$${sheetRanges[index].lastColumn}$${sheetRanges[index].lastRow}`;
        definedNames.appendChild(name);
      });
      const calcPr = workbookXml.getElementsByTagNameNS(spreadsheetNamespace, 'calcPr')[0];
      workbookXml.documentElement.insertBefore(definedNames, calcPr || null);
      if (calcPr) {
        calcPr.setAttribute('calcMode', 'auto');
        calcPr.setAttribute('fullCalcOnLoad', '1');
      }
      zip.file(workbookPath, new XMLSerializer().serializeToString(workbookXml));
      await addWorkbookStyles(zip);
    });
  }

  async function addWorkbookStyles(zip) {
    const path = 'xl/styles.xml';
    const file = zip.file(path);
    if (!file) throw new Error('엑셀 서식 정보를 찾을 수 없습니다.');
    const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const xml = new DOMParser().parseFromString(await file.async('text'), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('엑셀 서식 정보를 읽지 못했습니다.');
    const fonts = xml.getElementsByTagNameNS(namespace, 'fonts')[0];
    const fills = xml.getElementsByTagNameNS(namespace, 'fills')[0];
    const borders = xml.getElementsByTagNameNS(namespace, 'borders')[0];
    const cellXfs = xml.getElementsByTagNameNS(namespace, 'cellXfs')[0];
    if (!fonts || !fills || !borders || !cellXfs) throw new Error('엑셀 서식 구조가 올바르지 않습니다.');

    function addFont({ color, bold = false, size = 10 }) {
      const font = xml.createElementNS(namespace, 'font');
      if (bold) font.appendChild(xml.createElementNS(namespace, 'b'));
      const fontSize = xml.createElementNS(namespace, 'sz');
      fontSize.setAttribute('val', String(size));
      font.appendChild(fontSize);
      const fontColor = xml.createElementNS(namespace, 'color');
      fontColor.setAttribute('rgb', `FF${color}`);
      font.appendChild(fontColor);
      const fontName = xml.createElementNS(namespace, 'name');
      fontName.setAttribute('val', '맑은 고딕');
      font.appendChild(fontName);
      fonts.appendChild(font);
    }
    addFont({ color: 'FFFFFF', bold: true, size: 16 });
    addFont({ color: 'FFFFFF', bold: true });
    addFont({ color: '1F5B46', bold: true });
    addFont({ color: '1F5B46', bold: true });

    function addFill(color) {
      const fill = xml.createElementNS(namespace, 'fill');
      const pattern = xml.createElementNS(namespace, 'patternFill');
      pattern.setAttribute('patternType', 'solid');
      const foreground = xml.createElementNS(namespace, 'fgColor');
      foreground.setAttribute('rgb', `FF${color}`);
      pattern.appendChild(foreground);
      const background = xml.createElementNS(namespace, 'bgColor');
      background.setAttribute('indexed', '64');
      pattern.appendChild(background);
      fill.appendChild(pattern);
      fills.appendChild(fill);
    }
    ['1F5B46', '367B59', 'E4F1E8', 'FFF2CC'].forEach(addFill);

    const border = xml.createElementNS(namespace, 'border');
    ['left', 'right', 'top', 'bottom'].forEach(side => {
      const edge = xml.createElementNS(namespace, side);
      edge.setAttribute('style', 'thin');
      const color = xml.createElementNS(namespace, 'color');
      color.setAttribute('rgb', 'FFD4DED7');
      edge.appendChild(color);
      border.appendChild(edge);
    });
    border.appendChild(xml.createElementNS(namespace, 'diagonal'));
    borders.appendChild(border);

    const xfTemplates = [
      { fontId: 1, fillId: 2, borderId: 1, bold: true },
      { fontId: 2, fillId: 3, borderId: 1, bold: true },
      { fontId: 3, fillId: 4, borderId: 1, bold: true },
      { fontId: 4, fillId: 5, borderId: 1, bold: true },
      { fontId: 0, fillId: 0, borderId: 1 },
      { fontId: 0, fillId: 0, borderId: 1, date: true },
      { fontId: 0, fillId: 0, borderId: 1, money: true },
      { fontId: 4, fillId: 5, borderId: 1, bold: true, money: true }
    ];
    xfTemplates.forEach(template => {
      const xf = xml.createElementNS(namespace, 'xf');
      xf.setAttribute('numFmtId', template.money ? '3' : '0');
      xf.setAttribute('fontId', String(template.fontId));
      xf.setAttribute('fillId', String(template.fillId));
      xf.setAttribute('borderId', String(template.borderId));
      xf.setAttribute('xfId', '0');
      xf.setAttribute('applyFont', '1');
      xf.setAttribute('applyFill', '1');
      xf.setAttribute('applyBorder', '1');
      if (template.money) xf.setAttribute('applyNumberFormat', '1');
      if (template.bold) xf.setAttribute('applyAlignment', '1');
      const alignment = xml.createElementNS(namespace, 'alignment');
      alignment.setAttribute('horizontal', 'center');
      alignment.setAttribute('vertical', 'center');
      alignment.setAttribute('wrapText', '1');
      xf.appendChild(alignment);
      cellXfs.appendChild(xf);
    });
    fonts.setAttribute('count', String(fonts.children.length));
    fills.setAttribute('count', String(fills.children.length));
    borders.setAttribute('count', String(borders.children.length));
    cellXfs.setAttribute('count', String(cellXfs.children.length));
    zip.file(path, new XMLSerializer().serializeToString(xml));
  }

  async function exportWorkbook() {
    if (!window.XLSX || !window.JSZip) {
      setError('엑셀 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
      return;
    }
    exportButton.disabled = true;
    setError();
    try {
      const monthParts = getMonthRange(monthInput.value);
      const selectedMembers = (isAdmin && !userFilter.value
        ? teamMembers
        : teamMembers.filter(user => !isAdmin || user.id === userFilter.value));
      const golfMembers = selectedMembers.filter(user => entries.some(entry =>
        entry.user_id === user.id && entry.type_code === 'ball_pickup'));
      const shuttleMembers = selectedMembers.filter(user => entries.some(entry =>
        entry.user_id === user.id && entry.type_code === 'caddie_shuttle'));
      const shuttleColumns = shuttleMembers.flatMap(user =>
        ['morning', 'afternoon']
          .filter(shift => entries.some(entry => entry.user_id === user.id
            && entry.type_code === 'caddie_shuttle' && entry.shift === shift))
          .map(shift => ({ ...user, shift })));
      const monthMembers = selectedMembers.filter(user => entries.some(entry => entry.user_id === user.id));
      const [golfTemplate, shuttleTemplate, monthTemplate] = await Promise.all([
        fetchTemplate('/templates/golf_allow.xlsx'),
        fetchTemplate('/templates/shuttle_allow.xlsx'),
        fetchTemplate('/templates/month_allow.xlsx')
      ]);
      if (!golfTemplate.SheetNames.length || !shuttleTemplate.SheetNames.length || !monthTemplate.SheetNames.length) {
        throw new Error('사용할 엑셀 템플릿 시트를 확인할 수 없습니다.');
      }

      const names = {
        golf: `${monthParts.year}년${monthParts.month}월 골프`,
        shuttle: `${monthParts.year}년${monthParts.month}월 셔틀`,
        month: `${monthParts.year}년${monthParts.month}월 수당`
      };
      const golfRows = makeGolfRows(golfMembers, monthParts);
      const shuttleRows = makeShuttleRows(shuttleColumns, monthParts);
      const monthRows = makeMonthRows(monthMembers, monthParts);
      const golfColumnCount = Math.max(1, golfMembers.length + 1);
      const shuttleColumnCount = Math.max(1, shuttleColumns.length + 1);
      const monthColumnCount = Math.max(1, monthMembers.length + 1);
      const createHeights = rowCount => Array.from({ length: rowCount }, (_, index) =>
        ({ hpt: index === 0 ? 30 : index === 1 ? 8 : 22 }));
      const golfSheet = createStyledSheet(golfRows, golfColumnCount,
        [14, ...golfMembers.map(() => 16)], createHeights(golfRows.length));
      const shuttleSheet = createStyledSheet(shuttleRows, shuttleColumnCount,
        [14, ...shuttleColumns.map(() => 16)], createHeights(shuttleRows.length));
      const monthSheet = createStyledSheet(monthRows, monthColumnCount,
        [20, ...monthMembers.map(() => 16)], createHeights(monthRows.length));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, golfSheet, names.golf);
      XLSX.utils.book_append_sheet(workbook, shuttleSheet, names.shuttle);
      XLSX.utils.book_append_sheet(workbook, monthSheet, names.month);
      configureFormulas({ golf: golfSheet, shuttle: shuttleSheet, month: monthSheet }, monthParts, names, {
        golf: golfMembers,
        shuttle: shuttleMembers,
        shuttleColumns,
        month: monthMembers
      });
      const sheetRanges = [
        { lastColumn: columnName(golfColumnCount), lastRow: golfRows.length, totalRow: monthParts.days + 4 },
        { lastColumn: columnName(shuttleColumnCount), lastRow: shuttleRows.length, totalRow: monthParts.days + 5 },
        { lastColumn: columnName(monthColumnCount), lastRow: monthRows.length, totalRow: 5 }
      ];

      const fileName = `수당_${monthInput.value}.xlsx`;
      const generatedData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const zip = await JSZip.loadAsync(generatedData);
      await applyPrintSettings(zip, [names.golf, names.shuttle, names.month], sheetRanges);
      const fileData = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
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
    } catch (error) {
      setError(`엑셀을 만들지 못했습니다: ${error.message}`);
    } finally {
      exportButton.disabled = false;
    }
  }

  monthInput.addEventListener('change', async () => {
    selectedDate = `${monthInput.value}-01`;
    try {
      await loadEntries();
    } catch (error) {
      setError(`수당 정보를 불러오지 못했습니다: ${error.message}`);
    }
  });
  userFilter.addEventListener('change', async () => {
    try {
      await loadEntries();
      if (activeTab === 'entry') renderDaySlots();
    } catch (error) {
      setError(`수당 정보를 불러오지 못했습니다: ${error.message}`);
    }
  });
  tabs.forEach(tab => tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    render();
  }));
  exportButton.addEventListener('click', exportWorkbook);
  calendar.addEventListener('click', event => {
    const dayButton = event.target.closest('[data-date]');
    if (!dayButton) return;
    selectedDate = dayButton.dataset.date;
    renderCalendar();
  });
  daySlots.addEventListener('click', event => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) changeEntry(actionButton);
  });
  if (targetUser) targetUser.addEventListener('change', renderDaySlots);
  detailsContainer.addEventListener('click', event => {
    const button = event.target.closest('[data-action="delete"]');
    if (!button) return;
    const entry = entries.find(item => item.id === button.dataset.id);
    if (entry && (isAdmin || entry.user_id === session.user.id)) deleteEntry(entry);
  });

  async function initialize() {
    try {
      monthInput.value = getCurrentMonth();
      selectedDate = getTodayKst();
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
