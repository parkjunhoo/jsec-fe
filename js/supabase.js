// 실제 Supabase 설정 적용 완료
const SUPABASE_URL = 'https://nihsmjfcriqeuflujrrh.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hM0gN_gaG4d86oT9k-laRg_KOmfqrn8';                

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);