document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/item-requests';
  const form = document.getElementById('itemRequestForm');
  const formError = document.getElementById('requestFormError');
  const submitButton = document.getElementById('requestSubmit');
  const requestList = document.getElementById('requestList');
  const listError = document.getElementById('requestListError');
  const statusFilter = document.getElementById('requestStatusFilter');
  const exampleUrlInput = document.getElementById('itemExampleUrl');
  const linkPreview = document.getElementById('itemLinkPreview');
  const linkDomain = document.getElementById('itemLinkDomain');
  const linkUrl = document.getElementById('itemLinkUrl');
  let session = null;
  let isAdmin = false;
  let requests = [];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function safeHttpUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
    } catch {
      return null;
    }
  }

  function updateLinkPreview() {
    const url = safeHttpUrl(exampleUrlInput.value.trim());
    if (!url) {
      linkPreview.hidden = true;
      linkPreview.removeAttribute('href');
      return;
    }
    linkPreview.href = url.href;
    linkDomain.textContent = url.hostname;
    linkUrl.textContent = url.href;
    linkPreview.hidden = false;
  }

  function showError(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Seoul'
    }).format(new Date(value));
  }

  function statusLabel(status) {
    return status === 'approved' ? '승인' : status === 'rejected' ? '반려' : '검토 대기';
  }

  exampleUrlInput.addEventListener('input', updateLinkPreview);
  statusFilter.addEventListener('change', renderRequests);

  const { data, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) {
    console.error('물품 신청 세션 확인 오류:', sessionError);
    showError(formError, '로그인 정보를 확인하지 못했습니다. 페이지를 새로고침해 주세요.');
    form.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = true; });
    requestList.innerHTML = '<div class="request-empty">로그인 정보를 확인하지 못했습니다.</div>';
    return;
  }
  session = data.session;
  if (!session) {
    window.location.replace('/index.html');
    return;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('물품 신청 사용자 권한 조회 오류:', profileError);
    showError(listError, '사용자 권한을 확인하지 못했습니다. 새로고침해 주세요.');
    form.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = true; });
    return;
  }
  isAdmin = profile?.role === 'admin';
  if (isAdmin) {
    document.getElementById('requestListTitle').textContent = '전체 물품 신청';
    document.getElementById('requestListDescription').textContent = '신청 내용을 확인하고 승인 또는 반려할 수 있습니다.';
    document.getElementById('requestIntro').textContent = '필요한 물품을 신청하거나 팀원의 신청을 검토하세요.';
    statusFilter.hidden = false;
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

  function renderRequests() {
    const visibleRequests = requests.filter(item => !statusFilter.value || item.status === statusFilter.value);
    if (visibleRequests.length === 0) {
      requestList.innerHTML = `<div class="request-empty">${
        requests.length ? '선택한 상태의 신청 내역이 없습니다.' : '아직 물품 신청 내역이 없습니다.'
      }</div>`;
      return;
    }

    requestList.innerHTML = visibleRequests.map(item => {
      const url = safeHttpUrl(item.example_url);
      return `<article class="request-item" data-request-id="${escapeHtml(item.id)}">
        <header class="request-item-header">
          <div>
            <h3 class="request-item-title">${escapeHtml(item.item_name)}</h3>
            <p class="request-item-meta">${isAdmin ? `${escapeHtml(item.username)} · ` : ''}${escapeHtml(formatDate(item.created_at))} · 수량 ${escapeHtml(item.quantity)}</p>
          </div>
          <span class="request-status ${escapeHtml(item.status)}">${statusLabel(item.status)}</span>
        </header>
        <div class="request-details">
          <div class="request-detail"><strong>규격</strong><br>${escapeHtml(item.specification || '미기재')}</div>
          <div class="request-detail"><strong>신청 사유</strong><br>${escapeHtml(item.reason || '미기재')}</div>
          ${item.review_note ? `<div class="request-detail"><strong>관리자 메모</strong><br>${escapeHtml(item.review_note)}</div>` : ''}
        </div>
        ${url ? `<a class="request-item-link" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">예시 링크 · ${escapeHtml(url.hostname)} ↗</a>` : ''}
        ${isAdmin && item.status === 'pending' ? `
          <div class="request-review">
            <textarea data-review-note placeholder="신청자에게 전달할 메모 (선택 사항)" maxlength="1000" aria-label="${escapeHtml(item.item_name)} 관리자 메모"></textarea>
            <div class="request-review-actions">
              <button class="request-action reject" type="button" data-review-status="rejected">반려</button>
              <button class="request-action approve" type="button" data-review-status="approved">승인</button>
            </div>
          </div>` : ''}
        ${isAdmin ? `<div class="request-review-actions${item.status === 'pending' ? '' : ' request-delete-actions'}">
          <button class="request-action reject" type="button" data-delete-request>내역 삭제</button>
        </div>` : ''}
      </article>`;
    }).join('');
  }

  async function loadRequests() {
    showError(listError, '');
    requestList.innerHTML = '<div class="request-empty">신청 내역을 불러오는 중입니다.</div>';
    try {
      requests = await request();
      renderRequests();
    } catch (error) {
      console.error('물품 신청 목록 조회 오류:', error);
      showError(listError, `신청 내역을 불러오지 못했습니다: ${error.message}`);
      requestList.innerHTML = '<div class="request-empty">신청 내역을 표시할 수 없습니다.</div>';
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    showError(formError, '');
    const exampleUrl = exampleUrlInput.value.trim();
    if (exampleUrl && !safeHttpUrl(exampleUrl)) {
      showError(formError, '예시 링크는 http 또는 https 주소로 입력해 주세요.');
      exampleUrlInput.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = '신청 중...';
    try {
      const result = await request('', {
        method: 'POST',
        body: JSON.stringify({
          item_name: document.getElementById('itemName').value.trim(),
          quantity: Number(document.getElementById('itemQuantity').value),
          specification: document.getElementById('itemSpecification').value.trim(),
          reason: document.getElementById('itemReason').value.trim(),
          example_url: exampleUrl
        })
      });
      form.reset();
      updateLinkPreview();
      document.getElementById('itemQuantity').value = '1';
      await loadRequests();
      if (window.Swal) await window.Swal.fire({
        icon: result.notificationWarning ? 'warning' : 'success',
        text: result.notificationWarning || '물품 신청이 등록되었습니다.'
      });
    } catch (error) {
      console.error('물품 신청 등록 오류:', error);
      showError(formError, error.message || '물품 신청을 등록하지 못했습니다.');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = '물품 신청하기';
    }
  });

  requestList.addEventListener('click', async event => {
    const deleteButton = event.target.closest('[data-delete-request]');
    if (deleteButton && isAdmin && !deleteButton.disabled) {
      const card = deleteButton.closest('[data-request-id]');
      if (!card) return;
      const item = requests.find(requestItem => requestItem.id === card.dataset.requestId);
      if (!item) return;

      const confirmed = window.Swal
        ? (await window.Swal.fire({
          icon: 'warning',
          title: '신청 내역 삭제',
          text: `${item.item_name} 신청 내역을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`,
          showCancelButton: true,
          confirmButtonText: '삭제',
          cancelButtonText: '취소',
          confirmButtonColor: '#c74444'
        })).isConfirmed
        : window.confirm(`${item.item_name} 신청 내역을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`);
      if (!confirmed) return;

      deleteButton.disabled = true;
      try {
        await request(`/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
        requests = requests.filter(requestItem => requestItem.id !== item.id);
        renderRequests();
      } catch (error) {
        console.error('물품 신청 내역 삭제 오류:', error);
        showError(listError, error.message || '신청 내역을 삭제하지 못했습니다.');
        deleteButton.disabled = false;
      }
      return;
    }

    const button = event.target.closest('[data-review-status]');
    if (!button || !isAdmin || button.disabled) return;
    const card = button.closest('[data-request-id]');
    if (!card) return;
    const requestId = card.dataset.requestId;
    const reviewNote = card.querySelector('[data-review-note]').value.trim();
    const status = button.dataset.reviewStatus;
    card.querySelectorAll('[data-review-status]').forEach(action => { action.disabled = true; });
    try {
      const result = await request(`/${encodeURIComponent(requestId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, review_note: reviewNote })
      });
      await loadRequests();
      if (result.notificationWarning) showError(listError, result.notificationWarning);
    } catch (error) {
      console.error('물품 신청 검토 오류:', error);
      showError(listError, error.message || '신청을 처리하지 못했습니다.');
      card.querySelectorAll('[data-review-status]').forEach(action => { action.disabled = false; });
    }
  });

  await loadRequests();
});
