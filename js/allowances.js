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
  const calendarTitle = document.getElementById('entryCalendarTitle');
  const calendar = document.getElementById('allowanceEntryCalendar');
  const selectedDateHeading = document.getElementById('entrySelectedDate');
  const daySlots = document.getElementById('allowanceDaySlots');
  const targetControl = document.getElementById('entryTargetControl');
  const targetUser = document.getElementById('entryTargetUser');
  const previousMonthButton = document.getElementById('entryPrevMonth');
  const nextMonthButton = document.getElementById('entryNextMonth');

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

  function getAllowanceOrdinals() {
    const ordinalBySlot = new Map();
    const ordinalEntries = availability.slice()
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
    const ordinalBySlot = getAllowanceOrdinals();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토']
      .map(day => `<div class="allowance-weekday">${day}</div>`).join('');
    const cells = Array.from({ length: firstDay }, () => '<div aria-hidden="true"></div>');
    for (let day = 1; day <= days; day += 1) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEntries = getEntriesForDate(date);
      const getNames = typeCode => dayEntries
        .filter(entry => entry.type_code === typeCode)
        .map(entry => {
          const member = teamMembers.find(user => user.id === entry.user_id);
          const name = member?.name || entry.username || '직원';
          const ordinal = ordinalBySlot.get(getAllowanceSlotKey(entry));
          const color = getMemberColor(entry.user_id);
          return `<span class="allowance-person-tag" style="--member-color:${color}">${escapeHtml(name)} <strong>${ordinal || '-'}회</strong></span>`;
        });
      const shuttleNames = getNames('caddie_shuttle');
      const ballNames = getNames('ball_pickup');
      const status = [
        shuttleNames.length ? `셔틀: ${shuttleNames.join(', ')}` : '',
        ballNames.length ? `볼수거: ${ballNames.join(', ')}` : ''
      ].filter(Boolean).map(text => `<span>${text}</span>`).join('');
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
    renderDaySlots();
  }

  function renderDaySlots() {
    const date = selectedDate;
    if (!date) {
      selectedDateHeading.textContent = '날짜를 선택해 주세요';
      daySlots.innerHTML = '';
      return;
    }
    const [year, month, day] = date.split('-').map(Number);
    selectedDateHeading.textContent = `${year}년 ${month}월 ${day}일 수당 체크`;
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
    summaryContainer.hidden = isEntryTab;
    detailsContainer.hidden = isEntryTab;
    entryView.hidden = !isEntryTab;
    tabs.forEach(tab => {
      const selected = tab.dataset.tab === activeTab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    if (isEntryTab) {
      renderCalendar();
      return;
    }
    const visibleEntries = getVisibleEntries();
    renderSummary(visibleEntries);
    renderDetails(visibleEntries);
  }

  async function setMonth(monthValue) {
    monthInput.value = monthValue;
    const { start } = getMonthRange(monthValue);
    selectedDate = selectedDate.startsWith(monthValue) ? selectedDate : start;
    await loadEntries();
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
      ['일자', '', ...members.map(user => user.name)]
    ];
    for (let day = 1; day <= monthParts.days; day += 1) {
      const date = `${monthInput.value}-${String(day).padStart(2, '0')}`;
      const entriesForDate = entries.filter(entry => entry.work_date === date && entry.type_code === 'ball_pickup');
      rows.push([
        `${monthParts.month}월 ${String(day).padStart(2, '0')}일`,
        '',
        ...members.map(user => {
          const amount = entriesForDate
            .filter(entry => entry.user_id === user.id)
            .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0);
          return amount ? amount : 'ㅡ';
        })
      ]);
    }
    return rows;
  }

  function makeShuttleRows(members, monthParts) {
    const columns = members.flatMap(user => [
      { ...user, shift: 'morning' },
      { ...user, shift: 'afternoon' }
    ]);
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
    const totals = columns.map(user => entries
      .filter(entry => entry.type_code === 'caddie_shuttle' && entry.user_id === user.id && entry.shift === user.shift)
      .reduce((sum, entry) => sum + (Number(entry.unit_amount) || 0), 0));
    rows.push(['금액', ...totals]);
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

  function buildTemplateSheet(templateWorkbook, rows, sheetName) {
    const templateSheetName = templateWorkbook.SheetNames[0];
    if (!templateSheetName) throw new Error('엑셀 템플릿에 시트가 없습니다.');
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    delete templateWorkbook.Sheets[templateSheetName];
    templateWorkbook.Sheets[sheetName] = sheet;
    templateWorkbook.SheetNames[0] = sheetName;
    return templateWorkbook.Sheets[sheetName];
  }

  async function exportWorkbook() {
    if (!window.XLSX) {
      setError('엑셀 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
      return;
    }
    exportButton.disabled = true;
    setError();
    try {
      const monthParts = getMonthRange(monthInput.value);
      const visibleMembers = (isAdmin && !userFilter.value
        ? teamMembers
        : teamMembers.filter(user => !isAdmin || user.id === userFilter.value))
        .filter(user => entries.some(entry => entry.user_id === user.id));
      const [golfTemplate, shuttleTemplate, monthTemplate] = await Promise.all([
        fetchTemplate('/templates/golf_allow.xlsx'),
        fetchTemplate('/templates/shuttle_allow.xlsx'),
        fetchTemplate('/templates/month_allow.xlsx')
      ]);
      const golfSheet = buildTemplateSheet(
        golfTemplate,
        makeGolfRows(visibleMembers, monthParts),
        `${monthParts.year}년${monthParts.month}월 골프`
      );
      const shuttleSheet = buildTemplateSheet(
        shuttleTemplate,
        makeShuttleRows(visibleMembers, monthParts),
        `${monthParts.year}년${monthParts.month}월 셔틀`
      );
      const monthSheet = buildTemplateSheet(
        monthTemplate,
        makeMonthRows(visibleMembers, monthParts),
        `${monthParts.year}년${monthParts.month}월 수당`
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, golfSheet, `${monthParts.year}년${monthParts.month}월 골프`);
      XLSX.utils.book_append_sheet(workbook, shuttleSheet, `${monthParts.year}년${monthParts.month}월 셔틀`);
      XLSX.utils.book_append_sheet(workbook, monthSheet, `${monthParts.year}년${monthParts.month}월 수당`);

      const fileName = `수당_${monthInput.value}.xlsx`;
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
  previousMonthButton.addEventListener('click', async () => {
    const [year, month] = monthInput.value.split('-').map(Number);
    const previous = new Date(year, month - 2, 1);
    try {
      await setMonth(`${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`);
    } catch (error) {
      setError(`수당 정보를 불러오지 못했습니다: ${error.message}`);
    }
  });
  nextMonthButton.addEventListener('click', async () => {
    const [year, month] = monthInput.value.split('-').map(Number);
    const next = new Date(year, month, 1);
    try {
      await setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
    } catch (error) {
      setError(`수당 정보를 불러오지 못했습니다: ${error.message}`);
    }
  });
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
