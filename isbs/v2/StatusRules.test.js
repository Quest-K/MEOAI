/* StatusRules.test.js — 실행: node StatusRules.test.js (의존 패키지 없음) */
'use strict';
var assert = require('assert');
var R = require('./StatusRules.js');

var CFG = { today: '2026-10-15', months: 3 };      // 가망 기준일 = 2027-01-15
var passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; failures.push(name + ' → ' + e.message); console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function group(title) { console.log('\n' + title); }

/* 테스트 데이터 도우미 */
var P = R.newProduct;
function cust(o, products) {
  return R.newCustomer(Object.assign({ id: 'c', name: '테스트', agent: '한지수',
    contracts: [{ id: 'k1', name: '계약1', products: products || [] }] }, o));
}
function prod(c, pid) { var f = null; c.contracts.forEach(function (k) { k.products.forEach(function (p) { if (p.id === pid) f = p; }); }); return f; }
function hasMsg(res, code) { return res.messages.some(function (m) { return m.code === code; }); }
function lastLog(c, item) { return c.history.filter(function (h) { return h.item === item; })[0]; }

/* ================================================================ */
group('1. 계약 상태 계산 (상태사전 §3) — 목업 샘플 5명');
test('c1 김하늘: [접수완료, 접수대기] → 진행 / [상품제안] → 제안', function () {
  assert.equal(R.contractState({ products: [P({ id: 'a', pstatus: '접수완료' }), P({ id: 'b', pstatus: '접수대기' })] }).s, '진행');
  assert.equal(R.contractState({ products: [P({ id: 'c' })] }).s, '제안');
});
test('c3 이도윤: 개통완료+지급완료 → 완료', function () {
  assert.equal(R.contractState({ products: [P({ pstatus: '개통완료', pay: '지급완료' })] }).s, '완료');
});
test('c4 정미나: 접수불가만 → 취소', function () {
  assert.equal(R.contractState({ products: [P({ pstatus: '접수불가' })] }).s, '취소');
});
test('c5 최유진: 환수요청 상품 + 접수취소 상품 → 환수', function () {
  var k = { products: [P({ pstatus: '개통완료', pay: '지급완료', refund: '환수요청' }), P({ pstatus: '접수취소' })] };
  assert.equal(R.contractState(k).s, '환수');
});
test('상품이 없으면 "-"', function () { assert.equal(R.contractState({ products: [] }).s, '-'); });
test('일부만 취소되고 나머지가 진행이면 취소가 아님', function () {
  assert.equal(R.contractState({ products: [P({ pstatus: '접수취소' }), P({ pstatus: '접수완료' })] }).s, '진행');
});

/* ================================================================ */
group('2. 고객 구분 분류 · 경계');
test('예약일 없음 → 가망', function () { assert.equal(R.classify('', CFG), '가망'); });
test('예약일 = 기준일(2027-01-15) → 가망', function () { assert.equal(R.classify('2027-01-15', CFG), '가망'); });
test('예약일 = 기준일 + 1일 → 잠재', function () { assert.equal(R.classify('2027-01-16', CFG), '잠재'); });
test('가망 기준 개월 수 설정값(6개월) 반영', function () {
  assert.equal(R.classify('2027-01-16', { today: '2026-10-15', months: 6 }), '가망');
});

/* ================================================================ */
group('3. 상품 상태 · 자동 규칙 R-01, R-13');
test('R-01 개통완료 → 지급요청 자동 설정 + 이력(시스템)', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', name: '인터넷', type: 'internet', pstatus: '접수완료' })]);
  var r = R.setProductStatus(c, 'p1', '개통완료', {}, CFG);
  assert.ok(r.ok); assert.equal(prod(r.customer, 'p1').pay, '지급요청');
  assert.ok(hasMsg(r, 'pay-auto'));
  assert.equal(lastLog(r.customer, '고객지급').who, '시스템');
});
test('접수완료·개통완료 최초 시각 기록 (유치 지표용)', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '접수대기' })]);
  var r = R.setProductStatus(c, 'p1', '접수완료', {}, CFG);
  assert.equal(prod(r.customer, 'p1').firstReceivedAt, '2026-10-15');
  var r2 = R.setProductStatus(R.setProductStatus(r.customer, 'p1', '개통완료', {}, { today: '2026-10-20' }).customer, 'p1', '접수완료', {}, { today: '2026-10-25' });
  assert.equal(prod(r2.customer, 'p1').firstReceivedAt, '2026-10-15');     // 최초 시각 유지
});
test('접수불가는 사유가 필요 → needs, 변경 없음', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1' })]);
  var r = R.setProductStatus(c, 'p1', '접수불가', {}, CFG);
  assert.ok(!r.ok && r.needs && r.needs.code === 'reason');
  assert.deepEqual(r.needs.options, ['신용불량', '설치불가', '기타']);
  assert.equal(prod(r.customer, 'p1').pstatus, '상품제안');
});
test('기타 사유는 메모 필수', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1' })]);
  var r = R.setProductStatus(c, 'p1', '접수취소', { reason: '기타' }, CFG);
  assert.equal(r.error.code, 'MEMO_REQUIRED');
  var r2 = R.setProductStatus(c, 'p1', '접수취소', { reason: '기타', memo: '고객 요청' }, CFG);
  assert.ok(r2.ok); assert.equal(prod(r2.customer, 'p1').reason, '기타');
});
test('접수취소 사유 목록 밖 값은 거부', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1' })]);
  assert.equal(R.setProductStatus(c, 'p1', '접수취소', { reason: '신용불량' }, CFG).error.code, 'BAD_REASON');
});
test('R-13 개통·지급 이후 접수취소 → 환수 확인 안내', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '개통완료', pay: '지급요청' })]);
  var r = R.setProductStatus(c, 'p1', '접수취소', { reason: '고객변심' }, CFG);
  assert.ok(r.ok && hasMsg(r, 'refund-check'));
});
test('원본 객체는 변경되지 않음 (불변성)', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '접수완료' })]);
  var snap = JSON.stringify(c);
  R.setProductStatus(c, 'p1', '개통완료', {}, CFG);
  assert.equal(JSON.stringify(c), snap);
});

