/* =========================================================================
   StatusV2.js — 정의서 v1.4 상태값 처리 (추가 전용 파일)
   - 기존 Supabaseservice.js 의 changeStatus() 는 바꾸지 않고, 신규 축만 처리하는 changeStatusV2() 를 따로 둡니다.
   - 로드 순서: config.js → Supabaseservice.js → StatusV2.js (sb, isLoggedIn, s4ChangedBy 를 사용합니다)
   - 이력은 기존 status_history 에 그대로 저장합니다(axis 는 자유 문자열, target_type 은 customer / item).
   - 결과: { ok, changed, from, to, historyId, auto, closeSuggest, userMessage, error }
   ========================================================================= */

// 기존 칼럼 재사용 기본값(I-10, I-11). 새로 만든 reserve_at / opened_at 을 쓰려면 아래 두 값만 바꾸면 됩니다.
const V2_COLS = { reserveAt: 'next_contact_at', openedAt: 'installed_at' };
// 지급 대상 상품만 있을 때 재영업 예약 기준일: 'latest'(가장 늦은 지급완료일) | 'earliest'(가장 빠른 날짜) — 미확정(I-2)
const V2_PAY_ONLY_BASE = 'latest';

let V2_SEGMENT_MONTHS = (typeof SEGMENT_MONTHS_DEFAULT !== 'undefined') ? SEGMENT_MONTHS_DEFAULT : 3;

function v2Fail(msg){ return { ok: false, changed: false, error: msg, userMessage: msg }; }
function v2Today(){ return new Date().toISOString().slice(0, 10); }
function v2OpenedValue(){
  const now = new Date();
  return V2_COLS.openedAt === 'opened_at' ? now.toISOString().slice(0, 10) : now.toISOString();
}
function v2AddYears(baseIso, years){
  const d = new Date(baseIso || new Date());
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString();
}
function v2Spec(target, axis){
  const t = V2_STATUS_AXES[target];
  const a = t && t[axis];
  if (!a) return null;
  return { table: target === 'customer' ? 'customers' : 'contract_items',
           idCol: target === 'customer' ? 'customer_id' : 'item_id',
           col: a.col, values: a.values, nullable: !!a.nullable };
}

// ---------- 가망 / 잠재 자동 분류 (DB 함수 crm_calc_segment 와 같은 규칙) ----------
async function v2LoadSettings(){
  try {
    const r = await sb.from('crm_settings').select('key,value').eq('key', 'segment_months').limit(1);
    if (!r.error && r.data && r.data[0]) { const n = parseInt(r.data[0].value, 10); if (n > 0) V2_SEGMENT_MONTHS = n; }
  } catch (e) { /* 읽기 실패 시 기본값 유지 */ }
  return V2_SEGMENT_MONTHS;
}
function v2ClassifySegment(reserveIso){
  if (!reserveIso) return '가망고객';
  const limit = new Date(); limit.setMonth(limit.getMonth() + V2_SEGMENT_MONTHS);
  return new Date(reserveIso) <= limit ? '가망고객' : '잠재고객';
}

// ---------- 계약 상태 계산 (뷰 v_contract_state_v2 와 같은 규칙) ----------
function v2ContractState(items){
  const list = (items || []).filter(i => i.item_status);
  if (!list.length) return null;
  const dead = i => ITEM_DEAD_STATUSES.includes(i.item_status);
  if (list.every(dead)) return '취소';
  if (list.some(i => i.refund_status)) return '환수';
  const live = list.filter(i => !dead(i));
  if (live.some(i => ITEM_PRE_OPEN_STATUSES.includes(i.item_status) || ['지급요청', '지급보류'].includes(i.pay_status))) return '진행';
  if (live.some(i => ['지급완료', '지급제외'].includes(i.pay_status))) return '완료';
  return '제안';
}

