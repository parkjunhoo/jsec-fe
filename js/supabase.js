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

window.onNativePushToken = token => {
  if (typeof token !== 'string' || !token) return;
  nativePushToken = token;
  supabaseClient.auth.getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      return syncNativePushToken(data.session);
    })
    .catch(error => console.error('푸시 세션 확인 오류:', error));
};

supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session) {
    syncNativePushToken(session);
  }
});