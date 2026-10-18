document.addEventListener('DOMContentLoaded', async () => {
  // 1. 이미 로그인된 상태라면 바로 메인 페이지로 이동
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = '/pages/main.html';
    return;
  }

  const loginForm = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');
  const loginBtn = document.getElementById('loginBtn');

  // 2. 로그인 폼 제출 이벤트 처리
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    // UI 상태 초기화
    errorMessage.style.display = 'none';
    loginBtn.textContent = '로그인 중...';
    loginBtn.disabled = true;

    try {
      // 사내 ID 규격 (username@jsec.com)
      const email = `${username}@jsec.com`;

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
      }

      // 로그인 성공 시 메인 메뉴 페이지로 이동
      window.location.href = '/pages/main.html';

    } catch (err) {
      errorMessage.textContent = err.message;
      errorMessage.style.display = 'block';
      loginBtn.textContent = '로그인';
      loginBtn.disabled = false;
    }
  });
});