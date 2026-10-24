(() => {
  const MCP_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/mcp';
  const MCP_VERSION = '2025-03-26';
  const PREFERRED_GEMINI_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite'
  ];
  const MUTATION_TOOL_NAMES = new Set([
    'create_my_days_off',
    'update_my_day_off',
    'delete_my_day_off',
    'create_employee_days_off',
    'update_employee_day_off',
    'delete_employee_day_off'
  ]);
  const root = document.createElement('div');
  root.id = 'jsec-ai-chat-widget';
  root.innerHTML = `
    <section class="jsec-ai-chat-panel" id="jsecAiChatPanel" aria-label="AI 챗봇" hidden>
      <header class="jsec-ai-chat-header">
        <div><h2 class="jsec-ai-chat-title">AI 업무 챗봇</h2><p class="jsec-ai-chat-subtitle">날씨·차량·연락망·식단을 조회하고 휴무를 관리합니다.</p></div>
        <button class="jsec-ai-chat-close" id="jsecAiChatClose" type="button" aria-label="채팅 닫기">×</button>
      </header>
      <div class="jsec-ai-chat-messages" id="jsecAiChatMessages" role="log" aria-live="polite"></div>
      <form class="jsec-ai-chat-composer" id="jsecAiChatForm">
        <textarea id="jsecAiChatInput" rows="1" maxlength="2000" placeholder="업무 내용을 입력해 주세요." aria-label="메시지"></textarea>
        <button id="jsecAiChatSend" type="submit">전송</button>
      </form>
    </section>
    <button class="jsec-ai-chat-toggle" id="jsecAiChatToggle" type="button" aria-expanded="false" aria-controls="jsecAiChatPanel" aria-label="AI 챗봇 열기">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.7-3.2A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8.5 11.5h.01m3.49 0h.01m3.49 0h.01"/></svg>
    </button>`;

  const panel = root.querySelector('#jsecAiChatPanel');
  const toggle = root.querySelector('#jsecAiChatToggle');
  const closeButton = root.querySelector('#jsecAiChatClose');
  const messages = root.querySelector('#jsecAiChatMessages');
  const form = root.querySelector('#jsecAiChatForm');
  const input = root.querySelector('#jsecAiChatInput');
  const sendButton = root.querySelector('#jsecAiChatSend');
  let userId = '';
  let apiKey = '';
  let geminiModel = '';
  let enabled = true;
  let tools = [];
  let conversation = [];
  let busy = false;
  let pendingCalls = null;
  let pendingConfirmation = null;
  let pendingIsDirect = false;
  let requestId = 0;
  let pointerDrag = null;
  let ignoreNextToggleClick = false;
  let hasCustomPosition = false;

  function storageKeys() {
    return {
      apiKey: `jsecGeminiApiKey:${userId}`,
      enabled: `jsecAiChatEnabled:${userId}`,
      position: `jsecAiChatPosition:${userId}`
    };
  }

  function placeToggle(left, top, persist = false) {
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - toggle.offsetWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - toggle.offsetHeight - margin);
    const position = {
      left: Math.min(maxLeft, Math.max(margin, left)),
      top: Math.min(maxTop, Math.max(margin, top))
    };
    root.style.left = `${position.left}px`;
    root.style.top = `${position.top}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    hasCustomPosition = true;
    if (persist && userId) {
      try {
        localStorage.setItem(storageKeys().position, JSON.stringify(position));
      } catch (error) {
        console.error('AI 챗봇 버튼 위치 저장 실패:', error);
      }
    }
  }

  function restoreTogglePosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKeys().position) || 'null');
      if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
        placeToggle(saved.left, saved.top);
      }
    } catch (error) {
      console.error('AI 챗봇 버튼 위치를 불러오지 못했습니다:', error);
    }
  }

  function positionPanel() {
    const rect = toggle.getBoundingClientRect();
    const panelWidth = Math.min(390, window.innerWidth - 24);
    const panelHeight = Math.min(590, window.innerHeight - 112);
    const left = rect.left + rect.width / 2 < window.innerWidth / 2
      ? Math.max(12, Math.min(window.innerWidth - panelWidth - 12, rect.left))
      : Math.max(12, Math.min(window.innerWidth - panelWidth - 12, rect.right - panelWidth));
    const top = rect.top + rect.height / 2 > window.innerHeight / 2
      ? Math.max(12, rect.top - panelHeight - 14)
      : Math.min(window.innerHeight - panelHeight - 12, rect.bottom + 14);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function appendMessage(text, role = 'assistant', isError = false) {
    const message = document.createElement('div');
    message.className = `jsec-ai-chat-message${role === 'user' ? ' user' : ''}${isError ? ' error' : ''}`;
    message.textContent = text;
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  }

  function updateControls() {
    const blocked = busy || Boolean(pendingCalls);
    input.disabled = blocked || !apiKey;
    sendButton.disabled = blocked || !apiKey;
  }

  function releaseConversationImages() {
    conversation = conversation.map(content => ({
      ...content,
      parts: content.parts.filter(part => !part.inlineData)
    }));
  }

  function setOpen(isOpen) {
    if (isOpen && !enabled) return;
    panel.hidden = !isOpen;
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'AI 챗봇 닫기' : 'AI 챗봇 열기');
    if (isOpen) positionPanel();
    if (isOpen && apiKey) input.focus();
  }

  function renderNoKeyMessage() {
    messages.replaceChildren();
    const message = appendMessage('Gemini API 키가 등록되어 있지 않습니다. 설정에서 API 키를 등록해 주세요.');
    const settingsLink = document.createElement('a');
    settingsLink.className = 'jsec-ai-chat-settings-link';
    settingsLink.href = '/pages/settings.html#geminiApiKey';
    settingsLink.textContent = '설정에서 API 키 등록하기';
    message.append(document.createElement('br'), settingsLink);
    form.hidden = true;
  }

  function resetConversation() {
    tools = [];
    conversation = [];
    pendingCalls = null;
    pendingConfirmation?.remove();
    pendingConfirmation = null;
    pendingIsDirect = false;
    messages.replaceChildren();
  }

  function refreshSettings() {
    try {
      const keys = storageKeys();
      const savedApiKey = localStorage.getItem(keys.apiKey) || '';
      if (savedApiKey !== apiKey) {
        apiKey = savedApiKey;
        geminiModel = '';
        resetConversation();
      }
      enabled = localStorage.getItem(keys.enabled) !== 'false';
    } catch (error) {
      apiKey = '';
      enabled = false;
      console.error('AI 챗봇 설정을 브라우저에서 읽지 못했습니다:', error);
    }

    root.hidden = !enabled;
    if (!enabled) setOpen(false);
    if (!apiKey && !panel.hidden) renderNoKeyMessage();
    else if (apiKey && !panel.hidden && !messages.childElementCount) {
      form.hidden = false;
      appendMessage('안녕하세요. “12월 5일 휴무 등록해줘”처럼 요청하거나 날씨, 차량, 직원 연락망, 오늘 식단을 물어보세요.');
    }
    updateControls();
  }

  function getTodayKst() {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  function parseDirectLeaveRequest(text) {
    if (!/(휴무|휴가|쉬는\s*날)/.test(text) || !/(등록|추가|잡아|신청|넣어|올려)/.test(text)
      || /(매달|매월|정기적으로|직원|씨|님|에게|대신|대리)/.test(text)) return null;
    if (!/^\s*(?:(?:이번|다음)\s*달\s*)?(?:(20\d{2})\s*년\s*)?(?:(?:1[0-2]|[1-9])\s*월\s*)?(?:3[01]|[12]\d|[1-9])\s*일/.test(text)) {
      return null;
    }

    const datePattern = /(?:(20\d{2})\s*년\s*)?(?:(1[0-2]|[1-9])\s*월\s*)?(3[01]|[12]\d|[1-9])\s*일/g;
    const matches = [...text.matchAll(datePattern)];
    if (!matches.length) return null;

    let inheritedYear = null;
    let inheritedMonth = null;
    let explicitYear = null;
    let explicitMonth = null;
    const dayTokens = [];
    for (const match of matches) {
      const year = match[1] ? Number(match[1]) : inheritedYear;
      const month = match[2] ? Number(match[2]) : inheritedMonth;
      if (match[1]) inheritedYear = Number(match[1]);
      if (match[2]) inheritedMonth = Number(match[2]);
      if (match[1]) explicitYear = Number(match[1]);
      if (match[2]) explicitMonth = Number(match[2]);
      dayTokens.push({ year, month, day: Number(match[3]) });
    }

    const today = getTodayKst();
    const [currentYear, currentMonth, currentDay] = today.split('-').map(Number);
    const useNextMonth = /^\s*다음\s*달/.test(text);
    const useCurrentMonth = /^\s*이번\s*달/.test(text);
    if (dayTokens.some(item => item.month && item.month !== explicitMonth)) return null;
    if (dayTokens.some(item => item.year && item.year !== explicitYear)) return null;

    let month = explicitMonth;
    let year = explicitYear;
    if (!month) {
      if (year) return null;
      month = useNextMonth || (!useCurrentMonth && !dayTokens.every(item => item.day >= currentDay))
        ? currentMonth + 1
        : currentMonth;
      year = currentYear;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    } else if (!year) {
      year = month < currentMonth ? currentYear + 1 : currentYear;
    }

    const dates = dayTokens.map(item => {
      const date = new Date(Date.UTC(year, month - 1, item.day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== item.day) {
        return null;
      }
      return `${year}-${String(month).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`;
    });
    if (dates.some(date => !date)) return { error: '달력에 없는 날짜가 포함되어 있습니다. 날짜를 확인해 주세요.' };
    if (new Set(dates).size !== dates.length) return { error: '같은 날짜가 여러 번 입력되었습니다. 날짜를 확인해 주세요.' };
    if (new Set(dates.map(date => date.slice(0, 7))).size !== 1) return null;
    if (dates.some(date => date < today)) return { error: '이미 지난 날짜에는 휴무를 등록할 수 없습니다.' };
    return { dates };
  }

  function toGeminiSchema(schema) {
    const allowedKeys = ['type', 'description', 'enum', 'required', 'properties', 'items', 'format'];
    return Object.fromEntries(Object.entries(schema || {})
      .filter(([key]) => allowedKeys.includes(key))
      .map(([key, value]) => [key, key === 'type' && typeof value === 'string'
        ? value.toUpperCase()
        : key === 'properties'
          ? Object.fromEntries(Object.entries(value).map(([name, property]) => [name, toGeminiSchema(property)]))
          : key === 'items' ? toGeminiSchema(value) : value]));
  }

  async function getAccessToken() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
    return data.session.access_token;
  }

  async function mcpRequest(method, params = {}) {
    const body = { jsonrpc: '2.0', id: ++requestId, method, params };
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': MCP_VERSION
      },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error?.message || `업무 도구 요청 실패 (HTTP ${response.status})`);
    if (result?.error) throw new Error(result.error.message || '업무 도구를 처리하지 못했습니다.');
    return result?.result;
  }

  async function loadTools() {
    if (tools.length) return;
    const initialized = await mcpRequest('initialize', {
      protocolVersion: MCP_VERSION,
      capabilities: {},
      clientInfo: { name: 'jsec-floating-assistant', version: '1.0.0' }
    });
    if (!initialized?.capabilities?.tools) throw new Error('MCP 업무 도구를 초기화하지 못했습니다.');
    const result = await mcpRequest('tools/list');
    if (!Array.isArray(result?.tools) || !result.tools.length) throw new Error('사용 가능한 업무 도구가 없습니다.');
    tools = result.tools;
  }

  function getSystemPrompt() {
    return [
      '너는 지산리조트 보안팀 업무 챗봇이다. 한국어로 짧고 바로 답한다.',
      '제공된 도구 목록에 관리자 도구가 있으면 관리자로 로그인한 것이다. 관리자 도구가 있을 때만 다른 직원 정보·휴무·근태를 조회하거나 직원 휴무를 관리한다. 관리자 도구가 없으면 본인 데이터만 다룬다.',
      '일반 사용자도 list_team_days_off 도구로 팀 휴무자를 조회할 수 있다. "내일 휴무자 누구야?", "오늘 누가 쉬어?"와 같이 물으면 서울 기준 날짜를 계산해 해당 날짜만 조회하고 이름과 휴무 정보를 안내한다. 팀 일정 조회를 개인 정보 제한으로 거절하지 않는다. 연락처, 근태, 연차 잔액 등 다른 직원 개인정보는 관리자 도구가 있을 때만 조회한다.',
      '휴무 등록 요청은 자연스러운 한국어 날짜를 직접 해석한다. "12월 5일", "5일, 6일, 8일" 같은 요청을 YYYY-MM-DD로 변환하고 형식을 되묻지 않는다. 다른 직원 이름이 요청에 포함되면 관리자 도구가 있을 때에만 직원 대상 도구를 쓴다.',
      '월이 없으면 아래 오늘 날짜 기준으로 가장 가까운 미래 날짜를 쓴다. 여러 날짜 중 하나라도 이미 지났으면 다음 달로 넘긴다. 월/연도를 합리적으로 해석할 수 없을 때만 빠진 정보를 한 번 질문한다.',
      '모든 등록·수정·삭제는 화면에 대상과 날짜를 보여주는 확인 버튼으로 한 번만 승인받는다. 사용자에게 대화로 재확인을 하지 않는다. 도구 호출을 바로 해 확인창을 표시한다.',
      '도구 실행 성공 후 완료라고 답하고, 도구 오류가 난 경우에만 오류를 설명한다.',
      '지원 업무: 팀 휴무자 조회, 본인 휴무 조회·등록·수정·삭제, 본인 근태·연차 조회, 기상청 지산리조트 날씨, 차량 검색, 지산 연락망 검색, 골프장/스키장 주간 식단표 이미지 읽기. 관리자에게는 도구 목록에 표시된 직원 정보·근태·휴무 관리 도구도 제공된다.',
      '주간 식단표 도구가 이미지를 반환하면 이미지의 해당 날짜 메뉴를 읽어 답하고, 사진에서 확인할 수 없는 내용은 추측하지 않는다.',
      '근태는 조회만 가능하다. GPS 좌표·기기 정보 및 로그인 비밀 정보는 조회하지 않는다.',
      `오늘(대한민국 서울 기준)은 ${getTodayKst()}이다.`
    ].join('\n');
  }

  async function callGemini() {
    if (!geminiModel) {
      const modelsResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
        headers: { 'x-goog-api-key': apiKey }
      });
      const modelsResult = await modelsResponse.json().catch(() => ({}));
      if (!modelsResponse.ok) {
        throw new Error(modelsResult.error?.message || `Gemini API 키 확인 실패 (HTTP ${modelsResponse.status})`);
      }
      const availableModels = (modelsResult.models || []).filter(model =>
        (model.supportedGenerationMethods || []).includes('generateContent'));
      const selectedModel = PREFERRED_GEMINI_MODELS
        .map(name => availableModels.find(model => model.name === `models/${name}`))
        .find(Boolean) || availableModels.find(model => /flash/i.test(model.name));
      if (!selectedModel) throw new Error('이 API 키에서 사용할 수 있는 Gemini Flash 모델을 찾지 못했습니다.');
      geminiModel = selectedModel.name.replace(/^models\//, '');
    }
    const declarations = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: toGeminiSchema(tool.inputSchema)
    }));
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: getSystemPrompt() }] },
          contents: conversation,
          tools: [{ functionDeclarations: declarations }],
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          generationConfig: { temperature: 0.2, maxOutputTokens: 1000 }
        })
      }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || `Gemini 요청 실패 (HTTP ${response.status})`);
    const content = result.candidates?.[0]?.content;
    if (!content?.parts) throw new Error('Gemini가 답변을 반환하지 않았습니다.');
    return content;
  }

  function parseToolValue(toolResponse) {
    const text = toolResponse?.content?.find(item => item.type === 'text')?.text;
    if (!text) return toolResponse?.isError ? { isError: true, error: '업무 도구 실행에 실패했습니다.' } : toolResponse;
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      value = text;
    }
    return toolResponse?.isError ? { isError: true, error: value } : value;
  }

  async function runMcpTool(functionCall) {
    const result = await mcpRequest('tools/call', {
      name: functionCall.name,
      arguments: functionCall.args || {}
    });
    const value = parseToolValue(result);
    if (value?.isError) {
      const errorMessage = typeof value.error === 'string' ? value.error : JSON.stringify(value.error);
      throw new Error(errorMessage);
    }
    const imageBase64 = typeof value?.imageBase64 === 'string' ? value.imageBase64 : '';
    const resultValue = imageBase64
      ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'imageBase64'))
      : value;
    const parts = [{
      functionResponse: {
        name: functionCall.name,
        ...(functionCall.id ? { id: functionCall.id } : {}),
        response: { result: resultValue }
      }
    }];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: value.mimeType || 'image/jpeg', data: imageBase64 } });
    }
    return parts;
  }

  function displayDate(date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    return match ? `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일` : date;
  }

  function describeMutation(call) {
    const args = call.args || {};
    const target = args.employee_name || '본인';
    const dates = args.dates || [args.date || args.old_date].filter(Boolean);
    const dateLabel = dates.map(displayDate).join(', ');
    const labels = {
      create_my_days_off: '휴무 등록',
      update_my_day_off: '휴무 수정',
      delete_my_day_off: '휴무 삭제',
      create_employee_days_off: '직원 휴무 등록',
      update_employee_day_off: '직원 휴무 수정',
      delete_employee_day_off: '직원 휴무 삭제'
    };
    const oldDate = args.old_date ? `${displayDate(args.old_date)} 일정 → ` : '';
    return `${labels[call.name] || '일정 변경'} · ${target}${dateLabel ? ` · ${oldDate}${dateLabel}` : ''}`;
  }

  function showConfirmation(calls, isDirect = false) {
    pendingCalls = calls;
    pendingIsDirect = isDirect;
    const confirmation = document.createElement('section');
    confirmation.className = 'jsec-ai-chat-pending';
    confirmation.setAttribute('aria-label', '업무 변경 확인');
    const title = document.createElement('strong');
    title.textContent = '다음 업무를 실행합니다.';
    const list = document.createElement('ul');
    calls.forEach(call => {
      const item = document.createElement('li');
      item.textContent = describeMutation(call);
      list.append(item);
    });
    const actions = document.createElement('div');
    actions.className = 'jsec-ai-chat-pending-actions';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'confirm';
    confirm.textContent = '확인하고 실행';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '취소';
    confirm.addEventListener('click', () => settlePendingCalls(true, confirmation));
    cancel.addEventListener('click', () => settlePendingCalls(false, confirmation));
    actions.append(confirm, cancel);
    confirmation.append(title, list, actions);
    pendingConfirmation = confirmation;
    messages.append(confirmation);
    messages.scrollTop = messages.scrollHeight;
    updateControls();
  }

  async function settlePendingCalls(confirmed, confirmation) {
    const calls = pendingCalls;
    if (!calls || busy) return;
    const isDirect = pendingIsDirect;
    pendingCalls = null;
    pendingConfirmation = null;
    pendingIsDirect = false;
    confirmation.remove();
    busy = true;
    updateControls();
    try {
      if (!confirmed) {
        if (isDirect) {
          appendMessage('요청을 취소했습니다.');
          return;
        }
        conversation.push({
          role: 'user',
          parts: calls.map(call => ({
            functionResponse: {
              name: call.name,
              ...(call.id ? { id: call.id } : {}),
              response: { result: { cancelled: true, message: '사용자가 등록을 취소했습니다.' } }
            }
          }))
        });
        return;
      }
      const responses = [];
      for (const call of calls) {
        try {
          responses.push(...await runMcpTool(call));
        } catch (error) {
          if (isDirect) throw error;
          appendMessage(`업무 실행 실패: ${error.message || '업무 도구 오류'}`, 'assistant', true);
          responses.push({
            functionResponse: {
              name: call.name,
              ...(call.id ? { id: call.id } : {}),
              response: { result: { error: error.message || '업무 도구 실행에 실패했습니다.' } }
            }
          });
        }
      }
      if (isDirect) {
        const total = calls.reduce((sum, call) =>
          sum + (call.name.includes('days_off') ? (call.args?.dates?.length || 0) : 0), 0);
        if (total) appendMessage(`${total}일 휴무 등록을 완료했습니다.`);
        else appendMessage('요청한 변경을 완료했습니다.');
      } else {
        conversation.push({ role: 'user', parts: responses });
      }
    } catch (error) {
      appendMessage(error.message || '휴무를 등록하지 못했습니다.', 'assistant', true);
    } finally {
      busy = false;
      updateControls();
      if (!isDirect && confirmed && apiKey) await continueConversation();
    }
  }

  async function continueConversation() {
    busy = true;
    updateControls();
    try {
      await loadTools();
      for (let turn = 0; turn < 6; turn += 1) {
        const content = await callGemini();
        conversation.push(content);
        const calls = content.parts.filter(part => part.functionCall?.name).map(part => part.functionCall);
        if (!calls.length) {
          const answer = content.parts.map(part => part.text || '').filter(Boolean).join('\n').trim();
          if (!answer) throw new Error('답변 내용이 비어 있습니다.');
          appendMessage(answer);
          releaseConversationImages();
          return;
        }
        if (calls.some(call => MUTATION_TOOL_NAMES.has(call.name))) {
          showConfirmation(calls);
          return;
        }
        const responses = [];
        for (const call of calls) {
          try {
            responses.push(...await runMcpTool(call));
          } catch (error) {
            responses.push({
              functionResponse: {
                name: call.name,
                ...(call.id ? { id: call.id } : {}),
                response: { result: { error: error.message || '업무 도구 실행에 실패했습니다.' } }
              }
            });
          }
        }
        conversation.push({ role: 'user', parts: responses });
      }
      throw new Error('도구 호출이 반복되어 대화를 멈췄습니다. 요청을 나눠서 다시 시도해 주세요.');
    } catch (error) {
      console.error('AI 챗봇 요청 실패:', error);
      appendMessage(error.message || '요청을 처리하지 못했습니다.', 'assistant', true);
    } finally {
      busy = false;
      updateControls();
    }
  }

  toggle.addEventListener('click', () => {
    if (ignoreNextToggleClick) {
      ignoreNextToggleClick = false;
      return;
    }
    const open = panel.hidden;
    if (open) {
      if (!apiKey) renderNoKeyMessage();
      else if (!messages.childElementCount) {
        form.hidden = false;
        appendMessage('안녕하세요. “12월 5일 휴무 등록해줘”처럼 요청하거나 날씨, 차량, 직원 연락망, 오늘 식단을 물어보세요.');
      }
    }
    setOpen(open);
  });
  closeButton.addEventListener('click', () => setOpen(false));
  toggle.addEventListener('pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    pointerDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    toggle.setPointerCapture(event.pointerId);
  });
  toggle.addEventListener('pointermove', event => {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pointerDrag.startX;
    const deltaY = event.clientY - pointerDrag.startY;
    if (!pointerDrag.moved && Math.hypot(deltaX, deltaY) < 6) return;
    if (!pointerDrag.moved) {
      const rect = toggle.getBoundingClientRect();
      pointerDrag.originLeft = rect.left;
      pointerDrag.originTop = rect.top;
      pointerDrag.moved = true;
    }
    placeToggle(pointerDrag.originLeft + deltaX, pointerDrag.originTop + deltaY, false);
    if (!panel.hidden) positionPanel();
    event.preventDefault();
  });
  const finishPointerDrag = event => {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    if (pointerDrag.moved) {
      placeToggle(toggle.getBoundingClientRect().left, toggle.getBoundingClientRect().top, true);
      ignoreNextToggleClick = true;
    }
    pointerDrag = null;
  };
  toggle.addEventListener('pointerup', finishPointerDrag);
  toggle.addEventListener('pointercancel', finishPointerDrag);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !apiKey || busy || pendingCalls) return;
    input.value = '';
    appendMessage(text, 'user');

    const directRequest = parseDirectLeaveRequest(text);
    if (directRequest?.error) {
      appendMessage(directRequest.error, 'assistant', true);
      return;
    }
    if (directRequest?.dates) {
      showConfirmation([{
        name: 'create_my_days_off',
        args: { dates: directRequest.dates },
        id: `direct-${Date.now()}`
      }], true);
      return;
    }

    conversation.push({ role: 'user', parts: [{ text }] });
    await continueConversation();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });
  window.addEventListener('resize', () => {
    if (hasCustomPosition) placeToggle(toggle.getBoundingClientRect().left, toggle.getBoundingClientRect().top);
    if (!panel.hidden) positionPanel();
  });

  window.addEventListener('jsec-ai-settings-changed', refreshSettings);
  window.addEventListener('storage', event => {
    if (userId && Object.values(storageKeys()).includes(event.key)) refreshSettings();
  });

  async function initialize() {
    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (!data.session?.user?.id) return;
      userId = data.session.user.id;
      document.body.append(root);
      restoreTogglePosition();
      refreshSettings();
    } catch (error) {
      console.error('AI 챗봇 로그인 상태 확인 실패:', error);
    }
  }

  initialize();
})();