/* ================================================================ */
group('4. 지급완료와 상담종료 (D-03, D-04, R-04)');
test('단일 상품 지급완료 → 재영업 년수 입력 필요(needs), 아직 변경 없음', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급요청' })]);
  var r = R.setPay(c, 'p1', '지급완료', {}, CFG);
  assert.ok(r.needs && r.needs.code === 'years');
  assert.equal(r.needs.suggest[1].date, '2027-10-15'); assert.equal(r.needs.suggest[3].date, '2029-10-15');
  assert.equal(r.customer.status, '상담중'); assert.equal(prod(r.customer, 'p1').pay, '지급요청');
});
test('1년 선택 → 상담종료 + 잠재 + 예약일 +1년 + 이력', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급요청' })]);
  var r = R.setPay(c, 'p1', '지급완료', { years: 1 }, CFG);
  assert.ok(r.ok);
  assert.equal(r.customer.status, '상담종료'); assert.equal(r.customer.seg, '잠재'); assert.equal(r.customer.reserve, '2027-10-15');
  assert.equal(prod(r.customer, 'p1').payDone, '2026-10-15');
  assert.ok(hasMsg(r, 'ended-by-payout'));
});
test('D-04 일부 상품만 지급완료 → 상담중 유지, 종료하지 않음', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [
    P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급요청' }),
    P({ id: 'p2', type: 'tv', pstatus: '개통완료', pay: '지급요청' })]);
  var r = R.setPay(c, 'p1', '지급완료', {}, CFG);
  assert.ok(r.ok); assert.equal(r.customer.status, '상담중'); assert.ok(hasMsg(r, 'payout-partial'));
  var r2 = R.setPay(r.customer, 'p2', '지급완료', {}, CFG);
  assert.ok(r2.needs && r2.needs.code === 'years');              // 마지막 상품에서 종료
});
test('D-03 재영업 기준일 = 인터넷 최초 상품의 지급일 (모바일이 나중에 지급돼도)', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [
    P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급완료', payDone: '2026-09-15' }),
    P({ id: 'p2', type: 'mobile', pstatus: '개통완료', pay: '지급요청' })]);
  var r = R.setPay(c, 'p2', '지급완료', { years: 1 }, CFG);
  assert.equal(r.customer.reserve, '2027-09-15');
});
test('인터넷 상품이 없으면 가장 빠른 지급완료일 사용', function () {
  var c = cust({}, [P({ id: 'a', type: 'mobile', payDone: '2026-08-01' }), P({ id: 'b', type: 'tv', payDone: '2026-07-01' })]);
  assert.equal(R.reengageBase(c), '2026-07-01');
});
test('예약일이 가망 범위이면 기준일+3개월+1일로 보정 [제안]', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [
    P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급완료', payDone: '2025-11-15' }),
    P({ id: 'p2', type: 'mobile', pstatus: '개통완료', pay: '지급요청' })]);
  var r = R.setPay(c, 'p2', '지급완료', { years: 1 }, CFG);       // 2025-11-15 + 1년 = 2026-11-15 ≤ 2027-01-15
  assert.equal(r.customer.reserve, '2027-01-16'); assert.ok(hasMsg(r, 'reserve-adjusted'));
});
test('접수불가·접수취소 상품은 종료 판단에서 제외', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [
    P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급요청' }),
    P({ id: 'p2', pstatus: '접수취소' })]);
  assert.ok(R.setPay(c, 'p1', '지급완료', {}, CFG).needs.code === 'years');
});
test('접수취소 상품에는 지급을 설정할 수 없음', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '접수취소' })]);
  assert.equal(R.setPay(c, 'p1', '지급요청', {}, CFG).error.code, 'PRODUCT_DEAD');
});
test('지급완료일 직접 입력(과거 날짜)과 형식 검증', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급요청' }), P({ id: 'p2', pstatus: '접수완료' })]);
  var r = R.setPay(c, 'p1', '지급완료', { doneDate: '2026-10-01' }, CFG);
  assert.equal(prod(r.customer, 'p1').payDone, '2026-10-01');
  assert.equal(R.setPay(c, 'p1', '지급완료', { doneDate: '10/01' }, CFG).error.code, 'BAD_DATE');
});