// ---------- 상담종료 조건 평가 ----------
//  지급 대상 상품이 모두 지급완료, 지급제외 상품이 모두 개통완료, 환수요청 중인 상품 없음 → 종료 가능
//  (접수불가·접수취소·상품제안 상품은 조건에서 제외 — 상품제안 제외는 확인 필요)
function v2EvaluateClose(items){
  const live = (items || []).filter(i => i.item_status && !ITEM_DEAD_STATUSES.includes(i.item_status) && i.item_status !== '상품제안');
  if (!live.length) return { met: false };
  if (live.some(i => i.refund_status === '환수요청')) return { met: false };
  const exempt = live.filter(i => i.is_pay_exempt || i.pay_status === '지급제외');
  const payT = live.filter(i => !exempt.includes(i));
  if (!payT.every(i => i.pay_status === '지급완료')) return { met: false };
  if (!exempt.every(i => i.item_status === '개통완료')) return { met: false };
  const paid = payT.map(i => i.paid_at).filter(Boolean).sort();
  const opened = exempt.map(i => i[V2_COLS.openedAt]).filter(Boolean).sort();
  let base;
  if (paid.length && opened.length) base = [...paid, ...opened].sort()[0];                       // 섞인 경우: 가장 빠른 날짜
  else if (paid.length) base = V2_PAY_ONLY_BASE === 'earliest' ? paid[0] : paid[paid.length - 1];
  else base = opened[opened.length - 1] || null;                                                // 지급제외만: 개통완료일
  return { met: true, baseDate: base };
}

async function v2LoadItems(customerId){
  const r = await sb.from('contract_items')
    .select(['item_id', 'contract_id', 'item_status', 'pay_status', 'refund_status', 'is_pay_exempt', 'paid_at', V2_COLS.openedAt].join(','))
    .eq('customer_id', customerId);
  return r.error ? null : (r.data || []);
}

