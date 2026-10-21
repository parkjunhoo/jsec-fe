(() => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/meal-plan';
  const TARGET_IMAGE_BYTES = 900 * 1024;
  const MAX_SOURCE_IMAGE_BYTES = 40 * 1024 * 1024;
  const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const previousWeekButton = document.getElementById('previousWeek');
  const nextWeekButton = document.getElementById('nextWeek');
  const weekRange = document.getElementById('weekRange');
  const weekStartLabel = document.getElementById('weekStart');
  const mealStatus = document.getElementById('mealStatus');
  const mealPhotoFrame = document.getElementById('mealPhotoFrame');
  const mealPhoto = document.getElementById('mealPhoto');
  const mealEmpty = document.getElementById('mealEmpty');
  const choosePhotoButton = document.getElementById('chooseMealPhoto');
  const uploadPhotoButton = document.getElementById('uploadMealPhoto');
  const cancelPhotoButton = document.getElementById('cancelMealPhoto');
  const photoInput = document.getElementById('mealPhotoInput');
  const mealViewer = document.getElementById('mealViewer');
  const mealViewerTitle = document.getElementById('mealViewerTitle');
  const mealViewerStage = document.getElementById('mealViewerStage');
  const mealViewerImage = document.getElementById('mealViewerImage');
  const mealZoomOutButton = document.getElementById('mealZoomOut');
  const mealZoomInButton = document.getElementById('mealZoomIn');
  const mealZoomFitButton = document.getElementById('mealZoomFit');
  const mealZoomLabel = document.getElementById('mealZoomLabel');
  const mealDownloadLink = document.getElementById('mealDownload');

  let selectedWeek = getCurrentWeekStart();
  let mealPlan = null;
  let pendingImage = null;
  let displayedImageUrl = '';
  let loadSequence = 0;
  let isBusy = false;
  let imageZoom = 1;
  let viewerBaseScale = 1;
  let viewerPanX = 0;
  let viewerPanY = 0;
  const activePointers = new Map();
  let viewerGesture = null;

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getCurrentWeekStart() {
    const today = new Date();
    const daysSinceMonday = (today.getDay() + 6) % 7;
    today.setDate(today.getDate() - daysSinceMonday);
    today.setHours(0, 0, 0, 0);
    return localDateString(today);
  }

  function dateFromString(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function setStatus(message, type = '') {
    mealStatus.textContent = message;
    mealStatus.dataset.type = type;
  }

  function setBusy(busy) {
    isBusy = busy;
    previousWeekButton.disabled = busy;
    nextWeekButton.disabled = busy;
    choosePhotoButton.disabled = busy;
    uploadPhotoButton.disabled = busy;
    cancelPhotoButton.disabled = busy;
  }

  async function getSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
    return data.session;
  }

  async function requestMealPlan(path = '', options = {}) {
    const session = await getSession();
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...options.headers
      }
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `요청에 실패했습니다. (HTTP ${response.status})`);
    }
    return response;
  }

  function clearPendingImage() {
    pendingImage = null;
    uploadPhotoButton.hidden = true;
    cancelPhotoButton.hidden = true;
    photoInput.value = '';
  }

  function showImageUrl(url) {
    if (displayedImageUrl && displayedImageUrl !== url) {
      URL.revokeObjectURL(displayedImageUrl);
    }
    displayedImageUrl = url;
    mealPhoto.src = url;
    mealDownloadLink.href = url;
    mealDownloadLink.download = `식단표-${selectedWeek}.jpg`;
    mealPhotoFrame.hidden = false;
    mealEmpty.hidden = true;
  }

  function showEmptyState() {
    if (displayedImageUrl) {
      URL.revokeObjectURL(displayedImageUrl);
      displayedImageUrl = '';
    }
    mealPhoto.removeAttribute('src');
    mealDownloadLink.removeAttribute('href');
    mealPhotoFrame.hidden = true;
    mealEmpty.hidden = false;
  }

  function updateViewerImageSize() {
    if (!mealViewerImage.naturalWidth || !mealViewerImage.naturalHeight) return;
    const availableWidth = Math.max(1, mealViewerStage.clientWidth - 24);
    const availableHeight = Math.max(1, mealViewerStage.clientHeight - 24);
    viewerBaseScale = Math.min(
      availableWidth / mealViewerImage.naturalWidth,
      availableHeight / mealViewerImage.naturalHeight,
      1
    );
    const width = Math.max(1, Math.round(mealViewerImage.naturalWidth * viewerBaseScale));
    mealViewerImage.style.width = `${width}px`;
    mealViewerImage.style.height = 'auto';
    updateViewerTransform();
  }

  function updateViewerTransform() {
    clampViewerPan();
    mealViewerImage.style.transform = `translate3d(${viewerPanX}px, ${viewerPanY}px, 0) scale(${imageZoom})`;
    mealZoomLabel.textContent = imageZoom === 1 ? '맞춤' : `${Math.round(imageZoom * 100)}%`;
  }

  function clampViewerPan() {
    const stageWidth = mealViewerStage.clientWidth;
    const stageHeight = mealViewerStage.clientHeight;
    const imageWidth = mealViewerImage.naturalWidth * viewerBaseScale * imageZoom;
    const imageHeight = mealViewerImage.naturalHeight * viewerBaseScale * imageZoom;
    const maxX = Math.max(0, (imageWidth - stageWidth) / 2);
    const maxY = Math.max(0, (imageHeight - stageHeight) / 2);
    viewerPanX = Math.max(-maxX, Math.min(maxX, viewerPanX));
    viewerPanY = Math.max(-maxY, Math.min(maxY, viewerPanY));
  }

  function setImageZoom(zoom) {
    imageZoom = Math.max(0.5, Math.min(4, Math.round(zoom * 100) / 100));
    updateViewerTransform();
  }

  function zoomAroundPoint(zoom, focalX, focalY, startZoom = imageZoom, startPanX = viewerPanX, startPanY = viewerPanY) {
    const nextZoom = Math.max(0.5, Math.min(4, zoom));
    const ratio = nextZoom / startZoom;
    viewerPanX = focalX - (focalX - startPanX) * ratio;
    viewerPanY = focalY - (focalY - startPanY) * ratio;
    imageZoom = nextZoom;
    updateViewerTransform();
  }

  function getStagePoint(clientX, clientY) {
    const bounds = mealViewerStage.getBoundingClientRect();
    return {
      x: clientX - bounds.left - bounds.width / 2,
      y: clientY - bounds.top - bounds.height / 2
    };
  }

  function getPointerDistance(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function beginViewerGesture() {
    const pointers = [...activePointers.values()];
    if (pointers.length >= 2) {
      const [first, second] = pointers;
      viewerGesture = {
        type: 'pinch',
        distance: Math.max(1, getPointerDistance(first, second)),
        zoom: imageZoom,
        panX: viewerPanX,
        panY: viewerPanY,
        focal: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      };
    } else if (pointers.length === 1) {
      const [pointer] = pointers;
      viewerGesture = {
        type: imageZoom > 1 ? 'pan' : 'idle',
        pointerId: pointer.id,
        x: pointer.x,
        y: pointer.y,
        panX: viewerPanX,
        panY: viewerPanY
      };
    } else {
      viewerGesture = null;
    }
  }

  function openImageViewer() {
    if (!displayedImageUrl) return;
    imageZoom = 1;
    viewerPanX = 0;
    viewerPanY = 0;
    mealViewerTitle.textContent = `식단표 · ${selectedWeek}`;
    mealViewerImage.src = displayedImageUrl;
    mealViewer.showModal();
    requestAnimationFrame(updateViewerImageSize);
  }

  async function downloadMealPlanImage(event) {
    const nativeDownloader = window.AndroidMealPlanDownloader;
    if (!nativeDownloader) return;
    event.preventDefault();

    try {
      const image = await fetch(mealDownloadLink.href).then(response => {
        if (!response.ok) throw new Error('사진 파일을 준비하지 못했습니다.');
        return response.blob();
      });
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('사진 파일을 읽지 못했습니다.'));
        reader.readAsDataURL(image);
      });
      nativeDownloader.saveImage(
        dataUrl.slice(dataUrl.indexOf(',') + 1),
        mealDownloadLink.download
      );
    } catch (error) {
      setStatus(error.message || '사진을 다운로드하지 못했습니다.', 'error');
    }
  }

  function updateWeekLabel() {
    const start = dateFromString(selectedWeek);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    weekRange.textContent = `${dateFormatter.format(start)} ~ ${dateFormatter.format(end)}`;
    weekStartLabel.textContent = selectedWeek === getCurrentWeekStart() ? '이번 주' : `${selectedWeek} 시작 주`;
  }

  async function loadMealPlan() {
    const sequence = ++loadSequence;
    updateWeekLabel();
    clearPendingImage();
    mealPlan = null;
    setBusy(true);
    setStatus('식단표를 불러오고 있습니다.');
    showEmptyState();

    try {
      const query = new URLSearchParams({ week: selectedWeek });
      const response = await requestMealPlan(`?${query}`);
      const result = await response.json();
      if (sequence !== loadSequence) return;
      mealPlan = result.mealPlan || null;

      if (!mealPlan) {
        showEmptyState();
        setStatus('이 주에는 아직 등록된 식단표가 없습니다.');
        return;
      }

      setStatus(
        `${mealPlan.uploaded_by_name}님이 ${dateFormatter.format(new Date(mealPlan.uploaded_at))} 등록 · ${(mealPlan.size_bytes / 1024).toFixed(0)}KB`,
        'success'
      );
      const imageResponse = await requestMealPlan(`/image?${query}`);
      const imageUrl = URL.createObjectURL(await imageResponse.blob());
      if (sequence !== loadSequence) {
        URL.revokeObjectURL(imageUrl);
        return;
      }
      showImageUrl(imageUrl);
    } catch (error) {
      if (sequence !== loadSequence) return;
      setStatus(error.message || '식단표를 불러오지 못했습니다.', 'error');
      showEmptyState();
    } finally {
      if (sequence === loadSequence) setBusy(false);
    }
  }

  function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file).then(bitmap => ({
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      }));
    }

    return new Promise((resolve, reject) => {
      const sourceUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(sourceUrl)
      });
      image.onerror = () => {
        URL.revokeObjectURL(sourceUrl);
        reject(new Error('사진을 읽을 수 없습니다. JPEG, PNG 또는 WebP 사진을 선택해 주세요.'));
      };
      image.src = sourceUrl;
    });
  }

  function canvasToJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('사진 압축에 실패했습니다. 다른 사진을 선택해 주세요.'));
      }, 'image/jpeg', quality);
    });
  }

  async function compressImage(file) {
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error('원본 사진이 너무 큽니다. 40MB 이하의 사진을 선택해 주세요.');
    }

    const decoded = await decodeImage(file);
    try {
      if (!decoded.width || !decoded.height) throw new Error('사진 크기를 확인할 수 없습니다.');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('이 기기에서 사진 압축을 지원하지 않습니다.');

      for (let attempt = 0; attempt < 15; attempt += 1) {
        const scale = Math.min(1, 2000 / Math.max(decoded.width, decoded.height)) *
          (0.88 ** Math.floor(attempt / 3));
        canvas.width = Math.max(1, Math.round(decoded.width * scale));
        canvas.height = Math.max(1, Math.round(decoded.height * scale));
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

        const quality = [0.84, 0.76, 0.68][attempt % 3];
        const compressed = await canvasToJpeg(canvas, quality);
        if (compressed.size <= TARGET_IMAGE_BYTES) return compressed;
        if (compressed.size <= 1024 * 1024) return compressed;
      }
      throw new Error('사진을 1MB 이하로 압축하지 못했습니다. 더 작은 사진을 선택해 주세요.');
    } finally {
      decoded.close();
    }
  }

  async function onPhotoSelected() {
    const file = photoInput.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus('사진을 읽고 압축하고 있습니다.');
    try {
      const compressed = await compressImage(file);
      pendingImage = compressed;
      showImageUrl(URL.createObjectURL(compressed));
      uploadPhotoButton.hidden = false;
      cancelPhotoButton.hidden = false;
      setStatus(`업로드할 사진을 준비했습니다. ${(compressed.size / 1024).toFixed(0)}KB`, 'success');
    } catch (error) {
      setStatus(error.message || '사진을 처리하지 못했습니다.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function uploadMealPlan() {
    if (!pendingImage || isBusy) return;
    if (mealPlan && !window.confirm('이 주의 기존 식단표 사진을 새 사진으로 교체할까요?')) return;

    setBusy(true);
    setStatus('식단표 사진을 업로드하고 있습니다.');
    try {
      const query = new URLSearchParams({ week: selectedWeek });
      const response = await requestMealPlan(`?${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: pendingImage
      });
      await response.json();
      clearPendingImage();
      await loadMealPlan();
      setStatus('식단표 사진을 등록했습니다.', 'success');
    } catch (error) {
      setStatus(error.message || '사진 업로드에 실패했습니다.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function moveWeek(offset) {
    if (isBusy) return;
    const nextDate = dateFromString(selectedWeek);
    nextDate.setDate(nextDate.getDate() + offset * 7);
    selectedWeek = localDateString(nextDate);
    loadMealPlan();
  }

  previousWeekButton.addEventListener('click', () => moveWeek(-1));
  nextWeekButton.addEventListener('click', () => moveWeek(1));
  choosePhotoButton.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', onPhotoSelected);
  uploadPhotoButton.addEventListener('click', uploadMealPlan);
  cancelPhotoButton.addEventListener('click', () => {
    clearPendingImage();
    loadMealPlan();
  });
  mealPhoto.addEventListener('click', openImageViewer);
  mealViewerImage.addEventListener('load', updateViewerImageSize);
  mealZoomOutButton.addEventListener('click', () => setImageZoom(imageZoom - 0.25));
  mealZoomInButton.addEventListener('click', () => setImageZoom(imageZoom + 0.25));
  mealZoomFitButton.addEventListener('click', () => {
    setImageZoom(1);
    viewerPanX = 0;
    viewerPanY = 0;
    updateViewerTransform();
  });
  mealDownloadLink.addEventListener('click', downloadMealPlanImage);
  document.getElementById('closeMealViewer').addEventListener('click', () => mealViewer.close());
  mealViewerStage.addEventListener('pointerdown', event => {
    if (event.target.closest('.meal-viewer-zoom-tools')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    mealViewerStage.setPointerCapture(event.pointerId);
    const point = getStagePoint(event.clientX, event.clientY);
    activePointers.set(event.pointerId, { id: event.pointerId, ...point });
    beginViewerGesture();
  });
  mealViewerStage.addEventListener('pointermove', event => {
    const pointer = activePointers.get(event.pointerId);
    if (!pointer || !viewerGesture) return;
    event.preventDefault();
    const point = getStagePoint(event.clientX, event.clientY);
    activePointers.set(event.pointerId, { id: event.pointerId, ...point });

    if (viewerGesture.type === 'pinch' && activePointers.size >= 2) {
      const [first, second] = [...activePointers.values()];
      const focalX = (first.x + second.x) / 2;
      const focalY = (first.y + second.y) / 2;
      const zoom = viewerGesture.zoom *
        getPointerDistance(first, second) / viewerGesture.distance;
      const ratio = zoom / viewerGesture.zoom;
      viewerPanX = focalX - (viewerGesture.focal.x - viewerGesture.panX) * ratio;
      viewerPanY = focalY - (viewerGesture.focal.y - viewerGesture.panY) * ratio;
      imageZoom = Math.max(0.5, Math.min(4, zoom));
      updateViewerTransform();
    } else if (viewerGesture.type === 'pan' && pointer.id === viewerGesture.pointerId) {
      viewerPanX = viewerGesture.panX + point.x - viewerGesture.x;
      viewerPanY = viewerGesture.panY + point.y - viewerGesture.y;
      updateViewerTransform();
    }
  });
  const endViewerPointer = event => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    beginViewerGesture();
  };
  mealViewerStage.addEventListener('pointerup', endViewerPointer);
  mealViewerStage.addEventListener('pointercancel', endViewerPointer);
  mealViewerStage.addEventListener('lostpointercapture', endViewerPointer);
  mealViewer.addEventListener('click', event => {
    if (event.target === mealViewer) mealViewer.close();
  });
  mealViewerStage.addEventListener('wheel', event => {
    event.preventDefault();
    const focal = getStagePoint(event.clientX, event.clientY);
    zoomAroundPoint(imageZoom * (event.deltaY < 0 ? 1.1 : 0.9), focal.x, focal.y);
  }, { passive: false });
  window.addEventListener('resize', () => {
    if (mealViewer.open) updateViewerImageSize();
  });
  window.addEventListener('beforeunload', () => {
    if (displayedImageUrl) URL.revokeObjectURL(displayedImageUrl);
  });

  loadMealPlan();
})();