/* ================================================================ */
group('5. 환수 (D-05, R-03, R-05)');
function endedCust(reserve) {
  return cust({ status: '상담종료', seg: reserve ? '잠재' : '잠재', reserve: reserve || '' },
    [P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급완료', payDone: '2026-09-01' })]);
}
test('R-03 상담종료 고객의 환수요청 → 상담중 (구분 잠재 유지)', function () {
  var r = R.setRefund(endedCust('2027-09-01'), 'p1', '환수요청', {}, CFG);
  assert.ok(r.ok); assert.equal(r.customer.status, '상담중'); assert.equal(r.customer.seg, '잠재');
  assert.ok(hasMsg(r, 'status-active'));
});
test('환수 진행 중에는 상담종료 불가', function () {
  var c = R.setRefund(endedCust('2027-09-01'), 'p1', '환수요청', {}, CFG).customer;
  var r = R.setConsultStatus(c, '상담종료', {}, CFG);
  assert.equal(r.error.code, 'END_BLOCKED');
});
test('R-05 환수완료 + 유효한 예약일 → 자동 상담종료, 예약일 유지', function () {
  var c = R.setRefund(endedCust('2027-09-01'), 'p1', '환수요청', {}, CFG).customer;
  var r = R.setRefund(c, 'p1', '환수완료', {}, CFG);
  assert.ok(r.ok); assert.equal(r.customer.status, '상담종료'); assert.equal(r.customer.reserve, '2027-09-01');
  assert.equal(prod(r.customer, 'p1').refundDone, '2026-10-15');
});
test('R-05 환수완료 + 예약일 없음 → 종료 방식 선택 필요(needs)', function () {
  var c = R.setRefund(endedCust(''), 'p1', '환수요청', {}, CFG).customer;
  var r = R.setRefund(c, 'p1', '환수완료', {}, CFG);
  assert.ok(r.needs && r.needs.code === 'endChoice'); assert.equal(r.customer.status, '상담중');
});
test('R-05 종료 방식: 잠재(예약일) / 제외(사유)', function () {
  var c = R.setRefund(endedCust(''), 'p1', '환수요청', {}, CFG).customer;
  var r1 = R.setRefund(c, 'p1', '환수완료', { endChoice: { mode: '잠재', date: '2027-06-01' } }, CFG);
  assert.ok(r1.ok); assert.equal(r1.customer.reserve, '2027-06-01'); assert.equal(r1.customer.status, '상담종료');
  var r2 = R.setRefund(c, 'p1', '환수완료', { endChoice: { mode: '제외', reason: '기타', memo: '환수 고객' } }, CFG);
  assert.ok(r2.ok); assert.equal(r2.customer.seg, '제외');
});
test('환수완료여도 다른 상품이 진행 중이면 상담중 유지', function () {
  var c = cust({ status: '상담종료', seg: '잠재', reserve: '2027-09-01' }, [
    P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급완료', payDone: '2026-09-01' }),
    P({ id: 'p2', type: 'tv', pstatus: '개통완료', pay: '지급완료', payDone: '2026-09-01' })]);
  var r = R.setRefund(c, 'p1', '환수요청', {}, CFG);
  var r2 = R.setRefund(r.customer, 'p1', '환수완료', {}, CFG);
  assert.equal(r2.customer.status, 'status' && '상담종료');     // p2 는 지급완료라서 모두 done → 종료
  var c3 = cust({ status: '상담종료', seg: '잠재', reserve: '2027-09-01' }, [
    P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급완료', payDone: '2026-09-01' })]);
  var r3 = R.addProduct(R.setRefund(c3, 'p1', '환수요청', {}, CFG).customer, 'k1', { name: '신규 TV', type: 'tv' }, CFG);
  var r4 = R.setRefund(r3.customer, 'p1', '환수완료', {}, CFG);
  assert.equal(r4.customer.status, '상담중');                      // 상품제안 상품이 남아 있음
});

/* ================================================================ */
group('6. 상담종료 · 제외 (R-06, R-09, R-10)');
test('R-06 제외: 상품제안 → 접수불가 자동(사유 매핑), 예약일 해제', function () {
  var c = cust({ status: '상담중', seg: '가망', reserve: '2026-11-01' }, [P({ id: 'p1', name: '인터넷 100메가' })]);
  var r = R.endConsult(c, { mode: '제외', reason: '타사가입' }, CFG);
  assert.ok(r.ok);
  assert.equal(r.customer.status, '상담종료'); assert.equal(r.customer.seg, '제외'); assert.equal(r.customer.exclReason, '타사가입');
  assert.equal(r.customer.reserve, '');
  var p = prod(r.customer, 'p1');
  assert.equal(p.pstatus, '접수불가'); assert.equal(p.reason, '기타'); assert.equal(p.memo, '상담 단계 제외(타사가입)');
  assert.ok(hasMsg(r, 'proposals-closed'));
  assert.ok(hasMsg(r, 'reengage-suggest'));                         // R-10
});
test('R-06 신용불량·설치불가는 사유 그대로 상품에 전달', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1' })]);
  assert.equal(prod(R.endConsult(c, { mode: '제외', reason: '신용불량' }, CFG).customer, 'p1').reason, '신용불량');
  var r = R.endConsult(c, { mode: '제외', reason: '설치불가' }, CFG);
  assert.ok(hasMsg(r, 'install-check'));
});
test('제외 사유 기타는 메모 필수', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1' })]);
  assert.equal(R.endConsult(c, { mode: '제외', reason: '기타' }, CFG).error.code, 'MEMO_REQUIRED');
});
test('R-09 접수 이후 상품이 있으면 제외 차단, 고객 변경 없음', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '접수완료' }), P({ id: 'p2' })]);
  var snap = JSON.stringify(c);
  var r = R.endConsult(c, { mode: '제외', reason: '타사가입' }, CFG);
  assert.equal(r.error.code, 'END_BLOCKED'); assert.equal(JSON.stringify(r.customer), snap);
});
test('상담종료(잠재): 예약일이 가망 범위면 거부, 이후 날짜면 성공', function () {
  var c = cust({ status: '상담중', seg: '가망' }, []);
  assert.equal(R.endConsult(c, { mode: '잠재', date: '2026-12-01' }, CFG).error.code, 'DATE_TOO_SOON');
  var r = R.endConsult(c, { mode: '잠재', date: '2027-06-01' }, CFG);
  assert.ok(r.ok); assert.equal(r.customer.seg, '잠재'); assert.equal(r.customer.status, '상담종료');
});
test('상담종료(잠재): 제안 상품이 남아 있으면 차단 (먼저 접수취소 필요)', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1' })]);
  assert.equal(R.endConsult(c, { mode: '잠재', date: '2027-06-01' }, CFG).error.code, 'END_BLOCKED');
  var c2 = R.setProductStatus(c, 'p1', '접수취소', { reason: '고객변심' }, CFG).customer;
  assert.ok(R.endConsult(c2, { mode: '잠재', date: '2027-06-01' }, CFG).ok);
});
test('상담 상태를 상담종료로 직접 선택: 가망이면 종료 방식 선택(needs), 잠재면 바로 종료', function () {
  var c = cust({ status: '상담중', seg: '가망' }, []);
  assert.equal(R.setConsultStatus(c, '상담종료', {}, CFG).needs.code, 'endChoice');
  var c2 = cust({ status: '상담중', seg: '잠재', reserve: '2027-06-01' }, []);
  assert.equal(R.setConsultStatus(c2, '상담종료', {}, CFG).customer.status, '상담종료');
});
test('고객 구분을 제외로 선택하면 종료 방식 입력(needs), 사유 입력 시 처리', function () {
  var c = cust({ status: '상담중', seg: '가망' }, []);
  assert.equal(R.setSeg(c, '제외', {}, CFG).needs.code, 'endChoice');
  var r = R.setSeg(c, '제외', { endChoice: { reason: '오인입' } }, CFG);
  assert.equal(r.customer.exclReason, '오인입');
});
test('제외 해제(가망으로 변경) → 상담대기 + 가망, 제외 사유 삭제', function () {
  var c = R.endConsult(cust({ status: '상담중', seg: '가망' }, []), { mode: '제외', reason: '오인입' }, CFG).customer;
  var r = R.setSeg(c, '가망', {}, CFG);
  assert.equal(r.customer.status, '상담대기'); assert.equal(r.customer.seg, '가망'); assert.equal(r.customer.exclReason, '');
});
test('구분 없음은 상담대기에서만 가능', function () {
  assert.equal(R.setSeg(cust({ status: '상담중', seg: '가망' }, []), '', {}, CFG).error.code, 'SEG_REQUIRED');
});