// ---------- 상태 변경 ----------
async function changeStatusV2(o){
  try {
    o = o || {};
    if (typeof isLoggedIn !== 'undefined' && !isLoggedIn) return v2Fail('로그인 후 변경할 수 있습니다.');
    const target = o.target, axis = o.axis;
    const spec = v2Spec(target, axis);
    if (!spec) return v2Fail(`지원하지 않는 변경 대상입니다. (${target}/${axis})`);
    const id = Number(o.id);
    if (!Number.isFinite(id)) return v2Fail('대상 ID가 올바르지 않습니다.');
    const to = (o.to === undefined || o.to === '') ? null : o.to;
    if (to === null && !spec.nullable) return v2Fail('변경할 값을 선택해 주세요.');
    if (to !== null && !spec.values.includes(to)) return v2Fail(`허용되지 않는 값입니다: ${to}`);

    const cur = await sb.from(spec.table).select('*').eq(spec.idCol, id).limit(1);
    if (cur.error) return v2Fail('현재 값을 읽지 못했습니다: ' + cur.error.message);
    const row = (cur.data || [])[0];
    if (!row) return v2Fail('대상을 찾을 수 없습니다.');
    const from = row[spec.col] === undefined ? null : row[spec.col];

    const reason = (o.reason == null || String(o.reason).trim() === '') ? null : String(o.reason).trim();
    const memo = (o.memo == null || String(o.memo).trim() === '') ? null : String(o.memo).trim();
    const patch = {}; patch[spec.col] = to;
    let histReason = null;
    const note = o.note || null;

    if (target === 'customer' && axis === 'customer_segment') {
      if (to === '제외고객') {
        if (!reason || !EXCLUDE_REASONS.includes(reason)) return v2Fail('제외 사유를 선택해 주세요.');
        if (reason === EXCLUDE_MEMO_REQUIRED_REASON && !memo) return v2Fail('제외 사유가 기타이면 메모를 입력해 주세요.');
        patch.exclude_reason = reason; patch.exclude_memo = memo; histReason = reason;
      } else { patch.exclude_reason = null; patch.exclude_memo = null; }
    } else if (target === 'customer' && axis === 'exclude_reason') {
      if (row.customer_segment !== '제외고객') return v2Fail('제외 사유는 제외고객일 때만 바꿀 수 있습니다.');
      if (to === null) return v2Fail('제외 사유를 선택해 주세요.');
      if (to === EXCLUDE_MEMO_REQUIRED_REASON && !memo && !row.exclude_memo) return v2Fail('제외 사유가 기타이면 메모를 입력해 주세요.');
      patch.exclude_memo = to === EXCLUDE_MEMO_REQUIRED_REASON ? (memo || row.exclude_memo) : null; histReason = to;
    } else if (target === 'item' && axis === 'item_status') {
      if (to === '변경요청' && (row.item_status === '개통완료' || row[V2_COLS.openedAt])) return v2Fail('개통완료 이후에는 상품 변경을 할 수 없습니다.');
      if (to !== null && ITEM_REASON_STATUSES.includes(to)) {
        if (reason && !ITEM_STATUS_REASONS.includes(reason)) return v2Fail(`사유로 쓸 수 없는 값입니다: ${reason}`);
        patch.item_status_reason = reason; patch.item_status_memo = memo; histReason = reason;
      } else { patch.item_status_reason = null; patch.item_status_memo = null; }
      if (to === '개통완료' && !row[V2_COLS.openedAt]) patch[V2_COLS.openedAt] = (o.extra && o.extra.opened_at) || v2OpenedValue();
    } else if (target === 'item' && axis === 'pay_status') {
      patch.paid_at = to === '지급완료' ? (row.paid_at || v2Today()) : null;
      if (to === '지급제외') patch.is_pay_exempt = true;
      else if (from === '지급제외') patch.is_pay_exempt = false;
    } else if (target === 'item' && axis === 'refund_status') {
      if (to !== null && row.pay_status !== '지급완료') return v2Fail('지급완료된 상품에만 환수를 요청할 수 있습니다.');
    }

    if (from === to) {
      ['paid_at', V2_COLS.openedAt].forEach(k => { delete patch[k]; });
      const diff = Object.keys(patch).filter(k => k !== spec.col && (row[k] === undefined ? null : row[k]) !== (patch[k] === undefined ? null : patch[k]));
      if (!diff.length) return { ok: true, changed: false, from, to, userMessage: '이미 같은 상태입니다.' };
    }

    const customerId = target === 'customer' ? id : row.customer_id;
    const hist = {
      customer_id: customerId,
      contract_id: target === 'item' ? row.contract_id : null,
      item_id: target === 'item' ? id : null,
      event_type: 'status_change', target_type: target, axis,
      from_value: from, to_value: to, reason: histReason, note,
      changed_by: (typeof s4ChangedBy === 'function') ? await s4ChangedBy() : null, source: 'app'
    };
    const hr = await sb.from('status_history').insert(hist).select('history_id');
    if (hr.error) return v2Fail('이력 저장에 실패해 상태를 바꾸지 않았습니다: ' + hr.error.message);
    const historyId = hr.data && hr.data[0] ? hr.data[0].history_id : null;

    let uq = sb.from(spec.table).update(patch).eq(spec.idCol, id);
    uq = from === null ? uq.is(spec.col, null) : uq.eq(spec.col, from);
    const ur = await uq.select(spec.idCol);
    if (ur.error || !ur.data || !ur.data.length) {
      if (historyId != null) await sb.from('status_history').delete().eq('history_id', historyId);
      return v2Fail(ur.error ? '상태 변경에 실패했습니다: ' + ur.error.message
                             : '다른 곳에서 먼저 변경되어 적용하지 않았습니다. 새로고침 후 다시 시도해 주세요.');
    }

    const result = { ok: true, changed: true, from, to, historyId, auto: [], closeSuggest: null, userMessage: '변경되었습니다.' };
    if (!o.auto) await v2AfterChange(target, axis, to, row, customerId, result);
    return result;
  } catch (e) {
    return v2Fail(e && e.message ? e.message : String(e));
  }
}

// ---------- 자동 전환 규칙 (정의서 6장) ----------
async function v2SetConsult(customerId, to, note, result){
  const c = await sb.from('customers').select('consult_state').eq('customer_id', customerId).limit(1);
  if (c.error || !c.data || !c.data[0] || c.data[0].consult_state === to) return;
  const r = await changeStatusV2({ target: 'customer', id: customerId, axis: 'consult_state', to, note, auto: true });
  if (r.ok && r.changed) result.auto.push({ axis: 'consult_state', from: r.from, to: r.to });
}
async function v2AfterChange(target, axis, to, row, customerId, result){
  if (target !== 'item') return;
  if (axis === 'item_status' && to === '개통완료' && !row.is_pay_exempt && row.pay_status == null) {   // R1
    const r = await changeStatusV2({ target: 'item', id: row.item_id, axis: 'pay_status', to: '지급요청', note: '개통완료에 따른 자동 지급요청', auto: true });
    if (r.ok && r.changed) result.auto.push({ axis: 'pay_status', from: null, to: '지급요청' });
  }
  if (axis === 'item_status' && to === '변경요청') await v2SetConsult(customerId, '상담중', '변경요청에 따른 자동 전환', result);   // R6
  if (axis === 'refund_status' && to === '환수요청') await v2SetConsult(customerId, '상담중', '환수요청에 따른 자동 전환', result);   // R5
  if (axis === 'refund_status' && to === '환수완료') await v2SetConsult(customerId, '상담종료', '환수 입금 확인에 따른 자동 전환', result); // R5
  if ((axis === 'pay_status' && to === '지급완료') || (axis === 'item_status' && to === '개통완료')) {                            // R2~R4
    const items = await v2LoadItems(customerId);
    const ev = items ? v2EvaluateClose(items) : { met: false };
    if (ev.met) result.closeSuggest = { customerId, baseDate: ev.baseDate, years: RESALE_OFFSET_YEARS };   // 화면에서 1년/3년을 고르게 한 뒤 v2CloseWithResale 호출
  }
}

