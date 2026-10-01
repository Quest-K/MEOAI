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

async function loadData(){
  logs = {};
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

function lookupCommission(carrierKey, speedNum, tvTier){
  const rows = RAW_COMMISSION_DATA.filter(r => String(r.carrier).toLowerCase() === carrierKey && normalizeSpeedValue(r.speed) === speedNum);
  const internetComm = pickLatestRow(rows.filter(r => String(r.tv_tier) === 'none'))?.commission_amount || 0;
  const tvComm = tvTier !== 'none' ? (pickLatestRow(rows.filter(r => String(r.tv_tier) === tvTier))?.commission_amount || 0) : 0;
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
  CARRIERS.forEach(carrier => {
    const commRows = commRes.data
      ? commRes.data.filter(r => String(r.carrier).toLowerCase() === carrier && normalizeSpeedValue(r.speed) === targetSpeed)
      : [];
    const internetComm = pickLatestRow(commRows.filter(r => String(r.tv_tier) === 'none'))?.commission_amount || 0;
    const tvComm = tvTierForComm !== 'none' ? (pickLatestRow(commRows.filter(r => String(r.tv_tier) === tvTierForComm))?.commission_amount || 0) : 0;

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
//   filters: contact(숫자·하이픈 모두 가능, 부분일치) / name(부분일치) / customerStatus(문자열 또는 배열)
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
