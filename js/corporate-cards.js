(() => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/corporate-cards';
  const TARGET_RECEIPT_BYTES = 900 * 1024;
  const MAX_RECEIPT_BYTES = 1024 * 1024;
  const monthFilter = document.getElementById('monthFilter');
  const searchFilter = document.getElementById('searchFilter');
  const entryRows = document.getElementById('entryRows');
  const statusMessage = document.getElementById('statusMessage');
  const emptyState = document.getElementById('emptyState');
  const addEntryButton = document.getElementById('addEntry');
  const entryDialog = document.getElementById('entryDialog');
  const entryForm = document.getElementById('entryForm');
  const formError = document.getElementById('formError');
  const receiptPreview = document.getElementById('receiptPreview');
  const receiptCameraInput = document.getElementById('receiptCameraInput');
  const receiptGalleryInput = document.getElementById('receiptGalleryInput');
  const removeReceiptRow = document.getElementById('removeReceiptRow');
  const removeReceiptCheckbox = document.getElementById('removeReceipt');
  const clearReceiptPhotoButton = document.getElementById('clearReceiptPhoto');
  const receiptViewer = document.getElementById('receiptViewer');
  const receiptImage = document.getElementById('receiptImage');

  const now = new Date();
  monthFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let entries = [];
  let isAdmin = false;
  let editingId = '';
  let pendingReceipt = null;
  let previewUrl = '';
  let viewerUrl = '';

  const amountFormatter = new Intl.NumberFormat('ko-KR');
  const dateFormatter = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });

  function setStatus(message, type = '') {
    statusMessage.textContent = message;
    statusMessage.dataset.type = type;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  async function request(path = '', options = {}) {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!session) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${session.access_token}`, ...options.headers }
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `요청에 실패했습니다. (HTTP ${response.status})`);
    }
    return response;
  }

  function renderEntries() {
    const term = searchFilter.value.trim().toLocaleLowerCase('ko-KR');
    const visible = entries.filter(entry => !term ||
      [entry.merchant, entry.cardholder, entry.category, entry.memo]
        .some(value => String(value || '').toLocaleLowerCase('ko-KR').includes(term)));
    const total = visible.reduce((sum, entry) => sum + Number(entry.amount), 0);
    document.getElementById('entryCount').textContent = `${visible.length}건`;
    document.getElementById('totalAmount').textContent = `${amountFormatter.format(total)}원`;
    document.getElementById('receiptCount').textContent =
      `${visible.filter(entry => entry.receipt_size_bytes).length}건`;
    emptyState.hidden = visible.length > 0;

    entryRows.innerHTML = visible.map(entry => {
      const spentOn = dateFormatter.format(new Date(`${entry.spent_on}T00:00:00`));
      return `<tr>
        <td data-cell="date">${escapeHtml(spentOn)}</td>
        <td data-cell="title"><span class="cards-merchant">${escapeHtml(entry.merchant)}</span><span class="cards-sub">${escapeHtml(entry.cardholder)}${entry.memo ? ` · ${escapeHtml(entry.memo)}` : ''}</span></td>
        <td data-cell="category">${escapeHtml(entry.category)}</td>
        <td data-cell="amount"><span class="cards-amount">${amountFormatter.format(entry.amount)}원</span></td>
        <td data-cell="receipt">${entry.receipt_size_bytes
          ? `<button class="cards-button cards-receipt-button" type="button" data-action="receipt" data-id="${escapeHtml(entry.id)}">영수증 보기</button>`
          : '<span class="cards-sub">미첨부</span>'}</td>
        ${isAdmin ? `<td data-cell="actions"><div class="cards-row-actions">
          <button class="cards-button" type="button" data-action="edit" data-id="${escapeHtml(entry.id)}">수정</button>
          <button class="cards-button" type="button" data-action="delete" data-id="${escapeHtml(entry.id)}">삭제</button>
        </div></td>` : ''}
      </tr>`;
    }).join('');
    document.getElementById('actionHeading').hidden = !isAdmin;
  }

  async function loadEntries() {
    setStatus('내역을 불러오고 있습니다.');
    entryRows.replaceChildren();
    emptyState.hidden = true;
    try {
      const query = new URLSearchParams();
      if (monthFilter.value) query.set('month', monthFilter.value);
      const response = await request(`?${query}`);
      const result = await response.json();
      entries = Array.isArray(result.entries) ? result.entries : [];
      isAdmin = result.role === 'admin';
      addEntryButton.hidden = !isAdmin;
      renderEntries();
      setStatus(result.hasMore
        ? '조회 가능한 내역이 1,000건을 초과합니다. 월별로 나누어 확인해 주세요.'
        : `${monthFilter.value || '전체 기간'} 내역 ${result.count}건을 불러왔습니다.`,
      result.hasMore ? 'error' : '');
    } catch (error) {
      entries = [];
      renderEntries();
      setStatus(error.message || '내역을 불러오지 못했습니다.', 'error');
      if (error.message.includes('권한')) {
        entryRows.replaceChildren();
        emptyState.hidden = false;
        emptyState.innerHTML = '<strong>조회 권한이 없습니다.</strong>법인카드 내역은 관리자와 게스트만 조회할 수 있습니다.';
      }
    }
  }

  function clearPendingReceipt() {
    pendingReceipt = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    receiptPreview.removeAttribute('src');
    receiptPreview.hidden = true;
    clearReceiptPhotoButton.hidden = true;
    receiptCameraInput.value = '';
    receiptGalleryInput.value = '';
  }

  function openForm(entry = null) {
    entryForm.reset();
    clearPendingReceipt();
    formError.textContent = '';
    editingId = entry?.id || '';
    document.getElementById('entryDialogTitle').textContent =
      entry ? '법인카드 내역 수정' : '법인카드 내역 등록';
    document.getElementById('spentOn').value = entry?.spent_on || new Date().toISOString().slice(0, 10);
    document.getElementById('amount').value = entry?.amount ?? '';
    document.getElementById('merchant').value = entry?.merchant || '';
    document.getElementById('cardholder').value = entry?.cardholder || '';
    document.getElementById('category').value = entry?.category || '식대';
    document.getElementById('memo').value = entry?.memo || '';
    removeReceiptRow.hidden = !entry?.receipt_size_bytes;
    removeReceiptCheckbox.checked = false;
    entryDialog.showModal();
  }

  async function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('영수증 사진을 읽을 수 없습니다.'));
        image.src = url;
      });
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  async function compressReceipt(file) {
    if (!file.type.startsWith('image/')) throw new Error('사진 파일을 선택해 주세요.');
    if (file.size > 40 * 1024 * 1024) throw new Error('40MB 이하의 사진을 선택해 주세요.');
    const image = await decodeImage(file);
    try {
      if (!image.width || !image.height) throw new Error('사진 크기를 확인할 수 없습니다.');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('사진 압축을 지원하지 않는 기기입니다.');
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const scale = Math.min(1, 2000 / Math.max(image.width, image.height)) *
          (0.88 ** Math.floor(attempt / 3));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(
          resolve,
          'image/jpeg',
          [0.84, 0.76, 0.68][attempt % 3]
        ));
        if (!blob) throw new Error('사진 압축에 실패했습니다.');
        if (blob.size <= TARGET_RECEIPT_BYTES) return blob;
        if (blob.size <= MAX_RECEIPT_BYTES) return blob;
      }
      throw new Error('사진을 1MB 이하로 압축하지 못했습니다.');
    } finally {
      image.close();
    }
  }

  async function handleReceiptSelected(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    formError.textContent = '';
    try {
      pendingReceipt = await compressReceipt(file);
      clearPendingReceiptPreview();
      previewUrl = URL.createObjectURL(pendingReceipt);
      receiptPreview.src = previewUrl;
      receiptPreview.hidden = false;
      clearReceiptPhotoButton.hidden = false;
      removeReceiptCheckbox.checked = false;
    } catch (error) {
      formError.textContent = error.message || '영수증 사진을 처리하지 못했습니다.';
    }
  }

  function clearPendingReceiptPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    receiptPreview.removeAttribute('src');
    receiptPreview.hidden = true;
  }

  async function saveEntry(event) {
    event.preventDefault();
    if (!isAdmin) return;
    const saveButton = document.getElementById('saveEntry');
    saveButton.disabled = true;
    formError.textContent = '';
    try {
      const data = new FormData(entryForm);
      data.delete('receipt');
      if (pendingReceipt) data.append('receipt', pendingReceipt, 'receipt.jpg');
      if (removeReceiptCheckbox.checked) data.set('remove_receipt', 'true');
      const response = await request(editingId ? `/${encodeURIComponent(editingId)}` : '', {
        method: editingId ? 'PATCH' : 'POST',
        body: data
      });
      await response.json();
      entryDialog.close();
      clearPendingReceipt();
      await loadEntries();
      setStatus('법인카드 내역을 저장했습니다.', 'success');
    } catch (error) {
      formError.textContent = error.message || '내역을 저장하지 못했습니다.';
    } finally {
      saveButton.disabled = false;
    }
  }

  async function showReceipt(id) {
    try {
      const response = await request(`/${encodeURIComponent(id)}/receipt`);
      viewerUrl = URL.createObjectURL(await response.blob());
      receiptImage.src = viewerUrl;
      receiptViewer.showModal();
    } catch (error) {
      setStatus(error.message || '영수증을 불러오지 못했습니다.', 'error');
    }
  }

  async function handleRowAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const entry = entries.find(item => item.id === button.dataset.id);
    if (!entry) return;
    if (button.dataset.action === 'receipt') {
      await showReceipt(entry.id);
      return;
    }
    if (!isAdmin) return;
    if (button.dataset.action === 'edit') {
      openForm(entry);
      return;
    }
    if (button.dataset.action === 'delete' &&
      window.confirm(`${entry.spent_on} ${entry.merchant} 내역을 삭제할까요? 영수증 사진도 함께 삭제됩니다.`)) {
      button.disabled = true;
      try {
        await request(`/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
        await loadEntries();
        setStatus('법인카드 내역을 삭제했습니다.', 'success');
      } catch (error) {
        setStatus(error.message || '내역을 삭제하지 못했습니다.', 'error');
      }
    }
  }

  addEntryButton.addEventListener('click', () => openForm());
  monthFilter.addEventListener('change', loadEntries);
  searchFilter.addEventListener('input', renderEntries);
  entryRows.addEventListener('click', handleRowAction);
  entryForm.addEventListener('submit', saveEntry);
  document.getElementById('takeReceiptPhoto').addEventListener('click', () => receiptCameraInput.click());
  document.getElementById('chooseReceiptPhoto').addEventListener('click', () => receiptGalleryInput.click());
  receiptCameraInput.addEventListener('change', handleReceiptSelected);
  receiptGalleryInput.addEventListener('change', handleReceiptSelected);
  clearReceiptPhotoButton.addEventListener('click', clearPendingReceipt);
  removeReceiptCheckbox.addEventListener('change', () => {
    if (removeReceiptCheckbox.checked) {
      pendingReceipt = null;
      clearPendingReceiptPreview();
      clearReceiptPhotoButton.hidden = true;
      receiptCameraInput.value = '';
      receiptGalleryInput.value = '';
    }
  });
  document.getElementById('closeEntryDialog').addEventListener('click', () => entryDialog.close());
  document.getElementById('cancelEntry').addEventListener('click', () => entryDialog.close());
  document.getElementById('closeReceiptViewer').addEventListener('click', () => receiptViewer.close());
  receiptViewer.addEventListener('close', () => {
    receiptImage.removeAttribute('src');
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = '';
  });
  entryDialog.addEventListener('close', clearPendingReceipt);
  entryDialog.addEventListener('click', event => {
    if (event.target === entryDialog) entryDialog.close();
  });
  receiptViewer.addEventListener('click', event => {
    if (event.target === receiptViewer) receiptViewer.close();
  });

  loadEntries();
})();
