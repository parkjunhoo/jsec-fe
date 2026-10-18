// Supabase 프로젝트 URL 및 Anon Key 설정
const SUPABASE_URL = 'https://YOUR_SUPABASE_PROJECT_ID.supabase.co'; 
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';                

// 전역 변수 중복 방지를 위해 supabaseClient 이름으로 생성
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);