/* ================================================================ */
group('7. 상담 상태 · 예약일 자동 분류 (R-08)');
test('상담종료 → 상담중 직접 변경 시 "다시 연락 온 고객" 이력 + 구분 정리', function () {
  var c = cust({ status: '상담종료', seg: '제외', exclReason: '오인입' }, []);
  var r = R.setConsultStatus(c, '상담중', {}, CFG);
  assert.equal(r.customer.status, '상담중'); assert.equal(r.customer.seg, '가망');
  assert.equal(lastLog(r.customer, '상담 상태').note, '다시 연락 온 고객');
});
test('예약일 설정: 기준일 이후 → 잠재, 이내 → 가망', function () {
  var c = cust({ status: '상담중', seg: '가망' }, []);
  assert.equal(R.setReserve(c, '2027-06-01', {}, CFG).customer.seg, '잠재');
  assert.equal(R.setReserve(c, '2026-12-01', {}, CFG).customer.seg, '가망');
});
test('예약일 해제: 잠재 → 가망, 상담종료이면 상담대기로', function () {
  var c = cust({ status: '상담종료', seg: '잠재', reserve: '2027-06-01' }, []);
  var r = R.setReserve(c, '', {}, CFG);
  assert.equal(r.customer.seg, '가망'); assert.equal(r.customer.status, '상담대기');
});
test('R-08 기준일이 지나 예약일이 가망 범위가 되면 상담종료 → 상담대기 + 가망', function () {
  var c = cust({ status: '상담종료', seg: '잠재', reserve: '2027-01-20' }, []);
  assert.equal(R.reevaluate(c, '', CFG).customer.seg, '잠재');                                   // 2026-10-15 기준: 아직 잠재
  var r = R.reevaluate(c, '', { today: '2026-10-25', months: 3 });                              // 기준일 2027-01-25
  assert.equal(r.customer.seg, '가망'); assert.equal(r.customer.status, '상담대기');
});
test('상담대기 + 잠재 예약 → 상담중으로 시작', function () {
  var c = cust({ status: '상담대기', seg: '가망', reserve: '2027-06-01' }, []);
  var r = R.reevaluate(c, '', CFG);
  assert.equal(r.customer.seg, '잠재'); assert.equal(r.customer.status, '상담중');
});
test('예약일 도래 표시(업무 목록)', function () {
  assert.ok(R.isDue(cust({ status: '상담대기', reserve: '2026-10-15' }, []), CFG));
  assert.ok(!R.isDue(cust({ status: '상담종료', reserve: '2026-10-01' }, []), CFG));
});

