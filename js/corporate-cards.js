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
  const exportReportButton = document.getElementById('exportReport');
  const reportStartInput = document.getElementById('reportStart');
  const reportEndInput = document.getElementById('reportEnd');
  const categoryChart = document.getElementById('categoryChart');
  const dailyChart = document.getElementById('dailyChart');
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

  function formatDateInput(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function setReportPeriodFromMonth() {
    const [year, month] = monthFilter.value.split('-').map(Number);
    if (!year || !month) return;
    reportStartInput.value = formatDateInput(new Date(year, month - 1, 1));
    reportEndInput.value = formatDateInput(new Date(year, month, 0));
  }

  function formatCompactMoney(value) {
    if (value >= 100000000) return `${(value / 100000000).toFixed(value % 100000000 ? 1 : 0)}억`;
    if (value >= 10000) return `${(value / 10000).toFixed(value % 10000 ? 1 : 0)}만`;
    return amountFormatter.format(value);
  }

  function renderCharts(visible) {
    const monthLabel = monthFilter.value || '전체 기간';
    document.getElementById('categoryChartNote').textContent = monthLabel;
    document.getElementById('dailyChartNote').textContent = monthLabel;

    if (!visible.length) {
      categoryChart.innerHTML = '<div class="cards-chart-empty">표시할 사용 내역이 없습니다.</div>';
      dailyChart.innerHTML = '<div class="cards-chart-empty">내역을 등록하면 일자별 추이가 표시됩니다.</div>';
      return;
    }

    const categoryTotals = new Map();
    for (const entry of visible) {
      categoryTotals.set(entry.category, (categoryTotals.get(entry.category) || 0) + Number(entry.amount));
    }
    const sortedCategories = [...categoryTotals.entries()]
      .sort((first, second) => second[1] - first[1]);
    const categories = sortedCategories.length > 6
      ? [
        ...sortedCategories.slice(0, 5),
        ['기타 항목', sortedCategories.slice(5).reduce((sum, [, amount]) => sum + amount, 0)]
      ]
      : sortedCategories;
    const largestCategory = Math.max(...categories.map(([, amount]) => amount), 1);
    categoryChart.innerHTML = categories.map(([category, amount]) => `
      <div class="cards-category-item">
        <span class="cards-category-name" title="${escapeHtml(category)}">${escapeHtml(category)}</span>
        <span class="cards-category-track" aria-hidden="true"><span class="cards-category-fill" style="width:${Math.max(2, amount / largestCategory * 100)}%"></span></span>
        <span class="cards-category-value">${formatCompactMoney(amount)}원</span>
      </div>`).join('');

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthFilter.value)) {
      dailyChart.innerHTML = '<div class="cards-chart-empty">일자별 추이를 보려면 조회 월을 선택해 주세요.</div>';
      return;
    }
    const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthFilter.value)
      ? monthFilter.value
      : new Date().toISOString().slice(0, 7);
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyTotals = Array(daysInMonth).fill(0);
    for (const entry of visible) {
      if (entry.spent_on.startsWith(`${selectedMonth}-`)) {
        const day = Number(entry.spent_on.slice(8, 10));
        if (day >= 1 && day <= daysInMonth) dailyTotals[day - 1] += Number(entry.amount);
      }
    }

    const width = 720;
    const height = 180;
    const left = 50;
    const right = 12;
    const top = 12;
    const bottom = 28;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxValue = Math.max(...dailyTotals, 1);
    const axisMax = Math.max(10000, Math.ceil(maxValue / 4 / 10000) * 10000) * 4;
    const points = dailyTotals.map((amount, index) => ({
      x: left + (daysInMonth === 1 ? plotWidth / 2 : index * plotWidth / (daysInMonth - 1)),
      y: top + plotHeight - (amount / axisMax) * plotHeight,
      amount,
      day: index + 1
    }));
    const line = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const areaPath = `M ${points[0].x.toFixed(1)} ${top + plotHeight} L ${line.replace(/,/g, ' ')} L ${points[points.length - 1].x.toFixed(1)} ${top + plotHeight} Z`;
    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = axisMax * (4 - index) / 4;
      const y = top + plotHeight * index / 4;
      return `<line class="cards-chart-gridline" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"></line><text class="cards-chart-axis" x="${left - 7}" y="${y + 3}" text-anchor="end">${escapeHtml(formatCompactMoney(value))}</text>`;
    }).join('');
    const labelDays = new Set([1, 5, 10, 15, 20, 25, daysInMonth]);
    const labels = points.filter(point => labelDays.has(point.day)).map(point =>
      `<text class="cards-chart-axis" x="${point.x}" y="${height - 6}" text-anchor="middle">${point.day}일</text>`
    ).join('');
    const markers = points.filter(point => point.amount > 0).map(point =>
      `<circle class="cards-chart-point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.2"><title>${point.day}일 · ${amountFormatter.format(point.amount)}원</title></circle>`
    ).join('');
    dailyChart.innerHTML = `<svg class="cards-daily-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(selectedMonth)} 일자별 법인카드 사용 금액 그래프">
      <defs><linearGradient id="cardsChartArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#46a276" stop-opacity=".3"></stop><stop offset="100%" stop-color="#46a276" stop-opacity=".02"></stop></linearGradient></defs>
      ${grid}<path class="cards-chart-area" d="${areaPath}"></path><polyline class="cards-chart-line" points="${line}"></polyline>${markers}${labels}
    </svg>`;
  }

  function setStatus(message, type = '') {
    statusMessage.textContent = message;
    statusMessage.dataset.type = type;
  }

  function setExportStatus(message, type = '') {
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

  async function createReceiptThumbnail(entry, index, total) {
    const response = await request(`/${encodeURIComponent(entry.id)}/receipt`);
    const source = await createImageBitmap(await response.blob());
    try {
      const maxWidth = 240;
      const maxHeight = 300;
      const scale = Math.min(1, maxWidth / source.width, maxHeight / source.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('영수증 축소 이미지를 만들 수 없습니다.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const thumbnail = await new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob
          ? resolve(blob)
          : reject(new Error('영수증 축소 이미지 변환에 실패했습니다.')), 'image/jpeg', 0.72);
      });
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('영수증 이미지를 읽지 못했습니다.'));
        reader.readAsDataURL(thumbnail);
      });
      setExportStatus(`보고서 작성 중 · 영수증 사진 ${index}/${total}개 처리`);
      return base64;
    } finally {
      source.close();
    }
  }

  function addReportHeading(sheet, startDate, endDate, entries) {
    const lastRow = 8 + entries.length;
    const totalAmount = entries.reduce((sum, entry) => sum + Number(entry.amount), 0);
    const receiptCount = entries.filter(entry => entry.receipt_size_bytes).length;
    sheet.mergeCells('A1:H1');
    sheet.getCell('A1').value = '법인카드 사용 내역 보고서';
    sheet.getCell('A1').font = { name: '맑은 고딕', size: 21, bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(1).height = 42;
    sheet.getRow(1).eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18392F' } }; });

    sheet.mergeCells('A2:H2');
    sheet.getCell('A2').value = 'JISAN SECURITY TEAM  |  본사 제출용 공식 정산 자료';
    sheet.getCell('A2').font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF577064' } };
    sheet.getRow(2).height = 22;

    sheet.mergeCells('A3:F3');
    sheet.getCell('A3').value = `보고 기간  ${startDate}  ~  ${endDate}`;
    sheet.getCell('A3').font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FF18392F' } };
    sheet.getCell('A3').alignment = { vertical: 'middle', indent: 1 };
    sheet.mergeCells('G3:H3');
    sheet.getCell('G3').value = `작성일  ${formatDateInput(new Date())}`;
    sheet.getCell('G3').font = { name: '맑은 고딕', size: 9, color: { argb: 'FF65756D' } };
    sheet.getCell('G3').alignment = { vertical: 'middle', horizontal: 'right' };
    sheet.getRow(3).height = 26;

    const summary = [
      { label: '총 사용 건수', range: 'A5:B5', valueRange: 'A6:B6', value: `${entries.length} 건` },
      { label: '총 사용 금액', range: 'C5:E5', valueRange: 'C6:E6', value: `${amountFormatter.format(totalAmount)} 원` },
      { label: '영수증 첨부', range: 'F5:H5', valueRange: 'F6:H6', value: `${receiptCount} / ${entries.length} 건` }
    ];
    for (const item of summary) {
      sheet.mergeCells(item.range);
      sheet.mergeCells(item.valueRange);
      const labelCell = sheet.getCell(item.range.split(':')[0]);
      const valueCell = sheet.getCell(item.valueRange.split(':')[0]);
      labelCell.value = item.label;
      labelCell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: 'FF65756D' } };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F1' } };
      valueCell.value = item.value;
      valueCell.font = { name: '맑은 고딕', size: 15, bold: true, color: { argb: 'FF18392F' } };
      valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
      valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F1' } };
      for (const range of [item.range, item.valueRange]) {
        sheet.getCell(range.split(':')[0]).border = {
          top: { style: 'thin', color: { argb: 'FFD8E2DC' } },
          bottom: { style: 'thin', color: { argb: 'FFD8E2DC' } },
          left: { style: 'thin', color: { argb: 'FFD8E2DC' } },
          right: { style: 'thin', color: { argb: 'FFD8E2DC' } }
        };
      }
    }
    sheet.getRow(5).height = 20;
    sheet.getRow(6).height = 31;
    sheet.mergeCells('A7:H7');
    sheet.getCell('A7').value = '※ 사용 내역별 영수증 이미지를 첨부했습니다. 영수증 미첨부 건은 사용자가 입력한 내역을 기준으로 확인해 주세요.';
    sheet.getCell('A7').font = { name: '맑은 고딕', size: 8, color: { argb: 'FF65756D' }, italic: true };
    sheet.getCell('A7').alignment = { vertical: 'middle', wrapText: true };
    sheet.getRow(7).height = 25;

    const headers = ['No.', '영수증', '사용일', '가맹점', '사용 내역 / 목적', '사용자', '항목', '사용 금액 (원)'];
    const headerRow = sheet.getRow(8);
    headerRow.values = headers;
    headerRow.height = 26;
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF244E40' } };
      cell.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF244E40' } },
        bottom: { style: 'thin', color: { argb: 'FF244E40' } },
        left: { style: 'thin', color: { argb: 'FF769388' } },
        right: { style: 'thin', color: { argb: 'FF769388' } }
      };
    });

    sheet.columns = [
      { key: 'number', width: 5 },
      { key: 'receipt', width: 18 },
      { key: 'spent_on', width: 13 },
      { key: 'merchant', width: 19 },
      { key: 'memo', width: 30 },
      { key: 'cardholder', width: 12 },
      { key: 'category', width: 12 },
      { key: 'amount', width: 16 }
    ];
    sheet.autoFilter = { from: 'A8', to: `H${lastRow}` };
    sheet.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];
    return lastRow;
  }

  async function downloadReport() {
    if (exportReportButton.disabled) return;
    const startDate = reportStartInput.value;
    const endDate = reportEndInput.value;
    if (!startDate || !endDate || startDate > endDate) {
      setExportStatus('보고 시작일과 종료일을 올바르게 선택해 주세요.', 'error');
      return;
    }
    if (!window.ExcelJS?.Workbook) {
      setExportStatus('엑셀 보고서 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.', 'error');
      return;
    }

    exportReportButton.disabled = true;
    const originalLabel = exportReportButton.innerHTML;
    exportReportButton.textContent = '내역을 조회하고 있습니다…';
    try {
      const query = new URLSearchParams({ from: startDate, to: endDate });
      const response = await request(`?${query}`);
      const result = await response.json();
      if (result.hasMore) {
        throw new Error('선택한 기간의 내역이 1,000건을 초과합니다. 기간을 나누어 다시 내보내 주세요.');
      }
      const reportEntries = Array.isArray(result.entries) ? result.entries : [];
      if (!reportEntries.length) {
        throw new Error('선택한 기간에 내보낼 법인카드 내역이 없습니다.');
      }

      const workbook = new window.ExcelJS.Workbook();
      workbook.creator = '지산리조트 보안팀';
      workbook.subject = '법인카드 사용 내역 및 영수증 보고';
      workbook.title = '법인카드 사용 내역 보고서';
      workbook.created = new Date();
      workbook.modified = new Date();
      workbook.properties.date1904 = false;

      const sheet = workbook.addWorksheet('법인카드 보고서', {
        properties: { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } },
        pageSetup: {
          paperSize: 9,
          orientation: 'portrait',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          horizontalDpi: 300,
          verticalDpi: 300,
          margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
          printArea: `A1:H${8 + reportEntries.length + 5}`,
          printTitlesRow: '8:8'
        },
        headerFooter: {
          oddFooter: '&L지산리조트 보안팀&C법인카드 사용 내역 보고서&R페이지 &P / &N'
        },
        views: [{ state: 'frozen', ySplit: 8, showGridLines: false }]
      });
      const lastRow = addReportHeading(sheet, startDate, endDate, reportEntries);
      for (let index = 0; index < reportEntries.length; index += 1) {
        const entry = reportEntries[index];
        const rowNumber = 9 + index;
        const row = sheet.getRow(rowNumber);
        row.values = [
          index + 1,
          entry.receipt_size_bytes ? '영수증 첨부' : '미첨부',
          entry.spent_on,
          entry.merchant,
          entry.memo?.trim() || `${entry.category} 사용 내역`,
          entry.cardholder,
          entry.category,
          Number(entry.amount)
        ];
        row.height = entry.receipt_size_bytes ? 76 : 54;
        row.eachCell((cell, columnNumber) => {
          cell.font = { name: '맑은 고딕', size: 9, color: { argb: 'FF26362F' } };
          cell.alignment = {
            vertical: 'middle',
            horizontal: columnNumber === 8 ? 'right' : (columnNumber === 1 || columnNumber === 2 || columnNumber === 3 || columnNumber === 6 || columnNumber === 7 ? 'center' : 'left'),
            wrapText: true,
            indent: columnNumber === 4 || columnNumber === 5 ? 1 : 0
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE1E8E3' } },
            bottom: { style: 'thin', color: { argb: 'FFE1E8E3' } },
            left: { style: 'thin', color: { argb: 'FFE8EDE9' } },
            right: { style: 'thin', color: { argb: 'FFE8EDE9' } }
          };
          if (index % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9F7' } };
          }
        });
        row.getCell(3).numFmt = 'yyyy-mm-dd';
        row.getCell(8).numFmt = '#,##0';
        if (entry.receipt_size_bytes) {
          setExportStatus(`보고서 작성 중 · 영수증 사진 ${index + 1}/${reportEntries.filter(item => item.receipt_size_bytes).length}개 처리`);
          try {
            const imageBase64 = await createReceiptThumbnail(
              entry,
              reportEntries.slice(0, index + 1).filter(item => item.receipt_size_bytes).length,
              reportEntries.filter(item => item.receipt_size_bytes).length
            );
            const imageId = workbook.addImage({ base64: imageBase64, extension: 'jpeg' });
            sheet.addImage(imageId, {
              tl: { col: 1.12, row: rowNumber - 1 + 0.08 },
              ext: { width: 112, height: 84 },
              editAs: 'oneCell'
            });
          } catch (error) {
            throw new Error(`${entry.spent_on} ${entry.merchant} 영수증을 보고서에 넣지 못했습니다. ${error.message}`);
          }
        } else {
          row.getCell(2).font = { name: '맑은 고딕', size: 9, color: { argb: 'FF8A7560' }, italic: true };
        }
      }

      const approvalStart = lastRow + 2;
      sheet.mergeCells(`A${approvalStart}:B${approvalStart}`);
      sheet.getCell(`A${approvalStart}`).value = '제출 확인';
      sheet.getCell(`A${approvalStart}`).font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FF18392F' } };
      sheet.getCell(`A${approvalStart}`).alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.mergeCells(`C${approvalStart}:E${approvalStart}`);
      sheet.getCell(`C${approvalStart}`).value = '작성자';
      sheet.getCell(`C${approvalStart}`).font = { name: '맑은 고딕', size: 9, color: { argb: 'FF65756D' } };
      sheet.getCell(`C${approvalStart}`).alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.mergeCells(`F${approvalStart}:G${approvalStart}`);
      sheet.getCell(`F${approvalStart}`).value = '확인자';
      sheet.getCell(`F${approvalStart}`).font = { name: '맑은 고딕', size: 9, color: { argb: 'FF65756D' } };
      sheet.getCell(`F${approvalStart}`).alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.getCell(`H${approvalStart}`).value = '결재';
      sheet.getCell(`H${approvalStart}`).font = { name: '맑은 고딕', size: 9, color: { argb: 'FF65756D' } };
      sheet.getCell(`H${approvalStart}`).alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.getRow(approvalStart).height = 24;
      const signatureRow = approvalStart + 1;
      sheet.mergeCells(`A${signatureRow}:B${signatureRow}`);
      sheet.getCell(`A${signatureRow}`).value = `보고 기간  ${startDate} ~ ${endDate}`;
      sheet.mergeCells(`C${signatureRow}:E${signatureRow}`);
      sheet.mergeCells(`F${signatureRow}:G${signatureRow}`);
      sheet.getCell(`H${signatureRow}`).value = ' (인)';
      sheet.getCell(`H${signatureRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      for (let column = 1; column <= 8; column += 1) {
        const cell = sheet.getRow(signatureRow).getCell(column);
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD8E2DC' } },
          bottom: { style: 'thin', color: { argb: 'FFD8E2DC' } },
          left: { style: 'thin', color: { argb: 'FFD8E2DC' } },
          right: { style: 'thin', color: { argb: 'FFD8E2DC' } }
        };
      }
      sheet.getRow(signatureRow).height = 48;
      sheet.pageSetup.printArea = `A1:H${signatureRow}`;

      setExportStatus('엑셀 파일을 만들고 있습니다.');
      const fileData = await workbook.xlsx.writeBuffer();
      const fileName = `법인카드_사용내역보고서_${startDate.replace(/-/g, '')}-${endDate.replace(/-/g, '')}.xlsx`;
      if (window.AndroidExcelExporter) {
        const bytes = new Uint8Array(fileData);
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        const base64 = btoa(binary);
        if (base64.length > 14 * 1024 * 1024) {
          throw new Error('보고서 파일이 앱 저장 한도를 초과했습니다. 기간을 나누어 다시 내보내 주세요.');
        }
        window.AndroidExcelExporter.saveExcel(base64, fileName);
      } else {
        const blob = new Blob([fileData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
      setExportStatus(`${reportEntries.length}건의 법인카드 사용 내역을 엑셀 보고서로 내보냈습니다.`, 'success');
    } catch (error) {
      setExportStatus(error.message || '엑셀 보고서를 만들지 못했습니다.', 'error');
    } finally {
      exportReportButton.disabled = false;
      exportReportButton.innerHTML = originalLabel;
    }
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
    renderCharts(visible);
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
      exportReportButton.hidden = !isAdmin && result.role !== 'guest';
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
  monthFilter.addEventListener('change', () => {
    setReportPeriodFromMonth();
    loadEntries();
  });
  exportReportButton.addEventListener('click', downloadReport);
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

  setReportPeriodFromMonth();
  loadEntries();
})();
