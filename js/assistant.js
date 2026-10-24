document.addEventListener('DOMContentLoaded', async () => {
  const API_URL = 'https://jsec-serverless.adobephotoshop.workers.dev/api/mcp';
  const MCP_VERSION = '2025-03-26';
  const SYSTEM_PROMPT = [
    '너는 지산리조트 보안팀 내부 업무 도우미다. 반드시 한국어로 간결하고 정확하게 답한다.',
    '도구를 사용할 때도 로그인한 사용자 본인의 데이터만 다룬다. 다른 직원 정보를 조회하거나 대신 등록할 수 없다.',
    '사용자가 날짜의 월을 말하지 않고 일(day)만 말하면 한국 서울 날짜 기준으로 가장 가까운 미래의 해당 날짜를 사용한다. 여러 날짜가 현재 달에 모두 남아 있으면 현재 달, 하나라도 이미 지났으면 다음 달로 해석한다. 날짜들이 서로 다른 달에 걸리거나 의도가 불분명하면 등록 전에 월을 질문한다.',
    '날짜 도구는 YYYY-MM-DD로 호출한다. 등록 전에 반드시 정확한 연·월·일 목록을 사용자에게 보여주고 명시적 확인을 받아야 한다. 화면의 별도 확인 버튼을 누르기 전에는 등록 도구를 호출하지 않는다.',
    '사용자가 대화에서 전달한 날짜와 실제 도구 인자를 혼동하지 말고, 도구 실행 전후를 명확히 구분한다. 도구 성공 응답을 받은 뒤에만 등록 완료라고 말한다.',
    '연차 잔여 일수 조회, 본인 휴무 조회, 본인 근태 기록 조회도 제공된 도구로 처리한다. 출퇴근 기록은 조회만 가능하며 챗봇으로 출퇴근을 등록하지 않는다.',
    `오늘(대한민국 서울 기준)은 ${new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date())}이다.`
  ].join('\n');

  const apiKeyInput = document.getElementById('assistantApiKey');
  const modelSelect = document.getElementById('assistantModel');
  const connectButton = document.getElementById('assistantConnect');
  const statusLabel = document.getElementById('assistantStatus');
  const messages = document.getElementById('assistantMessages');
  const form = document.getElementById('assistantForm');
  const input = document.getElementById('assistantInput');
  const sendButton = document.getElementById('assistantSend');

  let geminiApiKey = '';
  let accessToken = '';
  let mcpTools = [];
  let conversation = [];
  let pendingFunctionCalls = null;
  let pendingConfirmation = null;
  let requestId = 0;
  let isBusy = false;

  function setStatus(message, state = '') {
    statusLabel.textContent = message;
    statusLabel.dataset.state = state;
  }

  function addMessage(text, role = 'assistant', isError = false) {
    const message = document.createElement('div');
    message.className = `assistant-message${role === 'user' ? ' user' : ''}${isError ? ' error' : ''}`;
    message.textContent = text;
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  }

  function setBusy(busy) {
    isBusy = busy;
    input.disabled = busy || !geminiApiKey || Boolean(pendingFunctionCalls);
    sendButton.disabled = busy || !geminiApiKey || Boolean(pendingFunctionCalls);
    connectButton.disabled = busy;
  }

  async function getAccessToken() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
    accessToken = data.session.access_token;
    return accessToken;
  }

  async function mcpRequest(method, params = {}, hasId = true) {
    const body = { jsonrpc: '2.0', method, params };
    if (hasId) body.id = ++requestId;
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': MCP_VERSION
      },
      body: JSON.stringify(body)
    });
    if (response.status === 202 && !hasId) return null;
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error?.message || result?.error || `MCP 요청 실패 (HTTP ${response.status})`);
    if (result?.error) throw new Error(result.error.message || 'MCP 요청을 처리하지 못했습니다.');
    return result?.result;
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

  async function connectAssistant() {
    const key = apiKeyInput.value.trim();
    if (!key) {
      setStatus('Gemini API 키를 입력해 주세요.', 'error');
      apiKeyInput.focus();
      return;
    }

    connectButton.disabled = true;
    setStatus('API 키와 업무 도구를 확인하고 있습니다.');
    try {
      const model = modelSelect.value;
      const modelsResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
        headers: { 'x-goog-api-key': key }
      });
      const modelsResult = await modelsResponse.json().catch(() => ({}));
      if (!modelsResponse.ok) {
        throw new Error(modelsResult.error?.message || `Gemini API 확인 실패 (HTTP ${modelsResponse.status})`);
      }
      const selectedModel = (modelsResult.models || []).find(item =>
        item.name === `models/${model}` && (item.supportedGenerationMethods || []).includes('generateContent'));
      if (!selectedModel) {
        throw new Error(`이 API 키에서 ${model} 모델을 사용할 수 없습니다. Google AI Studio에서 사용 가능한 모델을 확인해 주세요.`);
      }

      const initialized = await mcpRequest('initialize', {
        protocolVersion: MCP_VERSION,
        capabilities: {},
        clientInfo: { name: 'jsec-web-assistant', version: '1.0.0' }
      });
      if (!initialized?.capabilities?.tools) throw new Error('MCP 업무 도구를 초기화하지 못했습니다.');
      await mcpRequest('notifications/initialized', {}, false);
      const toolResult = await mcpRequest('tools/list');
      if (!Array.isArray(toolResult?.tools) || !toolResult.tools.length) {
        throw new Error('사용 가능한 MCP 업무 도구가 없습니다.');
      }

      mcpTools = toolResult.tools;
      geminiApiKey = key;
      apiKeyInput.value = '';
      apiKeyInput.disabled = true;
      modelSelect.disabled = true;
      connectButton.textContent = '연결 해제';
      input.disabled = false;
      sendButton.disabled = false;
      setStatus(`${model} 연결 완료 · API 키는 메모리에만 유지됩니다.`);
      input.focus();
    } catch (error) {
      console.error('AI 업무 도우미 연결 실패:', error);
      setStatus(error.message || '연결에 실패했습니다.', 'error');
      connectButton.disabled = false;
    }
  }

  function getGeminiFunctionDeclarations() {
    return mcpTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: toGeminiSchema(tool.inputSchema)
    }));
  }

  async function callGemini() {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelSelect.value)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: conversation,
          tools: [{ functionDeclarations: getGeminiFunctionDeclarations() }],
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          generationConfig: { temperature: 0.2, maxOutputTokens: 1200 }
        })
      }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error?.message || `Gemini 요청 실패 (HTTP ${response.status})`);
    }
    const candidate = result.candidates?.[0];
    if (!candidate?.content?.parts) throw new Error('Gemini가 답변을 반환하지 않았습니다.');
    return candidate.content;
  }

  function parseToolValue(toolResponse) {
    const text = toolResponse?.content?.find(item => item.type === 'text')?.text;
    if (!text) return toolResponse?.isError
      ? { isError: true, error: '업무 도구 실행에 실패했습니다.' }
      : toolResponse;
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
    return {
      functionResponse: {
        name: functionCall.name,
        ...(functionCall.id ? { id: functionCall.id } : {}),
        response: { result: parseToolValue(result) }
      }
    };
  }

  function formatPendingCall(call) {
    if (call.name === 'create_my_days_off') {
      const dates = Array.isArray(call.args?.dates) ? call.args.dates : [];
      if (!dates.length) return '등록 날짜를 확인할 수 없습니다.';
      return `본인 휴무 ${dates.map(date => {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
        return match ? `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일` : String(date);
      }).join(', ')}`;
    }
    return `${call.name} 도구 실행`;
  }

  function showConfirmation(functionCalls) {
    pendingFunctionCalls = functionCalls;
    const confirmation = document.createElement('section');
    confirmation.className = 'assistant-pending';
    pendingConfirmation = confirmation;
    confirmation.setAttribute('aria-label', '업무 변경 확인');
    const title = document.createElement('strong');
    title.textContent = '실행 전에 확인해 주세요';
    const list = document.createElement('ul');
    functionCalls.forEach(call => {
      const item = document.createElement('li');
      item.textContent = formatPendingCall(call);
      list.append(item);
    });
    const actions = document.createElement('div');
    actions.className = 'assistant-pending-actions';
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
    messages.append(confirmation);
    messages.scrollTop = messages.scrollHeight;
    input.disabled = true;
    sendButton.disabled = true;
  }

  async function settlePendingCalls(confirmed, confirmation) {
    const calls = pendingFunctionCalls;
    if (!calls || isBusy) return;
    pendingFunctionCalls = null;
    pendingConfirmation = null;
    confirmation.remove();
    setBusy(true);
    setStatus(confirmed ? '확인한 업무를 처리하고 있습니다.' : '취소 내용을 반영하고 있습니다.');
    const functionResponses = [];
    for (const call of calls) {
      if (!confirmed) {
        functionResponses.push({
          functionResponse: {
            name: call.name,
            ...(call.id ? { id: call.id } : {}),
            response: { result: { cancelled: true, message: '사용자가 실행을 취소했습니다.' } }
          }
        });
        continue;
      }
      try {
        const result = await runMcpTool(call);
        functionResponses.push(result);
        if (call.name === 'create_my_days_off') addMessage(`${formatPendingCall(call)} 등록을 완료했습니다.`);
      } catch (error) {
        addMessage(`${formatPendingCall(call)} 실행에 실패했습니다: ${error.message || '업무 도구 오류'}`, 'assistant', true);
        functionResponses.push({
          functionResponse: {
            name: call.name,
            ...(call.id ? { id: call.id } : {}),
            response: { result: { error: error.message || '업무 도구 실행에 실패했습니다.' } }
          }
        });
      }
    }
    conversation.push({ role: 'user', parts: functionResponses });
    setBusy(false);
    if (!confirmed) addMessage('요청을 취소했습니다.');
    await continueConversation();
  }

  function disconnectAssistant() {
    geminiApiKey = '';
    mcpTools = [];
    conversation = [];
    pendingFunctionCalls = null;
    pendingConfirmation?.remove();
    pendingConfirmation = null;
    apiKeyInput.disabled = false;
    modelSelect.disabled = false;
    connectButton.textContent = '연결';
    input.value = '';
    input.disabled = true;
    sendButton.disabled = true;
    messages.replaceChildren();
    addMessage('연결을 해제했습니다. API 키와 대화 내용은 저장하지 않았습니다.');
    setStatus('Gemini API 키를 입력해 연결해 주세요.');
  }

  async function continueConversation() {
    setBusy(true);
    setStatus('답변을 생성하고 있습니다.');
    try {
      for (let turn = 0; turn < 6; turn += 1) {
        const modelContent = await callGemini();
        conversation.push(modelContent);
        const functionCalls = modelContent.parts
          .filter(part => part.functionCall?.name)
          .map(part => part.functionCall);
        if (!functionCalls.length) {
          const text = modelContent.parts.map(part => part.text || '').filter(Boolean).join('\n').trim();
          if (text) addMessage(text);
          else throw new Error('답변 내용이 비어 있습니다.');
          setStatus('연결됨 · 입력 내용은 사이트에 저장되지 않습니다.');
          return;
        }
        if (functionCalls.some(call => call.name === 'create_my_days_off')) {
          showConfirmation(functionCalls);
          return;
        }
        const functionResponses = [];
        for (const functionCall of functionCalls) {
          try {
            functionResponses.push(await runMcpTool(functionCall));
          } catch (error) {
            functionResponses.push({
              functionResponse: {
                name: functionCall.name,
                ...(functionCall.id ? { id: functionCall.id } : {}),
                response: { result: { error: error.message || '업무 도구 실행에 실패했습니다.' } }
              }
            });
          }
        }
        conversation.push({ role: 'user', parts: functionResponses });
      }
      throw new Error('도구 호출이 반복되어 대화를 멈췄습니다. 요청을 나눠서 다시 시도해 주세요.');
    } catch (error) {
      console.error('AI 업무 도우미 요청 실패:', error);
      addMessage(error.message || '요청을 처리하지 못했습니다.', 'assistant', true);
    } finally {
      setBusy(false);
      if (geminiApiKey && statusLabel.dataset.state !== 'error') {
        setStatus('연결됨 · API 키와 대화 내용은 사이트에 저장되지 않습니다.');
      }
    }
  }

  connectButton.addEventListener('click', () => {
    if (geminiApiKey) disconnectAssistant();
    else connectAssistant();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !geminiApiKey || isBusy || pendingFunctionCalls) return;
    input.value = '';
    addMessage(text, 'user');
    conversation.push({ role: 'user', parts: [{ text }] });
    setBusy(true);
    await continueConversation();
  });
  apiKeyInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !geminiApiKey) {
      event.preventDefault();
      connectAssistant();
    }
  });

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      window.location.replace('/index.html');
      return;
    }
  } catch (error) {
    console.error('AI 업무 도우미 세션 확인 실패:', error);
    setStatus('로그인 상태를 확인하지 못했습니다. 페이지를 새로고침해 주세요.', 'error');
  }
});