// 상담종료 + 재영업 예약(1년/3년) → 잠재고객
async function v2CloseWithResale(o){
  o = o || {};
  const years = Number(o.years);
  if (!RESALE_OFFSET_YEARS.includes(years)) return v2Fail('재영업 예약은 1년 뒤 또는 3년 뒤만 선택할 수 있습니다.');
  const cid = Number(o.customerId);
  const reserve = v2AddYears(o.baseDate, years);
  const up = await sb.from('customers').update({ [V2_COLS.reserveAt]: reserve }).eq('customer_id', cid).select('customer_id');
  if (up.error || !up.data || !up.data.length) return v2Fail('상담예약 저장에 실패했습니다: ' + (up.error ? up.error.message : '대상 없음'));
  const out = { ok: true, reserveAt: reserve, auto: [] };
  const seg = v2ClassifySegment(reserve);
  const r1 = await changeStatusV2({ target: 'customer', id: cid, axis: 'customer_segment', to: seg, note: `재영업 예약 ${reserve.slice(0, 10)} (${years}년 뒤)`, auto: true });
  if (!r1.ok) return r1;
  await v2SetConsult(cid, '상담종료', `지급 완료에 따른 상담종료 (재영업 예약 ${reserve.slice(0, 10)})`, out);
  return out;
}

// 상담예약일 입력·변경 → 가망/잠재 자동 분류 (제외고객은 건드리지 않음)
async function v2SetReservation(customerId, reserveIso){
  const cid = Number(customerId);
  const cu = await sb.from('customers').select('customer_segment').eq('customer_id', cid).limit(1);
  if (cu.error || !cu.data || !cu.data[0]) return v2Fail('고객을 찾을 수 없습니다.');
  const up = await sb.from('customers').update({ [V2_COLS.reserveAt]: reserveIso || null }).eq('customer_id', cid).select('customer_id');
  if (up.error) return v2Fail('상담예약 저장에 실패했습니다: ' + up.error.message);
  if (cu.data[0].customer_segment === '제외고객') return { ok: true, segment: '제외고객' };
  const seg = v2ClassifySegment(reserveIso);
  const r = await changeStatusV2({ target: 'customer', id: cid, axis: 'customer_segment', to: seg, note: '상담예약일 기준 자동 분류', auto: true });
  return r.ok ? { ok: true, segment: seg } : r;
}

// 재컨택 시기 도래 → 가망고객 + 상담대기 (R7). 화면 진입 시 호출
async function v2RefreshDueReservations(){
  await v2LoadSettings();
  const limit = new Date(); limit.setMonth(limit.getMonth() + V2_SEGMENT_MONTHS);
  const q = await sb.from('customers').select(`customer_id,${V2_COLS.reserveAt}`)
    .eq('customer_segment', '잠재고객').eq('consult_state', '상담종료').lte(V2_COLS.reserveAt, limit.toISOString()).limit(200);
  if (q.error) return { ok: false, error: q.error.message };
  let n = 0;
  for (const c of (q.data || [])) {
    const r1 = await changeStatusV2({ target: 'customer', id: c.customer_id, axis: 'customer_segment', to: '가망고객', note: '재컨택 시기 도래', auto: true });
    const r2 = await changeStatusV2({ target: 'customer', id: c.customer_id, axis: 'consult_state', to: '상담대기', note: '재컨택 시기 도래', auto: true });
    if (r1.ok && r2.ok) n++;
  }
  return { ok: true, count: n };
}
