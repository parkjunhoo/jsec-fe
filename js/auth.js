document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (session) {
      const destination = window.consumeNativePushDestination?.();
      window.location.replace(destination || '/pages/main.html');
      return;
    }
  } catch (err) {
    console.error('세션 확인 오류:', err);
  }

  const loginForm = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const errorMessage = document.getElementById('errorMessage');
  if (new URLSearchParams(window.location.search).get('session') === 'expired') {
    showError('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  const WORKER_LOGIN_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/login';

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();

      if (!username || !password) {
        showError('이름과 비밀번호를 모두 입력해 주세요.');
        return;
      }

      loginBtn.textContent = '로그인 중...';
      loginBtn.disabled = true;
      errorMessage.style.display = 'none';

      try {
        // 백엔드 로그인 API 호출 (RLS 우회 및 이름 기반 이메일 매핑 처리)
        const response = await fetch(WORKER_LOGIN_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || '로그인에 실패했습니다.');
        }

        // 백엔드에서 받아온 세션 토큰을 프론트엔드 Supabase 클라이언트에 세팅
        const { error: sessionError } = await supabaseClient.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token
        });

        if (sessionError) throw sessionError;

        const destination = window.consumeNativePushDestination?.();
        window.location.replace(destination || '/pages/main.html');

      } catch (err) {
        showError(err.message);
      } finally {
        loginBtn.textContent = '로그인';
        loginBtn.disabled = false;
      }
    });
  }

  function showError(msg) {
    if (errorMessage) {
      errorMessage.textContent = msg;
      errorMessage.style.display = 'block';
    }
  }
});