/* ================================================================ */
group('8. 장기부재 3회 (D-06, R-07)');
test('부재 1·2회: 상담중 전환, 횟수 누적', function () {
  var c = cust({ status: '상담대기', seg: '가망' }, [P({ id: 'p1' })]);
  var r1 = R.recordAbsence(c, false, CFG); var r2 = R.recordAbsence(r1.customer, false, CFG);
  assert.equal(r2.customer.absenceCount, 2); assert.equal(r2.customer.status, '상담중');
});
test('연결되면 횟수 초기화', function () {
  var c = cust({ status: '상담중', seg: '가망', absenceCount: 2 }, []);
  assert.equal(R.recordAbsence(c, true, CFG).customer.absenceCount, 0);
});
test('3회 도달 → 바로 제외하지 않고 확인 요청(prompt), 확인하면 제외(장기부재) + 제안 상품 접수불가', function () {
  var c = cust({ status: '상담중', seg: '가망', absenceCount: 2 }, [P({ id: 'p1' })]);
  var r = R.recordAbsence(c, false, CFG);
  assert.equal(r.customer.status, '상담중'); assert.equal(r.customer.absenceCount, 3);
  assert.equal(r.prompt.code, 'absence-exclude'); assert.ok(hasMsg(r, 'absence-limit'));
  var r2 = R.confirmAbsenceExclude(r.customer, CFG);
  assert.ok(r2.ok);
  assert.equal(r2.customer.status, '상담종료'); assert.equal(r2.customer.seg, '제외'); assert.equal(r2.customer.exclReason, '장기부재');
  assert.equal(prod(r2.customer, 'p1').pstatus, '접수불가');
  assert.ok(hasMsg(r2, 'absence-excluded'));
});
test('3회에 도달하지 않았으면 제외 확인 불가', function () {
  var c = cust({ status: '상담중', seg: '가망', absenceCount: 1 }, []);
  assert.equal(R.confirmAbsenceExclude(c, CFG).error.code, 'ABSENCE_NOT_REACHED');
});
test('3회여도 접수 이후 상품이 있으면 제외하지 않고 안내만', function () {
  var c = cust({ status: '상담중', seg: '가망', absenceCount: 2 }, [P({ id: 'p1', pstatus: '접수완료' })]);
  var r = R.recordAbsence(c, false, CFG);
  assert.equal(r.customer.status, '상담중'); assert.ok(hasMsg(r, 'absence-blocked')); assert.equal(r.customer.absenceCount, 3);
});
test('설정값 absenceLimit 변경 반영', function () {
  var c = cust({ status: '상담중', seg: '가망', absenceCount: 1 }, []);
  var r = R.recordAbsence(c, false, { today: '2026-10-15', absenceLimit: 2 });
  assert.equal(r.prompt.code, 'absence-exclude');
  assert.equal(R.recordAbsence(c, false, CFG).prompt, null);
});

