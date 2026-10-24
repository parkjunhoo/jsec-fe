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
  const pushNotificationToggle = document.getElementById('pushNotificationToggle');
  const pushPreferenceStatus = document.getElementById('pushPreferenceStatus');
  const PUSH_PREFERENCE_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/push/preference';
  const PUSH_SETTINGS_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/push/settings';
  const pushVacationAll = document.getElementById('pushVacationAll');
  const pushVacationMembers = document.getElementById('pushVacationMembers');
  const pushVacationMemberList = document.getElementById('pushVacationMemberList');
  const pushAdminNotifications = document.getElementById('pushAdminNotifications');
  const pushQuietHoursEnabled = document.getElementById('pushQuietHoursEnabled');
  const pushQuietHoursFields = document.getElementById('pushQuietHoursFields');
  const pushQuietHoursStart = document.getElementById('pushQuietHoursStart');
  const pushQuietHoursEnd = document.getElementById('pushQuietHoursEnd');
  const savePushSettings = document.getElementById('savePushSettings');
  const pushSettingsStatus = document.getElementById('pushSettingsStatus');
  const currentUserId = session.user.id;
  const UPDATE_PROFILE_API = `https://jsec-serverless.adobephotoshop.workers.dev/api/users/${encodeURIComponent(currentUserId)}`;
  let pushToken = '';

  function setPushSettingsStatus(message) {
    if (pushSettingsStatus) pushSettingsStatus.textContent = message;
  }

  function syncPushSettingsControls() {
    if (pushVacationMembers) pushVacationMembers.disabled = pushVacationAll.checked;
    if (pushQuietHoursFields) {
      pushQuietHoursFields.classList.toggle('opacity-50', !pushQuietHoursEnabled.checked);
      pushQuietHoursStart.disabled = !pushQuietHoursEnabled.checked;
      pushQuietHoursEnd.disabled = !pushQuietHoursEnabled.checked;
    }
  }

  async function loadPushSettings() {
    if (!pushVacationAll) return;
    setPushSettingsStatus('세부 알림 설정을 불러오는 중...');
    try {
      const response = await fetch(PUSH_SETTINGS_API, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      const settings = result.settings || {};
      pushVacationAll.checked = settings.push_vacation_all === true;
      pushAdminNotifications.checked = settings.push_admin_notifications === true;
      pushQuietHoursEnabled.checked = settings.push_quiet_hours_enabled === true;
      pushQuietHoursStart.value = String(settings.push_quiet_hours_start || '22:00').slice(0, 5);
      pushQuietHoursEnd.value = String(settings.push_quiet_hours_end || '07:00').slice(0, 5);
      pushVacationMemberList.replaceChildren();
      const selectedIds = new Set(settings.push_vacation_user_ids || []);
      (result.members || []).forEach(member => {
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 text-sm text-slate-200';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'h-4 w-4 accent-sky-500';
        input.value = member.id;
        input.checked = selectedIds.has(member.id);
        const text = document.createElement('span');
        text.textContent = `${member.name || member.username || '이름 없음'}${member.work_location ? ` · ${member.work_location}` : ''}`;
        label.append(input, text);
        pushVacationMemberList.append(label);
      });
      if (!pushVacationMemberList.childElementCount) pushVacationMemberList.innerHTML = '<span class="text-xs text-slate-500">선택 가능한 회원이 없습니다.</span>';
      syncPushSettingsControls();
      setPushSettingsStatus('세부 알림 설정을 불러왔습니다.');
    } catch (error) {
      setPushSettingsStatus('세부 알림 설정을 불러오지 못했습니다.');
      console.error('세부 푸시 설정 조회 실패:', error);
    }
  }

  async function savePushSettingsChanges() {
    savePushSettings.disabled = true;
    setPushSettingsStatus('알림 설정을 저장하는 중...');
    try {
      const response = await fetch(PUSH_SETTINGS_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          push_vacation_all: pushVacationAll.checked,
          push_vacation_user_ids: [...pushVacationMemberList.querySelectorAll('input:checked')].map(input => input.value),
          push_admin_notifications: pushAdminNotifications.checked,
          push_quiet_hours_enabled: pushQuietHoursEnabled.checked,
          push_quiet_hours_start: pushQuietHoursStart.value,
          push_quiet_hours_end: pushQuietHoursEnd.value
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setPushSettingsStatus('알림 설정을 저장했습니다.');
    } catch (error) {
      setPushSettingsStatus('알림 설정을 저장하지 못했습니다.');
      await Swal.fire({ icon: 'error', text: `세부 푸시 설정 저장 실패: ${error.message}` });
    } finally {
      savePushSettings.disabled = false;
    }
  }

  pushVacationAll?.addEventListener('change', syncPushSettingsControls);
  pushQuietHoursEnabled?.addEventListener('change', syncPushSettingsControls);
  savePushSettings?.addEventListener('click', savePushSettingsChanges);
  await loadPushSettings();

  function setPushPreferenceStatus(message) {
    if (pushPreferenceStatus) pushPreferenceStatus.textContent = message;
  }

  async function loadPushPreference(token) {
    if (!token || !pushNotificationToggle) return;
    pushToken = token;
    pushNotificationToggle.disabled = true;
    setPushPreferenceStatus('알림 설정을 불러오는 중...');

    try {
      const response = await fetch(
        `${PUSH_PREFERENCE_API}?token=${encodeURIComponent(token)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      pushNotificationToggle.checked = result.enabled;
      pushNotificationToggle.disabled = false;
      setPushPreferenceStatus(result.enabled ? '알림을 받고 있습니다.' : '알림이 꺼져 있습니다.');
    } catch (error) {
      setPushPreferenceStatus('알림 설정을 불러오지 못했습니다.');
      await Swal.fire({ icon: 'error', text: `푸시 설정 조회 실패: ${error.message}` });
    }
  }

  if (pushNotificationToggle) {
    pushNotificationToggle.addEventListener('change', async () => {
      const enabled = pushNotificationToggle.checked;
      pushNotificationToggle.disabled = true;
      setPushPreferenceStatus('설정을 저장하는 중...');

      try {
        const response = await fetch(PUSH_PREFERENCE_API, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ token: pushToken, enabled })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

        setPushPreferenceStatus(enabled ? '알림을 받고 있습니다.' : '알림이 꺼져 있습니다.');
      } catch (error) {
        pushNotificationToggle.checked = !enabled;
        setPushPreferenceStatus('설정을 저장하지 못했습니다.');
        await Swal.fire({ icon: 'error', text: `푸시 설정 저장 실패: ${error.message}` });
      } finally {
        pushNotificationToggle.disabled = false;
      }
    });
  }

  window.addEventListener('native-push-token-ready', event => {
    loadPushPreference(event.detail);
  });
  const existingPushToken = window.getNativePushToken && window.getNativePushToken();
  if (existingPushToken) {
    await loadPushPreference(existingPushToken);
  } else {
    if (pushNotificationToggle) pushNotificationToggle.disabled = true;
    setPushPreferenceStatus('Android 앱에서 이 페이지를 열면 설정할 수 있습니다.');
  }

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

    if (newPassword && (newPassword.length < 4 || newPassword.length > 16)) {
      await Swal.fire({
        icon: 'error',
        text: '비밀번호는 4자리 이상 16자리 이하로 입력해 주세요.'
      });
      return;
    }

    saveBtn.textContent = '저장 중...';
    saveBtn.disabled = true;

    try {
      const { data: { session: activeSession }, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      if (!activeSession?.access_token) {
        throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
      }

      const profileResponse = await fetch(UPDATE_PROFILE_API, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeSession.access_token}`
        },
        body: JSON.stringify({ phone: newPhone })
      });
      const profileResult = await profileResponse.json().catch(() => ({}));
      if (!profileResponse.ok) {
        throw new Error(profileResult.error || `연락처 저장 실패 (HTTP ${profileResponse.status})`);
      }

      // 새 비밀번호를 입력한 경우에만 auth 업데이트
      if (newPassword) {
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