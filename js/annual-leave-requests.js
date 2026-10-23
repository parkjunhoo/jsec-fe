document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/annual-leave-requests';
  const list = document.getElementById('annualRequestList');
  const message = document.getElementById('annualRequestMessage');
  const statusFilter = document.getElementById('annualRequestStatusFilter');
  const requestsCard = document.getElementById('annualRequests');
  let userRole = 'user';
  let requests = [];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
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

  function formatDate(date) {
    const [year, month, day] = date.split('-').map(Number);
    return `${year}년 ${month}월 ${day}일`;
  }

  function statusLabel(status) {
    return status === 'approved' ? '승인' : status === 'rejected' ? '반려' : '승인 대기';
  }

  function renderRequests() {
    const filter = statusFilter.value;
    const visible = requests.filter(item => !filter || item.status === filter);
    if (!visible.length) {
      list.innerHTML = `<div class="annual-request-empty">${
        requests.length ? '선택한 상태의 신청 내역이 없습니다.' : '아직 연차 신청 내역이 없습니다.'
      }</div>`;
      return;
    }

    list.innerHTML = visible.map(item => `
      <article class="annual-request-item" data-request-id="${escapeHtml(item.id)}">
        <header class="annual-request-item-header">
          <div>
            <h3 class="annual-request-item-title">${escapeHtml(item.username)} · ${item.leave_type === '시간차' ? `${escapeHtml(item.hours_used)}시간 시간차` : `${escapeHtml(item.total_days)}일 연차`}</h3>
            <p class="annual-request-item-meta">${escapeHtml(item.department || '부서 미기재')} · ${escapeHtml(formatDate(item.start_date))} ${escapeHtml(item.start_time.slice(0, 5))} ~ ${escapeHtml(formatDate(item.end_date))} ${escapeHtml(item.end_time.slice(0, 5))}</p>
            <p class="annual-request-item-meta">신청일 ${escapeHtml(new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' }).format(new Date(item.created_at)))}</p>
          </div>
          <span class="annual-request-status ${escapeHtml(item.status)}">${statusLabel(item.status)}</span>
        </header>
        <p class="annual-request-item-details">${escapeHtml(item.details || '세부 사항 없음')}${item.review_note ? `\n관리자 메모: ${escapeHtml(item.review_note)}` : ''}</p>
        ${userRole === 'admin' && item.status === 'pending' ? `
          <div class="annual-request-review">
            <textarea data-request-review-note maxlength="1000" aria-label="관리자 검토 메모" placeholder="신청자에게 전달할 메모 (선택)"></textarea>
            <div class="annual-request-review-actions">
              <button class="annual-request-action" type="button" data-request-review="rejected">반려</button>
              <button class="annual-request-action" type="button" data-request-review="approved">승인</button>
            </div>
          </div>` : ''}
        <div class="annual-request-actions">
          <button class="annual-request-action annual-request-download" type="button" data-request-download>연차 신청서 엑셀 다운로드</button>
          <button class="annual-request-action annual-request-delete" type="button" data-request-delete>신청 내역 삭제</button>
        </div>
      </article>
    `).join('');
  }

  async function loadRequests() {
    message.textContent = '';
    list.innerHTML = '<div class="annual-request-empty">연차 신청 내역을 불러오는 중입니다.</div>';
    try {
      requests = await request();
      renderRequests();
    } catch (error) {
      console.error('연차 신청 목록 조회 오류:', error);
      message.textContent = `연차 신청 목록을 불러오지 못했습니다: ${error.message}`;
      list.innerHTML = '<div class="annual-request-empty">신청 내역을 표시할 수 없습니다.</div>';
    }
  }

  async function downloadApplication(item) {
    await window.appLoading.loadScript('/lib/jszip/jszip.min.js');
    if (!window.JSZip) throw new Error('엑셀 양식 처리 라이브러리를 불러오지 못했습니다.');
    const response = await fetch(encodeURI('/templates/연차신청서.xlsx'));
    if (!response.ok) throw new Error(`연차 신청서 양식을 불러오지 못했습니다. (HTTP ${response.status})`);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const worksheetPath = 'xl/worksheets/sheet1.xml';
    const worksheetFile = zip.file(worksheetPath);
    if (!worksheetFile) throw new Error('연차 신청서 양식의 시트를 찾을 수 없습니다.');

    const formatDateTime = (date, time) => `${formatDate(date)} ${time.slice(0, 5).replace(':', '시 ')}분`;
    const dateRange = item.leave_type === '시간차'
      ? `${formatDateTime(item.start_date, item.start_time)}부터\n${formatDateTime(item.end_date, item.end_time)}까지 (총 ${item.hours_used}시간)`
      : `${formatDate(item.start_date)}부터\n${formatDate(item.end_date)}까지 (총 ${item.total_days}일)`;
    const applicationDate = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul'
    }).format(new Date(item.created_at));
    const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const worksheetXml = new DOMParser().parseFromString(await worksheetFile.async('text'), 'application/xml');
    if (worksheetXml.querySelector('parsererror')) throw new Error('연차 신청서 양식의 시트 XML을 읽지 못했습니다.');
    const cellValues = {
      C7: item.department || '',
      H7: item.username,
      C8: item.leave_type,
      C9: dateRange,
      C10: item.details || '',
      B17: `위와 같이 휴가를 신청하오니 허락하여 주시기 바랍니다.\n\n\n${applicationDate}\n\n\n신청자 : ${item.username} (인)`
    };
    for (const [address, value] of Object.entries(cellValues)) {
      const cell = Array.from(worksheetXml.getElementsByTagNameNS(namespace, 'c'))
        .find(candidate => candidate.getAttribute('r') === address);
      if (!cell) throw new Error(`연차 신청서 양식에서 ${address} 셀을 찾을 수 없습니다.`);
      cell.setAttribute('t', 'inlineStr');
      for (const child of Array.from(cell.childNodes)) {
        if (child.nodeType === 1 && ['f', 'v', 'is'].includes(child.localName)) cell.removeChild(child);
      }
      const inlineString = worksheetXml.createElementNS(namespace, 'is');
      const text = worksheetXml.createElementNS(namespace, 't');
      text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      text.textContent = value;
      inlineString.appendChild(text);
      cell.appendChild(inlineString);
    }
    zip.file(worksheetPath, new XMLSerializer().serializeToString(worksheetXml));

    const safeName = String(item.username || '신청자').replace(/[\\\\/:*?\"<>|]/g, '_');
    const fileName = `연차신청서_${safeName}_${item.start_date}.xlsx`;
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
  }

  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !session) {
    window.location.replace('/index.html');
    return;
  }
  try {
    const { data: profile, error } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    userRole = profile?.role || 'user';
    if (['guest', 'monitor'].includes(userRole)) {
      requestsCard.hidden = true;
      return;
    }
    statusFilter.hidden = userRole !== 'admin';
    await loadRequests();
  } catch (error) {
    console.error('연차 신청 내역 화면 초기화 오류:', error);
    message.textContent = error.message || '연차 신청 내역을 불러오지 못했습니다.';
  }

  statusFilter.addEventListener('change', renderRequests);
  window.addEventListener('annual-leave:requests-refresh', loadRequests);

  list.addEventListener('click', async event => {
    const card = event.target.closest('[data-request-id]');
    const item = requests.find(requestItem => requestItem.id === card?.dataset.requestId);
    if (!item) return;

    const deleteButton = event.target.closest('[data-request-delete]');
    if (deleteButton) {
      const note = item.status === 'approved' ? '\n\n이미 승인된 휴무 일정은 캘린더에 유지됩니다.' : '';
      const confirmation = await Swal.fire({
        icon: 'warning',
        title: '연차 신청 내역 삭제',
        text: `${item.username} 님의 연차 신청 내역을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.${note}`,
        showCancelButton: true,
        confirmButtonText: '삭제',
        cancelButtonText: '취소',
        confirmButtonColor: '#c74444'
      });
      if (!confirmation.isConfirmed) return;
      deleteButton.disabled = true;
      message.textContent = '';
      try {
        await request(`/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
        await loadRequests();
        window.dispatchEvent(new Event('annual-leave:updated'));
      } catch (error) {
        console.error('연차 신청 내역 삭제 오류:', error);
        message.textContent = error.message || '연차 신청 내역을 삭제하지 못했습니다.';
        deleteButton.disabled = false;
      }
      return;
    }

    const downloadButton = event.target.closest('[data-request-download]');
    if (downloadButton) {
      downloadButton.disabled = true;
      try {
        await downloadApplication(item);
      } catch (error) {
        await Swal.fire({ icon: 'error', text: `엑셀 다운로드 실패: ${error.message}` });
      } finally {
        downloadButton.disabled = false;
      }
      return;
    }

    const reviewButton = event.target.closest('[data-request-review]');
    if (!reviewButton || userRole !== 'admin' || reviewButton.disabled) return;
    const status = reviewButton.dataset.requestReview;
    const reviewNote = card.querySelector('[data-request-review-note]').value.trim();
    const confirmation = await Swal.fire({
      icon: status === 'approved' ? 'question' : 'warning',
      text: `${item.username} 님의 연차 신청을 ${status === 'approved' ? '승인' : '반려'}하시겠습니까?`,
      showCancelButton: true,
      confirmButtonText: status === 'approved' ? '승인' : '반려',
      cancelButtonText: '취소'
    });
    if (!confirmation.isConfirmed) return;
    card.querySelectorAll('[data-request-review]').forEach(button => { button.disabled = true; });
    message.textContent = '';
    try {
      const result = await request(`/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, review_note: reviewNote })
      });
      await loadRequests();
      window.dispatchEvent(new Event('annual-leave:updated'));
      if (result.notificationWarning) message.textContent = result.notificationWarning;
    } catch (error) {
      console.error('연차 신청 검토 오류:', error);
      message.textContent = error.message || '연차 신청을 처리하지 못했습니다.';
      card.querySelectorAll('[data-request-review]').forEach(button => { button.disabled = false; });
    }
  });
});
