/* StatusRules.js — 고객·상품 상태 규칙 엔진 (ST-B)
 * 기준 문서: 상태개편_통합.md (v2.1, §13 확정 사항 반영)
 *
 * - 화면·DB에 의존하지 않는 순수 모듈입니다. 브라우저에서는 window.StatusRules, Node에서는 require() 로 씁니다.
 * - 모든 이벤트 함수는 (customer, ...인자, cfg) 를 받아 새 고객 객체를 돌려줍니다. 원본은 바꾸지 않습니다.
 * - 반환값: { ok, customer, messages:[{code,text}], error:{code,text}|null, needs:{code,...}|null }
 *     ok=true     → customer 가 새 상태. messages 는 화면에 알릴 안내(자동 변경, 경고).
 *     error       → 규칙 위반. customer 는 원본 그대로.
 *     needs       → 사용자 입력(모달)이 더 필요함. 같은 함수를 입력값을 채워 다시 호출. customer 는 원본 그대로.
 * - cfg: { today:'YYYY-MM-DD', months:3, absenceLimit:3, now:'HH:MM'(선택) }
 *
 * 고객 객체:  { id, name, agent, status, seg, reserve, exclReason, exclMemo, absenceCount, contracts:[{id,name,products:[...]}], history:[] }
 * 상품 객체:  { id, name, type('internet'|'tv'|'mobile'...), pstatus, reason, memo,
 *              pay, payDone, settle, invoiceDate, invoiceAmount, collectDate, collectAmount,
 *              refund, refundDone, changedFrom, firstReceivedAt, installedAt, proposedAt }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StatusRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 값 목록 ---------- */
  var OPT = {
    consult: ['상담대기', '상담중', '상담종료'],
    seg: ['가망', '잠재', '제외'],
    excl: ['타사가입', '기존유지', '장기부재', '신용불량', '설치불가', '오인입', '타부서', '기타'],
    pstatus: ['상품제안', '접수대기', '접수보류', '접수완료', '개통완료', '접수불가', '접수취소'],
    pay: ['지급요청', '지급보류', '지급완료', '지급제외'],
    settle: ['발행예정', '발행완료', '수금완료'],
    refund: ['환수요청', '환수완료'],
    reasonByStatus: { '접수불가': ['신용불량', '설치불가', '기타'], '접수취소': ['고객변심', '상품변경', '기타'], '접수보류': ['서류 대기', '고객 확인 대기', '일정 조율', '기타'] }   // O-04 확정
  };
  var DEFAULT_CONFIG = { today: '', months: 3, absenceLimit: 3, staleDays: 7, now: '' };
  var AFTER_RECEIPT = ['접수대기', '접수보류', '접수완료', '개통완료'];

  /* ---------- 날짜 ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function addMonths(s, n) {
    var d = parse(s), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return fmt(d);
  }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return fmt(d); }
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* ---------- 공통 ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function conf(cfg) { var c = Object.assign({}, DEFAULT_CONFIG, cfg || {}); if (!c.today) c.today = fmt(new Date()); return c; }
  function makeCtx(c, cfg) { return { c: clone(c), cfg: conf(cfg), msgs: [] }; }
  function say(x, code, text) { x.msgs.push({ code: code, text: text }); }
  function err(code, text) { return { code: code, text: text }; }
  function okRes(x) { return { ok: true, customer: x.c, messages: x.msgs, error: null, needs: null, confirm: null }; }
  function fail(orig, e) { return { ok: false, customer: orig, messages: [], error: e, needs: null }; }
  function need(orig, code, info) { return { ok: false, customer: orig, messages: [], error: null, needs: Object.assign({ code: code }, info || {}) }; }
  function limitDate(x) { return addMonths(x.cfg.today, x.cfg.months); }
  function log(x, target, item, before, after, o) {
    o = o || {};
    x.c.history = x.c.history || [];
    x.c.history.unshift({
      d: x.cfg.today, t: x.cfg.now || '', target: target, item: item,
      before: before == null ? '' : before, after: after == null ? '' : after,
      note: o.note || '', who: o.auto ? '시스템' : (x.c.agent || ''), auto: !!o.auto, pid: o.pid == null ? null : o.pid
    });
  }

  /* ---------- 상품·계약 계산 ---------- */
  function allProducts(c) {
    var a = [];
    (c.contracts || []).forEach(function (k) { (k.products || []).forEach(function (p) { a.push(p); }); });
    return a;
  }
  function findProduct(c, pid) {
    var ks = c.contracts || [];
    for (var i = 0; i < ks.length; i++) {
      var ps = ks[i].products || [];
      for (var j = 0; j < ps.length; j++) if (ps[j].id === pid) return { contract: ks[i], product: ps[j] };
    }
    return null;
  }
  function isDead(p) { return p.pstatus === '접수불가' || p.pstatus === '접수취소'; }
  function isExemptDone(p) { return p.pay === '지급제외' && p.pstatus === '개통완료'; }   // 지급 대상이 아닌 개통완료 상품은 처리 끝
  function isDone(p) { return (p.pay === '지급완료' && p.refund !== '환수요청') || p.refund === '환수완료' || isExemptDone(p); }
  function activeProducts(c) { return allProducts(c).filter(function (p) { return !isDead(p); }); }
  function blockers(c) { return activeProducts(c).filter(function (p) { return !isDone(p); }); }
  function hardBlockers(c) { return blockers(c).filter(function (p) { return p.pstatus !== '상품제안'; }); }
  function canEnd(c) { var b = blockers(c); return { ok: b.length === 0, blockers: b }; }
  function inProg(p) {
    return !isDead(p) && !isExemptDone(p) && ((AFTER_RECEIPT.indexOf(p.pstatus) > -1 && p.pay !== '지급완료') || p.pay === '지급요청' || p.pay === '지급보류');
  }
  function contractState(k) {
    var ps = k.products || [];
    if (!ps.length) return { s: '-', why: '등록된 상품이 없습니다' };
    if (ps.every(isDead)) return { s: '취소', why: '모든 상품이 접수불가·접수취소' };
    var r = ps.filter(function (p) { return p.refund && p.refund !== '-'; });
    if (r.length) return { s: '환수', why: '환수 상태 상품 ' + r.length + '건' };
    var g = ps.filter(inProg);
    if (g.length) return { s: '진행', why: '지급완료 전 접수 이후 상품 ' + g.length + '건' };
    var d = ps.filter(function (p) { return !isDead(p) && (p.pay === '지급완료' || isExemptDone(p)); });
    if (d.length) return { s: '완료', why: '지급완료·지급제외 상품 ' + d.length + '건' };
    return { s: '제안', why: '상품제안 상태' };
  }
  function newProduct(o) {
    return Object.assign({
      id: null, name: '', type: '', pstatus: '상품제안', reason: '', memo: '',
      pay: '-', payDone: '', settle: '-', invoiceDate: '', invoiceAmount: null, collectDate: '', collectAmount: null,
      refund: '-', refundDone: '', changedFrom: null, firstReceivedAt: '', installedAt: '', proposedAt: ''
    }, o || {});
  }
  function newCustomer(o) {
    return Object.assign({ id: null, name: '', agent: '', status: '상담대기', seg: '', reserve: '', exclReason: '', exclMemo: '', absenceCount: 0, contracts: [], history: [] }, o || {});
  }
  function nextProductId(c) {
    var max = 0;
    allProducts(c).forEach(function (p) { var n = Number(String(p.id).replace(/\D/g, '')); if (n > max) max = n; });
    return 'p' + (max + 1);
  }

  /* ---------- 고객 구분 · 재영업 예약 ---------- */
  function classify(reserve, cfg) {
    var cf = conf(cfg);
    return (!reserve || reserve <= addMonths(cf.today, cf.months)) ? '가망' : '잠재';
  }
  // 상품의 기준일: 지급완료는 지급완료일, 지급제외는 개통완료일
  function baseDate(p) { return p.pay === '지급제외' ? (p.installedAt || '') : (p.payDone || ''); }
  // 재영업 기준일: 활성 인터넷 상품 중 지급완료일이 가장 빠른 날짜 (인터넷이 없으면 활성 상품 중 가장 빠른 지급완료일)
  function reengageBase(c) {
    var act = activeProducts(c).filter(function (p) { return baseDate(p); });
    var net = act.filter(function (p) { return p.type === 'internet'; });
    var pool = net.length ? net : act;
    if (!pool.length) return '';
    return pool.map(baseDate).sort()[0];
  }
  function reengageDate(c, years, cfg) {
    var cf = conf(cfg), base = reengageBase(c) || cf.today;
    var raw = addMonths(base, 12 * years), limit = addMonths(cf.today, cf.months);
    if (raw <= limit) return { date: addDays(limit, 1), raw: raw, base: base, adjusted: true };
    return { date: raw, raw: raw, base: base, adjusted: false };
  }
  function isDue(c, cfg) { var cf = conf(cfg); return !!(c.reserve && c.reserve <= cf.today && c.status !== '상담종료'); }

  /* ---------- 내부 상태 변경 (ctx 기준) ---------- */
  function setSegX(x, v, o) {
    o = o || {};
    if (x.c.seg === v) return;
    var before = x.c.seg;
    x.c.seg = v;
    if (v !== '제외') { x.c.exclReason = ''; x.c.exclMemo = ''; }
    log(x, '고객', '고객 구분', before || '구분 없음', v || '구분 없음', o);
  }
  function setStatusX(x, v, o) {
    var before = x.c.status;
    x.c.status = v;
    log(x, '고객', '상담 상태', before, v, o);
  }
  function normalizeX(x) {
    var c = x.c;
    if (c.status === '상담대기') {
      if (c.seg !== '' && c.seg !== '가망') setSegX(x, '가망', { auto: true, note: '상담 상태에 맞춰 조정' });
    } else if (c.status === '상담중') {
      if (c.seg === '' || c.seg === '제외') setSegX(x, classify(c.reserve, x.cfg), { auto: true, note: '상담 상태에 맞춰 조정' });
    }
  }
  function ensureActiveX(x, why) {
    if (x.c.status === '상담중') return false;
    setStatusX(x, '상담중', { auto: true, note: why });
    normalizeX(x);
    say(x, 'status-active', why + ' → 상담 상태가 상담중으로 변경되었습니다.');
    return true;
  }
  // R-14: 상담종료 고객에게 처리할 상품이 다시 생기면 상담중으로 되돌림
  function syncOpenX(x, why) {
    if (x.c.status === '상담종료' && blockers(x.c).length) ensureActiveX(x, why);
  }
  function reclassX(x, note) {
    var c = x.c;
    if (c.seg === '제외' || !c.reserve) return;
    var s = classify(c.reserve, x.cfg);
    if (s !== c.seg) setSegX(x, s, { auto: true, note: note });
    if (c.status === '상담종료' && s === '가망') setStatusX(x, '상담대기', { auto: true, note: '재컨택 시기 도래' });
    else if (c.status === '상담대기' && s === '잠재') setStatusX(x, '상담중', { auto: true, note: '상담 시작' });
  }
  function mapReason(r) { return (r === '신용불량' || r === '설치불가') ? r : '기타'; }
  function blockedText(n) { return '진행 중인 상품 ' + n + '건이 있어 상담을 종료할 수 없습니다. 상품을 먼저 정리해 주세요.'; }

  // 상담종료 + 잠재 (재영업 예약)
  function applyEndPotential(x, date, o) {
    o = o || {};
    var lim = limitDate(x);
    if (!date || !DATE_RE.test(date)) return err('DATE_REQUIRED', '재컨택 예약일을 입력해 주세요.');
    if (date <= lim) return err('DATE_TOO_SOON', x.cfg.months + '개월 이내 날짜는 가망고객입니다. ' + lim + ' 이후 날짜를 입력해 주세요.');
    var b = blockers(x.c);
    if (b.length) return err('END_BLOCKED', blockedText(b.length));
    if (x.c.status !== '상담종료') setStatusX(x, '상담종료', { auto: o.auto, note: o.note });
    if (x.c.reserve !== date) {
      var prev = x.c.reserve;
      x.c.reserve = date;
      log(x, '고객', '상담예약일', prev, date, { auto: o.auto, note: o.noteReserve || '재영업 예약' });
    }
    setSegX(x, '잠재', { auto: o.auto, note: '재영업 예약' });
    return null;
  }
  // 상담종료 + 제외 (R-06): 상품제안 상품은 접수불가로 자동 변경한 뒤 종료 가능 여부 검사
  function applyEndExcluded(x, reason, memo, o) {
    o = o || {};
    if (OPT.excl.indexOf(reason) < 0) return err('BAD_REASON', '제외 사유를 선택해 주세요.');
    if (reason === '기타' && !(memo || '').trim()) return err('MEMO_REQUIRED', '기타를 선택한 경우 메모를 입력해 주세요.');
    var n = 0;
    allProducts(x.c).forEach(function (p) {
      if (p.pstatus === '상품제안') {
        var before = p.pstatus;
        p.pstatus = '접수불가'; p.reason = mapReason(reason);
        p.memo = reason === '기타' ? memo : '상담 단계 제외(' + reason + ')';
        log(x, '상품', '상품상태', p.name + ': ' + before, p.name + ': 접수불가', { pid: p.id, auto: true, note: '상담 단계 불가' });
        n++;
      }
    });
    var b = blockers(x.c);
    if (b.length) return err('END_BLOCKED', blockedText(b.length));
    if (x.c.status !== '상담종료') setStatusX(x, '상담종료', { auto: o.auto, note: o.note });
    if (x.c.reserve) { var prev = x.c.reserve; x.c.reserve = ''; log(x, '고객', '상담예약일', prev, '해제', { auto: true, note: '제외 처리' }); }
    setSegX(x, '제외', { auto: o.auto, note: '사유: ' + reason + (memo ? ' · ' + memo : '') });
    x.c.exclReason = reason; x.c.exclMemo = memo || '';
    if (n) say(x, 'proposals-closed', '제안 상품 ' + n + '건이 접수불가로 자동 처리되었습니다.');
    if (reason === '타사가입' || reason === '기존유지') say(x, 'reengage-suggest', reason + ' 고객입니다. 약정 만료 예상일로 재영업 예약(잠재) 전환을 검토해 주세요.');
    if (reason === '설치불가') say(x, 'install-check', '설치불가 제외입니다. 다른 통신사 안내 여부를 확인했는지 점검해 주세요.');
    return null;
  }
  function applyEndChoice(x, choice, o) {
    if (!choice) return err('BAD_CHOICE', '종료 방식을 선택해 주세요.');
    if (choice.mode === '제외') return applyEndExcluded(x, choice.reason, choice.memo || '', o);
    if (choice.mode === '잠재') return applyEndPotential(x, choice.date, o);
    return err('BAD_CHOICE', '종료 방식을 선택해 주세요.');
  }

  // 처리할 상품이 모두 끝났을 때(R-04): 재영업 년수를 받아 상담종료 + 잠재. 돌려줄 결과가 있으면 그것을, 없으면 null
  function finishPayoutX(x, orig, o, partialText) {
    if (x.c.status === '상담종료') return null;
    if (blockers(x.c).length) { say(x, 'payout-partial', partialText); return null; }
    if (o.years !== 1 && o.years !== 3) {
      return need(orig, 'years', { options: [1, 3], suggest: { 1: reengageDate(x.c, 1, x.cfg), 3: reengageDate(x.c, 3, x.cfg) } });
    }
    var rd = reengageDate(x.c, o.years, x.cfg);
    var e = applyEndPotential(x, rd.date, { auto: true, note: '고객지급 처리 완료', noteReserve: '인터넷 최초 상품 기준일(' + rd.base + ') 기준 ' + o.years + '년 뒤 재영업 예약' });
    if (e) return fail(orig, e);
    say(x, 'ended-by-payout', '지급이 모두 완료되어 상담종료, ' + o.years + '년 뒤(' + rd.date + ') 재영업 예약(잠재고객)이 등록되었습니다.');
    if (rd.adjusted) say(x, 'reserve-adjusted', '계산된 예약일(' + rd.raw + ')이 가망 기준 이내라서 ' + rd.date + '(으)로 보정했습니다.');
    return null;
  }

  /* ---------- 고객 이벤트 ---------- */
  function endConsult(c, choice, cfg) {
    var x = makeCtx(c, cfg);
    var e = applyEndChoice(x, choice, {});
    return e ? fail(c, e) : okRes(x);
  }

  function setConsultStatus(c, v, o, cfg) {
    o = o || {};
    var x = makeCtx(c, cfg);
    if (OPT.consult.indexOf(v) < 0) return fail(c, err('BAD_VALUE', '알 수 없는 상담 상태입니다.'));
    if (v === c.status) return okRes(x);
    if (v === '상담종료') {
      if (c.seg === '잠재' || c.seg === '제외') {
        var b = blockers(c);
        if (b.length) return fail(c, err('END_BLOCKED', blockedText(b.length)));
        setStatusX(x, '상담종료', {});
        return okRes(x);
      }
      var hb = hardBlockers(c);
      if (hb.length) return fail(c, err('END_BLOCKED', blockedText(hb.length)));
      if (o.endChoice) { var e = applyEndChoice(x, o.endChoice, {}); return e ? fail(c, e) : okRes(x); }
      return need(c, 'endChoice', { options: ['제외', '잠재'] });
    }
    var prev = c.status;
    setStatusX(x, v, { note: prev === '상담종료' ? '다시 연락 온 고객' : '' });
    normalizeX(x);
    return okRes(x);
  }

  function setSeg(c, v, o, cfg) {
    o = o || {};
    var x = makeCtx(c, cfg);
    if (v !== '' && OPT.seg.indexOf(v) < 0) return fail(c, err('BAD_VALUE', '알 수 없는 고객 구분입니다.'));
    if (v === c.seg) return okRes(x);
    if (v === '제외') {
      if (o.endChoice) { var e = applyEndChoice(x, Object.assign({ mode: '제외' }, o.endChoice), {}); return e ? fail(c, e) : okRes(x); }
      return need(c, 'endChoice', { options: ['제외'], preset: '제외' });
    }
    if (v === '' && c.status !== '상담대기') return fail(c, err('SEG_REQUIRED', '구분 없음은 상담대기에서만 선택할 수 있습니다.'));
    setSegX(x, v, {});
    if (x.c.status === '상담종료' && v === '가망') setStatusX(x, '상담대기', { auto: true, note: '재컨택 대상' });
    else if (x.c.status === '상담대기' && v === '잠재') setStatusX(x, '상담중', { auto: true, note: '상담 시작' });
    if (x.c.reserve && classify(x.c.reserve, x.cfg) !== v) say(x, 'reserve-mismatch', '상담예약일 기준 분류는 ' + classify(x.c.reserve, x.cfg) + '고객입니다. 예약일을 수정하면 다시 자동 분류됩니다.');
    return okRes(x);
  }

  function setReserve(c, v, o, cfg) {
    var x = makeCtx(c, cfg);
    v = v || '';
    if (v && !DATE_RE.test(v)) return fail(c, err('BAD_DATE', '날짜 형식이 올바르지 않습니다.'));
    if (v === c.reserve) return okRes(x);
    x.c.reserve = v;
    log(x, '고객', '상담예약일', c.reserve, v || '해제', {});
    if (x.c.seg === '제외') return okRes(x);
    if (v) {
      reclassX(x, '예약일 기준 ' + x.cfg.months + '개월');
      if (x.c.seg === '') setSegX(x, classify(v, x.cfg), { auto: true, note: '예약일 기준 ' + x.cfg.months + '개월' });
    } else if (x.c.seg === '잠재') {
      setSegX(x, '가망', { auto: true, note: '상담예약 없음' });
      if (x.c.status === '상담종료') setStatusX(x, '상담대기', { auto: true, note: '재컨택 대상' });
    }
    return okRes(x);
  }

  // 기준일이 바뀌었거나 예약일이 도래했을 때 한 번 호출 (R-08)
  function reevaluate(c, note, cfg) {
    var x = makeCtx(c, cfg);
    reclassX(x, note || '기준일 변경');
    return okRes(x);
  }

  // 고객부재 기록 (R-07): connected=true 이면 횟수 초기화
  function recordAbsence(c, connected, cfg) {
    var x = makeCtx(c, cfg);
    if (x.c.status === '상담종료') return fail(c, err('NOT_ACTIVE', '상담종료 고객에게는 부재를 기록할 수 없습니다.'));
    var before = x.c.absenceCount || 0;
    if (connected) {
      if (before) { x.c.absenceCount = 0; log(x, '고객', '고객부재 횟수', before, 0, { note: '고객과 연결됨' }); }
      return okRes(x);
    }
    var n = before + 1;
    x.c.absenceCount = n;
    log(x, '고객', '고객부재 횟수', before, n, {});
    ensureActiveX(x, '고객부재 재안내');
    if (n === x.cfg.absenceLimit) {                                                     // R-07: 도달 시 확인 1회
      if (hardBlockers(x.c).length) {
        say(x, 'absence-blocked', '고객부재 ' + n + '회이지만 진행 중인 상품이 있어 제외할 수 없습니다. 상품을 정리해 주세요.');
      } else {
        say(x, 'absence-limit', '고객부재 연속 ' + n + '회입니다. 제외(장기부재) 처리할지 확인해 주세요.');
        var res = okRes(x);
        res.confirm = { code: 'absenceExclude', count: n };
        return res;
      }
    }
    return okRes(x);
  }

  // 부재 확인 승인 후 제외(장기부재)
  function confirmAbsenceExclude(c, cfg) {
    var x = makeCtx(c, cfg);
    if (x.c.status === '상담종료') return fail(c, err('NOT_ACTIVE', '이미 상담종료된 고객입니다.'));
    var n = x.c.absenceCount || 0;
    if (n < x.cfg.absenceLimit) return fail(c, err('ABSENCE_NOT_REACHED', '고객부재가 ' + x.cfg.absenceLimit + '회에 도달하지 않았습니다.'));
    var e = applyEndExcluded(x, '장기부재', '고객부재 연속 ' + n + '회', { note: '고객부재 연속 ' + n + '회, 확인 후 제외' });
    if (e) return fail(c, e);
    say(x, 'absence-excluded', '고객부재 연속 ' + n + '회로 제외(장기부재) 처리되었습니다.');
    return okRes(x);
  }

  // 계약 등록 등으로 처리할 상품이 새로 생겼을 때: 상담대기 → 상담중(R-02), 상담종료 → 상담중(R-14)
  function onProductAdded(c, cfg) {
    var x = makeCtx(c, cfg);
    if (x.c.status === '상담대기') ensureActiveX(x, '상품 추가');
    else syncOpenX(x, '상품 추가');
    return okRes(x);
  }

  /* ---------- 상품 이벤트 ---------- */
  function setProductStatus(c, pid, v, o, cfg) {
    o = o || {};
    var x = makeCtx(c, cfg);
    var f = findProduct(x.c, pid);
    if (!f) return fail(c, err('NOT_FOUND', '상품을 찾을 수 없습니다.'));
    var p = f.product;
    if (OPT.pstatus.indexOf(v) < 0) return fail(c, err('BAD_VALUE', '알 수 없는 상품 상태입니다.'));
    if (v === p.pstatus) return okRes(x);
    var needsReason = (v === '접수보류' || v === '접수불가' || v === '접수취소');
    if (needsReason) {
      if (!o.reason) return need(c, 'reason', { status: v, options: OPT.reasonByStatus[v] });
      var list = OPT.reasonByStatus[v];
      if (list && list.indexOf(o.reason) < 0) return fail(c, err('BAD_REASON', v + ' 사유를 목록에서 선택해 주세요.'));
      if (o.reason === '기타' && !(o.memo || '').trim()) return fail(c, err('MEMO_REQUIRED', '기타를 선택한 경우 메모를 입력해 주세요.'));
    }
    var prev = p.pstatus, hadMoney = (prev === '개통완료' || p.pay !== '-' || p.refund !== '-');
    p.pstatus = v;
    if (needsReason) { p.reason = o.reason; p.memo = o.memo || ''; } else { p.reason = ''; p.memo = ''; }
    log(x, '상품', '상품상태', p.name + ': ' + prev, p.name + ': ' + v, { pid: p.id, note: needsReason ? '사유: ' + o.reason + (o.memo ? ' · ' + o.memo : '') : '' });
    if ((v === '접수완료' || v === '개통완료') && !p.firstReceivedAt) p.firstReceivedAt = x.cfg.today;
    if (v === '개통완료' && !p.installedAt) p.installedAt = x.cfg.today;
    if (v === '개통완료' && p.pay === '-') {
      p.pay = '지급요청';
      log(x, '상품', '고객지급', p.name + ': 해당 없음', p.name + ': 지급요청', { pid: p.id, auto: true, note: '개통완료' });
      say(x, 'pay-auto', '개통완료 → 고객지급 \'지급요청\'이 자동 설정되었습니다.');
    }
    if ((v === '접수불가' || v === '접수취소') && hadMoney) say(x, 'refund-check', '개통·지급이 진행된 상품입니다. 환수 대상인지 확인해 주세요.');
    syncOpenX(x, '상품 상태 변경');
    if (v === '개통완료' && p.pay === '지급제외') {                                        // 지급제외만 남은 고객: 개통완료 기준 종료
      var fin = finishPayoutX(x, c, o, '개통완료만 기록했습니다. 남은 상품 처리가 끝나면 상담이 종료됩니다.');
      if (fin) return fin;
    }
    return okRes(x);
  }

  function setPay(c, pid, v, o, cfg) {
    o = o || {};
    var x = makeCtx(c, cfg);
    var f = findProduct(x.c, pid);
    if (!f) return fail(c, err('NOT_FOUND', '상품을 찾을 수 없습니다.'));
    var p = f.product;
    if (v !== '-' && OPT.pay.indexOf(v) < 0) return fail(c, err('BAD_VALUE', '알 수 없는 지급 상태입니다.'));
    if (v === p.pay) return okRes(x);
    if (v !== '-' && isDead(p)) return fail(c, err('PRODUCT_DEAD', '접수불가·접수취소 상품에는 지급을 설정할 수 없습니다.'));
    var before = p.pay;
    if (v === '지급완료') {
      var d = o.doneDate || x.cfg.today;
      if (!DATE_RE.test(d)) return fail(c, err('BAD_DATE', '지급완료일 형식이 올바르지 않습니다.'));
      p.pay = v; p.payDone = d;
      log(x, '상품', '고객지급', p.name + ': ' + (before === '-' ? '해당 없음' : before), p.name + ': 지급완료', { pid: p.id, note: '지급완료일 ' + d });
      var fin = finishPayoutX(x, c, o, '지급완료만 기록했습니다. 남은 상품의 지급이 끝나면 상담이 종료됩니다.');
      if (fin) return fin;
      return okRes(x);
    }
    p.pay = v; p.payDone = '';
    log(x, '상품', '고객지급', p.name + ': ' + (before === '-' ? '해당 없음' : before), p.name + ': ' + (v === '-' ? '해당 없음' : v), { pid: p.id });
    syncOpenX(x, '지급 상태 변경');
    if (v === '지급제외' && p.pstatus === '개통완료') {
      var fin2 = finishPayoutX(x, c, o, '지급제외로 기록했습니다. 남은 상품 처리가 끝나면 상담이 종료됩니다.');
      if (fin2) return fin2;
    }
    return okRes(x);
  }

  // 지급완료일 수정 (기본값은 처리한 날, 이후 바꿀 수 있음)
  function setPayDate(c, pid, date, cfg) {
    var x = makeCtx(c, cfg);
    var f = findProduct(x.c, pid);
    if (!f) return fail(c, err('NOT_FOUND', '상품을 찾을 수 없습니다.'));
    var p = f.product;
    if (p.pay !== '지급완료') return fail(c, err('PAY_NOT_DONE', '지급완료 상품만 지급완료일을 수정할 수 있습니다.'));
    if (!date || !DATE_RE.test(date)) return fail(c, err('BAD_DATE', '지급완료일 형식이 올바르지 않습니다.'));
    if (date === p.payDone) return okRes(x);
    var before = p.payDone;
    p.payDone = date;
    log(x, '상품', '지급완료일', p.name + ': ' + before, p.name + ': ' + date, { pid: p.id });
    if (x.c.status === '상담종료' && x.c.seg === '잠재') say(x, 'reserve-recheck', '지급완료일이 바뀌었습니다. 재영업 예약일은 자동으로 바뀌지 않으니 필요하면 상담예약일을 수정해 주세요.');
    return okRes(x);
  }

  function setRefund(c, pid, v, o, cfg) {
    o = o || {};
    var x = makeCtx(c, cfg);
    var f = findProduct(x.c, pid);
    if (!f) return fail(c, err('NOT_FOUND', '상품을 찾을 수 없습니다.'));
    var p = f.product;
    if (v !== '-' && OPT.refund.indexOf(v) < 0) return fail(c, err('BAD_VALUE', '알 수 없는 환수 상태입니다.'));
    if (v === p.refund) return okRes(x);
    if ((v === '환수요청' || v === '환수완료') && p.pay !== '지급완료') return fail(c, err('REFUND_NOT_PAID', '환수는 지급완료 상품에만 요청할 수 있습니다.'));
    var rdate = o.doneDate || x.cfg.today;
    if (v === '환수완료' && !DATE_RE.test(rdate)) return fail(c, err('BAD_DATE', '환수완료일 형식이 올바르지 않습니다.'));
    var before = p.refund;
    p.refund = v;
    if (v !== '환수완료') p.refundDone = '';
    log(x, '상품', '환수', p.name + ': ' + (before === '-' ? '해당 없음' : before), p.name + ': ' + (v === '-' ? '해당 없음' : v), { pid: p.id });
    if (v === '환수요청') { ensureActiveX(x, '환수요청'); return okRes(x); }          // R-03
    if (v === '환수완료') {
      p.refundDone = rdate;
      if (x.c.status === '상담중' && blockers(x.c).length === 0) {                     // R-05
        var validReserve = x.c.reserve && classify(x.c.reserve, x.cfg) === '잠재';
        if (validReserve) {
          var e1 = applyEndPotential(x, x.c.reserve, { auto: true, note: '환수완료', noteReserve: '' });
          if (e1) return fail(c, e1);
          say(x, 'ended-by-refund', '환수가 완료되어 상담종료되었습니다. (기존 예약일 ' + x.c.reserve + ' 유지)');
        } else if (o.endChoice) {
          var e2 = applyEndChoice(x, o.endChoice, { auto: false, note: '환수완료' });
          if (e2) return fail(c, e2);
        } else {
          return need(c, 'endChoice', { options: ['제외', '잠재'], reason: '재영업 예약일이 없거나 가망 범위입니다.' });
        }
      }
      return okRes(x);
    }
    syncOpenX(x, '환수 상태 변경');
    return okRes(x);
  }

  // 수수료 정산: 발행 → 수금 순서, 처리일·금액 기록
  function setSettle(c, pid, v, o, cfg) {
    o = o || {};
    var x = makeCtx(c, cfg);
    var f = findProduct(x.c, pid);
    if (!f) return fail(c, err('NOT_FOUND', '상품을 찾을 수 없습니다.'));
    var p = f.product;
    if (v !== '-' && OPT.settle.indexOf(v) < 0) return fail(c, err('BAD_VALUE', '알 수 없는 정산 상태입니다.'));
    if (v === p.settle) return okRes(x);
    if (v !== '-' && p.pstatus !== '개통완료') return fail(c, err('SETTLE_NOT_READY', '수수료 정산은 개통완료 이후에 입력할 수 있습니다.'));
    var before = p.settle, note = '';
    function validAmount(a) { return typeof a === 'number' && isFinite(a) && a >= 0; }
    if (v === '-' || v === '발행예정') {
      p.invoiceDate = ''; p.invoiceAmount = null; p.collectDate = ''; p.collectAmount = null;
    } else if (v === '발행완료') {
      if (!o.date || !DATE_RE.test(o.date)) return fail(c, err('DATE_REQUIRED', '세금계산서 발행일을 입력해 주세요.'));
      if (!validAmount(o.amount)) return fail(c, err('AMOUNT_REQUIRED', '발행 금액을 입력해 주세요.'));
      p.invoiceDate = o.date; p.invoiceAmount = o.amount; p.collectDate = ''; p.collectAmount = null;
      note = '발행일 ' + o.date + ' · ' + o.amount + '원';
    } else if (v === '수금완료') {
      if (p.settle !== '발행완료') return fail(c, err('SETTLE_ORDER', '세금계산서 발행완료 후에 수금완료로 변경할 수 있습니다.'));
      if (!o.date || !DATE_RE.test(o.date)) return fail(c, err('DATE_REQUIRED', '수금일을 입력해 주세요.'));
      if (!validAmount(o.amount)) return fail(c, err('AMOUNT_REQUIRED', '수금 금액을 입력해 주세요.'));
      if (o.date < p.invoiceDate) return fail(c, err('DATE_ORDER', '수금일이 발행일보다 빠를 수 없습니다.'));
      p.collectDate = o.date; p.collectAmount = o.amount;
      note = '수금일 ' + o.date + ' · ' + o.amount + '원';
      if (o.amount !== p.invoiceAmount) say(x, 'collect-mismatch', '수금 금액(' + o.amount + '원)이 발행 금액(' + p.invoiceAmount + '원)과 다릅니다.');
    }
    p.settle = v;
    log(x, '상품', '수수료 정산', p.name + ': ' + (before === '-' ? '해당 없음' : before), p.name + ': ' + (v === '-' ? '해당 없음' : v), { pid: p.id, note: note });
    return okRes(x);
  }

  // 제안 방치 (R-12, O-05): 상품제안이 staleDays 이상 유지된 상품. 상담종료 고객은 제외
  function staleProposals(c, cfg) {
    var cf = conf(cfg);
    if (c.status === '상담종료') return [];
    var out = [];
    allProducts(c).forEach(function (p) {
      if (p.pstatus !== '상품제안' || !p.proposedAt) return;
      var days = Math.round((parse(cf.today) - parse(p.proposedAt)) / 86400000);
      if (days >= cf.staleDays) out.push({ id: p.id, name: p.name, days: days });
    });
    return out;
  }

  function addProduct(c, contractId, prod, cfg) {
    var x = makeCtx(c, cfg);
    var k = (x.c.contracts || []).filter(function (k2) { return k2.id === contractId; })[0];
    if (!k) return fail(c, err('NOT_FOUND', '계약을 찾을 수 없습니다.'));
    var p = newProduct(prod);
    if (!p.name) return fail(c, err('NAME_REQUIRED', '상품명을 입력해 주세요.'));
    if (!p.id) p.id = nextProductId(x.c);
    if (!p.proposedAt) p.proposedAt = x.cfg.today;
    k.products = k.products || [];
    k.products.push(p);
    log(x, '상품', '상품 추가', '', p.name + ' (상품제안)', { pid: p.id });
    syncOpenX(x, '상품 추가');
    return okRes(x);
  }

  // 상품 변경 (D-02): 기존 행은 접수취소(상품변경), 새 행은 상품제안 + 변경 전 상품 연결
  function changeProduct(c, pid, prod, cfg) {
    var x = makeCtx(c, cfg);
    var f = findProduct(x.c, pid);
    if (!f) return fail(c, err('NOT_FOUND', '상품을 찾을 수 없습니다.'));
    var old = f.product;
    if (isDead(old)) return fail(c, err('PRODUCT_DEAD', '이미 접수불가·접수취소된 상품은 변경할 수 없습니다.'));
    if (!prod || !prod.name) return fail(c, err('NAME_REQUIRED', '변경할 상품명을 입력해 주세요.'));
    var hadMoney = (old.pstatus === '개통완료' || old.pay !== '-' || old.refund !== '-');
    var prev = old.pstatus;
    old.pstatus = '접수취소'; old.reason = '상품변경'; old.memo = '';
    log(x, '상품', '상품상태', old.name + ': ' + prev, old.name + ': 접수취소', { pid: old.id, note: '사유: 상품변경' });
    var np = newProduct(Object.assign({ type: old.type }, prod, { pstatus: '상품제안', changedFrom: old.id }));
    if (!np.id) np.id = nextProductId(x.c);
    if (!np.proposedAt) np.proposedAt = x.cfg.today;
    f.contract.products.push(np);
    log(x, '상품', '상품 변경', old.name, np.name + ' (상품제안)', { pid: old.id, note: '변경 전 상품 ' + old.id });
    ensureActiveX(x, '상품 변경');                                                      // R-02
    if (hadMoney) say(x, 'refund-check', '개통·지급이 진행된 상품입니다. 환수 대상인지 확인해 주세요.');
    return okRes(x);
  }

  return {
    OPT: OPT, DEFAULT_CONFIG: DEFAULT_CONFIG,
    // 계산
    addMonths: addMonths, addDays: addDays, classify: classify, contractState: contractState,
    activeProducts: activeProducts, blockers: blockers, canEnd: canEnd, isDue: isDue,
    reengageBase: reengageBase, reengageDate: reengageDate, newProduct: newProduct, newCustomer: newCustomer,
    // 고객 이벤트
    setConsultStatus: setConsultStatus, setSeg: setSeg, setReserve: setReserve, reevaluate: reevaluate,
    endConsult: endConsult, recordAbsence: recordAbsence, onProductAdded: onProductAdded, confirmAbsenceExclude: confirmAbsenceExclude,
    // 상품 이벤트
    setProductStatus: setProductStatus, setPay: setPay, setPayDate: setPayDate, setRefund: setRefund, setSettle: setSettle,
    staleProposals: staleProposals,
    addProduct: addProduct, changeProduct: changeProduct
  };
});
