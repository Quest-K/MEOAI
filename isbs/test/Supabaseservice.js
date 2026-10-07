// ============================================================
// supabaseService.js
// Supabase 연동(DB 조회, 인증) 전용 로직
// 로드 순서: supabase-js -> config.js -> Calculator.js -> 이 파일 -> CS.html 인라인 스크립트.
// CARRIERS 등 상수는 config.js, DATA / logs / isLoggedIn 등 상태값과 addLog/render* 함수는
// CS.html 인라인 스크립트에 있으며 모두 호출 시점에 참조합니다.
// ============================================================

const SUPABASE_URL = 'https://jhfhpumhifyhauuoinxc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZmhwdW1oaWZ5aGF1dW9pbnhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MDE2NTMsImV4cCI6MjEwMzk3NzY1M30.euXk3eXtUVvEQRDGgcLhvX3JhVlpv9D7fZUEDr0i8yA';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// 연락처 헬퍼 (S1) : DB에는 숫자만 저장(고객 1명 = 연락처 1개), 화면에서만 하이픈 표시
//  - normalizeContact      : 저장·조회·비교용. 숫자 외 문자를 모두 제거
//  - isValidContactDigits  : DB 제약(customers_contact_digits_check)과 동일하게 숫자 9~11자리
//  - formatContactDisplay  : 표시·입력용. 010 -> 3-4-4, 02 -> 2-(3~4)-4, 그 외 지역번호 -> 3-(3~4)-4
// ============================================================
function normalizeContact(raw){
  return String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
}

function isValidContactDigits(digits){
  return /^[0-9]{9,11}$/.test(String(digits || ''));
}

