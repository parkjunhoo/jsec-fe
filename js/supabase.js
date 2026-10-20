// 실제 Supabase 설정 적용 완료
const SUPABASE_URL = 'https://nihsmjfcriqeuflujrrh.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hM0gN_gaG4d86oT9k-laRg_KOmfqrn8';                

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: window.localStorage
  }
});

const PUSH_TOKEN_API = 'https://jsec-serverless.adobephotoshop.workers.dev/api/push/register';
let nativePushToken = '';
const notificationDestinationKey = 'jsec-pending-notification-destination';
const notificationDestinations = {
  calendar: '/pages/calendar.html',
  'item-requests': '/pages/item-requests.html',
  main: '/pages/main.html'
};
let hasAuthenticatedSession = false;
let intentionalSignOutPending = false;

window.onNativePushDestination = async destination => {
  const path = notificationDestinations[destination];
  if (!path) return;

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data.session) {
      window.location.replace(path);
      return;
    }
    sessionStorage.setItem(notificationDestinationKey, path);
    if (window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
      window.location.replace('/index.html');
    }
  } catch (error) {
    console.error('푸시 알림 이동 전 세션 확인 오류:', error);
  }
};

window.consumeNativePushDestination = () => {
  const path = sessionStorage.getItem(notificationDestinationKey);
  sessionStorage.removeItem(notificationDestinationKey);
  return Object.values(notificationDestinations).includes(path) ? path : null;
};

window.markIntentionalSignOut = (pending = true) => {
  intentionalSignOutPending = pending;
};

async function syncNativePushToken(session) {
  if (!nativePushToken || !session) return;

  try {
    const response = await fetch(PUSH_TOKEN_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ token: nativePushToken })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('푸시 토큰 등록 오류:', error);
  }
}

window.onNativePushToken = async token => {
  if (typeof token !== 'string' || !token) return;
  nativePushToken = token;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    await syncNativePushToken(data.session);
    window.dispatchEvent(new CustomEvent('native-push-token-ready', { detail: token }));
  } catch (error) {
    console.error('푸시 세션 확인 오류:', error);
  }
};

window.getNativePushToken = () => nativePushToken;

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session) {
    hasAuthenticatedSession = true;
    localStorage.setItem('jsec-had-authenticated-session', 'true');
    syncNativePushToken(session);
  } else if (event === 'SIGNED_OUT') {
    const hadAuthenticatedSession = hasAuthenticatedSession ||
      localStorage.getItem('jsec-had-authenticated-session') === 'true';
    hasAuthenticatedSession = false;
    const intentionalSignOut = intentionalSignOutPending;
    intentionalSignOutPending = false;
    localStorage.removeItem('jsec-had-authenticated-session');
    if (hadAuthenticatedSession && !intentionalSignOut) {
      window.location.replace('/index.html?session=expired');
    }
  }
});