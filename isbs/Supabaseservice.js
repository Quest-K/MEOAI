// ============================================================
// supabaseService.js
// Supabase 연동(DB 조회, 인증) 전용 로직
// 이 파일은 CS.html 보다 먼저 로드되어야 하며,
// 상단 <script src="...supabase-js..."> 이후에 로드되어야 합니다.
// ============================================================

const SUPABASE_URL = 'https://jhfhpumhifyhauuoinxc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZmhwdW1oaWZ5aGF1dW9pbnhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MDE2NTMsImV4cCI6MjEwMzk3NzY1M30.euXk3eXtUVvEQRDGgcLhvX3JhVlpv9D7fZUEDr0i8yA';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function loadData(){
  logs = [];
  const [internetRes, tvRes, settopRes] = await Promise.all([
    sb.from('internet_plans').select('*').in('carrier', CARRIERS),
    sb.from('tv_plans').select('*').in('carrier', CARRIERS),
    sb.from('settop_boxes').select('*').in('carrier', CARRIERS)
  ]);

  addLog('internet_plans', !internetRes.error, internetRes.error ? internetRes.error.message : `${internetRes.data.length}건 로드 완료`);
  addLog('tv_plans', !tvRes.error, tvRes.error ? tvRes.error.message : `${tvRes.data.length}건 로드 완료`);
  addLog('settop_boxes', !settopRes.error, settopRes.error ? settopRes.error.message : `${settopRes.data.length}건 로드 완료`);

  if (internetRes.error || tvRes.error || settopRes.error) return false;

  DATA = {};
  CARRIERS.forEach(c => { DATA[c] = { internet:{}, tv:{ low:null, basic:null, premium:null }, settopList:[] }; });

  internetRes.data.forEach(row => {
    if (DATA[row.carrier]) DATA[row.carrier].internet[row.speed] = { fee: row.monthly_fee, routerFee: row.router_fee };
  });

  // 통신사별 올바른 TV 요금제 명칭 정밀 매핑 (오류 해결)
  tvRes.data.forEach(row => {
    const c = row.carrier;
    if (!DATA[c]) return;
    const name = row.plan_name;
    
    if (c === 'kt') {
      if (name.includes('베이직')) DATA[c].tv.low = { name, fee: row.monthly_fee, channels: row.channel_count };
      else if (name.includes('에센스')) DATA[c].tv.basic = { name, fee: row.monthly_fee, channels: row.channel_count };
      else if (name.includes('모든G') || name.includes('키즈랜드')) DATA[c].tv.premium = { name, fee: row.monthly_fee, channels: row.channel_count };
    } else if (c === 'lg') {
      if (name.includes('실속형')) DATA[c].tv.low = { name, fee: row.monthly_fee, channels: row.channel_count };
      else if (name.includes('기본형')) DATA[c].tv.basic = { name, fee: row.monthly_fee, channels: row.channel_count };
      else if (name.includes('프리미엄')) DATA[c].tv.premium = { name, fee: row.monthly_fee, channels: row.channel_count };
    } else if (c === 'skb' || c === 'skt') {
      if (name.includes('이코노미')) DATA[c].tv.low = { name, fee: row.monthly_fee, channels: row.channel_count };
      else if (name.includes('스탠다드')) DATA[c].tv.basic = { name, fee: row.monthly_fee, channels: row.channel_count };
      else if (name.includes('All')) DATA[c].tv.premium = { name, fee: row.monthly_fee, channels: row.channel_count };
    }
  });

  // 매칭 누락 방지 폴백 처리
  CARRIERS.forEach(c => {
    const t = DATA[c].tv;
    const available = tvRes.data.filter(r => r.carrier === c);
    if (!t.low && available.length) t.low = { name: available[0].plan_name, fee: available[0].monthly_fee, channels: available[0].channel_count };
    if (!t.basic && available.length) t.basic = { name: available[Math.min(1, available.length-1)].plan_name, fee: available[Math.min(1, available.length-1)].monthly_fee, channels: available[Math.min(1, available.length-1)].channel_count };
    if (!t.premium && available.length) t.premium = { name: available[available.length-1].plan_name, fee: available[available.length-1].monthly_fee, channels: available[available.length-1].channel_count };
  });

  settopRes.data.forEach(row => {
    if (DATA[row.carrier]) DATA[row.carrier].settopList.push({ name: row.model_name, fee: row.monthly_fee });
  });

  return true;
}

function formatStartAt(date){
  if (!date) return null;
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  return `${mm}월 ${dd}일 ${hh}시부터 적용`;
}

