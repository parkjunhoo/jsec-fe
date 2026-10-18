document.addEventListener('DOMContentLoaded', async () => {
  // 1. 세션 체크 (supabaseClient 사용)
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.href = '/pages/main.html';
    return;
  }

  const loginForm = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');
  const loginBtn = document.getElementById('loginBtn');

  // 2. 로그인 이벤트
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    errorMessage.style.display = 'none';
    loginBtn.textContent = '로그인 중...';
    loginBtn.disabled = true;

    try {
      const email = `${username}@jsec.com`;

      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
      }

      // 로그인 성공 시 이동
      window.location.href = '/pages/main.html';

    } catch (err) {
      errorMessage.textContent = err.message;
      errorMessage.style.display = 'block';
      loginBtn.textContent = '로그인';
      loginBtn.disabled = false;
    }
  });
});