/* ================================================================ */
group('9. 상품 변경 · 추가 (D-02, R-02, R-14)');
test('D-02 상품 변경: 기존 접수취소(상품변경) + 새 행(상품제안, 변경 전 연결) + 상담중', function () {
  var c = cust({ status: '상담대기', seg: '가망' }, [P({ id: 'p1', name: '인터넷 500메가', type: 'internet', pstatus: '접수완료' })]);
  var r = R.changeProduct(c, 'p1', { name: '인터넷 1기가' }, CFG);
  assert.ok(r.ok);
  var old = prod(r.customer, 'p1'), nw = prod(r.customer, 'p2');
  assert.equal(old.pstatus, '접수취소'); assert.equal(old.reason, '상품변경');
  assert.equal(nw.pstatus, '상품제안'); assert.equal(nw.changedFrom, 'p1'); assert.equal(nw.type, 'internet');
  assert.equal(r.customer.status, '상담중');
  assert.equal(r.customer.contracts[0].products.length, 2);
});
test('개통·지급이 진행된 상품을 변경하면 환수 확인 안내', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '개통완료', pay: '지급요청' })]);
  assert.ok(hasMsg(R.changeProduct(c, 'p1', { name: '신규' }, CFG), 'refund-check'));
});
test('이미 취소된 상품은 변경 불가', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '접수취소' })]);
  assert.equal(R.changeProduct(c, 'p1', { name: '신규' }, CFG).error.code, 'PRODUCT_DEAD');
});
test('R-14 상담종료 고객에게 상품 추가 → 상담중 복귀', function () {
  var c = endedCust('2027-09-01');
  var r = R.addProduct(c, 'k1', { name: '추가 TV', type: 'tv' }, CFG);
  assert.equal(r.customer.status, '상담중'); assert.equal(r.customer.seg, '잠재');
});
test('R-14 상담종료 고객의 지급완료를 되돌리면 상담중 복귀', function () {
  var r = R.setPay(endedCust('2027-09-01'), 'p1', '지급보류', {}, CFG);
  assert.equal(r.customer.status, '상담중');
});
test('R-14 취소했던 상품을 다시 살리면 상담종료 고객이 상담중으로 복귀', function () {
  var c = cust({ status: '상담종료', seg: '잠재', reserve: '2027-09-01' }, [
    P({ id: 'p1', pstatus: '개통완료', pay: '지급완료', payDone: '2026-09-01', type: 'internet' }),
    P({ id: 'p2', pstatus: '접수취소', reason: '고객변심' })]);
  assert.equal(R.setProductStatus(c, 'p2', '상품제안', {}, CFG).customer.status, '상담중');
});