function lookupCommission(carrierKey, speedNum, tvTier){
  const rows = RAW_COMMISSION_DATA.filter(r => String(r.carrier).toLowerCase() === carrierKey && normalizeSpeedValue(r.speed) === speedNum);
  const internetComm = rows.find(r => String(r.tv_tier) === 'none')?.commission_amount || 0;
  const tvComm = tvTier !== 'none' ? (rows.find(r => String(r.tv_tier) === tvTier)?.commission_amount || 0) : 0;
  return { internetComm, tvComm, totalComm: internetComm + tvComm };
}

function normalizeSpeedValue(v){
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  const num = parseFloat(s.replace(/,/g, ''));
  if (isNaN(num)) return null;
  if (/(g|기가)/i.test(s) && !/m/i.test(s)) return num * 1000;
  return num;
}

async function loadFinanceData() {
  const targetSpeed = Number(state.speed);
  const tvTierForPromo = state.tv === 'none' ? 'none' : 'all';
  const tvTierForComm = state.tv === 'none' ? 'none' : state.tv;

  const promoPromise = sb.from('carrier_promotions').select('*').eq('tv_tier', tvTierForPromo);
  const commPromise = isLoggedIn ? sb.rpc('get_admin_commissions') : Promise.resolve({ data: null, error: null });

  const [commRes, promoRes] = await Promise.all([commPromise, promoPromise]);
  if (isLoggedIn) {
    addLog('get_admin_commissions (RPC)', !commRes.error, commRes.error ? commRes.error.message : `${commRes.data?.length || 0}건 조회`);
  }
  addLog('carrier_promotions', !promoRes.error, promoRes.error ? promoRes.error.message : `${promoRes.data?.length || 0}건 프로모션 조회`);

  COMMISSION_DATA = {};
  RAW_COMMISSION_DATA = commRes.data || [];
  CARRIERS.forEach(carrier => {
    const commRows = commRes.data
      ? commRes.data.filter(r => String(r.carrier).toLowerCase() === carrier && normalizeSpeedValue(r.speed) === targetSpeed)
      : [];
    const internetComm = commRows.find(r => String(r.tv_tier) === 'none')?.commission_amount || 0;
    const tvComm = tvTierForComm !== 'none' ? (commRows.find(r => String(r.tv_tier) === tvTierForComm)?.commission_amount || 0) : 0;

    const startAtTimes = commRows.map(r => r.start_at).filter(Boolean).map(v => new Date(v)).filter(d => !isNaN(d.getTime()));
    const startAt = startAtTimes.length ? new Date(Math.max(...startAtTimes.map(d => d.getTime()))) : null;

    COMMISSION_DATA[carrier] = { internetComm, tvComm, totalComm: internetComm + tvComm, startAt };
  });

  PROMOTION_DATA = {};
  CARRIERS.forEach(carrier => {
    const promoRow = promoRes.data
      ? promoRes.data.find(r => String(r.carrier).toLowerCase() === carrier && normalizeSpeedValue(r.speed) === targetSpeed)
      : null;
    if (promoRow) {
      PROMOTION_DATA[carrier] = {
        giftCard: promoRow.gift_card || 0,
        cash: promoRow.cash_amount || 0,
        maxLimit: promoRow.max_promo_limit || ((promoRow.gift_card || 0) + (promoRow.cash_amount || 0))
      };
    } else {
      PROMOTION_DATA[carrier] = { giftCard: 60000, cash: 380000, maxLimit: 440000 };
    }
  });
}

async function handleLogin(){
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = '로그인 실패: ' + error.message;
    return;
  }
  isLoggedIn = true;
  updateAuthUI(data.session.user.email);
  closeLoginModal();
  if (DATA) { await loadFinanceData(); render(); }
  renderReflectedProducts();
  if (typeof renderRecoCards === 'function') renderRecoCards();
  if (typeof fetchRecoUsimPlans === 'function' && recoUsimTier) fetchRecoUsimPlans(recoUsimTier);
}

async function handleLogout(){
  await sb.auth.signOut();
  isLoggedIn = false;
  COMMISSION_DATA = {};
  RAW_COMMISSION_DATA = [];
  updateAuthUI();
  if (DATA) render();
  renderReflectedProducts();
  if (typeof renderRecoCards === 'function') renderRecoCards();
  if (typeof fetchRecoUsimPlans === 'function' && recoUsimTier) fetchRecoUsimPlans(recoUsimTier);
}
