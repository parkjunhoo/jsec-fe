document.addEventListener('DOMContentLoaded', async () => {
  // 1. 이미 로그인된 세션이 있다면 메인으로 이동
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.href = '/pages/main.html';
    return;
  }

  const loginForm = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');
  const loginBtn = document.getElementById('loginBtn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // 사용자가 입력한 이름/아이디 (예: '박준후')
    const inputName = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    errorMessage.style.display = 'none';
    loginBtn.textContent = '로그인 중...';
    loginBtn.disabled = true;

    try {
      // 2. users 테이블에서 입력받은 이름으로 해당 회원 조회
      const { data: userData, error: userError } = await supabaseClient
        .from('users')
        .select('id, username, name')
        .or(`username.eq.${inputName},name.eq.${inputName}`)
        .maybeSingle();

      if (userError || !userData) {
        throw new Error('존재하지 않는 회원 이름입니다.');
      }

      // 3. 현재 auth에 만들어둔 테스트용 계정 (1@jsec.com)으로 로그인 시도
      const email = '1@jsec.com'; 

      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        throw new Error('비밀번호가 올바르지 않습니다.');
      }

      // 4. 로그인 성공 시 메인 화면으로 이동
      window.location.href = '/pages/main.html';

    } catch (err) {
      errorMessage.textContent = err.message;
      errorMessage.style.display = 'block';
      loginBtn.textContent = '로그인';
      loginBtn.disabled = false;
    }
  });
});