/* ================================================================ */
group('10. 수수료 정산 (D-07): 발행 → 수금, 처리일·금액');
function settleCust() { return cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '개통완료', pay: '지급요청' }), P({ id: 'p2', pstatus: '접수완료' })]); }
test('개통완료 전에는 정산 입력 불가', function () {
  assert.equal(R.setSettle(settleCust(), 'p2', '발행예정', {}, CFG).error.code, 'SETTLE_NOT_READY');
});
test('발행완료는 발행일·금액 필수', function () {
  assert.equal(R.setSettle(settleCust(), 'p1', '발행완료', {}, CFG).error.code, 'DATE_REQUIRED');
  assert.equal(R.setSettle(settleCust(), 'p1', '발행완료', { date: '2026-10-15' }, CFG).error.code, 'AMOUNT_REQUIRED');
});
test('수금완료는 발행완료 이후에만 (순서 검증)', function () {
  assert.equal(R.setSettle(settleCust(), 'p1', '수금완료', { date: '2026-10-20', amount: 100 }, CFG).error.code, 'SETTLE_ORDER');
});
test('정상 흐름: 발행예정 → 발행완료 → 수금완료, 값 기록', function () {
  var c = R.setSettle(settleCust(), 'p1', '발행예정', {}, CFG).customer;
  c = R.setSettle(c, 'p1', '발행완료', { date: '2026-10-16', amount: 500000 }, CFG).customer;
  var r = R.setSettle(c, 'p1', '수금완료', { date: '2026-10-30', amount: 500000 }, CFG);
  var p = prod(r.customer, 'p1');
  assert.equal(p.settle, '수금완료'); assert.equal(p.invoiceDate, '2026-10-16'); assert.equal(p.invoiceAmount, 500000);
  assert.equal(p.collectDate, '2026-10-30'); assert.equal(p.collectAmount, 500000);
  assert.ok(!hasMsg(r, 'collect-mismatch'));
});
test('수금 금액이 발행 금액과 다르면 경고, 수금일이 발행일보다 빠르면 거부', function () {
  var c = R.setSettle(settleCust(), 'p1', '발행완료', { date: '2026-10-16', amount: 500000 }, CFG).customer;
  assert.ok(hasMsg(R.setSettle(c, 'p1', '수금완료', { date: '2026-10-30', amount: 450000 }, CFG), 'collect-mismatch'));
  assert.equal(R.setSettle(c, 'p1', '수금완료', { date: '2026-10-10', amount: 500000 }, CFG).error.code, 'DATE_ORDER');
});
test('발행예정으로 되돌리면 발행·수금 값 초기화', function () {
  var c = R.setSettle(settleCust(), 'p1', '발행완료', { date: '2026-10-16', amount: 500000 }, CFG).customer;
  var p = prod(R.setSettle(c, 'p1', '발행예정', {}, CFG).customer, 'p1');
  assert.equal(p.invoiceDate, ''); assert.equal(p.invoiceAmount, null);
});
test('정산은 상담 상태·상품 상태에 영향을 주지 않음', function () {
  var c = settleCust();
  var r = R.setSettle(c, 'p1', '발행완료', { date: '2026-10-16', amount: 1 }, CFG);
  assert.equal(r.customer.status, c.status); assert.equal(prod(r.customer, 'p1').pstatus, '개통완료');
});

/* ================================================================ */
group('11. 목업 샘플 시나리오 통합');
test('c1 김하늘: 접수대기 → 접수완료 → 개통완료 → 지급완료(둘 다) → 상담종료', function () {
  var c = cust({ status: '상담중', seg: '가망', reserve: '2027-06-01' }, [
    P({ id: 'p1', name: '인터넷 500메가', type: 'internet', pstatus: '접수완료' }),
    P({ id: 'p2', name: 'IPTV 베이직', type: 'tv', pstatus: '접수대기' })]);
  c = R.setProductStatus(c, 'p2', '접수완료', {}, CFG).customer;
  c = R.setProductStatus(c, 'p1', '개통완료', {}, CFG).customer;
  c = R.setProductStatus(c, 'p2', '개통완료', {}, CFG).customer;
  c = R.setPay(c, 'p1', '지급완료', {}, CFG).customer;
  var last = R.setPay(c, 'p2', '지급완료', {}, CFG);
  assert.equal(last.needs.code, 'years');
  var done = R.setPay(c, 'p2', '지급완료', { years: 3 }, CFG);
  assert.equal(done.customer.status, '상담종료'); assert.equal(done.customer.reserve, '2029-10-15');
});
test('c5 최유진: 환수 → 상담중 → 환수완료 → 종료 방식 선택', function () {
  var c = cust({ status: '상담종료', seg: '잠재', reserve: '' }, [
    P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급완료', payDone: '2026-08-16' }),
    P({ id: 'p2', pstatus: '접수취소', reason: '고객변심' })]);
  c = R.setRefund(c, 'p1', '환수요청', {}, CFG).customer;
  assert.equal(c.status, '상담중');
  assert.equal(R.setRefund(c, 'p1', '환수완료', {}, CFG).needs.code, 'endChoice');
});