function formatContactDisplay(raw){
  const d = normalizeContact(raw).slice(0, 11);
  if (!d) return '';
  if (d[0] !== '0') return d;                       // 대표번호(1588 등)는 그대로 표시
  if (d.startsWith('010')) {                         // 휴대폰: 입력 중에도 3-4-4
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  const p = d.startsWith('02') ? 2 : 3;              // 서울 02, 그 외 3자리(031·070·011 등)
  const rest = d.slice(p);
  if (rest.length === 0) return d;
  if (rest.length <= 4) return `${d.slice(0, p)}-${rest}`;
  return `${d.slice(0, p)}-${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
}

// ---- 통신사 키 (SKY 추가) ----
// 화면 키는 소문자(kt·lg·skb·skt·sky)입니다. DB 에는 SKY 가 skylife / SKYLIFE / SKY 로 섞여 있어 화면 키 sky 로 모아 읽습니다.
const DB_CARRIER_ALIAS = { skylife: 'sky' };
function allCarriers(){ return CARRIERS; }
function carrierKeyOf(v){
  const k = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return DB_CARRIER_ALIAS[k] || k;
}
// LG 소호: 요금제는 홈과 같고 수수료만 다릅니다. 화면 키 lg + 구분 'soho' → 수수료 행의 carrier 'LGbiz'/'LGBIZ'(소문자로 모으면 lgbiz)
function commissionKeyOf(carrierKey, variant){ return (carrierKey === 'lg' && variant === 'soho') ? 'lgbiz' : carrierKey; }
function dbCarrierNames(){ return allCarriers().concat(['skylife', 'SKYLIFE', 'SKY']); }   // .in('carrier', …) 조회용(대소문자 구분)

async function loadData(){
  logs = {};
  const [internetRes, tvRes, settopRes] = await Promise.all([
    sb.from('internet_plans').select('*').in('carrier', dbCarrierNames()),
    sb.from('tv_plans').select('*').in('carrier', dbCarrierNames()),
    sb.from('settop_boxes').select('*').in('carrier', dbCarrierNames())
  ]);

  addLog('internet_plans', !internetRes.error, internetRes.error ? internetRes.error.message : `${internetRes.data.length}건 로드 완료`);
  addLog('tv_plans', !tvRes.error, tvRes.error ? tvRes.error.message : `${tvRes.data.length}건 로드 완료`);
  addLog('settop_boxes', !settopRes.error, settopRes.error ? settopRes.error.message : `${settopRes.data.length}건 로드 완료`);

  if (internetRes.error || tvRes.error || settopRes.error) return false;

  DATA = {};
  allCarriers().forEach(c => { DATA[c] = { internet:{}, tv:{ low:null, basic:null, premium:null }, settopList:[] }; });

  internetRes.data.forEach(row => {
    const ck = carrierKeyOf(row.carrier);
    if (DATA[ck]) DATA[ck].internet[row.speed] = { fee: row.monthly_fee, routerFee: row.router_fee };
  });

  // 통신사별 올바른 TV 요금제 명칭 정밀 매핑 (오류 해결)
  tvRes.data.forEach(row => {
    const c = carrierKeyOf(row.carrier);
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
    } else if (c === 'sky') {
      // SKY 는 TV 요금제가 2개(베이직·플러스)뿐: 저가형=베이직, 기본형·고급형=플러스 (수수료도 기본형=고급형 금액)
      const tv = { name, fee: row.monthly_fee, channels: row.channel_count };
      if (name.includes('베이직')) DATA[c].tv.low = tv;
      else if (name.includes('플러스')) { DATA[c].tv.basic = tv; DATA[c].tv.premium = tv; }
    }
  });

  // 매칭 누락 방지 폴백 처리
  allCarriers().forEach(c => {
    const t = DATA[c].tv;
    const available = tvRes.data.filter(r => carrierKeyOf(r.carrier) === c);
    if (!t.low && available.length) t.low = { name: available[0].plan_name, fee: available[0].monthly_fee, channels: available[0].channel_count };
    if (!t.basic && available.length) t.basic = { name: available[Math.min(1, available.length-1)].plan_name, fee: available[Math.min(1, available.length-1)].monthly_fee, channels: available[Math.min(1, available.length-1)].channel_count };
    if (!t.premium && available.length) t.premium = { name: available[available.length-1].plan_name, fee: available[available.length-1].monthly_fee, channels: available[available.length-1].channel_count };
  });

  settopRes.data.forEach(row => {
    const ck = carrierKeyOf(row.carrier);
    if (DATA[ck]) DATA[ck].settopList.push({ name: row.model_name, fee: row.monthly_fee });
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

// 동일한 (통신사/속도/TV등급) 조합에 대해 여러 시점의 수수료 이력(start_at)이
// 공존할 수 있어(정책 갱신 시 UPDATE 대신 새 행을 추가하는 경우 포함),
// 단순 .find()로 첫 매칭 행을 쓰면 옛 정책이 계속 선택될 수 있습니다.
// -> start_at이 이미 지난 행들 중 가장 최근(effective) 행을 선택합니다.
function pickLatestRow(rows){
  if (!rows || !rows.length) return null;
  const now = Date.now();
  const effective = rows.filter(r => !r.start_at || new Date(r.start_at).getTime() <= now);
  const pool = effective.length ? effective : rows; // 전부 미래 시점뿐이면 fallback
  return pool.reduce((latest, r) => {
    const rt = r.start_at ? new Date(r.start_at).getTime() : -Infinity;
    const lt = latest.start_at ? new Date(latest.start_at).getTime() : -Infinity;
    return rt >= lt ? r : latest;
  });
}

// ============================================================
// 수수료 에이전시 (C-AG1)
//  - 수수료를 주는 에이전시가 2곳 이상이 되어, 같은 상품에 에이전시별 수수료가 여러 개일 수 있습니다.
//  - 화면은 '에이전시별 합계(인터넷+TV)가 가장 큰 곳'의 금액과 에이전시 이름을 보여 줍니다. 선택 규칙은 pickBestCommission 한 곳에만 있습니다.
//  - DB 연결 전 단계: RAW_COMMISSION_DATA(get_admin_commissions 결과)의 각 행에 에이전시 이름 칼럼이 있으면 그 값을 쓰고,
//    칼럼이 없으면 에이전시 1곳(이름 없음)으로 보아 기존과 똑같이 동작합니다. 칼럼 이름이 확정되면 COMMISSION_ROW_FIELDS.agency 만 고치면 됩니다.
//  - 유심 수수료는 Calculator.js 의 getUsimCommission(단일 구간표)이 기본입니다. 에이전시별 구간표를 USIM_COMMISSION_BY_AGENCY 에 넣으면
//    같은 규칙으로 비교합니다(DB 연결 시 { 에이전시명: { SK:[{max,fee}..], KT:[..], LG:[..] } } 모양으로 채우면 됩니다).
//  - 화면 확인용 가짜 에이전시: 주소 끝에 ?commMock=1 (저장은 막힙니다). 아래 commissionMock* 참고.
// ============================================================
const COMMISSION_ROW_FIELDS = { agency: 'agency' };   // 수수료 행에서 에이전시 이름이 든 칼럼
let USIM_COMMISSION_BY_AGENCY = null;                 // null 이면 단일 구간표(getUsimCommission) 사용

function commissionAgencyOf(row){
  const v = row ? row[COMMISSION_ROW_FIELDS.agency] : null;
  return (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim();
}

// 후보(에이전시별 금액) 중 합계가 가장 큰 곳. 같으면 먼저 나온 곳.
function pickBestCommission(cands){
  if (!cands || !cands.length) return null;
  return cands.reduce((best, c) => (c.totalComm > best.totalComm ? c : best), cands[0]);
}

// 홈(인터넷·TV) 수수료 : 기존 필드(internetComm·tvComm·totalComm)는 '가장 큰 에이전시' 값이라 기존 화면 코드가 그대로 동작합니다.
//   추가 필드: agency(선택된 에이전시 이름 또는 null), agencies(에이전시별 후보, 합계 높은 순)
function lookupCommission(carrierKey, speedNum, tvTier, variant){
  const dbKey = commissionKeyOf(carrierKey, variant);   // variant: LG 의 'home'|'soho' (없으면 홈)
  const rows = RAW_COMMISSION_DATA.filter(r => carrierKeyOf(r.carrier) === dbKey && normalizeSpeedValue(r.speed) === speedNum);
  const names = [];
  rows.forEach(r => { const a = commissionAgencyOf(r); if (!names.includes(a)) names.push(a); });
  const cands = names.map(a => {
    const rs = rows.filter(r => commissionAgencyOf(r) === a);
    const internetComm = pickLatestRow(rs.filter(r => String(r.tv_tier) === 'none'))?.commission_amount || 0;
    const tvComm = tvTier !== 'none' ? (pickLatestRow(rs.filter(r => String(r.tv_tier) === tvTier))?.commission_amount || 0) : 0;
    return { agency: a, internetComm, tvComm, totalComm: internetComm + tvComm };
  });
  const best = pickBestCommission(cands);
  if (!best) return { internetComm: 0, tvComm: 0, totalComm: 0, agency: null, agencies: [] };
  return {
    internetComm: best.internetComm, tvComm: best.tvComm, totalComm: best.totalComm,
    agency: best.agency, agencies: cands.slice().sort((x, y) => y.totalComm - x.totalComm)
  };
}

// 유심 수수료 : { amount, agency, agencies } — amount 는 getUsimCommission 과 같은 의미(가장 큰 에이전시 금액)
function usimBandFee(bands, fee){
  if (!bands) return 0;
  const b = bands.find(x => fee <= x.max);
  return b ? b.fee : 0;
}
function usimCommissionInfo(carrier, monthlyFee){
  const fee = Number(monthlyFee) || 0;
  const table = USIM_COMMISSION_BY_AGENCY;
  if (table && Object.keys(table).length) {
    const cands = Object.keys(table).map(a => { const amount = usimBandFee(table[a][carrier], fee); return { agency: a, amount, totalComm: amount }; });
    const best = pickBestCommission(cands);
    return { amount: best.amount, agency: best.agency, agencies: cands.slice().sort((x, y) => y.amount - x.amount) };
  }
  return { amount: getUsimCommission(carrier, fee), agency: null, agencies: [] };
}

// ---- 화면 확인용 가짜 에이전시(?commMock=1) : DB 와 무관한 테스트 값이며 저장은 막힙니다 ----
let COMMISSION_MOCK_ON = false;
const COMMISSION_MOCK_A = 'A에이전시(테스트)', COMMISSION_MOCK_B = 'B에이전시(테스트)';
function commissionMockFactor(carrier){ return ['kt', 'lg', 'KT', 'LG'].includes(carrier) ? 1.1 : 0.9; }   // B 가 KT·LG 에서 높고 SK 계열에서 낮게
function commissionMockRows(rows){
  const out = [];
  (rows || []).forEach(r => {
    out.push(Object.assign({}, r, { [COMMISSION_ROW_FIELDS.agency]: COMMISSION_MOCK_A }));
    out.push(Object.assign({}, r, { [COMMISSION_ROW_FIELDS.agency]: COMMISSION_MOCK_B,
      commission_amount: Math.round((Number(r.commission_amount) || 0) * commissionMockFactor(String(r.carrier).toLowerCase()) / 1000) * 1000 }));
  });
  return out;
}
function commissionMockUsimTable(){
  const mapBands = (bands, f) => bands.map(b => ({ max: b.max, fee: Math.round(b.fee * f / 1000) * 1000 }));
  const a = {}, b = {};
  Object.keys(USIM_COMMISSION_BANDS).forEach(k => { a[k] = USIM_COMMISSION_BANDS[k]; b[k] = mapBands(USIM_COMMISSION_BANDS[k], commissionMockFactor(k)); });
  return { [COMMISSION_MOCK_A]: a, [COMMISSION_MOCK_B]: b };
}
function commissionMockRequested(){
  try { return typeof location !== 'undefined' && new URLSearchParams(location.search).get('commMock') === '1'; } catch (e) { return false; }
}
function commissionMockInit(){
  if (!commissionMockRequested()) return;
  COMMISSION_MOCK_ON = true;
  USIM_COMMISSION_BY_AGENCY = commissionMockUsimTable();
  if (typeof document !== 'undefined' && document.body) {
    const bar = document.createElement('div');
    bar.id = 'commission-mock-banner';
    bar.style.cssText = 'background:#b3261e;color:#fff;padding:6px 12px;font-size:13px;font-weight:700;text-align:center;position:sticky;top:0;z-index:9999;';
    bar.textContent = '⚠ 수수료 에이전시 화면 확인용 테스트 모드 — 표시되는 에이전시·금액은 가짜 값이며 상담 저장은 막혀 있습니다. (주소의 ?commMock=1 을 빼면 해제)';
    document.body.insertBefore(bar, document.body.firstChild);
  }
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
  const targetSpeed = Number(recoState.speed);
  const tvTierForPromo = recoState.tv === 'none' ? 'none' : 'all';
  const tvTierForComm = recoState.tv === 'none' ? 'none' : recoState.tv;

  const promoPromise = sb.from('carrier_promotions').select('*').eq('tv_tier', tvTierForPromo);
  const commPromise = isLoggedIn ? sb.rpc('get_admin_commissions') : Promise.resolve({ data: null, error: null });

  const [commRes, promoRes] = await Promise.all([commPromise, promoPromise]);
  if (isLoggedIn) {
    addLog('get_admin_commissions (RPC)', !commRes.error, commRes.error ? commRes.error.message : `${commRes.data?.length || 0}건 조회`);
  }
  addLog('carrier_promotions', !promoRes.error, promoRes.error ? promoRes.error.message : `${promoRes.data?.length || 0}건 프로모션 조회`);

  COMMISSION_DATA = {};
  RAW_COMMISSION_DATA = commRes.data || [];
  if (COMMISSION_MOCK_ON) RAW_COMMISSION_DATA = commissionMockRows(RAW_COMMISSION_DATA);   // 화면 확인용(?commMock=1)
  allCarriers().forEach(carrier => {
    const commRows = commRes.data
      ? commRes.data.filter(r => carrierKeyOf(r.carrier) === carrier && normalizeSpeedValue(r.speed) === targetSpeed)
      : [];
    const internetComm = pickLatestRow(commRows.filter(r => String(r.tv_tier) === 'none'))?.commission_amount || 0;
    const tvComm = tvTierForComm !== 'none' ? (pickLatestRow(commRows.filter(r => String(r.tv_tier) === tvTierForComm))?.commission_amount || 0) : 0;

    const startAtTimes = commRows.map(r => r.start_at).filter(Boolean).map(v => new Date(v)).filter(d => !isNaN(d.getTime()));
    const startAt = startAtTimes.length ? new Date(Math.max(...startAtTimes.map(d => d.getTime()))) : null;

    COMMISSION_DATA[carrier] = { internetComm, tvComm, totalComm: internetComm + tvComm, startAt };
  });

  PROMOTION_DATA = {};
  allCarriers().forEach(carrier => {
    const promoRow = promoRes.data
      ? promoRes.data.find(r => carrierKeyOf(r.carrier) === carrier && normalizeSpeedValue(r.speed) === targetSpeed)
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
  if (DATA) { await loadFinanceData(); renderRecoCards(); }
  renderProposalLists();
  renderFinalProducts();
  if (typeof fetchRecoUsimPlans === 'function' && recoUsimTier) fetchRecoUsimPlans(recoUsimTier);
  if (typeof refreshCustomerListView === 'function') refreshCustomerListView(); // 고객조회 목록의 수수료 컬럼 표시
  if (typeof refreshPerformanceView === 'function') refreshPerformanceView(); // 실적조회의 수수료·마진 표시
}

async function handleLogout(){
  await sb.auth.signOut();
  isLoggedIn = false;
  COMMISSION_DATA = {};
  RAW_COMMISSION_DATA = [];
  updateAuthUI();
  if (DATA) renderRecoCards();
  renderProposalLists();
  renderFinalProducts();
  if (typeof fetchRecoUsimPlans === 'function' && recoUsimTier) fetchRecoUsimPlans(recoUsimTier);
  if (typeof refreshCustomerListView === 'function') refreshCustomerListView(); // 고객조회 목록의 수수료 컬럼 숨김
  if (typeof refreshPerformanceView === 'function') refreshPerformanceView(); // 실적조회의 수수료·마진 숨김
}

// ============================================================
// S2. 읽기 전용 데이터 접근 계층 (새 구조: contracts / contract_items / contract_proposals / status_history)
//  - 추가만 한 함수입니다. 기존 함수·화면은 바꾸지 않으며, 아직 CS.html 에서 호출하지 않습니다.
//  - 새 테이블·뷰는 로그인한 사용자만 읽을 수 있습니다(RLS). 미로그인이면 { ok:false, error } 를 돌려줍니다.
//  - 모든 함수는 예외를 던지지 않고 { ok, ..., error } 형태로 결과를 돌려줍니다.
//  - loadCustomerBundle        : 고객 1명의 고객·계약·상품·제안·이력을 한 번에
//  - loadCustomerOverviewList  : 고객 목록 + 계약 집계(v_customer_overview)
//  - loadContractOverviewList  : 계약 목록(v_contract_overview) + 고객 이름·연락처
// ============================================================
const S2_PAGE_SIZE = 1000;      // PostgREST 한 번에 가져오는 최대 행 수
const S2_ID_CHUNK = 150;        // .in('...', ids) 한 번에 넣는 ID 수 (URL 길이 제한 대비)
const S2_MAX_ROWS = 20000;      // 목록 전체 조회 시 안전 상한

// v_contract_overview 목록용 칼럼. consult_snapshot(JSON, 큼)은 목록에서 제외하고 상세에서만 읽습니다.
const S2_CONTRACT_LIST_COLUMNS = [
  'contract_id','customer_id','seq','contract_type','label','linked_contract_id',
  'contract_status','effective_status','status_reason','received_at','received_at_source',
  'install_scheduled_at','external_ref','gift_total','gift_card','gift_cash','gift_extra','commission_total',
  'payout_status','payout_at','clawback_status','clawback_amount','clawback_reason',
  'item_count','canceled_item_count','is_acquired','source','created_at','updated_at'
].join(',');

function s2LoginError(){
  return (typeof isLoggedIn !== 'undefined' && !isLoggedIn) ? '로그인 후 조회할 수 있습니다.' : null;
}

function s2Chunk(arr, size){
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// build(from, to) 는 order 와 range(from, to) 가 적용된 쿼리를 돌려줘야 합니다 (정렬이 고정되어야 누락·중복이 없음).
async function s2FetchAll(build, maxRows){
  const cap = maxRows || S2_MAX_ROWS;
  const rows = [];
  for (let from = 0; from < cap; from += S2_PAGE_SIZE) {
    const { data, error } = await build(from, Math.min(from + S2_PAGE_SIZE, cap) - 1);
    if (error) return { rows: null, error };
    rows.push(...(data || []));
    if (!data || data.length < S2_PAGE_SIZE) break;
  }
  return { rows, error: null, truncated: rows.length >= cap };
}

function s2ToArray(v){
  if (v === undefined || v === null || v === '') return null;
  return Array.isArray(v) ? (v.length ? v : null) : [v];
}

function s2Compare(a, b){
  if (a == null && b == null) return 0;
  if (a == null) return 1;      // 값 없는 행은 항상 뒤로
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

const S2_EMPTY_OVERVIEW = {
  contract_count: 0, acquired_contract_count: 0, acquired_home_count: 0, acquired_usim_count: 0,
  active_contract_count: 0, is_acquired: false, first_received_at: null,
  open_payout_count: 0, unpaid_contract_count: 0, open_clawback_count: 0
};

// ------------------------------------------------------------
// 고객 1명 묶음 : { ok, customer, summary, contracts[ {..., items[], proposals[]} ], history[] }
//   contracts 는 v_contract_overview 기준이라 effective_status(계약취소 계산값), is_acquired 가 들어 있습니다.
//   history 는 최신순(최대 500건). 공통 이력은 contract_id 가 null 입니다.
// ------------------------------------------------------------
async function loadCustomerBundle(customerId){
  const loginErr = s2LoginError();
  if (loginErr) return { ok: false, error: loginErr };
  const id = Number(customerId);
  if (!Number.isFinite(id)) return { ok: false, error: '고객 ID가 올바르지 않습니다.' };
  try {
    const names = ['customers', 'v_customer_overview', 'v_contract_overview', 'contract_items', 'contract_proposals', 'status_history'];
    const results = await Promise.all([
      sb.from('customers').select('*').eq('customer_id', id).limit(1),
      sb.from('v_customer_overview').select('*').eq('customer_id', id).limit(1),
      sb.from('v_contract_overview').select('*').eq('customer_id', id).order('seq', { ascending: true }),
      sb.from('contract_items').select('*').eq('customer_id', id).order('item_id', { ascending: true }),
      sb.from('contract_proposals').select('*').eq('customer_id', id).order('proposal_id', { ascending: true }),
      sb.from('status_history').select('*').eq('customer_id', id)
        .order('changed_at', { ascending: false }).order('history_id', { ascending: false }).limit(500)
    ]);
    const failed = results.map((r, i) => r.error ? `${names[i]}: ${r.error.message}` : null).filter(Boolean);
    if (failed.length) return { ok: false, error: failed.join(' / ') };

    const [cuRes, sumRes, ctRes, itRes, prRes, hiRes] = results;
    const customer = (cuRes.data || [])[0];
    if (!customer) return { ok: false, error: '고객을 찾을 수 없습니다.' };

    const itemsBy = {}, proposalsBy = {};
    (itRes.data || []).forEach(r => { (itemsBy[r.contract_id] = itemsBy[r.contract_id] || []).push(r); });
    (prRes.data || []).forEach(r => { (proposalsBy[r.contract_id] = proposalsBy[r.contract_id] || []).push(r); });
    const contracts = (ctRes.data || []).map(c => ({
      ...c, items: itemsBy[c.contract_id] || [], proposals: proposalsBy[c.contract_id] || []
    }));
    return {
      ok: true,
      customer,
      summary: (sumRes.data || [])[0] || { customer_id: id, ...S2_EMPTY_OVERVIEW },
      contracts,
      history: hiRes.data || []
    };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// ------------------------------------------------------------
// 고객 목록 + 계약 집계 : { ok, rows[ {...customers 칼럼, overview:{...}} ], total }
//   filters: contact(숫자·하이픈 모두 가능, 부분일치) / name(부분일치) / customerStatus(문자열 또는 배열) / substatus / reason
//            acquired(true=유치, false=미유치) / openPayout / unpaid / openClawback (true 이면 해당 계약이 1건 이상)
//            orderBy(기본 updated_at) / ascending(기본 false) / limit(기본 200)
//   total : 조건에 맞는 전체 고객 수(limit 이전)
// ------------------------------------------------------------
async function loadCustomerOverviewList(filters){
  const loginErr = s2LoginError();
  if (loginErr) return { ok: false, error: loginErr };
  const f = filters || {};
  const limit = Number(f.limit) > 0 ? Number(f.limit) : 200;
  const orderBy = f.orderBy || 'updated_at';
  const ascending = f.ascending === true;
  const statuses = s2ToArray(f.customerStatus);
  const digits = normalizeContact(f.contact);
  const name = String(f.name || '').trim();

  const applyCustomer = q => {
    if (digits) q = q.ilike('contact', `%${digits}%`);
    if (name) q = q.ilike('name', `%${name}%`);
    if (statuses) q = q.in('customer_status', statuses);
    if (f.substatus) q = q.eq('consult_substatus', f.substatus);   // S5 추가: 상담중 부가표시
    if (f.reason) q = q.eq('status_reason', f.reason);             // S5 추가: 이탈·제외 사유
    return q;
  };
  const applyOverview = q => {
    if (f.acquired === true) q = q.eq('is_acquired', true);
    if (f.acquired === false) q = q.eq('is_acquired', false);
    if (f.openPayout) q = q.gt('open_payout_count', 0);
    if (f.unpaid) q = q.gt('unpaid_contract_count', 0);
    if (f.openClawback) q = q.gt('open_clawback_count', 0);
    return q;
  };
  const useOverviewFilter = f.acquired === true || f.acquired === false || !!f.openPayout || !!f.unpaid || !!f.openClawback;
  const merge = (cust, ov) => ({ ...cust, overview: ov ? { ...ov } : { ...S2_EMPTY_OVERVIEW } });

  try {
    if (!useOverviewFilter) {
      // 고객 조건으로 먼저 자르고(정렬·limit 은 DB에서), 그 고객들의 집계만 붙입니다.
      const res = await applyCustomer(sb.from('customers').select('*', { count: 'exact' }))
        .order(orderBy, { ascending, nullsFirst: false }).limit(limit);
      if (res.error) return { ok: false, error: 'customers: ' + res.error.message };
      const customers = res.data || [];
      const ovMap = {};
      for (const ids of s2Chunk(customers.map(c => c.customer_id), S2_ID_CHUNK)) {
        const ov = await sb.from('v_customer_overview').select('*').in('customer_id', ids);
        if (ov.error) return { ok: false, error: 'v_customer_overview: ' + ov.error.message };
        (ov.data || []).forEach(r => { ovMap[r.customer_id] = r; });
      }
      return { ok: true, rows: customers.map(c => merge(c, ovMap[c.customer_id])), total: res.count != null ? res.count : customers.length };
    }

    // 계약 집계 조건이 있으면 집계 뷰에서 먼저 고르고, 고객 조건은 그 고객들에게만 적용합니다.
    const ovRes = await s2FetchAll((from, to) =>
      applyOverview(sb.from('v_customer_overview').select('*')).order('customer_id', { ascending: true }).range(from, to));
    if (ovRes.error) return { ok: false, error: 'v_customer_overview: ' + ovRes.error.message };
    const ovMap = {};
    ovRes.rows.forEach(r => { ovMap[r.customer_id] = r; });
    const merged = [];
    for (const ids of s2Chunk(ovRes.rows.map(r => r.customer_id), S2_ID_CHUNK)) {
      const cu = await applyCustomer(sb.from('customers').select('*').in('customer_id', ids));
      if (cu.error) return { ok: false, error: 'customers: ' + cu.error.message };
      (cu.data || []).forEach(c => merged.push(merge(c, ovMap[c.customer_id])));
    }
    merged.sort((a, b) => { const r = s2Compare(a[orderBy], b[orderBy]); return a[orderBy] == null || b[orderBy] == null ? r : (ascending ? r : -r); });
    return { ok: true, rows: merged.slice(0, limit), total: merged.length, truncated: !!ovRes.truncated };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// ------------------------------------------------------------
// 계약 목록 : { ok, rows[ {...v_contract_overview 칼럼, customer:{customer_id,name,contact}} ], total, truncated }
//   filters: customerId / contractType('home'|'usim') / status(effective_status, 문자열 또는 배열)
//            payoutStatus / clawbackStatus(문자열 또는 배열) / acquired(true=접수 이력 있음)
//            receivedFrom / receivedTo(ISO 문자열, 접수 시각 기준 기간) / limit(없으면 전체) / withCustomer(기본 true)
//   정렬: 접수 시각 최신순(없으면 뒤), 같으면 계약 ID 큰 순
// ------------------------------------------------------------
async function loadContractOverviewList(filters){
  const loginErr = s2LoginError();
  if (loginErr) return { ok: false, error: loginErr };
  const f = filters || {};
  const limit = Number(f.limit) > 0 ? Number(f.limit) : null;
  const statuses = s2ToArray(f.status), payouts = s2ToArray(f.payoutStatus), clawbacks = s2ToArray(f.clawbackStatus);

  const build = (from, to) => {
    let q = sb.from('v_contract_overview').select(S2_CONTRACT_LIST_COLUMNS);
    if (f.customerId != null && f.customerId !== '') q = q.eq('customer_id', Number(f.customerId));
    if (f.contractType) q = q.eq('contract_type', f.contractType);
    if (statuses) q = q.in('effective_status', statuses);
    if (payouts) q = q.in('payout_status', payouts);
    if (clawbacks) q = q.in('clawback_status', clawbacks);
    if (f.acquired === true) q = q.eq('is_acquired', true);
    if (f.acquired === false) q = q.eq('is_acquired', false);
    if (f.receivedFrom) q = q.gte('received_at', f.receivedFrom);
    if (f.receivedTo) q = q.lte('received_at', f.receivedTo);
    return q.order('received_at', { ascending: false, nullsFirst: false })
            .order('contract_id', { ascending: false }).range(from, to);
  };

  try {
    const res = await s2FetchAll(build, limit);
    if (res.error) return { ok: false, error: 'v_contract_overview: ' + res.error.message };
    const rows = res.rows;
    if (f.withCustomer !== false && rows.length) {
      const ids = Array.from(new Set(rows.map(r => r.customer_id)));
      const cuMap = {};
      for (const chunk of s2Chunk(ids, S2_ID_CHUNK)) {
        const cu = await sb.from('customers').select('customer_id,name,contact').in('customer_id', chunk);
        if (cu.error) return { ok: false, error: 'customers: ' + cu.error.message };
        (cu.data || []).forEach(c => { cuMap[c.customer_id] = c; });
      }
      rows.forEach(r => { r.customer = cuMap[r.customer_id] || null; });
    }
    return { ok: true, rows, total: rows.length, truncated: !!res.truncated };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}


// ============================================================
// 상태 변경 단일 함수 (S4)
// ------------------------------------------------------------
//  - 추가만 한 함수입니다. 기존 함수·화면은 바꾸지 않았고, 아직 CS.html / CS_new.html 에서 호출하지 않습니다.
//    (기존 변경 경로 교체는 화면을 새 구조로 바꾸는 S5·S6·S7 에서 각 화면과 함께 진행합니다.)
//  - 고객 / 계약 / 상품의 상태는 모두 changeStatus() 하나만 거쳐 바꾸고, 바꿀 때마다 status_history 에 1건씩 남깁니다.
//  - 순서: 현재값 읽기 -> 이력 저장 -> 값 갱신(읽은 값과 같을 때만) -> 실패하면 방금 저장한 이력 삭제.
//    이력 저장이 실패하면 상태를 바꾸지 않고 오류를 돌려줍니다(이력 없이 바뀌는 일이 없도록).
//  - 접수완료로 처음 바뀔 때만 received_at 을 기록합니다(D15). 이후 접수대기 등으로 되돌려도 지우지 않습니다.
//  - 계약 상태가 바뀌면 고객 상태를 자동으로 맞춥니다(D16, deriveCustomerStatus 참고).
//  - 한계: 브라우저에서 여러 번 요청하는 방식이라 DB 트랜잭션은 아닙니다. 정리(이력 삭제)까지 실패하는 극히 드문 경우
//    result.orphanHistoryId 로 알려 줍니다. 완전한 원자성이 필요하면 DB 함수(RPC)로 옮길 수 있습니다.
//  - 결과: { ok, changed, from, to, historyId, auto, autoError, userMessage, error }
//
//  changeStatus({ target, id, axis, to, reason, substatus, note, extra })
//    target : 'customer' | 'contract' | 'item'
//    axis   : customer -> 'status'(기본) | 'substatus' / contract -> 'status'(기본) | 'payout' | 'clawback' / item -> 'progress'(기본)
//    to     : 새 값(config.js 9장 목록). 지급·환수·상담중 부가표시는 null 로 비울 수 있습니다.
//    reason : 이탈·제외(필수, STATUS_REASONS 안의 값) / 접수불가·접수취소(선택) 사유
//    substatus : customer 를 '상담중'으로 바꿀 때 함께 정할 부가표시(선택)
//    extra  : { amount, reason } 환수 금액·사유, { installed_at } 설치일시(선택)
// ============================================================
const S4_AUTO_FROM_STATUSES = ['상담대기', '상담중', '상담완료'];     // 자동 전환 대상. 이탈·제외는 담당자가 직접 변경
const S4_ACQUIRED_CONTRACT_STATUSES = ['접수대기', '접수보류', '접수완료']; // 이 상태의 계약이 있으면 고객은 '상담완료'(화면 칩은 '유치')

function s4Spec(target, axis){
  const specs = {
    customer: { table: 'customers', idCol: 'customer_id', axes: {
      status:    { col: 'customer_status',   values: CUSTOMER_STATUSES },
      substatus: { col: 'consult_substatus', values: CONSULT_SUBSTATUSES, nullable: true }
    } },
    contract: { table: 'contracts', idCol: 'contract_id', axes: {
      status:   { col: 'contract_status', values: CONTRACT_STATUSES },
      payout:   { col: 'payout_status',   values: PAYOUT_STATUSES,   nullable: true },
      clawback: { col: 'clawback_status', values: CLAWBACK_STATUSES, nullable: true }
    } },
    item: { table: 'contract_items', idCol: 'item_id', axes: {
      progress: { col: 'progress_status', values: ITEM_PROGRESS }
    } }
  };
  const t = specs[target];
  if (!t) return null;
  const a = t.axes[axis];
  return a ? { table: t.table, idCol: t.idCol, col: a.col, values: a.values, nullable: !!a.nullable } : null;
}

// 계약 목록으로 고객 상태를 계산합니다. 바꿀 필요가 없으면 null.
//  - 접수대기·접수보류·접수완료 계약(또는 접수 이력)이 1건이라도 있으면 상담완료
//  - 그런 계약이 없는데 상담완료이면 상담중으로 되돌림(예: 유일한 계약이 접수불가로 바뀐 경우)
//  - 이탈·제외는 자동으로 바꾸지 않음
function deriveCustomerStatus(currentStatus, contracts){
  if (!S4_AUTO_FROM_STATUSES.includes(currentStatus)) return null;
  const hasAcquired = (contracts || []).some(c => S4_ACQUIRED_CONTRACT_STATUSES.includes(c.contract_status) || !!c.received_at);
  if (hasAcquired) return currentStatus === '상담완료' ? null : '상담완료';
  return currentStatus === '상담완료' ? '상담중' : null;
}

async function s4ChangedBy(){
  if (typeof currentUserEmail === 'function') return (await currentUserEmail()) || null;
  try {
    const { data } = await sb.auth.getSession();
    return (data && data.session && data.session.user && data.session.user.email) || null;
  } catch (e) { return null; }
}

function s4Fail(msg){ return { ok: false, changed: false, error: msg, userMessage: msg }; }

async function changeStatus(opts){
  try {
    const o = opts || {};
    if (typeof isLoggedIn !== 'undefined' && !isLoggedIn) return s4Fail('로그인 후 변경할 수 있습니다.');

    const target = o.target;
    const axis = o.axis || (target === 'item' ? 'progress' : 'status');
    const spec = s4Spec(target, axis);
    if (!spec) return s4Fail(`지원하지 않는 변경 대상입니다. (${target}/${axis})`);
    const id = Number(o.id);
    if (!Number.isFinite(id)) return s4Fail('대상 ID가 올바르지 않습니다.');

    const to = (o.to === undefined || o.to === '') ? null : o.to;
    if (to === null && !spec.nullable) return s4Fail('변경할 값을 선택해 주세요.');
    if (to !== null && !spec.values.includes(to)) return s4Fail(`허용되지 않는 값입니다: ${to}`);

    // 대상 행 읽기
    const cur = await sb.from(spec.table).select('*').eq(spec.idCol, id).limit(1);
    if (cur.error) return s4Fail('현재 값을 읽지 못했습니다: ' + cur.error.message);
    const row = (cur.data || [])[0];
    if (!row) return s4Fail('대상을 찾을 수 없습니다.');
    const from = row[spec.col] === undefined ? null : row[spec.col];

    const reason = (o.reason == null || String(o.reason).trim() === '') ? null : String(o.reason).trim();
    const extra = o.extra || {};
    const now = new Date().toISOString();
    const patch = {};
    let note = o.note || null;
    let histReason = null;

    patch[spec.col] = to;

    if (target === 'customer' && axis === 'status') {
      if (to === '이탈' || to === '제외') {
        const allowed = STATUS_REASONS[to] || [];
        if (!reason) return s4Fail(`${to} 사유를 선택해 주세요.`);
        if (!allowed.includes(reason)) return s4Fail(`${to} 사유로 쓸 수 없는 값입니다: ${reason}`);
        patch.status_reason = reason;
        histReason = reason;
      } else {
        patch.status_reason = null;
      }
      if (to === '상담중') {
        const sub = o.substatus == null || o.substatus === '' ? null : o.substatus;
        if (sub !== null && !CONSULT_SUBSTATUSES.includes(sub)) return s4Fail(`허용되지 않는 부가표시입니다: ${sub}`);
        patch.consult_substatus = sub;
        if (sub && !note) note = `세부: ${sub}`;
      } else {
        patch.consult_substatus = null;
      }
      if (from === to && !note && (row.status_reason || null) !== (patch.status_reason || null)) {
        note = `사유 변경: ${row.status_reason || '-'} → ${patch.status_reason || '-'}`;
      }
    } else if (target === 'customer' && axis === 'substatus') {
      if (row.customer_status !== '상담중') return s4Fail('부가표시는 고객 상태가 상담중일 때만 바꿀 수 있습니다.');
    } else if (target === 'contract' && axis === 'status') {
      patch.status_reason = to === '접수불가' ? reason : null;
      histReason = to === '접수불가' ? reason : null;
      if (to === '접수완료' && !row.received_at) {           // D15: 접수 시각은 최초 1회만 기록
        patch.received_at = now;
        patch.received_at_source = 'app';
      }
    } else if (target === 'contract' && axis === 'payout') {
      patch.payout_at = to === '지급완료' ? now : null;
    } else if (target === 'contract' && axis === 'clawback') {
      if (to === null) { patch.clawback_amount = null; patch.clawback_reason = null; }
      else {
        if (extra.amount !== undefined) {
          const amt = extra.amount === null || extra.amount === '' ? null : Number(extra.amount);
          if (amt !== null && !Number.isFinite(amt)) return s4Fail('환수 금액이 올바르지 않습니다.');
          patch.clawback_amount = amt;
        }
        if (extra.reason !== undefined) patch.clawback_reason = extra.reason || null;
        histReason = extra.reason || null;
      }
    } else if (target === 'item' && axis === 'progress') {
      patch.cancel_reason = to === '접수취소' ? reason : null;
      histReason = to === '접수취소' ? reason : null;
      if (to === '설치완료') patch.installed_at = extra.installed_at || now;
      else if (to === '설치대기') patch.installed_at = null;
    }

    // 같은 값으로 다시 저장하는 경우: 사유·금액 등이 달라진 것이 없으면 아무것도 하지 않고, 달라졌으면 시각 칼럼은 건드리지 않고 그 값만 갱신
    if (from === to) {
      ['payout_at', 'installed_at', 'received_at', 'received_at_source'].forEach(k => { delete patch[k]; });
      const diff = Object.keys(patch).filter(k => k !== spec.col && (row[k] === undefined ? null : row[k]) !== (patch[k] === undefined ? null : patch[k]));
      if (!diff.length) return { ok: true, changed: false, from, to, userMessage: '이미 같은 상태입니다.' };
    }

    // 이력 먼저 저장 (실패하면 상태를 바꾸지 않음)
    const customerId = target === 'customer' ? id : row.customer_id;
    const hist = {
      customer_id: customerId,
      contract_id: target === 'contract' ? id : (target === 'item' ? row.contract_id : null),
      item_id: target === 'item' ? id : null,
      event_type: 'status_change',
      target_type: target,
      axis,
      from_value: from,
      to_value: to,
      reason: histReason,
      note,
      changed_by: await s4ChangedBy(),
      source: 'app'
    };
    const hr = await sb.from('status_history').insert(hist).select('history_id');
    if (hr.error) return s4Fail('이력 저장에 실패해 상태를 바꾸지 않았습니다: ' + hr.error.message);
    const historyId = hr.data && hr.data[0] ? hr.data[0].history_id : null;

    const cleanup = async () => {
      if (historyId == null) return null;
      const d = await sb.from('status_history').delete().eq('history_id', historyId);
      return d.error ? historyId : null;
    };

    // 값 갱신: 읽을 때의 값과 같을 때만 (다른 곳에서 먼저 바뀌었으면 적용하지 않음)
    let uq = sb.from(spec.table).update(patch).eq(spec.idCol, id);
    uq = from === null ? uq.is(spec.col, null) : uq.eq(spec.col, from);
    const ur = await uq.select(spec.idCol);
    if (ur.error || !ur.data || !ur.data.length) {
      const orphan = await cleanup();
      const msg = ur.error ? '상태 변경에 실패했습니다: ' + ur.error.message
                           : '다른 곳에서 먼저 변경되어 적용하지 않았습니다. 새로고침 후 다시 시도해 주세요.';
      const out = s4Fail(orphan != null ? msg + ` (이력 ${orphan}번 정리 실패 — 관리자 확인 필요)` : msg);
      if (orphan != null) out.orphanHistoryId = orphan;
      return out;
    }

    const result = { ok: true, changed: true, from, to, historyId, auto: null, autoError: null, userMessage: '변경되었습니다.' };
    if (patch.received_at) result.receivedAtSet = true;

    // 계약 상태가 바뀌면 고객 상태 자동 전환 (D16)
    if (target === 'contract' && axis === 'status' && !o.auto) {
      const [cu, cts] = await Promise.all([
        sb.from('customers').select('customer_status').eq('customer_id', customerId).limit(1),
        sb.from('contracts').select('contract_status,received_at').eq('customer_id', customerId)
      ]);
      if (cu.error || cts.error) {
        result.autoError = '고객 상태 자동 전환 확인에 실패했습니다: ' + (cu.error || cts.error).message;
      } else if (cu.data && cu.data[0]) {
        const next = deriveCustomerStatus(cu.data[0].customer_status, cts.data);
        if (next) {
          const ar = await changeStatus({ target: 'customer', id: customerId, axis: 'status', to: next,
            note: '계약 상태 변경에 따른 자동 전환', auto: true });
          if (ar.ok && ar.changed) result.auto = { from: ar.from, to: ar.to };
          else if (!ar.ok) result.autoError = '고객 상태 자동 전환에 실패했습니다: ' + ar.error;
        }
      }
      if (result.autoError) result.userMessage = '계약 상태는 변경됐지만 ' + result.autoError;
    }
    return result;
  } catch (e) {
    return s4Fail(e && e.message ? e.message : String(e));
  }
}


// ============================================================
// 계약·상품 생성 / 수정 / 삭제 (S6)
// ------------------------------------------------------------
//  - 추가만 한 함수입니다. 모든 함수는 예외를 던지지 않고 { ok, ..., error } 를 돌려줍니다.
//  - 상태(접수·지급·환수·진행)는 여기서 바꾸지 않고 changeStatus() 로만 바꿉니다. 여기서는 생성·정보 수정·삭제만 다룹니다.
//  - 삭제는 접수 전(작성중이고 접수 시각이 없는) 계약·상품만 허용합니다(D15). DB 트리거도 같은 규칙으로 막습니다.
//  - 삭제 전에 해당 계약·상품의 이력을 '공통 이력'으로 바꿔 남깁니다. status_history 에는
//    "target_type 이 contract/item 이면 contract_id/item_id 가 있어야 한다"는 제약이 있어, 그대로 지우면
//    FK 의 set null 이 제약에 걸려 삭제가 실패하기 때문입니다. 삭제가 실패하면 이력을 원래대로 되돌립니다.
//  - 번호 표기(D3-8): 계약 CT-0001, 상품 IT-3938 형태는 화면에서만 만듭니다(formatContractNo / formatItemNo).
// ============================================================
function formatContractNo(id){ return 'CT-' + String(id).padStart(4, '0'); }
function formatItemNo(id){ return 'IT-' + String(id).padStart(4, '0'); }

const S6_ITEM_TYPES = { home: ['internet', 'tv'], usim: ['usim'] };
const S6_ITEM_TYPE_LABEL = { internet: '인터넷', tv: 'TV', usim: '유심' };
const S6_META_TEXT = ['label', 'address_zip', 'address', 'address_detail', 'contractor_name', 'contractor_relation', 'payment_method', 'external_ref', 'clawback_reason', 'memo'];
const S6_META_INT = ['gift_total', 'gift_card', 'gift_cash', 'gift_extra', 'commission_total', 'clawback_amount'];
const S6_META_DATE = ['install_scheduled_at'];

function s6Err(msg){ return { ok: false, error: msg }; }
function s6LoginErr(){ return (typeof isLoggedIn !== 'undefined' && !isLoggedIn) ? '로그인 후 사용할 수 있습니다.' : null; }

function s6Int(v){
  if (v === '' || v === null || v === undefined) return null;
  const t = String(v).replace(/[,\s원]/g, '');      // 1,200,000 / 1200000원 허용
  if (!/^-?\d+$/.test(t)) return NaN;                // 그 외 글자가 섞이면 숫자가 아닌 것으로 처리
  return Number(t);
}

async function s6DetachHistory(col, id, label){
  const sel = await sb.from('status_history').select('history_id,target_type,contract_id,item_id,note').eq(col, id);
  if (sel.error) return { ok: false, error: '이력을 읽지 못했습니다: ' + sel.error.message };
  const saved = sel.data || [];
  const done = [];
  for (const r of saved) {
    const up = await sb.from('status_history').update({
      target_type: 'customer', contract_id: null, item_id: null, note: (r.note ? r.note + ' ' : '') + `[삭제된 ${label}]`
    }).eq('history_id', r.history_id);
    if (up.error) { await s6RestoreHistory(done); return { ok: false, error: '이력 정리에 실패했습니다: ' + up.error.message }; }
    done.push(r);
  }
  return { ok: true, saved };
}

async function s6RestoreHistory(saved){
  for (const r of (saved || [])) {
    await sb.from('status_history').update({ target_type: r.target_type, contract_id: r.contract_id, item_id: r.item_id, note: r.note }).eq('history_id', r.history_id);
  }
}

async function s6WriteHistory(row){
  const r = await sb.from('status_history').insert({ event_type: 'status_change', target_type: 'customer', source: 'app', changed_by: await s4ChangedBy(), ...row }).select('history_id');
  return r.error ? { ok: false, error: r.error.message } : { ok: true, historyId: r.data && r.data[0] ? r.data[0].history_id : null };
}

// 신규 계약 : 작성중으로 만들고 '계약 생성' 이력을 남깁니다. 이력 저장이 실패하면 계약도 취소합니다.
//   opts: { customerId, contractType('home'|'usim'), label, linkedContractId(유심만, 선택) }
async function createContract(opts){
  try {
    const le = s6LoginErr(); if (le) return s6Err(le);
    const o = opts || {};
    const customerId = Number(o.customerId);
    if (!Number.isFinite(customerId)) return s6Err('고객 ID가 올바르지 않습니다.');
    if (o.contractType !== 'home' && o.contractType !== 'usim') return s6Err('계약 구분을 선택해 주세요.');
    let linked = null;
    if (o.contractType === 'usim' && o.linkedContractId) {
      linked = Number(o.linkedContractId);
      const lk = await sb.from('contracts').select('contract_id,customer_id,contract_type').eq('contract_id', linked).limit(1);
      if (lk.error) return s6Err('연결할 계약을 읽지 못했습니다: ' + lk.error.message);
      const row = (lk.data || [])[0];
      if (!row || row.customer_id !== customerId || row.contract_type !== 'home') return s6Err('유심 계약은 같은 고객의 인터넷·TV 계약에만 연결할 수 있습니다.');
    }
    let ins = null;
    for (let attempt = 0; attempt < 2; attempt++) {      // 동시에 만들어 순번이 겹치면 한 번 다시 시도
      const mx = await sb.from('contracts').select('seq').eq('customer_id', customerId);
      if (mx.error) return s6Err('순번을 확인하지 못했습니다: ' + mx.error.message);
      const seq = (mx.data || []).reduce((m, r) => Math.max(m, Number(r.seq) || 0), 0) + 1;
      ins = await sb.from('contracts').insert({
        customer_id: customerId, seq, contract_type: o.contractType, label: (o.label || '').trim() || null,
        linked_contract_id: linked, contract_status: '작성중', source: 'app', created_by: await s4ChangedBy()
      }).select('*');
      if (!ins.error) break;
    }
    if (ins.error) return s6Err('계약 생성에 실패했습니다: ' + ins.error.message);
    const contract = ins.data[0];
    const h = await s6WriteHistory({ customer_id: customerId, contract_id: contract.contract_id, target_type: 'contract', axis: 'status', from_value: null, to_value: '작성중', note: '계약 생성' });
    if (!h.ok) {
      await sb.from('contracts').delete().eq('contract_id', contract.contract_id);
      return s6Err('이력 저장에 실패해 계약을 만들지 않았습니다: ' + h.error);
    }
    return { ok: true, contract };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

// 계약 정보 수정(상태 제외). 허용 칼럼만 반영하고 나머지는 무시합니다.
async function saveContractMeta(contractId, fields){
  try {
    const le = s6LoginErr(); if (le) return s6Err(le);
    const id = Number(contractId);
    if (!Number.isFinite(id)) return s6Err('계약 ID가 올바르지 않습니다.');
    const f = fields || {}, patch = {};
    S6_META_TEXT.forEach(k => { if (k in f) patch[k] = (f[k] == null || String(f[k]).trim() === '') ? null : String(f[k]).trim(); });
    for (const k of S6_META_INT) {
      if (!(k in f)) continue;
      const n = s6Int(f[k]);
      if (Number.isNaN(n)) return s6Err(`숫자로 입력해 주세요: ${k}`);
      patch[k] = n;
    }
    S6_META_DATE.forEach(k => { if (k in f) patch[k] = f[k] ? f[k] : null; });
    if (!Object.keys(patch).length) return { ok: true, changed: false };
    const r = await sb.from('contracts').update(patch).eq('contract_id', id).select('contract_id');
    if (r.error) return s6Err('저장에 실패했습니다: ' + r.error.message);
    if (!r.data || !r.data.length) return s6Err('계약을 찾을 수 없습니다.');
    return { ok: true, changed: true };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

// 상품 추가 : 설치대기로 만들고 이력을 남깁니다. 인터넷·TV 계약에는 인터넷/TV, 유심 계약에는 유심(1회선)만 넣을 수 있습니다.
//   opts: { contractId, productType, carrier, productName, monthlyFee, commission }
async function addContractItem(opts){
  try {
    const le = s6LoginErr(); if (le) return s6Err(le);
    const o = opts || {};
    const cid = Number(o.contractId);
    if (!Number.isFinite(cid)) return s6Err('계약 ID가 올바르지 않습니다.');
    const ct = await sb.from('contracts').select('contract_id,customer_id,contract_type').eq('contract_id', cid).limit(1);
    if (ct.error) return s6Err('계약을 읽지 못했습니다: ' + ct.error.message);
    const contract = (ct.data || [])[0];
    if (!contract) return s6Err('계약을 찾을 수 없습니다.');
    if (!(S6_ITEM_TYPES[contract.contract_type] || []).includes(o.productType)) return s6Err('이 계약에는 넣을 수 없는 상품 구분입니다.');
    if (contract.contract_type === 'usim') {
      const ex = await sb.from('contract_items').select('item_id').eq('contract_id', cid);
      if (ex.error) return s6Err('상품을 확인하지 못했습니다: ' + ex.error.message);
      if ((ex.data || []).length) return s6Err('유심 계약에는 1회선만 넣을 수 있습니다.');
    }
    const fee = s6Int(o.monthlyFee), comm = s6Int(o.commission);
    if (Number.isNaN(fee) || Number.isNaN(comm)) return s6Err('요금·수수료는 숫자로 입력해 주세요.');
    const ins = await sb.from('contract_items').insert({
      contract_id: cid, customer_id: contract.customer_id, product_type: o.productType,
      carrier: (o.carrier || '').trim() || null, product_name: (o.productName || '').trim() || null,
      monthly_fee: fee, commission: comm, progress_status: '설치대기', source: 'app'
    }).select('*');
    if (ins.error) return s6Err('상품 추가에 실패했습니다: ' + ins.error.message);
    const item = ins.data[0];
    const h = await s6WriteHistory({ customer_id: contract.customer_id, contract_id: cid, item_id: item.item_id, target_type: 'item', axis: 'progress', from_value: null, to_value: '설치대기', note: '상품 추가' });
    if (!h.ok) {
      await sb.from('contract_items').delete().eq('item_id', item.item_id);
      return s6Err('이력 저장에 실패해 상품을 추가하지 않았습니다: ' + h.error);
    }
    return { ok: true, item };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

// 상품 정보 수정(상태 제외) : 통신사·상품명·월요금·수수료만. detail(JSON) 등 나머지는 건드리지 않습니다.
async function saveContractItem(itemId, fields){
  try {
    const le = s6LoginErr(); if (le) return s6Err(le);
    const id = Number(itemId);
    if (!Number.isFinite(id)) return s6Err('상품 ID가 올바르지 않습니다.');
    const f = fields || {}, patch = {};
    ['carrier', 'product_name'].forEach(k => { if (k in f) patch[k] = (f[k] == null || String(f[k]).trim() === '') ? null : String(f[k]).trim(); });
    for (const k of ['monthly_fee', 'commission']) {
      if (!(k in f)) continue;
      const n = s6Int(f[k]);
      if (Number.isNaN(n)) return s6Err('요금·수수료는 숫자로 입력해 주세요.');
      patch[k] = n;
    }
    if (!Object.keys(patch).length) return { ok: true, changed: false };
    const r = await sb.from('contract_items').update(patch).eq('item_id', id).select('item_id');
    if (r.error) return s6Err('저장에 실패했습니다: ' + r.error.message);
    if (!r.data || !r.data.length) return s6Err('상품을 찾을 수 없습니다.');
    return { ok: true, changed: true };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

function s6IsDraft(c){ return !!c && c.contract_status === '작성중' && !c.received_at; }

// 상품 삭제 : 접수 전(작성중) 계약의 상품만. 접수 이후에는 진행 상태를 '접수취소'로 바꿔 주세요.
async function deleteContractItem(itemId){
  try {
    const le = s6LoginErr(); if (le) return s6Err(le);
    const id = Number(itemId);
    const it = await sb.from('contract_items').select('item_id,contract_id').eq('item_id', id).limit(1);
    if (it.error) return s6Err('상품을 읽지 못했습니다: ' + it.error.message);
    const item = (it.data || [])[0];
    if (!item) return s6Err('상품을 찾을 수 없습니다.');
    const ct = await sb.from('contracts').select('contract_id,contract_status,received_at').eq('contract_id', item.contract_id).limit(1);
    if (ct.error) return s6Err('계약을 읽지 못했습니다: ' + ct.error.message);
    if (!s6IsDraft((ct.data || [])[0])) return s6Err('접수된 계약의 상품은 삭제할 수 없습니다. 진행 상태를 접수취소로 바꿔 주세요.');
    const det = await s6DetachHistory('item_id', id, '상품 ' + formatItemNo(id));
    if (!det.ok) return s6Err(det.error);
    const del = await sb.from('contract_items').delete().eq('item_id', id);
    if (del.error) { await s6RestoreHistory(det.saved); return s6Err('삭제에 실패했습니다: ' + del.error.message); }
    return { ok: true };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

// 계약 삭제 : 작성중이고 접수 시각이 없는 계약만(D15). 하위 상품·제안은 함께 삭제되고 이력은 공통 이력으로 남습니다.
// 계약 삭제.
//   - 작성중(접수 시각 없음) 계약 : 바로 삭제합니다.
//   - 접수 이후 계약 : opts.force === true 일 때만 삭제합니다(잘못 만든 계약 정리용). 지급·환수 상태가 있는 계약은 돈 기록이 있으므로 삭제하지 않습니다.
//   - 삭제하는 계약에 연결된 유심 계약은 남기고 연결만 풉니다. 이력은 지우지 않고 '삭제된 계약' 표시를 붙여 공통 이력으로 남깁니다.
async function deleteContract(contractId, opts){
  try {
    const le = s6LoginErr(); if (le) return s6Err(le);
    const force = !!(opts && opts.force);
    const id = Number(contractId);
    const ct = await sb.from('contracts').select('contract_id,customer_id,contract_type,contract_status,received_at,payout_status,clawback_status').eq('contract_id', id).limit(1);
    if (ct.error) return s6Err('계약을 읽지 못했습니다: ' + ct.error.message);
    const c = (ct.data || [])[0];
    if (!c) return s6Err('계약을 찾을 수 없습니다.');
    const draft = s6IsDraft(c);
    if (!draft) {
      if (!force) return s6Err('접수된 계약은 삭제할 수 없습니다. 상태(접수불가 등)로 처리해 주세요.');
      if (c.payout_status || c.clawback_status) return s6Err(`지급·환수 상태가 있는 계약은 삭제할 수 없습니다. (지급: ${c.payout_status || '없음'} / 환수: ${c.clawback_status || '없음'})\n상태를 정리하거나 계약취소로 처리해 주세요.`);
    }
    const no = formatContractNo(id);
    if (c.contract_type === 'home') {                       // 이 계약에 연결된 유심 계약은 남기고 연결만 풉니다.
      const un = await sb.from('contracts').update({ linked_contract_id: null }).eq('linked_contract_id', id).select('contract_id');
      if (un.error) return s6Err('연결된 유심 계약을 정리하지 못했습니다: ' + un.error.message);
    }
    const det = await s6DetachHistory('contract_id', id, '계약 ' + no);
    if (!det.ok) return s6Err(det.error);
    const del = await sb.from('contracts').delete().eq('contract_id', id);
    if (del.error) { await s6RestoreHistory(det.saved); return s6Err('삭제에 실패했습니다: ' + del.error.message); }
    const note = draft ? `계약 ${no} 삭제` : `계약 ${no} 삭제 (접수 이후 계약 · 삭제 당시 상태 ${c.contract_status}${c.received_at ? ' · 접수 ' + String(c.received_at).slice(0, 16).replace('T', ' ') : ''})`;
    const h = await s6WriteHistory({ customer_id: c.customer_id, target_type: 'customer', axis: null, event_type: 'contract_deleted', note });
    return h.ok ? { ok: true } : { ok: true, historyWarning: '계약은 삭제됐지만 삭제 이력 저장에 실패했습니다: ' + h.error };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

// 고객 삭제 전 확인 : 접수 이후 계약(작성중이 아니거나 접수 시각이 있는 계약)이 있으면 삭제할 수 없습니다.
async function checkCustomerDeletable(customerId){
  try {
    const r = await sb.from('contracts').select('contract_id,contract_status,received_at').eq('customer_id', Number(customerId));
    if (r.error) return s6Err('계약을 확인하지 못했습니다: ' + r.error.message);
    const blocked = (r.data || []).filter(c => !s6IsDraft(c));
    if (blocked.length) return { ok: false, blocked: blocked.map(c => formatContractNo(c.contract_id)),
      error: `접수된 계약(${blocked.map(c => formatContractNo(c.contract_id)).join(', ')})이 있어 고객을 삭제할 수 없습니다. 상태를 이탈 또는 제외로 처리해 주세요.` };
    return { ok: true, draftCount: (r.data || []).length };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

// 고객 삭제 전 새 구조 데이터 정리 : 이력 → 계약(작성중만, 하위 상품·제안 포함). 고객 행 자체는 호출한 쪽에서 지웁니다.
async function deleteCustomerNewData(customerId){
  const id = Number(customerId);
  const chk = await checkCustomerDeletable(id);
  if (!chk.ok) return chk;
  const h = await sb.from('status_history').delete().eq('customer_id', id);
  if (h.error) return s6Err('이력 삭제에 실패했습니다: ' + h.error.message);
  const c = await sb.from('contracts').delete().eq('customer_id', id);
  if (c.error) return s6Err('계약 삭제에 실패했습니다: ' + c.error.message);
  return { ok: true };
}


// ============================================================
// 상담 입력값 → 계약·제안·상품 변환 규칙 (S7-1)
// ------------------------------------------------------------
//  - 추가만 한 순수 함수입니다. DB를 읽거나 쓰지 않고 화면도 바꾸지 않습니다(저장은 S7-2·S7-3, 화면 연결은 S7-4·S7-5).
//  - 상담 화면(1세트 구조)의 값을 받아 "인터넷·TV 계약 1건 + 유심 계약 N건 + 제안 행 + 상담 스냅샷"으로 바꿉니다.
//  - 계약·상품은 **최종상품(finalProducts)에서만** 만듭니다. 제안상품(reflectedProducts)은 안내용이라 제안 행으로만 남깁니다.
//  - 유심은 회선 1개 = 계약 1건입니다. "고객 본인 회선(상담정보 연동)" 자동 행은 판매 상품이 아니므로 계약으로 만들지 않고,
//    본인 회선 정보는 스냅샷의 customerInfo(mobileCarrier·mobileFee)에 남습니다.
//  - 다시 저장할 때 같은 계약·상품을 찾을 수 있도록 matchKey 를 붙입니다.
//      인터넷·TV 계약 'home' / 그 안의 상품 'internet', 'tv' / 유심 계약은 상담 화면 상품 ID(p.id) — 유심 상품은 'usim'
//  - 상태(접수·진행)는 여기서 다루지 않습니다. 상태는 changeStatus() 로만 바꿉니다.
//  - 금액 필드 이름은 saveContractMeta·addContractItem 이 받는 이름(gift_total 등 / monthlyFee·commission)과 같습니다.
// ============================================================
const S7_USIM_GIFT_BASE = 150000;   // 유심 사은품 기본값 = 수수료 - 150,000원 (상담 화면의 기존 계산과 동일)

function s7Num(v){
  if (v === null || v === undefined || v === '') return null;
  const n = Number(typeof v === 'string' ? v.replace(/[,\s원]/g, '') : v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
// 수수료 에이전시 이름이 있을 때만 상품 detail 에 담습니다(없으면 키를 만들지 않아 기존 상품과 값이 같게 유지).
function s7AgencyDetail(agency){ return agency ? { commissionAgency: agency } : {}; }
function s7Clone(v){ return (v === null || v === undefined) ? v : JSON.parse(JSON.stringify(v)); }
function s7IsSyncedLine(p){ return !!p && (p.synced === true || p.id === 'synced-cs-line'); }
function s7HasTv(p){
  if (p.tvTier !== undefined && p.tvTier !== null) return p.tvTier !== 'none';
  return !!p.tvLabel && p.tvLabel !== '미포함' && p.tvLabel !== '인터넷 단독';
}
function s7UsimCommission(p, helpers){
  if (!helpers || typeof helpers.usimCommission !== 'function') return null;
  const fee = s7Num(p.fee) || 0;
  const c = helpers.usimCommission(p.carrier, fee);
  return Number.isFinite(Number(c)) && c !== null ? Math.round(Number(c)) : null;
}
function s7UsimGift(p, commission){
  if (p.gift !== null && p.gift !== undefined && p.gift !== '') return s7Num(p.gift);
  return commission != null ? Math.max(0, commission - S7_USIM_GIFT_BASE) : null;
}
function s7HomeCommission(p, helpers){
  if (!helpers || typeof helpers.homeCommission !== 'function') return null;
  const c = helpers.homeCommission(p);
  return (c === null || c === undefined || !Number.isFinite(Number(c))) ? null : Math.round(Number(c));
}

// 인터넷·TV 최종상품 1건 → 계약 1건(+ 인터넷 상품, TV 상품).
// 상품별 월요금(확정 C8):
//   인터넷 = 인터넷요금 + 공유기요금 - 인터넷·TV 결합할인(bundleDiscount)
//   TV     = TV요금 + 셋탑박스요금 - TV결합할인(tvBundleDiscount) + 추가 TV 요금(메인 TV 상품에 종속, D3-6)
//   → 두 상품 요금의 합은 상담 화면 합계(totalFee)와 같아야 하며, 다르면 경고를 남깁니다.
// 홈 수수료(lookupCommission 결과)는 인터넷·TV로 나눌 수 없어 인터넷 상품과 계약(commission_total)에만 기록하고 TV 상품은 비웁니다.
function s7HomeContract(p, helpers, warnings){
  const hasTv = s7HasTv(p);
  const total = s7Num(p.totalFee);
  const internetFee = (s7Num(p.internetFee) || 0) + (s7Num(p.routerFee) || 0) - (hasTv ? (s7Num(p.bundleDiscount) || 0) : 0);
  const tvFee = hasTv
    ? (s7Num(p.tvFee) || 0) + (s7Num(p.settopFee) || 0) - (s7Num(p.tvBundleDiscount) || 0) + (s7Num(p.extraTvFee) || 0)
    : null;
  const commission = s7HomeCommission(p, helpers);
  if (total === null) warnings.push('인터넷·TV 최종상품의 합계 요금(totalFee)이 없어 항목별 요금 합계를 비교하지 못했습니다.');
  else if (internetFee + (tvFee || 0) !== total) warnings.push(`인터넷·TV 상품 요금의 합(${(internetFee + (tvFee || 0)).toLocaleString()}원)이 상담 화면 합계(${total.toLocaleString()}원)와 다릅니다. 요금 항목을 확인해 주세요.`);

  const items = [{
    matchKey: 'internet', productType: 'internet', carrier: p.carrierName || null,
    productName: p.internetLabel || null, monthlyFee: internetFee, commission,
    detail: { consultKey: p.id, carrierKey: p.carrierKey || null, lgVariant: p.lgVariant || null, speedNum: p.speedNum ?? null, internetLabel: p.internetLabel || null,
      internetFee: s7Num(p.internetFee), routerLabel: p.routerLabel || null, routerFee: s7Num(p.routerFee), bundleDiscount: s7Num(p.bundleDiscount),
      ...s7AgencyDetail(helpers && typeof helpers.homeAgency === 'function' ? helpers.homeAgency(p) : null) }     // 수수료 에이전시(C-AG1)
  }];
  if (hasTv) {
    items.push({
      matchKey: 'tv', productType: 'tv', carrier: p.carrierName || null,
      productName: p.tvLabel || null, monthlyFee: tvFee, commission: null,
      detail: { consultKey: p.id, carrierKey: p.carrierKey || null, lgVariant: p.lgVariant || null, tvTier: p.tvTier ?? null, tvLabel: p.tvLabel || null, tvName: p.tvName || null,
        tvChannels: p.tvChannels ?? null, tvFee: s7Num(p.tvFee), settopLabel: p.settopLabel || null, settopFee: s7Num(p.settopFee),
        tvBundleDiscount: s7Num(p.tvBundleDiscount), extraTVs: s7Clone(p.extraTVs) || [], extraTvFee: s7Num(p.extraTvFee) || 0,
        extraTvDetails: s7Clone(p.extraTvDetails) || [] }     // 추가 TV는 메인 TV 상품에 종속(D3-6)
    });
  }
  return {
    matchKey: 'home', contractType: 'home', sourceId: p.id,
    label: `${p.carrierName || ''} ${hasTv ? '인터넷+TV' : '인터넷'}`.trim(),
    meta: { gift_total: s7Num(p.benefitTotal), gift_card: s7Num(p.giftCard), gift_cash: s7Num(p.cash), gift_extra: s7Num(p.extraPay), commission_total: commission },
    items
  };
}

// 유심 최종상품 1건 → 계약 1건(+ 유심 상품 1건)
function s7UsimContract(p, helpers){
  const fee = s7Num(p.fee) || 0;
  const commission = s7UsimCommission(p, helpers);
  const gift = s7UsimGift(p, commission);
  return {
    matchKey: p.id, contractType: 'usim', sourceId: p.id,
    label: `${p.carrier || ''} ${p.planName || ''}`.trim(),
    meta: { gift_total: gift, commission_total: commission },
    items: [{ matchKey: 'usim', productType: 'usim', carrier: p.carrier || null, productName: p.planName || null, monthlyFee: fee, commission,
      detail: Object.assign(s7Clone(p), { consultKey: p.id }, s7AgencyDetail(helpers && typeof helpers.usimAgency === 'function' ? helpers.usimAgency(p.carrier, fee) : null)) }]
  };
}

// 제안 행 1건(안내용 스냅샷). 최종상품에도 올라간 제안은 isFinal = true.
function s7ProposalRow(p, isFinal, helpers){
  if (p.type === 'home') {
    return { matchKey: p.id, productType: 'home', isFinal, carrier: p.carrierName || null,
      productName: `${p.internetLabel || ''} · ${p.tvLabel || ''}`, monthlyFee: s7Num(p.totalFee), giftAmount: s7Num(p.benefitTotal),
      commission: s7HomeCommission(p, helpers), detail: s7Clone(p) };
  }
  const commission = s7UsimCommission(p, helpers);
  return { matchKey: p.id, productType: 'usim', isFinal, carrier: p.carrier || null, productName: p.planName || null,
    monthlyFee: s7Num(p.fee) || 0, giftAmount: s7UsimGift(p, commission), commission, detail: s7Clone(p) };
}

// 변환 진입점.
//   input:   { reflectedProducts, finalProducts, addedUsimLines, customerInfo:{ mobileCarrier, mobileFee, oldInternet, familyLines }, comboDiscount }
//   helpers: { homeCommission(item)→숫자|null, usimCommission(carrier, fee)→숫자|null, now()→ISO 문자열(선택) }
//            (비로그인이면 두 수수료 함수가 null 을 돌려주도록 호출하는 쪽에서 감쌉니다)
//   반환:    { home: 계약|null, usims: [계약...], proposals: [제안 행...], snapshot, warnings: [문구...] }
function s7BuildConsultPlan(input, helpers){
  const inp = input || {};
  const warnings = [];
  const reflected = Array.isArray(inp.reflectedProducts) ? inp.reflectedProducts : [];
  const finals = Array.isArray(inp.finalProducts) ? inp.finalProducts : [];

  const homeFinals = finals.filter(p => p && p.type === 'home');
  if (homeFinals.length > 1) warnings.push('인터넷·TV 최종상품이 2건 이상입니다. 첫 번째 상품만 계약으로 만듭니다.');
  const home = homeFinals.length ? s7HomeContract(homeFinals[0], helpers, warnings) : null;

  const seen = new Set();
  const usims = [];
  finals.filter(p => p && p.type === 'usim').forEach(p => {
    if (s7IsSyncedLine(p)) return;                              // 고객 본인 회선(연동 행)은 판매 상품이 아님
    if (seen.has(p.id)) { warnings.push('같은 유심 최종상품이 중복되어 한 번만 반영합니다.'); return; }
    seen.add(p.id);
    usims.push(s7UsimContract(p, helpers));
  });

  const finalIds = new Set(finals.filter(Boolean).map(p => p.id));
  const proposals = reflected.filter(p => p && (p.type === 'home' || p.type === 'usim')).map(p => s7ProposalRow(p, finalIds.has(p.id), helpers));

  const ci = inp.customerInfo || {};
  const snapshot = {
    snapshotVersion: 2,
    savedAt: (helpers && typeof helpers.now === 'function') ? helpers.now() : new Date().toISOString(),
    customerInfo: {
      mobileCarrier: ci.mobileCarrier ?? '', mobileFee: ci.mobileFee ?? null,
      oldInternet: s7Clone(ci.oldInternet) ?? null, familyLines: s7Clone(ci.familyLines) || []
    },
    proposals: s7Clone(reflected), finals: s7Clone(finals), comboDiscount: s7Clone(inp.comboDiscount) ?? null
  };
  return { home, usims, proposals, snapshot, warnings };
}


// ============================================================
// 상담 세트 계약 저장 (S7-2)
// ------------------------------------------------------------
//  - 추가만 한 함수입니다. 화면은 아직 연결하지 않습니다(연결은 S7-4·S7-5). 상품·제안 저장은 S7-3에서 합니다.
//  - 대상: S7-1 변환 결과(s7BuildConsultPlan)의 계약. 상태는 changeStatus() 로만 바꾸므로 여기서는 계약 생성·정보·스냅샷만 다룹니다.
//  - 저장 범위(C4, B안): **상담 화면이 불러온(또는 직전에 저장한) 계약에만** 저장합니다. 새 상담이나 다른 고객은 새 계약을 만듭니다.
//    · 인터넷·TV 계약(대표 계약)이 상담 스냅샷(consult_snapshot)을 가집니다. 최종상품이 없어도 제안·유심이 있으면 상품 없는 대표 계약을 만들어
//      제안과 스냅샷을 보관합니다(작성중, 접수되기 전까지 상품 추가 가능). 아무 내용도 없으면 계약을 만들지 않습니다.
//    · 대표 계약이 수정 가능 범위(작성중·접수대기·접수보류, 접수 시각 없음 — s7IsEditable)가 아니면 상담 저장은 아무것도 바꾸지 않고 안내만 합니다(skippedAll). 유심 계약도 같습니다. (S7-9b, C9)
//    · 접수 단계(작성중이 아닌) 계약에서는 상담 화면에서 뺀 상품을 삭제하지 않고 진행 상태 접수취소로 바꿉니다(이력 남김, S7-9c). 설치완료 상품은 바꾸지 않고 경고합니다.
//      빠진 유심 회선의 계약도 삭제하지 않고 계약은 남기며 상품만 접수취소로 바꿉니다. 상담 저장이 접수취소한 상품은 다시 올리면 되살립니다(사유 표식으로 구분, 계약 카드에서 직접 접수취소한 상품은 되살리지 않음).
//    · 상담 화면에서 뺀 유심 회선의 계약은 작성중이면 삭제하고, 접수된 계약은 그대로 둡니다(경고만).
//    · 유심 계약은 인터넷·TV 최종상품이 있을 때만 대표 계약에 연결합니다(결합할인 대상).
//    · 계약 정보는 비어 있지 않은 값만 덮어씁니다(라벨은 새로 만들 때만 정함). 사은품 값은 상담 화면 값이 기준입니다.
//  - 중간에 실패하면 { ok:false, error } 와 함께 그때까지 만들어진 계약 ID(carrierContractId, usimByKey)를 돌려주어 화면이 같은 계약을 기억하게 합니다.
//  - 계약을 다시 찾는 방법: 대표 계약 = consult_snapshot 이 있는 가장 최근 인터넷·TV 계약, 유심 계약 = 그 스냅샷 최종상품의 상담 상품 ID(detail.consultKey)와
//    같은 키를 가진 유심 상품이 든 계약(s7LoadConsultTargets).
// ============================================================
// 상담 저장으로 수정할 수 있는 계약인가(S7-9b, C9): 작성중·접수대기·접수보류이면서 접수 시각이 없는 계약.
// 접수완료·접수불가 등이거나 접수 시각이 한 번이라도 기록된 계약은 상담 저장이 바꾸지 않습니다.
const S7_EDITABLE_STATUSES = ['작성중', '접수대기', '접수보류'];
function s7IsEditable(c){ return !!c && S7_EDITABLE_STATUSES.includes(c.contract_status) && !c.received_at; }

function s7NonNull(obj){
  const r = {};
  Object.keys(obj || {}).forEach(k => { if (obj[k] !== null && obj[k] !== undefined) r[k] = obj[k]; });
  return r;
}
function s7ItemKey(it){
  const d = it && it.detail;
  return (d && typeof d === 'object' && d.consultKey) ? String(d.consultKey) : null;
}

// ------------------------------------------------------------
// 변경 메모 이력 (S7-9d)
//  - 접수 단계(작성중이 아닌) 계약에서 상담 저장이 상품·사은품·수수료 값을 바꾸면, 무엇이 어떻게 바뀌었는지 status_history 에 메모로 남깁니다.
//    작성중 계약은 접수 전이라 저장할 때마다 값이 바뀌는 게 정상이므로 메모를 남기지 않습니다(접수 전 변경은 추적 대상이 아님).
//  - 메모 행: event_type = 'memo'(DB에 event_type 제약 없음: 01_structure.sql 의 CHECK 는 target_type 뿐), axis·from·to 는 비우고 note 에 내용을 적습니다.
//    상품 값 변경은 target_type = 'item'(item_id + contract_id), 사은품·수수료 합계 변경은 target_type = 'contract'. 둘 다 계약 필터에 보입니다.
//  - 저장 순서는 changeStatus 와 같습니다: 메모를 먼저 저장 → 실패하면 값을 바꾸지 않음 → 값 저장이 실패하면 방금 저장한 메모를 지움.
//  - 값이 실제로 달라진 항목만 적습니다(같은 내용으로 다시 저장해도 메모가 늘지 않음). 상세(detail JSON)만 달라진 경우는 눈에 보이는 변경이 없어 메모하지 않습니다.
// ------------------------------------------------------------
const S7_MEMO_MONEY = ['monthly_fee', 'commission', 'gift_total', 'gift_card', 'gift_cash', 'gift_extra', 'commission_total'];
const S7_MEMO_ITEM_FIELDS = [['carrier', '통신사'], ['product_name', '상품명'], ['monthly_fee', '월요금'], ['commission', '수수료']];
const S7_MEMO_CONTRACT_FIELDS = [['gift_total', '사은품 합계'], ['gift_card', '상품권'], ['gift_cash', '현금'], ['gift_extra', '추가지급'], ['commission_total', '수수료 합계']];

function s7MemoVal(col, v){
  if (v === null || v === undefined || v === '') return '(없음)';
  if (S7_MEMO_MONEY.includes(col)) return String(Math.round(Number(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
  return `'${v}'`;
}

// before(현재 행) 와 after(새 값) 에서 fields 의 값이 달라진 것만 "라벨 이전 → 이후" 문구로 만듭니다. 달라진 게 없으면 ''.
function s7DiffNote(before, after, fields){
  const parts = [];
  for (const [col, label] of fields) {
    if (!after || !(col in after)) continue;
    const money = S7_MEMO_MONEY.includes(col);
    const norm = v => (v === undefined || v === '' || v === null) ? null : (money ? s7Num(v) : String(v));
    const a = norm(before ? before[col] : null), b = norm(after[col]);
    if (a === b) continue;
    parts.push(`${label} ${s7MemoVal(col, a)} → ${s7MemoVal(col, b)}`);
  }
  return parts.join(' · ');
}

// 변경 메모 1건 저장 : { ok, historyId } / { ok:false, error }
async function s7WriteChangeMemo(o){
  return s6WriteHistory({
    customer_id: o.customerId, contract_id: o.contractId, item_id: o.itemId || null,
    event_type: 'memo', target_type: o.itemId ? 'item' : 'contract', axis: null, from_value: null, to_value: null, note: o.note
  });
}
async function s7DropMemo(historyId){
  if (historyId === null || historyId === undefined) return;
  await sb.from('status_history').delete().eq('history_id', historyId);
}

// 계약 정보(사은품·수수료 합계) 저장. withMemo 이면 바뀐 값을 메모로 남깁니다.
async function s7SaveMeta(contractId, customerId, meta, withMemo){
  if (!withMemo) return saveContractMeta(contractId, meta);
  const cur = await sb.from('contracts').select('contract_id,gift_total,gift_card,gift_cash,gift_extra,commission_total').eq('contract_id', contractId).limit(1);
  if (cur.error) return s6Err('계약 정보를 읽지 못했습니다: ' + cur.error.message);
  const row = (cur.data || [])[0];
  if (!row) return s6Err('계약을 찾을 수 없습니다.');
  const note = s7DiffNote(row, meta, S7_MEMO_CONTRACT_FIELDS);
  let memoId = null;
  if (note) {
    const h = await s7WriteChangeMemo({ customerId, contractId, note: '상담 저장으로 계약 정보 변경: ' + note });
    if (!h.ok) return s6Err('변경 이력을 저장하지 못해 계약 정보를 바꾸지 않았습니다: ' + h.error);
    memoId = h.historyId;
  }
  const r = await saveContractMeta(contractId, meta);
  if (!r.ok) await s7DropMemo(memoId);
  else if (memoId !== null) r.memoId = memoId;
  return r;
}

// 상담 화면이 쓸 계약 찾기 : { ok, carrierContractId, usimByKey, snapshot, contracts }
async function s7LoadConsultTargets(customerId){
  try {
    const le = s6LoginErr(); if (le) return s6Err(le);
    const cid = Number(customerId);
    if (!Number.isFinite(cid)) return s6Err('고객 ID가 올바르지 않습니다.');
    const cs = await sb.from('contracts').select('contract_id,contract_type,contract_status,received_at,linked_contract_id,updated_at,consult_snapshot').eq('customer_id', cid);
    if (cs.error) return s6Err('계약을 읽지 못했습니다: ' + cs.error.message);
    const rows = cs.data || [];
    const carriers = rows.filter(c => c.contract_type === 'home' && c.consult_snapshot)
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || b.contract_id - a.contract_id);
    const carrier = carriers[0] || null;
    const out = { ok: true, carrierContractId: carrier ? carrier.contract_id : null, carrierItemTypes: [], usimByKey: {}, snapshot: carrier ? carrier.consult_snapshot : null,
      contracts: rows.map(c => ({ contract_id: c.contract_id, contract_type: c.contract_type, contract_status: c.contract_status, received_at: c.received_at, linked_contract_id: c.linked_contract_id })) };
    if (!carrier) return out;
    const ci = await sb.from('contract_items').select('product_type').eq('contract_id', carrier.contract_id);
    if (ci.error) return s6Err('상품을 읽지 못했습니다: ' + ci.error.message);
    out.carrierItemTypes = (ci.data || []).map(r => r.product_type);
    const snap = carrier.consult_snapshot;
    const keys = new Set((Array.isArray(snap && snap.finals) ? snap.finals : []).filter(p => p && p.type === 'usim').map(p => String(p.id)));
    const usimIds = rows.filter(c => c.contract_type === 'usim').map(c => c.contract_id);
    if (!keys.size || !usimIds.length) return out;
    const it = await sb.from('contract_items').select('contract_id,item_id,product_type,detail').eq('customer_id', cid).eq('product_type', 'usim');
    if (it.error) return s6Err('상품을 읽지 못했습니다: ' + it.error.message);
    (it.data || []).forEach(r => { const k = s7ItemKey(r); if (k && keys.has(k) && usimIds.includes(r.contract_id)) out.usimByKey[k] = r.contract_id; });
    return out;
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

// 상담 세트의 계약 저장.
//   opts: { customerId, plan(s7BuildConsultPlan 결과), targets: { carrierContractId, usimByKey }, removeMissing(기본 true) }
//   반환: { ok, error?, skippedAll?, carrierContractId, homeContractId, carrier, home, usims:[{matchKey, contractId, created, skipped, reason}], removed:[...], warnings:[...] }
async function s7SaveConsultContracts(opts){
  const out = { ok: false, skippedAll: false, carrierContractId: null, homeContractId: null, carrier: null, home: null, usims: [], removed: [], usimByKey: {}, warnings: [] };
  const fail = msg => { out.ok = false; out.error = msg; return out; };
  try {
    const le = s6LoginErr(); if (le) return fail(le);
    const o = opts || {};
    const cid = Number(o.customerId);
    if (!Number.isFinite(cid)) return fail('고객 ID가 올바르지 않습니다.');
    const plan = o.plan;
    if (!plan || typeof plan !== 'object') return fail('상담 변환 결과가 없습니다.');
    const usims = Array.isArray(plan.usims) ? plan.usims : [];
    const proposals = Array.isArray(plan.proposals) ? plan.proposals : [];
    (plan.warnings || []).forEach(w => out.warnings.push(w));
    const targets = o.targets || {};
    const known = (targets.usimByKey && typeof targets.usimByKey === 'object') ? targets.usimByKey : {};

    // 화면이 기억하는 계약의 현재 상태(같은 고객의 계약만 인정)
    const ids = [targets.carrierContractId, ...Object.values(known)].filter(v => v !== null && v !== undefined).map(Number).filter(Number.isFinite);
    const state = {};
    if (ids.length) {
      const r = await sb.from('contracts').select('contract_id,customer_id,contract_type,contract_status,received_at,linked_contract_id').in('contract_id', ids);
      if (r.error) return fail('계약을 읽지 못했습니다: ' + r.error.message);
      (r.data || []).filter(c => c.customer_id === cid).forEach(c => { state[c.contract_id] = c; });
    }

    // 1) 대표(인터넷·TV) 계약 : 기억하는 계약이 있으면 그것, 없으면 저장할 내용이 있을 때만 새로 만듭니다.
    let carrierState = targets.carrierContractId !== null && targets.carrierContractId !== undefined ? state[Number(targets.carrierContractId)] : null;
    if (carrierState && carrierState.contract_type !== 'home') carrierState = null;
    if (targets.carrierContractId && !carrierState) out.warnings.push('상담 화면이 기억하던 계약을 찾지 못해 새 계약으로 저장합니다.');
    const needCarrier = !!(plan.home || usims.length || proposals.length);
    if (!carrierState && !needCarrier) { out.ok = true; return out; }       // 저장할 내용이 없음 : 계약을 만들지 않음

    if (carrierState) {
      out.carrierContractId = out.homeContractId = carrierState.contract_id;
      if (!s7IsEditable(carrierState)) {
        out.skippedAll = true; out.ok = true;
        out.carrier = out.home = { contractId: carrierState.contract_id, skipped: true, reason: `계약 상태가 '${carrierState.contract_status}'이거나 접수 이력이 있어 상담 저장이 바꾸지 않습니다. 새 상담으로 시작해 주세요.` };
        out.warnings.push(out.carrier.reason);
        Object.entries(known).forEach(([k, v]) => { out.usimByKey[k] = Number(v); });
        return out;
      }
      out.carrier = { contractId: carrierState.contract_id, created: false, draft: s6IsDraft(carrierState) };
    } else {
      const cr = await createContract({ customerId: cid, contractType: 'home', label: plan.home ? plan.home.label : '상담 계약' });
      if (!cr.ok) return fail('인터넷·TV 계약을 만들지 못했습니다: ' + cr.error);
      out.carrierContractId = out.homeContractId = cr.contract.contract_id;
      out.carrier = { contractId: cr.contract.contract_id, created: true, draft: true };
    }
    out.home = plan.home ? Object.assign({ matchKey: plan.home.matchKey }, out.carrier) : null;
    const carrierId = out.carrierContractId;

    // 스냅샷은 대표 계약에 가장 먼저 저장 : 이후 단계가 실패해도 다시 불러올 때 같은 대표 계약을 찾습니다.
    const sn = await sb.from('contracts').update({ consult_snapshot: plan.snapshot || null }).eq('contract_id', carrierId).select('contract_id');
    if (sn.error) return fail('상담 스냅샷 저장에 실패했습니다: ' + sn.error.message);
    if (plan.home) {
      const m = await s7SaveMeta(carrierId, cid, s7NonNull(plan.home.meta), out.carrier.draft === false);   // S7-9d: 접수 단계 계약이면 변경 메모
      if (!m.ok) return fail('인터넷·TV 계약 정보 저장에 실패했습니다: ' + m.error);
      if (m.memoId !== undefined && m.memoId !== null) out.carrier.metaMemo = true;      // 화면 안내용(S7-9e)
    }

    // 2) 유심 계약 : 키(상담 상품 ID)로 기존 계약을 찾고, 없으면 새로 만듭니다. 인터넷·TV 최종상품이 있을 때만 대표 계약에 연결합니다.
    const linkId = plan.home ? carrierId : null;
    const inPlan = new Set();
    for (const u of usims) {
      inPlan.add(u.matchKey);
      const row = { matchKey: u.matchKey, contractId: null, created: false, skipped: false };
      const ex = known[u.matchKey] !== undefined && known[u.matchKey] !== null ? state[Number(known[u.matchKey])] : null;
      if (ex && ex.contract_type === 'usim') {
        row.contractId = ex.contract_id; row.draft = s6IsDraft(ex);
        if (!s7IsEditable(ex)) {
          row.skipped = true; row.reason = `유심 계약 상태가 '${ex.contract_status}'이거나 접수 이력이 있어 상담 저장이 바꾸지 않습니다.`;
          out.warnings.push(`유심 ${formatContractNo(ex.contract_id)}: ${row.reason}`);
        } else {
          if ((ex.linked_contract_id || null) !== linkId) {
            const lk = await sb.from('contracts').update({ linked_contract_id: linkId }).eq('contract_id', ex.contract_id).select('contract_id');
            if (lk.error) { out.usimByKey[u.matchKey] = ex.contract_id; out.usims.push(row); return fail('유심 계약 연결 변경에 실패했습니다: ' + lk.error.message); }
          }
          const m = await s7SaveMeta(ex.contract_id, cid, s7NonNull(u.meta), row.draft === false);   // S7-9d: 접수 단계 계약이면 변경 메모
          if (!m.ok) { out.usimByKey[u.matchKey] = ex.contract_id; out.usims.push(row); return fail('유심 계약 정보 저장에 실패했습니다: ' + m.error); }
          if (m.memoId !== undefined && m.memoId !== null) row.metaMemo = true;      // 화면 안내용(S7-9e)
        }
      } else {
        if (known[u.matchKey]) out.warnings.push('상담 화면이 기억하던 유심 계약을 찾지 못해 새 계약으로 저장합니다.');
        const cr = await createContract({ customerId: cid, contractType: 'usim', label: u.label, linkedContractId: linkId });
        if (!cr.ok) return fail('유심 계약을 만들지 못했습니다: ' + cr.error);
        row.contractId = cr.contract.contract_id; row.created = true; row.draft = true;
        out.usimByKey[u.matchKey] = row.contractId; out.usims.push(row);
        const m = await saveContractMeta(row.contractId, s7NonNull(u.meta));
        if (!m.ok) return fail('유심 계약 정보 저장에 실패했습니다: ' + m.error);
        continue;
      }
      out.usimByKey[u.matchKey] = row.contractId; out.usims.push(row);
    }

    // 3) 상담 화면에서 뺀 유심 회선 : 작성중이면 삭제, 접수된 계약은 그대로(경고)
    if (o.removeMissing !== false) {
      for (const key of Object.keys(known)) {
        if (inPlan.has(key)) continue;
        const st = state[Number(known[key])];
        if (!st) continue;                                                   // 이미 없어진 계약
        if (!s6IsDraft(st)) {
          out.usimByKey[key] = st.contract_id;
          if (!s7IsEditable(st)) {
            out.warnings.push(`유심 ${formatContractNo(st.contract_id)}: 접수 이력이 있는 계약('${st.contract_status}')이라 상담 화면에서 빼도 바뀌지 않습니다.`);
            continue;
          }
          // 접수대기·접수보류 계약 : 삭제하지 않고 계약은 남기며 상품을 접수취소로 바꿉니다(D15).
          const ci = await s7SaveContractItems(st.contract_id, cid, [], { allowDelete: false });
          ci.warnings.forEach(w => out.warnings.push(w));
          if (!ci.ok) return fail(`유심 ${formatContractNo(st.contract_id)} 상품을 접수취소로 바꾸지 못했습니다: ${ci.error}`);
          continue;
        }
        const d = await deleteContract(st.contract_id);
        if (!d.ok) { out.usimByKey[key] = st.contract_id; return fail(`유심 ${formatContractNo(st.contract_id)} 삭제에 실패했습니다: ${d.error}`); }
        out.removed.push({ matchKey: key, contractId: st.contract_id });
        if (d.historyWarning) out.warnings.push(d.historyWarning);
      }
    }
    out.ok = true;
    return out;
  } catch (e) { return fail(e && e.message ? e.message : String(e)); }
}


// ============================================================
// 제안·최종상품 저장 + 상담 세트 저장 (S7-3)
// ------------------------------------------------------------
//  - 추가만 한 함수입니다. 화면은 아직 연결하지 않습니다(연결은 S7-4·S7-5).
//  - 저장 방식(C5): 최종상품은 **상품 ID를 유지하며 갱신**하고, 최종상품에서 뺀 상품은 작성중 계약이라 **삭제**합니다.
//    제안 행은 안내용 스냅샷이라 대표 계약 단위로 **통째로 교체**합니다(제안 ID 유지 안 함).
//  - 상품 찾기: 한 계약 안에서 상품 구분(internet / tv / usim)이 같은 상품이 같은 상품입니다. 구분별로 1건만 두며, 같은 구분이 여러 건이면 첫 건만 갱신하고 경고합니다.
//  - 상품 정보(통신사·상품명·월요금·수수료·detail)만 덮어쓰고, 진행 상태(설치대기 등)는 건드리지 않습니다.
//  - 제안 행의 detail 모양: { consultKey(상담 화면 상품 ID), isFinal(최종상품에도 올렸는지), product(상담 화면 상품 값) }
//  - 제안 교체 순서: 새 행 저장 → 옛 행 삭제. 새 행 저장이 실패하면 옛 제안이 그대로 남고, 삭제가 실패하면 오류로 알려 다시 저장하면 정리됩니다.
//  - 접수가 진행된 계약(건너뜀)은 상품·제안도 바꾸지 않습니다.
// ============================================================
const S7_CANCEL_REASON = '상담 저장: 상담 화면에서 상품 제외';   // 상담 저장이 접수취소로 바꾼 상품의 사유(다시 올리면 되살리는 기준)

async function s7SaveContractItems(contractId, customerId, planItems, opts){
  const out = { ok: false, added: [], updated: [], removed: [], canceled: [], reactivated: [], memos: [], warnings: [] };
  const fail = msg => { out.ok = false; out.error = msg; return out; };
  try {
    const le = s6LoginErr(); if (le) return fail(le);
    const cid = Number(contractId), cust = Number(customerId);
    if (!Number.isFinite(cid) || !Number.isFinite(cust)) return fail('계약 ID 또는 고객 ID가 올바르지 않습니다.');
    const items = Array.isArray(planItems) ? planItems : [];
    const allowDelete = !(opts && opts.allowDelete === false);      // 접수 단계 계약은 삭제하지 않고 접수취소로 처리(S7-9b·c)
    const ex = await sb.from('contract_items').select('*').eq('contract_id', cid).order('item_id', { ascending: true });
    if (ex.error) return fail('상품을 읽지 못했습니다: ' + ex.error.message);
    const rows = (ex.data || []).slice().sort((a, b) => a.item_id - b.item_id);
    const isCanceled = r => r.progress_status === '접수취소';
    const byType = {};
    rows.forEach(r => { (byType[r.product_type] = byType[r.product_type] || []).push(r); });
    Object.keys(byType).forEach(t => {
      const act = byType[t].filter(r => !isCanceled(r));
      if (act.length > 1) out.warnings.push(`계약 ${formatContractNo(cid)}에 ${t} 상품이 ${act.length}건 있어 첫 건(${formatItemNo(act[0].item_id)})만 갱신합니다.`);
    });

    const wantedTypes = new Set();
    for (const it of items) {
      wantedTypes.add(it.productType);
      const fee = s6Int(it.monthlyFee), comm = s6Int(it.commission);
      if (Number.isNaN(fee) || Number.isNaN(comm)) return fail('요금·수수료는 숫자여야 합니다.');
      const vals = { carrier: it.carrier || null, product_name: it.productName || null, monthly_fee: fee, commission: comm, detail: it.detail || null };
      const list = byType[it.productType] || [];
      let cur = list.find(r => !isCanceled(r));
      if (!cur && list.length) {
        const mk = list.find(r => isCanceled(r) && r.cancel_reason === S7_CANCEL_REASON);
        if (!mk) {                                                  // 계약 카드에서 직접 접수취소한 상품 : 되살리지 않음
          out.warnings.push(`계약 ${formatContractNo(cid)}: 계약 카드에서 접수취소된 ${it.productType} 상품(${list.map(r => formatItemNo(r.item_id)).join(', ')})이 있어 이 구분은 상담 저장이 바꾸지 않았습니다. 새 상품은 계약 카드에서 추가해 주세요.`);
          continue;
        }
        const re = await changeStatus({ target: 'item', id: mk.item_id, axis: 'progress', to: '설치대기', note: '상담 저장으로 상품 다시 추가' });
        if (!re.ok) return fail(`상품 ${formatItemNo(mk.item_id)}를 다시 올리지 못했습니다: ${re.error}`);
        out.reactivated.push(mk.item_id);
        cur = Object.assign({}, mk, { progress_status: '설치대기', cancel_reason: null });
      }
      if (cur) {
        const same = (cur.carrier || null) === vals.carrier && (cur.product_name || null) === vals.product_name && (cur.monthly_fee ?? null) === vals.monthly_fee
          && (cur.commission ?? null) === vals.commission && JSON.stringify(cur.detail || null) === JSON.stringify(vals.detail);
        if (!same) {
          let memoId = null;
          if (!allowDelete) {                                       // S7-9d: 접수 단계 계약이면 바뀐 값을 메모로 남김(먼저 저장, 실패하면 값을 바꾸지 않음)
            const note = s7DiffNote(cur, vals, S7_MEMO_ITEM_FIELDS);
            if (note) {
              const h = await s7WriteChangeMemo({ customerId: cust, contractId: cid, itemId: cur.item_id, note: `상담 저장으로 ${S6_ITEM_TYPE_LABEL[it.productType] || it.productType} 상품 변경: ${note}` });
              if (!h.ok) return fail(`상품 ${formatItemNo(cur.item_id)} 변경 이력을 저장하지 못해 바꾸지 않았습니다: ${h.error}`);
              memoId = h.historyId;
            }
          }
          const u = await sb.from('contract_items').update(vals).eq('item_id', cur.item_id).select('item_id');
          if (u.error) { await s7DropMemo(memoId); return fail(`상품 ${formatItemNo(cur.item_id)} 저장에 실패했습니다: ${u.error.message}`); }
          out.updated.push(cur.item_id);
          if (memoId !== null) out.memos.push(memoId);
        }
      } else {
        const ins = await sb.from('contract_items').insert(Object.assign({ contract_id: cid, customer_id: cust, product_type: it.productType, progress_status: '설치대기', source: 'app' }, vals)).select('*');
        if (ins.error) return fail('상품 추가에 실패했습니다: ' + ins.error.message);
        const item = ins.data[0];
        const h = await s6WriteHistory({ customer_id: cust, contract_id: cid, item_id: item.item_id, target_type: 'item', axis: 'progress', from_value: null, to_value: '설치대기', note: '상담 저장으로 상품 추가' });
        if (!h.ok) {
          await sb.from('contract_items').delete().eq('item_id', item.item_id);
          return fail('이력 저장에 실패해 상품을 추가하지 않았습니다: ' + h.error);
        }
        out.added.push(item.item_id);
      }
    }
    // 상담 화면에서 뺀 상품 : 작성중 계약은 삭제, 접수 단계 계약은 삭제하지 않고 진행 상태를 접수취소로 바꿈(이력 남김)
    for (const t of Object.keys(byType)) {
      if (wantedTypes.has(t)) continue;
      for (const r of byType[t]) {
        if (allowDelete) {
          const d = await deleteContractItem(r.item_id);
          if (!d.ok) return fail(`상품 ${formatItemNo(r.item_id)} 삭제에 실패했습니다: ${d.error}`);
          out.removed.push(r.item_id);
          continue;
        }
        if (isCanceled(r)) continue;                                // 이미 접수취소
        if (r.progress_status === '설치완료') {
          out.warnings.push(`계약 ${formatContractNo(cid)}: ${t} 상품 ${formatItemNo(r.item_id)}는 이미 설치완료라 접수취소로 바꾸지 않았습니다. 계약 카드에서 확인해 주세요.`);
          continue;
        }
        const c = await changeStatus({ target: 'item', id: r.item_id, axis: 'progress', to: '접수취소', reason: S7_CANCEL_REASON, note: '상담 저장으로 상품 제외' });
        if (!c.ok) return fail(`상품 ${formatItemNo(r.item_id)}를 접수취소로 바꾸지 못했습니다: ${c.error}`);
        out.canceled.push(r.item_id);
        out.warnings.push(`계약 ${formatContractNo(cid)}: 상담 화면에서 뺀 ${t} 상품 ${formatItemNo(r.item_id)}를 접수취소로 바꿨습니다.`);
      }
    }
    out.ok = true;
    return out;
  } catch (e) { return fail(e && e.message ? e.message : String(e)); }
}

// 대표 계약의 제안 행 교체. 새 행 저장 → 옛 행 삭제 순서라 저장 실패 시 옛 제안이 남습니다.
async function s7ReplaceProposals(contractId, customerId, proposalRows){
  const out = { ok: false, count: 0, removed: 0 };
  const fail = msg => { out.ok = false; out.error = msg; return out; };
  try {
    const le = s6LoginErr(); if (le) return fail(le);
    const cid = Number(contractId), cust = Number(customerId);
    if (!Number.isFinite(cid) || !Number.isFinite(cust)) return fail('계약 ID 또는 고객 ID가 올바르지 않습니다.');
    const old = await sb.from('contract_proposals').select('proposal_id').eq('contract_id', cid);
    if (old.error) return fail('제안을 읽지 못했습니다: ' + old.error.message);
    const oldIds = (old.data || []).map(r => r.proposal_id);
    const rows = (Array.isArray(proposalRows) ? proposalRows : []).map(p => ({
      contract_id: cid, customer_id: cust, product_type: p.productType, carrier: p.carrier || null, product_name: p.productName || null,
      monthly_fee: s6Int(p.monthlyFee), gift_amount: s6Int(p.giftAmount), commission: s6Int(p.commission), source: 'app',
      detail: { consultKey: p.matchKey, isFinal: !!p.isFinal, product: p.detail || null }
    }));
    if (rows.some(r => Number.isNaN(r.monthly_fee) || Number.isNaN(r.gift_amount) || Number.isNaN(r.commission))) return fail('제안의 금액이 숫자가 아닙니다.');
    if (rows.length) {
      const ins = await sb.from('contract_proposals').insert(rows).select('proposal_id');
      if (ins.error) return fail('제안 저장에 실패했습니다(기존 제안은 그대로입니다): ' + ins.error.message);
      out.count = (ins.data || []).length;
    }
    if (oldIds.length) {
      const del = await sb.from('contract_proposals').delete().in('proposal_id', oldIds);
      if (del.error) return fail('이전 제안 정리에 실패했습니다. 다시 저장하면 정리됩니다: ' + del.error.message);
      out.removed = oldIds.length;
    }
    out.ok = true;
    return out;
  } catch (e) { return fail(e && e.message ? e.message : String(e)); }
}

// 상담 세트 저장 : 변환(S7-1) → 계약(S7-2) → 상품 → 제안. 한 번에 호출해 같은 계약·상품 ID를 유지하며 저장합니다.
//   opts: { customerId, input(상담 입력값: s7BuildConsultPlan 의 input), helpers(수수료 계산 함수 등), targets:{carrierContractId, usimByKey}, removeMissing }
//   반환: s7SaveConsultContracts 결과 + { items:{ [contractId]: {added,updated,removed} }, proposals:{count,removed}, plan }
//        실패 시 { ok:false, error, step } 과 함께 그때까지 만든 carrierContractId·usimByKey 를 돌려줍니다(화면이 기억해 다시 저장하면 이어서 저장).
async function saveConsultSet(opts){
  const o = opts || {};
  let plan;
  try { plan = s7BuildConsultPlan(o.input, o.helpers); }
  catch (e) { return { ok: false, step: 'plan', error: '상담 입력값을 변환하지 못했습니다: ' + (e && e.message ? e.message : e), carrierContractId: null, usimByKey: {}, warnings: [] }; }
  const res = await s7SaveConsultContracts({ customerId: o.customerId, plan, targets: o.targets, removeMissing: o.removeMissing });
  res.plan = plan; res.items = {}; res.proposals = null;
  if (!res.ok) { res.step = 'contracts'; return res; }
  if (res.skippedAll || res.carrierContractId === null) return res;           // 접수 이후 계약이거나 저장할 내용 없음
  const fail = (step, msg) => { res.ok = false; res.step = step; res.error = msg; return res; };
  const cust = Number(o.customerId);

  // 상품 : 대표(인터넷·TV) → 유심
  const homeItems = plan.home ? plan.home.items : [];
  const hi = await s7SaveContractItems(res.carrierContractId, cust, homeItems, { allowDelete: !res.carrier || res.carrier.draft !== false });
  hi.warnings.forEach(w => res.warnings.push(w));
  res.items[res.carrierContractId] = { added: hi.added, updated: hi.updated, removed: hi.removed, canceled: hi.canceled, reactivated: hi.reactivated, memos: hi.memos };
  if (!hi.ok) return fail('items', '인터넷·TV 상품 저장에 실패했습니다: ' + hi.error);
  for (const u of plan.usims) {
    const row = res.usims.find(x => x.matchKey === u.matchKey);
    if (!row || row.skipped) continue;
    const ui = await s7SaveContractItems(row.contractId, cust, u.items, { allowDelete: row.draft !== false });
    ui.warnings.forEach(w => res.warnings.push(w));
    res.items[row.contractId] = { added: ui.added, updated: ui.updated, removed: ui.removed, canceled: ui.canceled, reactivated: ui.reactivated, memos: ui.memos };
    if (!ui.ok) return fail('items', `유심 ${formatContractNo(row.contractId)} 상품 저장에 실패했습니다: ${ui.error}`);
  }
  // 제안 : 대표 계약에 통째로 교체
  const pr = await s7ReplaceProposals(res.carrierContractId, cust, plan.proposals);
  res.proposals = { count: pr.count, removed: pr.removed };
  if (!pr.ok) return fail('proposals', pr.error);
  return res;
}


// ============================================================
// 상담 화면 불러오기 (S7-4)
// ------------------------------------------------------------
//  - 읽기 전용. 고객의 상담 내용(제안·최종상품·가족회선)을 새 구조(contracts.consult_snapshot)에서 읽어 상담 화면 값으로 돌려줍니다.
//  - 대표 계약·유심 계약은 s7LoadConsultTargets 규칙으로 찾고, 그 결과(carrierContractId·usimByKey)를 화면이 기억해 다시 저장할 때 같은 계약을 쓰게 합니다.
//  - 계약 쪽 변경 반영: S7 방식으로 저장된 스냅샷(snapshotVersion 2)은 계약·상품이 지워진 최종상품을 화면 값에서 뺍니다(제안은 그대로).
//      · 유심 최종상품 = 그 유심 계약이 없으면 제외 / 인터넷·TV 최종상품 = 대표 계약에 인터넷·TV 상품이 하나도 없으면 제외 / "고객 본인 회선" 행은 계약이 없는 게 정상이라 항상 유지
//    이전 데이터(snapshotVersion 없음)는 계약 키가 없으므로 이렇게 거르지 않고 스냅샷 그대로 보여 줍니다.
//  - 대표 계약이 없으면 { ok:true, found:false } → 화면은 구 방식 값(customers.proposal_snapshot)을 그대로 씁니다.
// ============================================================
async function loadConsultForScreen(customerId){
  try {
    const t = await s7LoadConsultTargets(customerId);
    if (!t.ok) return t;
    if (!t.carrierContractId || !t.snapshot || typeof t.snapshot !== 'object') return { ok: true, found: false };
    const snap = t.snapshot;
    const arr = v => Array.isArray(v) ? v : [];
    const finalsAll = arr(snap.finals).filter(p => p && typeof p === 'object');
    const dropped = [];
    let finals = finalsAll;
    if (snap.snapshotVersion === 2) {
      finals = finalsAll.filter(p => {
        let keep = true;
        if (p.type === 'usim') keep = s7IsSyncedLine(p) || Object.prototype.hasOwnProperty.call(t.usimByKey, String(p.id));
        else if (p.type === 'home') keep = t.carrierItemTypes.some(x => x === 'internet' || x === 'tv');
        if (!keep) dropped.push({ id: p.id, type: p.type });
        return keep;
      });
    }
    const ci = (snap.customerInfo && typeof snap.customerInfo === 'object') ? snap.customerInfo : null;
    return {
      ok: true, found: true, carrierContractId: t.carrierContractId, usimByKey: t.usimByKey,
      proposals: s7Clone(arr(snap.proposals).filter(p => p && typeof p === 'object')), finals: s7Clone(finals),
      familyLines: s7Clone(arr(ci && ci.familyLines)), customerInfo: s7Clone(ci), comboDiscount: s7Clone(snap.comboDiscount) ?? null,
      dropped, snapshotVersion: snap.snapshotVersion || 1
    };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}


// ============================================================
// 실적조회 데이터 읽기 (S8)
// ------------------------------------------------------------
//  - 추가만 한 함수입니다. 기존 함수는 바꾸지 않았고, 실적조회 화면(loadPerformance)이 호출합니다.
//  - 기준(화면 설명 문구와 같음)
//      · 고객 = 기간 안에 **등록한**(customers.created_at) 고객
//      · 유치 고객 = 그 고객 중 접수 이력이 있는 고객(v_customer_overview.is_acquired). 이후 이탈·제외·계약취소가 되어도 포함
//      · 유치 계약 = 기간 안에 **접수된**(received_at) 계약. 접수 후 취소된 계약도 포함(effective_status = 계약취소)
//      · 기간은 한국 시간 기준, 시작일 0시부터 종료일 23:59:59.999까지(양쪽 포함). 기간을 비우면 전체
//  - 반환: { ok, customers[], acquired{ 고객ID: true }, contracts[ {...계약 칼럼, customer:{customer_id,name,contact}} ],
//            itemsByContract{ 계약ID: [상품...] }, truncated:{ customers, acquired, contracts }, period:{ from, to } }
//    · customers 는 상태 표시에 필요한 칼럼만 읽습니다(상담 스냅샷 같은 큰 JSON 제외).
//    · 한 번에 읽는 행 수에 한계가 있어 1,000건씩 나누어 읽고, 상한(기본 20,000건)에 닿으면 truncated 로 알립니다.
//  - 예외를 던지지 않고 { ok:false, error } 를 돌려줍니다. 미로그인이면 로그인 안내를 돌려줍니다.
// ============================================================
const S8_CUSTOMER_COLUMNS = 'customer_id,name,contact,created_at,customer_status,consult_substatus,status_reason,funnel_status';
const S8_ITEM_COLUMNS = 'contract_id,item_id,product_type,carrier,product_name,progress_status';

function s8Bounds(from, to){
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const f = from ? String(from) : '', t = to ? String(to) : '';
  if ((f && !re.test(f)) || (t && !re.test(t))) return { error: '기간 형식이 올바르지 않습니다.' };
  if (f && t && f > t) return { error: '시작일이 종료일보다 늦습니다.' };
  const lo = f ? new Date(f + 'T00:00:00+09:00') : null, hi = t ? new Date(t + 'T23:59:59.999+09:00') : null;
  if ((lo && isNaN(lo.getTime())) || (hi && isNaN(hi.getTime()))) return { error: '기간 날짜가 올바르지 않습니다.' };
  return { lo: lo ? lo.toISOString() : null, hi: hi ? hi.toISOString() : null };
}

async function loadPerformanceData(opts){
  const loginErr = s2LoginError();
  if (loginErr) return { ok: false, error: loginErr };
  try {
    const o = opts || {};
    const b = s8Bounds(o.from, o.to);
    if (b.error) return { ok: false, error: b.error };
    const cap = Number(o.maxRows) > 0 ? Number(o.maxRows) : S2_MAX_ROWS;
    const truncated = { customers: false, acquired: false, contracts: false };

    // 1) 기간 안에 등록한 고객
    const cu = await s2FetchAll((from, to) => {
      let q = sb.from('customers').select(S8_CUSTOMER_COLUMNS);
      if (b.lo) q = q.gte('created_at', b.lo);
      if (b.hi) q = q.lte('created_at', b.hi);
      return q.order('created_at', { ascending: true }).order('customer_id', { ascending: true }).range(from, to);
    }, cap);
    if (cu.error) return { ok: false, error: 'customers: ' + cu.error.message };
    const customers = cu.rows;
    truncated.customers = !!cu.truncated;

    // 2) 그 고객 중 접수 이력이 있는 고객(이후 상태가 바뀌어도 포함)
    const acquired = {};
    if (customers.length) {
      const inPeriod = new Set(customers.map(c => c.customer_id));
      const ac = await s2FetchAll((from, to) =>
        sb.from('v_customer_overview').select('customer_id').eq('is_acquired', true).order('customer_id', { ascending: true }).range(from, to), cap);
      if (ac.error) return { ok: false, error: 'v_customer_overview: ' + ac.error.message };
      ac.rows.forEach(r => { if (inPeriod.has(r.customer_id)) acquired[r.customer_id] = true; });
      truncated.acquired = !!ac.truncated;
    }

    // 3) 기간 안에 접수된 계약(접수 후 취소된 계약 포함)
    const cr = await loadContractOverviewList({ acquired: true, receivedFrom: b.lo || undefined, receivedTo: b.hi || undefined, limit: cap });
    if (!cr.ok) return { ok: false, error: cr.error };
    const contracts = cr.rows;
    truncated.contracts = !!cr.truncated;

    // 4) 계약별 상품
    const itemsByContract = {};
    const ids = contracts.map(c => c.contract_id);
    const chunks = s2Chunk(ids, S2_ID_CHUNK);
    for (let i = 0; i < chunks.length; i += 5) {
      const rs = await Promise.all(chunks.slice(i, i + 5).map(ch => sb.from('contract_items').select(S8_ITEM_COLUMNS).in('contract_id', ch).order('item_id', { ascending: true })));
      for (const r of rs) {
        if (r.error) return { ok: false, error: 'contract_items: ' + r.error.message };
        (r.data || []).forEach(it => { (itemsByContract[it.contract_id] = itemsByContract[it.contract_id] || []).push(it); });
      }
    }
    return { ok: true, customers, acquired, contracts, itemsByContract, truncated, period: { from: o.from || '', to: o.to || '' } };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

commissionMockInit();   // ?commMock=1 일 때만 동작


// ============================================================
// CS v2 개편 1단계 : 계약 중심 화면용 서비스 함수 (추가만 한 블록)
// ------------------------------------------------------------
//  - 기존 s6*/s7* 함수와 saveConsultSet 은 수정하지 않았습니다. 이 블록의 함수는 그것들을 불러다 씁니다.
//  - 제안(상담 작업본)은 customers.consult_draft(jsonb)에 보관하고, [계약등록] 1회 = 제안 1건 → 계약 1건입니다.
//  - "등록됨" 여부는 저장하지 않고 contract_items.detail.consultKey(제안 ID)로 계산합니다(findRegisteredByProposal).
//  - 새 계약은 consult_snapshot 을 비워 둡니다. 옛 화면(s7LoadConsultTargets)이 새 계약을 '대표 계약'으로 오인하지 않게 하기 위함입니다.
//  - 모든 함수는 예외를 던지지 않고 { ok, ..., error } 를 돌려줍니다.
// ============================================================
const V2_MONEY_COLS = S7_MEMO_MONEY.concat(['clawback_amount']);
const V2_ITEM_FIELDS = [['carrier', '통신사'], ['product_name', '상품명'], ['monthly_fee', '월요금'], ['commission', '수수료']];
const V2_META_FIELDS = [
  ['label', '구분 이름'], ['contractor_name', '계약자'], ['contractor_relation', '계약자 관계'], ['payment_method', '납부 방법'],
  ['address_zip', '우편번호'], ['address', '주소'], ['address_detail', '상세주소'], ['install_scheduled_at', '설치 예정일'],
  ['external_ref', '외부 접수번호'], ['gift_total', '사은품 합계'], ['gift_card', '상품권'], ['gift_cash', '현금'], ['gift_extra', '추가지급'],
  ['commission_total', '수수료 합계'], ['clawback_amount', '환수 금액'], ['clawback_reason', '환수 사유'], ['memo', '메모']
];
const V2_DATE_COLS = ['install_scheduled_at'];

function v2Norm(col, v){
  if (v === null || v === undefined) return null;
  if (V2_MONEY_COLS.includes(col)) { const n = s6Int(v); return (n === null || Number.isNaN(n)) ? (n === null ? null : NaN) : n; }
  if (V2_DATE_COLS.includes(col)) { const s = String(v).slice(0, 10); return s || null; }
  const t = String(v).trim();
  return t === '' ? null : t;
}
function v2Val(col, v){
  if (v === null || v === undefined) return '(없음)';
  if (V2_MONEY_COLS.includes(col)) return String(Math.round(Number(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
  return `'${v}'`;
}
// before(현재 행)와 after(새 값, 일부 칼럼만 있어도 됨)를 비교해 달라진 칼럼만 돌려줍니다.
//   → { note:'라벨 이전 → 이후 · …', cols:{col:새값}, before:{col:이전값} } / 숫자가 아니면 { error }
function v2Diff(before, after, pairs){
  const parts = [], cols = {}, prev = {};
  for (const [col, label] of pairs) {
    if (!after || !(col in after)) continue;
    const b = v2Norm(col, after[col]);
    if (typeof b === 'number' && Number.isNaN(b)) return { error: `숫자로 입력해 주세요: ${label}` };
    const a = v2Norm(col, before ? before[col] : null);
    if (a === b) continue;
    parts.push(`${label} ${v2Val(col, a)} → ${v2Val(col, b)}`);
    cols[col] = b; prev[col] = (before && before[col] !== undefined) ? before[col] : null;
  }
  return { note: parts.join(' · '), cols, before: prev };
}
function v2IsMissingColumn(err){
  if (!err) return false;
  const m = String(err.message || '');
  return err.code === '42703' || (/consult_draft/.test(m) && /(column|schema cache)/i.test(m));
}
function v2GroupOfCarrier(name){
  const s = String(name || '').toUpperCase();
  if (/^KT/.test(s) || s === 'KT') return 'KT';
  if (/^LG/.test(s)) return 'LG';
  if (/^SK/.test(s) && !/SKY/.test(s)) return 'SK';
  return null;
}
// 인터넷·TV 계약의 통신사 그룹(KT/LG/SK/SKY) : 상품 detail.carrierKey → MOBILE_GROUP_MAP. 알 수 없으면 null.
async function v2HomeGroupOf(homeContractId){
  const r = await sb.from('contract_items').select('detail').eq('contract_id', homeContractId);
  if (r.error) return { ok: false, error: '인터넷·TV 계약 상품을 읽지 못했습니다: ' + r.error.message };
  for (const it of (r.data || [])) {
    const k = it.detail && typeof it.detail === 'object' ? it.detail.carrierKey : null;
    if (k && MOBILE_GROUP_MAP[k]) return { ok: true, group: MOBILE_GROUP_MAP[k] };
  }
  return { ok: true, group: null };
}
// R6 : 유심 통신사와 인터넷·TV 통신사 그룹이 다르면 오류 문구, 모르면(또는 KT/LG/SK 외 유심이면) 통과.
async function v2CheckLinkGroup(usimCarrier, homeContractId){
  const ug = v2GroupOfCarrier(usimCarrier);
  if (!ug) return { ok: true };
  const hg = await v2HomeGroupOf(homeContractId);
  if (!hg.ok) return hg;
  if (hg.group && hg.group !== ug) return s6Err(`통신사 그룹이 달라 연결할 수 없습니다 (유심 ${ug} / 인터넷·TV ${hg.group})`);
  return { ok: true };
}

// 제안 ID(consultKey)별로 이미 등록된 계약 ID 목록. 접수취소된 상품은 등록으로 세지 않습니다.
//   → { ok, byProposal:{ [consultKey]: [contractId, ...] } }
async function findRegisteredByProposal(customerId){
  try {
    const le = s6LoginErr(); if (le) return s6Err(le);
    const cid = Number(customerId);
    if (!Number.isFinite(cid)) return s6Err('고객 ID가 올바르지 않습니다.');
    const r = await sb.from('contract_items').select('contract_id,item_id,progress_status,detail').eq('customer_id', cid);
    if (r.error) return s6Err('등록 내역을 읽지 못했습니다: ' + r.error.message);
    const map = {};
    (r.data || []).forEach(it => {
      if (it.progress_status === '접수취소') return;
      const k = s7ItemKey(it); if (!k) return;
      (map[k] = map[k] || []);
      if (!map[k].includes(it.contract_id)) map[k].push(it.contract_id);
    });
    Object.keys(map).forEach(k => map[k].sort((a, b) => a - b));
    return { ok: true, byProposal: map };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

// [계약등록] : 제안 1건 → 계약 1건(작성중). 중간에 실패하면 만든 계약을 지웁니다.
//   opts: { customerId, proposal, contractType('home'|'usim', 생략 시 proposal.type), label, address, addressDetail, addressZip,
//           linkedContractId(유심, 선택), allowDuplicate, helpers }
//   이미 등록된 제안이면 { ok:false, duplicate:true, existing:[계약ID...] } → 화면이 확인 후 allowDuplicate+label 로 다시 호출(R3)
async function registerContract(opts){
  const o = opts || {};
  const out = { ok: false, warnings: [] };
  const fail = msg => { out.ok = false; out.error = msg; return out; };
  let createdId = null;
  const rollback = async () => {
    if (createdId === null) return '';
    const d = await deleteContract(createdId);
    out.rolledBack = !!d.ok;
    return d.ok ? '' : ` (만들어진 계약 ${formatContractNo(createdId)}을(를) 지우지 못했습니다. 직접 삭제해 주세요: ${d.error})`;
  };
  try {
    const le = s6LoginErr(); if (le) return fail(le);
    const customerId = Number(o.customerId);
    if (!Number.isFinite(customerId)) return fail('고객 ID가 올바르지 않습니다.');
    const p = o.proposal;
    if (!p || !p.id) return fail('등록할 제안이 없습니다.');
    if (s7IsSyncedLine(p)) return fail('고객 본인 회선(연동 행)은 계약으로 등록할 수 없습니다.');
    const type = o.contractType || p.type;
    if (type !== 'home' && type !== 'usim') return fail('인터넷·TV 또는 유심 제안만 계약으로 등록할 수 있습니다.');
    if (p.type !== type) return fail('제안 종류와 계약 구분이 다릅니다.');

    const reg = await findRegisteredByProposal(customerId);
    if (!reg.ok) return fail(reg.error);
    const existing = reg.byProposal[String(p.id)] || [];
    const label0 = (o.label || '').trim();
    if (existing.length && !o.allowDuplicate) { out.duplicate = true; out.existing = existing; return fail('이미 등록한 제안입니다. 한 번 더 등록하려면 확인이 필요합니다.'); }
    if (existing.length && !label0) return fail('같은 제안을 다시 등록할 때는 구분 이름(예: A집, B집)을 입력해 주세요.');

    const plan = type === 'home' ? s7HomeContract(p, o.helpers, out.warnings) : s7UsimContract(p, o.helpers);
    const label = label0 || plan.label || null;
    const linked = (type === 'usim' && o.linkedContractId) ? Number(o.linkedContractId) : null;
    if (type === 'usim' && linked) {
      const lk = await v2CheckLinkGroup(p.carrier, linked);
      if (!lk.ok) return fail(lk.error);
    }

    const cr = await createContract({ customerId, contractType: type, label, linkedContractId: linked });
    if (!cr.ok) return fail(cr.error);
    const contract = cr.contract; createdId = contract.contract_id; out.contract = contract;

    const meta = Object.assign(s7NonNull(plan.meta), {});
    if (type === 'home') {
      if (o.address != null) meta.address = o.address;
      if (o.addressDetail != null) meta.address_detail = o.addressDetail;
      if (o.addressZip != null) meta.address_zip = o.addressZip;
    }
    const sm = await saveContractMeta(createdId, meta);
    if (!sm.ok) return fail('계약 정보 저장에 실패했습니다: ' + sm.error + await rollback());

    const itemRows = plan.items.map(it => ({
      contract_id: createdId, customer_id: customerId, product_type: it.productType, carrier: it.carrier || null, product_name: it.productName || null,
      monthly_fee: s6Int(it.monthlyFee), commission: s6Int(it.commission), progress_status: '설치대기', source: 'app', detail: it.detail || null
    }));
    if (itemRows.some(r => Number.isNaN(r.monthly_fee) || Number.isNaN(r.commission))) return fail('상품 금액이 숫자가 아닙니다.' + await rollback());
    const ins = await sb.from('contract_items').insert(itemRows).select('*');
    if (ins.error) return fail('상품 저장에 실패했습니다: ' + ins.error.message + await rollback());
    out.items = ins.data || [];
    const h = await s6WriteHistory({ customer_id: customerId, contract_id: createdId, target_type: 'contract', axis: 'status', from_value: '작성중', to_value: '작성중', note: '계약 등록으로 상품 추가' });
    if (!h.ok) return fail('이력 저장에 실패해 계약을 만들지 않았습니다: ' + h.error + await rollback());

    const pr = s7ProposalRow(p, true, o.helpers);
    const pins = await sb.from('contract_proposals').insert({
      contract_id: createdId, customer_id: customerId, product_type: pr.productType, carrier: pr.carrier || null, product_name: pr.productName || null,
      monthly_fee: s6Int(pr.monthlyFee), gift_amount: s6Int(pr.giftAmount), commission: s6Int(pr.commission), source: 'app',
      detail: { consultKey: pr.matchKey, isFinal: true, product: pr.detail || null }
    }).select('proposal_id');
    if (pins.error) return fail('제안 보관에 실패했습니다: ' + pins.error.message + await rollback());
    out.proposalId = pins.data && pins.data[0] ? pins.data[0].proposal_id : null;

    // R11 : 첫 계약등록 시 상담대기 → 상담중 (실패해도 등록은 유지)
    const cu = await sb.from('customers').select('customer_id,customer_status').eq('customer_id', customerId).limit(1);
    const cur = (cu.data || [])[0];
    if (!cu.error && cur && cur.customer_status === '상담대기') {
      const sc = await changeStatus({ target: 'customer', id: customerId, axis: 'status', to: '상담중', note: '계약 등록' });
      out.statusChange = sc.ok ? { from: '상담대기', to: '상담중' } : { error: sc.error };
      if (!sc.ok) out.warnings.push('고객 상태를 상담중으로 바꾸지 못했습니다: ' + sc.error);
    }
    out.ok = true;
    return out;
  } catch (e) { return fail((e && e.message ? e.message : String(e)) + await rollback()); }
}

// 같은 고객의 인터넷·TV 계약 중 유심을 연결할 수 있는 후보(R6). usimCarrier 를 주면 같은 통신사 그룹만.
//   → { ok, candidates:[{ contractId, label, group, status }] }
async function findHomeCandidatesForUsim(customerId, usimCarrier){
  try {
    const cid = Number(customerId);
    if (!Number.isFinite(cid)) return s6Err('고객 ID가 올바르지 않습니다.');
    const cs = await sb.from('contracts').select('contract_id,label,contract_status,contract_type').eq('customer_id', cid).eq('contract_type', 'home');
    if (cs.error) return s6Err('계약을 읽지 못했습니다: ' + cs.error.message);
    const its = await sb.from('contract_items').select('contract_id,progress_status,detail').eq('customer_id', cid);
    if (its.error) return s6Err('상품을 읽지 못했습니다: ' + its.error.message);
    const ug = v2GroupOfCarrier(usimCarrier);
    const candidates = [];
    (cs.data || []).forEach(c => {
      const mine = (its.data || []).filter(i => i.contract_id === c.contract_id);
      if (mine.length && mine.every(i => i.progress_status === '접수취소')) return;
      let group = null;
      mine.forEach(i => { const k = i.detail && i.detail.carrierKey; if (!group && k && MOBILE_GROUP_MAP[k]) group = MOBILE_GROUP_MAP[k]; });
      if (ug && group && group !== ug) return;
      candidates.push({ contractId: c.contract_id, label: c.label || '', group, status: c.contract_status });
    });
    return { ok: true, candidates };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

// 유심 계약 ↔ 인터넷·TV 계약 연결 변경. homeContractId 가 null 이면 연결 해제.
//   바뀌면 변경 메모를 먼저 남기고, 값 저장이 실패하면 메모를 지웁니다.
async function linkUsimContract(usimContractId, homeContractId, opts){
  try {
    const le = s6LoginErr(); if (le) return s6Err(le);
    const uid = Number(usimContractId);
    if (!Number.isFinite(uid)) return s6Err('유심 계약 ID가 올바르지 않습니다.');
    const hid = (homeContractId === null || homeContractId === undefined || homeContractId === '') ? null : Number(homeContractId);
    if (hid !== null && !Number.isFinite(hid)) return s6Err('인터넷·TV 계약 ID가 올바르지 않습니다.');
    const ur = await sb.from('contracts').select('contract_id,customer_id,contract_type,linked_contract_id').eq('contract_id', uid).limit(1);
    if (ur.error) return s6Err('유심 계약을 읽지 못했습니다: ' + ur.error.message);
    const usim = (ur.data || [])[0];
    if (!usim) return s6Err('유심 계약을 찾을 수 없습니다.');
    if (usim.contract_type !== 'usim') return s6Err('유심 계약만 연결할 수 있습니다.');
    const before = usim.linked_contract_id === undefined ? null : usim.linked_contract_id;
    if (before === hid) return { ok: true, changed: false };
    if (hid !== null) {
      const hr = await sb.from('contracts').select('contract_id,customer_id,contract_type').eq('contract_id', hid).limit(1);
      if (hr.error) return s6Err('인터넷·TV 계약을 읽지 못했습니다: ' + hr.error.message);
      const home = (hr.data || [])[0];
      if (!home || home.contract_type !== 'home') return s6Err('인터넷·TV 계약에만 연결할 수 있습니다.');
      if (home.customer_id !== usim.customer_id) return s6Err('같은 고객의 계약에만 연결할 수 있습니다.');
      const ui = await sb.from('contract_items').select('carrier').eq('contract_id', uid).limit(1);
      if (ui.error) return s6Err('유심 상품을 읽지 못했습니다: ' + ui.error.message);
      const lk = await v2CheckLinkGroup(((ui.data || [])[0] || {}).carrier, hid);
      if (!lk.ok) return s6Err(lk.error);
    }
    const fmt = id => id === null ? '(없음)' : formatContractNo(id);
    const h = await s7WriteChangeMemo({ customerId: usim.customer_id, contractId: uid, note: `유심 연결 변경: ${fmt(before)} → ${fmt(hid)}` + ((opts && opts.reason) ? ` [사유: ${opts.reason}]` : '') });
    if (!h.ok) return s6Err('변경 이력을 저장하지 못해 연결을 바꾸지 않았습니다: ' + h.error);
    const up = await sb.from('contracts').update({ linked_contract_id: hid }).eq('contract_id', uid).select('contract_id');
    if (up.error || !up.data || !up.data.length) {
      await s7DropMemo(h.historyId);
      return s6Err('연결 저장에 실패했습니다: ' + (up.error ? up.error.message : '계약을 찾을 수 없습니다.'));
    }
    return { ok: true, changed: true, memoId: h.historyId };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

// 계약 수정(R7·R8·R9).
//   opts: { contractId, itemEdits:{ [itemId]:{carrier,product_name,monthly_fee,commission} }, metaEdits:{...}, reason, confirmPayout }
//   단계: draft(작성중·접수 시각 없음) → 메모·사유 불필요 / pre(접수대기·접수보류) → 메모 기록, 사유는 선택 / post(그 외) → 사유 필수
//   지급 상태(payout_status)가 있으면 { ok:false, needsConfirm:true, payoutWarning } 로 먼저 확인받습니다. 사은품·수수료는 자동 재계산하지 않습니다.
async function editContractWithReason(opts){
  const o = opts || {};
  const memoIds = [];
  const applied = { items: [], meta: null };
  const undo = async () => {
    for (const a of applied.items) await saveContractItem(a.itemId, a.before);
    if (applied.meta) await saveContractMeta(o.contractId, applied.meta);
    for (const m of memoIds) await s7DropMemo(m);
  };
  try {
    const le = s6LoginErr(); if (le) return s6Err(le);
    const cid = Number(o.contractId);
    if (!Number.isFinite(cid)) return s6Err('계약 ID가 올바르지 않습니다.');
    const cr = await sb.from('contracts').select('*').eq('contract_id', cid).limit(1);
    if (cr.error) return s6Err('계약을 읽지 못했습니다: ' + cr.error.message);
    const c = (cr.data || [])[0];
    if (!c) return s6Err('계약을 찾을 수 없습니다.');
    const stage = s6IsDraft(c) ? 'draft' : (s7IsEditable(c) ? 'pre' : 'post');

    const itemEdits = o.itemEdits || {};
    const itemIds = Object.keys(itemEdits).map(Number);
    let itemRows = [];
    if (itemIds.length) {
      const ir = await sb.from('contract_items').select('*').eq('contract_id', cid).in('item_id', itemIds);
      if (ir.error) return s6Err('상품을 읽지 못했습니다: ' + ir.error.message);
      itemRows = ir.data || [];
      if (itemRows.length !== itemIds.length) return s6Err('이 계약에 속하지 않는 상품이 있습니다.');
    }
    const itemDiffs = [];
    for (const row of itemRows) {
      const d = v2Diff(row, itemEdits[row.item_id], V2_ITEM_FIELDS);
      if (d.error) return s6Err(d.error);
      if (d.note) itemDiffs.push({ row, d });
    }
    let metaDiff = null;
    if (o.metaEdits) {
      metaDiff = v2Diff(c, o.metaEdits, V2_META_FIELDS);
      if (metaDiff.error) return s6Err(metaDiff.error);
      if (!metaDiff.note) metaDiff = null;
    }
    if (!itemDiffs.length && !metaDiff) return { ok: true, changed: false, stage };

    const reason = (o.reason || '').trim();
    if (stage === 'post' && !reason) return s6Err('접수 이후 계약을 수정하려면 사유를 입력해야 합니다.');

    const payoutWarning = c.payout_status ? `지급 상태가 '${c.payout_status}'인 계약입니다. 수정해도 사은품·수수료는 자동으로 다시 계산되지 않습니다.` : null;
    if (payoutWarning && !o.confirmPayout) return { ok: false, needsConfirm: true, payoutWarning, stage, error: payoutWarning };

    const suffix = (payoutWarning ? ` [지급 상태: ${c.payout_status}]` : '');
    const prefix = reason ? `[사유: ${reason}] ` : '';
    if (stage !== 'draft') {
      for (const { row, d } of itemDiffs) {
        const h = await s7WriteChangeMemo({ customerId: c.customer_id, contractId: cid, itemId: row.item_id, note: `${prefix}계약 수정으로 상품 변경: ${d.note}${suffix}` });
        if (!h.ok) { await undo(); return s6Err('변경 이력을 저장하지 못해 수정하지 않았습니다: ' + h.error); }
        memoIds.push(h.historyId);
      }
      if (metaDiff) {
        const h = await s7WriteChangeMemo({ customerId: c.customer_id, contractId: cid, note: `${prefix}계약 수정으로 계약 정보 변경: ${metaDiff.note}${suffix}` });
        if (!h.ok) { await undo(); return s6Err('변경 이력을 저장하지 못해 수정하지 않았습니다: ' + h.error); }
        memoIds.push(h.historyId);
      }
    }
    for (const { row, d } of itemDiffs) {
      const r = await saveContractItem(row.item_id, d.cols);
      if (!r.ok) { await undo(); return s6Err(`상품 ${formatItemNo(row.item_id)} 저장에 실패해 되돌렸습니다: ${r.error}`); }
      applied.items.push({ itemId: row.item_id, before: d.before });
    }
    if (metaDiff) {
      const r = await saveContractMeta(cid, metaDiff.cols);
      if (!r.ok) { await undo(); return s6Err('계약 정보 저장에 실패해 되돌렸습니다: ' + r.error); }
      applied.meta = metaDiff.before;
    }
    const productChanged = itemDiffs.some(x => ['carrier', 'product_name', 'monthly_fee'].some(k => k in x.d.cols));
    return { ok: true, changed: true, stage, payoutWarning, memoIds, recalcHint: !!(payoutWarning && productChanged) };
  } catch (e) { await undo(); return s6Err(e && e.message ? e.message : String(e)); }
}

// 상담 작업본(제안 목록 등) : customers.consult_draft(jsonb). 칼럼이 없으면 noColumn:true 로 알려 화면이 브라우저 저장으로 대체하게 합니다.
async function loadConsultDraft(customerId){
  try {
    const cid = Number(customerId);
    if (!Number.isFinite(cid)) return s6Err('고객 ID가 올바르지 않습니다.');
    const r = await sb.from('customers').select('customer_id,consult_draft').eq('customer_id', cid).limit(1);
    if (r.error) return v2IsMissingColumn(r.error) ? { ok: false, noColumn: true, error: 'consult_draft 칼럼이 없습니다. SQL 을 먼저 실행해 주세요.' } : s6Err('작업본을 읽지 못했습니다: ' + r.error.message);
    const row = (r.data || [])[0];
    if (!row) return s6Err('고객을 찾을 수 없습니다.');
    return { ok: true, draft: row.consult_draft || null };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}
async function saveConsultDraft(customerId, draft){
  try {
    const le = s6LoginErr(); if (le) return s6Err(le);
    const cid = Number(customerId);
    if (!Number.isFinite(cid)) return s6Err('고객 ID가 올바르지 않습니다.');
    const body = Object.assign({}, draft || {}, { v: 1, savedAt: new Date().toISOString() });
    if (JSON.stringify(body).length > 2000000) return s6Err('상담 작업본이 너무 큽니다(약 2MB 초과).');
    const r = await sb.from('customers').update({ consult_draft: body }).eq('customer_id', cid).select('customer_id');
    if (r.error) return v2IsMissingColumn(r.error) ? { ok: false, noColumn: true, error: 'consult_draft 칼럼이 없습니다. SQL 을 먼저 실행해 주세요.' } : s6Err('작업본 저장에 실패했습니다: ' + r.error.message);
    if (!r.data || !r.data.length) return s6Err('고객을 찾을 수 없습니다.');
    return { ok: true, savedAt: body.savedAt };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}

// 계약 1건 단위 결합할인(R12) : 인터넷·TV 계약 + 그 계약에 연결된 유심 계약들로 계산합니다. 저장은 하지 않습니다.
//   → { ok, homeContractId, carrierKey, lgVariant, speedNum, group, lines, excludedLines, options, best }
async function computeContractCombo(homeContractId, tcDistMode){
  try {
    const hid = Number(homeContractId);
    if (!Number.isFinite(hid)) return s6Err('계약 ID가 올바르지 않습니다.');
    const hc = await sb.from('contracts').select('contract_id,contract_type').eq('contract_id', hid).limit(1);
    if (hc.error) return s6Err('계약을 읽지 못했습니다: ' + hc.error.message);
    const home = (hc.data || [])[0];
    if (!home) return s6Err('계약을 찾을 수 없습니다.');
    if (home.contract_type !== 'home') return s6Err('인터넷·TV 계약만 계산할 수 있습니다.');
    const hi = await sb.from('contract_items').select('item_id,product_type,progress_status,detail').eq('contract_id', hid);
    if (hi.error) return s6Err('상품을 읽지 못했습니다: ' + hi.error.message);
    const internet = (hi.data || []).find(i => i.product_type === 'internet' && i.progress_status !== '접수취소');
    if (!internet) return s6Err('인터넷 상품이 없어 결합할인을 계산할 수 없습니다.');
    const d = internet.detail || {};
    const speedNum = Number(d.speedNum);
    if (!Number.isFinite(speedNum) || speedNum <= 0) return s6Err('인터넷 속도 정보가 없어 결합할인을 계산할 수 없습니다.');
    const carrierKey = d.carrierKey || null;
    const group = carrierKey ? (MOBILE_GROUP_MAP[carrierKey] || null) : null;

    const uc = await sb.from('contracts').select('contract_id').eq('linked_contract_id', hid).eq('contract_type', 'usim');
    if (uc.error) return s6Err('연결된 유심 계약을 읽지 못했습니다: ' + uc.error.message);
    const uids = (uc.data || []).map(r => r.contract_id);
    let usimItems = [];
    if (uids.length) {
      const ui = await sb.from('contract_items').select('item_id,contract_id,carrier,product_name,monthly_fee,progress_status,detail').in('contract_id', uids);
      if (ui.error) return s6Err('유심 상품을 읽지 못했습니다: ' + ui.error.message);
      usimItems = (ui.data || []).filter(i => i.progress_status !== '접수취소');
    }
    const lines = [], excludedLines = [];
    usimItems.forEach((i, idx) => {
      const line = { carrier: i.carrier, fee: Number(i.monthly_fee) || 0, teen: !!(i.detail && i.detail.teen), idx, planName: i.product_name, contractId: i.contract_id, itemId: i.item_id };
      (group && v2GroupOfCarrier(i.carrier) === group ? lines : excludedLines).push(line);
    });

    let options = [];
    if (carrierKey === 'kt' && typeof computeKTOptions === 'function') options = computeKTOptions(lines, speedNum, tcDistMode || 'equal');
    else if (carrierKey === 'lg' && typeof computeLGOptions === 'function') options = computeLGOptions(lines, speedNum);
    else if (carrierKey === 'sky' && typeof computeSkyOptions === 'function') options = computeSkyOptions();
    else if ((carrierKey === 'skb' || carrierKey === 'skt') && typeof computeSKOptions === 'function') options = computeSKOptions(lines, speedNum, carrierKey);
    const best = (options || []).filter(x => x && x.avail).reduce((b, x) => (!b || (Number(x.total) || 0) > (Number(b.total) || 0)) ? x : b, null);
    return { ok: true, homeContractId: hid, carrierKey, lgVariant: d.lgVariant || null, speedNum, group, lines, excludedLines, options: options || [], best };
  } catch (e) { return s6Err(e && e.message ? e.message : String(e)); }
}
