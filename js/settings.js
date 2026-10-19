document.addEventListener('DOMContentLoaded', async () => {
  // 1. 세션 체크
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return;
  }

  const nameInput = document.getElementById('settingName');
  const phoneInput = document.getElementById('settingPhone');
  const passwordInput = document.getElementById('settingPassword');
  const settingsForm = document.getElementById('settingsForm');
  const saveBtn = document.getElementById('saveBtn');

  let currentUserId = session.user.id;

  // 2. 기존 회원 정보 불러오기
  async function loadMyProfile() {
    try {
      const { data, error } = await supabaseClient
        .from('users')
        .select('name, phone')
        .eq('id', currentUserId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        nameInput.value = data.name || '';
        phoneInput.value = data.phone || '';
      }
    } catch (err) {
      console.error('정보 로드 실패:', err);
      await Swal.fire({
        icon: 'error',
        text: '회원 정보를 불러오는 데 실패했습니다.'
      });
    }
  }

  await loadMyProfile();

  // 3. 정보 수정 제출 이벤트
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newPhone = phoneInput.value.trim();
    const newPassword = passwordInput.value.trim();

    saveBtn.textContent = '저장 중...';
    saveBtn.disabled = true;

    try {
      // A. public.users 테이블의 연락처 정보 업데이트
      const { error: dbError } = await supabaseClient
        .from('users')
        .update({ phone: newPhone })
        .eq('id', currentUserId);

      if (dbError) throw dbError;

      // B. 새 비밀번호를 입력한 경우에만 auth 업데이트 (4~16자리 검증 및 정책 반영)
      if (newPassword) {
        if (newPassword.length < 4 || newPassword.length > 16) {
          throw new Error('비밀번호는 4자리 이상 16자리 이하로 입력해 주세요.');
        }

        const securePassword = newPassword + "jsec"; // 백엔드 로그인 정책과 일치시킴
        const { error: authError } = await supabaseClient.auth.updateUser({
          password: securePassword
        });

        if (authError) throw authError;
      }

      await Swal.fire({
        icon: 'success',
        text: '정보가 성공적으로 수정되었습니다.'
      });
      passwordInput.value = ''; // 비밀번호 입력창 초기화

    } catch (err) {
      await Swal.fire({
        icon: 'error',
        text: `수정 실패: ${err.message}`
      });
    } finally {
      saveBtn.textContent = '저장하기';
      saveBtn.disabled = false;
    }
  });
});