/* ================================================================ */
/* ================================================================ */
group('12. 2026-10-16 확정 사항 (지급제외 · 환수 제한 · 사유 목록 · 지급완료일 · 제안 방치)');
test('지급제외 상품: 개통완료되면 고객지급을 자동 요청하지 않음', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', type: 'tv', pstatus: '접수완료', pay: '지급제외' }), P({ id: 'p2', type: 'internet', pstatus: '접수완료' })]);
  var r = R.setProductStatus(c, 'p1', '개통완료', {}, CFG);
  assert.equal(prod(r.customer, 'p1').pay, '지급제외'); assert.equal(prod(r.customer, 'p1').openedAt, '2026-10-15');
  assert.equal(r.customer.status, '상담중');
});
test('지급제외만 있는 고객: 모두 개통완료 → 년수 선택(needs) → 상담종료 + 잠재, 기준일은 개통완료일', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', type: 'tv', pstatus: '접수완료', pay: '지급제외' })]);
  var n = R.setProductStatus(c, 'p1', '개통완료', {}, CFG);
  assert.equal(n.needs.code, 'years');
  var r = R.setProductStatus(c, 'p1', '개통완료', { years: 3 }, CFG);
  assert.ok(r.ok); assert.equal(r.customer.status, '상담종료'); assert.equal(r.customer.seg, '잠재');
  assert.equal(r.customer.reserve, '2029-10-15');
});
test('혼합(지급 대상 + 지급제외): 지급 대상이 끝나기 전에는 종료 안 됨, 끝나면 가장 빠른 기준일 사용', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [
    P({ id: 'p1', type: 'internet', pstatus: '개통완료', pay: '지급요청', openedAt: '2026-09-20' }),
    P({ id: 'p2', type: 'tv', pstatus: '접수완료', pay: '지급제외' })]);
  var a = R.setProductStatus(c, 'p2', '개통완료', { years: 1 }, CFG);
  assert.equal(a.customer.status, '상담중');
  var b = R.setPay(a.customer, 'p1', '지급완료', { doneDate: '2026-10-10', years: 1 }, CFG);
  assert.equal(b.customer.status, '상담종료'); assert.equal(b.customer.reserve, '2027-10-10');
});
test('계약 상태: 지급제외 + 개통완료는 완료', function () {
  assert.equal(R.contractState({ products: [P({ pstatus: '개통완료', pay: '지급제외' })] }).s, '완료');
  assert.equal(R.contractState({ products: [P({ pstatus: '접수완료', pay: '지급제외' })] }).s, '진행');
});
test('환수요청은 지급완료 상품만 가능', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '개통완료', pay: '지급요청' })]);
  assert.equal(R.setRefund(c, 'p1', '환수요청', {}, CFG).error.code, 'REFUND_NOT_PAID');
});
test('환수완료일 직접 입력 / 형식 검증', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '개통완료', pay: '지급완료', payDone: '2026-09-01', refund: '환수요청' }), P({ id: 'p2', pstatus: '접수완료' })]);
  var r = R.setRefund(c, 'p1', '환수완료', { doneDate: '2026-10-01' }, CFG);
  assert.equal(prod(r.customer, 'p1').refundDone, '2026-10-01');
  assert.equal(R.setRefund(c, 'p1', '환수완료', { doneDate: '10/01' }, CFG).error.code, 'BAD_DATE');
});
test('접수보류 사유 목록(O-04): 목록 밖 값 거부, 기타는 메모 필수', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '접수대기' })]);
  assert.deepEqual(R.setProductStatus(c, 'p1', '접수보류', {}, CFG).needs.options, ['서류 대기', '고객 확인 대기', '일정 조율', '기타']);
  assert.equal(R.setProductStatus(c, 'p1', '접수보류', { reason: '모름' }, CFG).error.code, 'BAD_REASON');
  assert.equal(R.setProductStatus(c, 'p1', '접수보류', { reason: '기타' }, CFG).error.code, 'MEMO_REQUIRED');
  assert.ok(R.setProductStatus(c, 'p1', '접수보류', { reason: '서류 대기' }, CFG).ok);
});
test('지급완료일 수정: 지급완료 상품만, 형식 검증, 이력 기록', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', pstatus: '개통완료', pay: '지급완료', payDone: '2026-09-01' }), P({ id: 'p2', pstatus: '접수완료' })]);
  var r = R.setPayDate(c, 'p1', '2026-09-05', CFG);
  assert.equal(prod(r.customer, 'p1').payDone, '2026-09-05'); assert.ok(lastLog(r.customer, '지급완료일').after.indexOf('2026-09-05') > -1);
  assert.equal(R.setPayDate(c, 'p2', '2026-09-05', CFG).error.code, 'NOT_PAID');
  assert.equal(R.setPayDate(c, 'p1', '9/5', CFG).error.code, 'BAD_DATE');
});
test('제안 방치(R-12, O-05): 7일 이상 상품제안 상태 상품만', function () {
  var c = cust({ status: '상담중', seg: '가망' }, [P({ id: 'p1', proposedAt: '2026-10-08' }), P({ id: 'p2', proposedAt: '2026-10-09' }), P({ id: 'p3', pstatus: '접수대기', proposedAt: '2026-09-01' })]);
  var s7 = R.staleProposals(c, CFG).map(function (p) { return p.id; });
  assert.deepEqual(s7, ['p1']);
  assert.deepEqual(R.staleProposals(c, { today: '2026-10-15', staleDays: 3 }).map(function (p) { return p.id; }), ['p1', 'p2']);
});
test('상품 추가 시 제안일 기록', function () {
  var c = cust({ status: '상담중', seg: '가망' }, []);
  var r = R.addProduct(c, 'k1', { name: '인터넷', type: 'internet' }, CFG);
  assert.equal(r.customer.contracts[0].products[0].proposedAt, '2026-10-15');
});

console.log('\n' + '='.repeat(60));
console.log('통과 ' + passed + ' / 실패 ' + failed + ' / 전체 ' + (passed + failed));
if (failed) { console.log('\n실패 목록:'); failures.forEach(function (f) { console.log(' - ' + f); }); process.exit(1); }
