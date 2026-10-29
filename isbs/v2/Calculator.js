// ============================================================
// calculator.js
// 통신사별(KT/LG/SKB/SKT/SKY) 결합 할인 및 요금 계산 로직
// 이 파일은 config.js 다음, CS.html 인라인 스크립트보다 먼저 로드되어야 합니다.
// TV_BUNDLE_DISCOUNT / FEE_RANGES 등 상수는 config.js, DATA / state 등 상태값은
// CS.html 인라인 스크립트의 전역 변수를 호출 시점에 참조합니다 (일반 스크립트로 로드).
// ============================================================

function getSettopByTier(carrier, tier) {
  const list = DATA[carrier]?.settopList || [];
  if (!list.length) return { name:'기본 셋톱박스', fee:3300 };
  if (tier === 'basic') {
    // SK(SKB/SKT) 기본형 셋톱박스는 '스마트3'(미니 제외)를 기본으로 노출합니다. 이름이 없으면 기존 요금 기준으로 대체.
    if (carrier === 'skb' || carrier === 'skt') {
      const smart3 = list.filter(s => /스마트\s*3/.test(String(s.name || '')) && !/미니/.test(String(s.name || '')))
        .sort((a, b) => String(a.name).length - String(b.name).length)[0];
      if (smart3) return smart3;
    }
    return list.find(s => s.fee <= 4400) || list[0];
  }
  if (tier === 'advanced') return list.find(s => s.fee > 4400 && s.fee <= 7700) || list[1] || list[0];
  return list.find(s => s.fee >= 8800) || list[list.length - 1];
}

// ---- SKY(스카이라이프) 총 요금표 (2026-10-29 반영) ----
// 기준: 사용자 전달 요금표(기가지니A). 3년 약정 금액·결합할인은 알 수 없어 반영하지 않습니다(0원).
// 총 요금 = 인터넷 + TV + 지니A셋탑(3,300) [+ AP(와이파이) 선택 시]. TV: low=베이직 / basic=플러스 / premium=초이스
//  only  : 인터넷 단독 요금(AP 제외)      bundle : TV 결합 시 인터넷 요금      ap : AP(와이파이) 포함 시 추가 요금
const SKY_PRICE_TABLE = {
  internet: {
    100:  { only: 23100, bundle: 19800, ap: 1100 },
    200:  { only: 25300, bundle: 22000, ap: 0 },
    500:  { only: 30800, bundle: 27500, ap: 0 },
    1000: { only: 36300, bundle: 33000, ap: 0 }
  },
  tv: {
    low:     { name: 'IPTV 베이직', fee: 9900 },
    basic:   { name: 'IPTV 플러스', fee: 11000 },
    premium: { name: 'IPTV 초이스', fee: 19800 }
  },
  settop: { name: '지니A셋탑', fee: 3300 }
};

// SKY 는 위 표의 "총 요금" 기준으로 계산합니다. 표에 없는 속도면 null 을 돌려 기존 DB 계산을 씁니다.
function computeSkyPrice(st){
  const row = SKY_PRICE_TABLE.internet[Number(st.speed)];
  if (!row) return null;
  const hasTv = st.tv !== 'none';
  const internetFee = hasTv ? row.bundle : row.only;
  const routerFee = st.router === 'Y' ? row.ap : 0;
  let total = internetFee + routerFee;

  let tvInfo = null, settopInfo = null, tvFee = 0, settopFee = 0;
  if (hasTv) {
    const t = SKY_PRICE_TABLE.tv[st.tv] || SKY_PRICE_TABLE.tv.basic;
    const dbTv = (typeof DATA !== 'undefined' && DATA && DATA.sky && DATA.sky.tv && DATA.sky.tv[st.tv]) || {};
    tvInfo = Object.assign({ channels: 200 }, dbTv, { name: t.name, fee: t.fee });
    settopInfo = { name: SKY_PRICE_TABLE.settop.name, fee: SKY_PRICE_TABLE.settop.fee };
    tvFee = t.fee; settopFee = settopInfo.fee;
    total += tvFee + settopFee;
  }

  // 서브 TV: 기존 규칙(채널 요금 50% + 셋탑 전액) 유지 — SKY 서브 TV 규칙은 미확정
  let extraTvFee = 0;
  const extraTvDetails = [];
  if (hasTv && Array.isArray(st.extraTVs)) {
    st.extraTVs.forEach(ex => {
      const t = SKY_PRICE_TABLE.tv[ex.tv] || SKY_PRICE_TABLE.tv.basic;
      const half = Math.round(t.fee / 2);
      extraTvFee += half + SKY_PRICE_TABLE.settop.fee;
      extraTvDetails.push({ tvName: t.name, tvChannels: 200, tvHalfFee: half, settopName: SKY_PRICE_TABLE.settop.name, settopFee: SKY_PRICE_TABLE.settop.fee });
    });
    total += extraTvFee;
  }

  return { available:true, totalOnly:true, total, internetFee, routerFee, tvFee, settopFee, bundleDiscount:0, tvBundleDiscount:0, tvInfo, settopInfo, extraTvFee, extraTvDetails };
}

// ---- LG헬로비전(hello) 요금표 (2026-10-29 반영) ----
// 기준: 사용자 전달 "LG헬로비전 기본 요금" 표. 표에 없는 값(알뜰형 HD 요금, 공유기·결합할인, 서브TV 규칙, 수수료 등)은 비워 둡니다.
// 합계 = 인터넷(TV 결합 시 bundle 요금) + TV + 셋탑.  유선(wire) / IPTV(ip) 두 가지.
// TV 요금제 버튼 순서: low = 알뜰 / basic = 이코노미 / premium = 뉴베이직 (IP: basic = 프로라이트 / premium = 프로맥스)
let HELLO_VARIANT = 'wire';
const HELLO_VARIANT_LABEL = { wire: '유선', ip: 'IP' };
const HELLO_PRICE_TABLE = {
  names: { 100: '광랜라이트', 160: '광랜', 500: '기가라이트', 1000: '플래티넘기가' },
  internet: {
    100:  { only: 20790, bundle: 16330 },
    160:  { only: 27610, bundle: 22160 },
    500:  { only: 31460, bundle: 25190 },
    1000: { only: 33000, bundle: 26400 }
  },
  wire: {
    tv: {
      low:     { name: '알뜰형 HD',    fee: null },     // 요금 자료 없음 → 공란
      basic:   { name: '이코노미 UHD', fee: 8800 },
      premium: { name: '뉴베이직 UHD', fee: 11000 }
    },
    settop: { name: 'UHD셋탑', fee: 6600 }
  },
  ip: {
    tv: {
      low:     { name: 'IPTV 해당 없음', fee: null },
      basic:   { name: '프로라이트 IPTV', fee: 13200 },
      premium: { name: '프로맥스 IPTV', fee: { 160: 15400, 500: 14300, 1000: 14300 } }
    },
    settop: { name: 'IPTV셋탑', fee: 4400 },
    unavailableSpeeds: [100]      // 광랜라이트(100MB) IPTV 설치불가
  }
};

function helloTvFee(variant, tier, speed){
  const t = HELLO_PRICE_TABLE[variant] && HELLO_PRICE_TABLE[variant].tv[tier];
  if (!t) return null;
  const f = (t.fee !== null && typeof t.fee === 'object') ? t.fee[speed] : t.fee;
  return (f === undefined || f === null) ? null : f;
}

function computeHelloPrice(st){
  const speed = Number(st.speed);
  const row = HELLO_PRICE_TABLE.internet[speed];
  if (!row) return { available:false, reason:'헬로비전은 100M·160M·500M·1G 요금만 있습니다.' };
  const variant = st.helloVariant || HELLO_VARIANT;
  const set = HELLO_PRICE_TABLE[variant];
  const hasTv = st.tv !== 'none';

  const internetFee = hasTv ? row.bundle : row.only;
  let total = internetFee;
  let tvInfo = null, settopInfo = null, tvFee = 0, settopFee = 0;

  if (hasTv) {
    if (set.unavailableSpeeds && set.unavailableSpeeds.includes(speed)) {
      return { available:false, reason:'광랜라이트(100MB)는 IPTV 설치불가입니다.' };
    }
    const t = set.tv[st.tv];
    const fee = helloTvFee(variant, st.tv, speed);
    if (!t || fee === null) {
      return { available:false, reason:`${t ? t.name : 'TV'} 요금은 아직 입력되지 않았습니다(공란).` };
    }
    tvInfo = { name: t.name, fee, channels: 0 };      // channels 0 = 채널 수 미입력(화면에서 생략)
    settopInfo = { name: set.settop.name, fee: set.settop.fee };
    tvFee = fee; settopFee = set.settop.fee;
    total += tvFee + settopFee;
  }

  // 서브 TV: 기존 규칙(채널 요금 50% + 셋탑 전액) — 헬로비전 서브 TV 규칙은 미확정
  let extraTvFee = 0;
  const extraTvDetails = [];
  if (hasTv && Array.isArray(st.extraTVs)) {
    st.extraTVs.forEach(ex => {
      const t = set.tv[ex.tv] || set.tv.basic;
      const fee = helloTvFee(variant, set.tv[ex.tv] ? ex.tv : 'basic', speed) || 0;
      const half = Math.round(fee / 2);
      extraTvFee += half + set.settop.fee;
      extraTvDetails.push({ tvName: t.name, tvChannels: 0, tvHalfFee: half, settopName: set.settop.name, settopFee: set.settop.fee });
    });
    total += extraTvFee;
  }

  return { available:true, total, internetFee, routerFee:0, tvFee, settopFee, bundleDiscount:0, tvBundleDiscount:0, tvInfo, settopInfo, extraTvFee, extraTvDetails };
}

// 헬로비전을 통신사 목록·라벨에 추가 (config.js 는 수정하지 않고 여기서 보강)
(function helloBootstrap(){
  try {
    if (typeof CARRIERS !== 'undefined' && Array.isArray(CARRIERS) && !CARRIERS.includes('hello')) {
      const i = CARRIERS.indexOf('lg');
      CARRIERS.splice(i >= 0 ? i + 1 : CARRIERS.length, 0, 'hello');
    }
    if (typeof CARRIER_LABEL !== 'undefined' && CARRIER_LABEL.hello === undefined) CARRIER_LABEL.hello = 'LG헬로비전';
    if (typeof BRAND_LABEL !== 'undefined' && BRAND_LABEL.hello === undefined) BRAND_LABEL.hello = 'LG헬로비전';
    if (typeof MOBILE_GROUP_MAP !== 'undefined' && MOBILE_GROUP_MAP.hello === undefined) MOBILE_GROUP_MAP.hello = 'LG헬로비전';
    if (typeof SPEED_LABEL !== 'undefined' && SPEED_LABEL['160'] === undefined) SPEED_LABEL['160'] = '160M';
    if (typeof ISP_HOME_CARRIER_MAP !== 'undefined') {
      Object.keys(ISP_HOME_CARRIER_MAP).forEach(k => {
        const a = ISP_HOME_CARRIER_MAP[k];
        if (/헬로/.test(k) && Array.isArray(a) && !a.includes('hello')) a.push('hello');
      });
    }
  } catch (e) { console.error('[hello] 목록 보강 실패', e); }
})();

function computePrice(carrier, overrideState){
  const st = overrideState || state;
  if (carrier === 'sky') { const skyRes = computeSkyPrice(st); if (skyRes) return skyRes; }
  if (carrier === 'hello') return computeHelloPrice(st);
  const speedData = DATA[carrier]?.internet[st.speed];
  if (!speedData) return { available:false };

  let internetFee = speedData.fee;
  let total = internetFee;
  
  let actualRouterFee = speedData.routerFee;
  if (st.router === 'Y') {
    if (carrier === 'lg') actualRouterFee = 0;
    else if (carrier === 'kt' && Number(st.speed) >= 1000) actualRouterFee = 0;
    total += actualRouterFee;
  } else {
    actualRouterFee = 0;
  }

  let tvInfo = null, settopInfo = null, bundleDiscount = 0, tvBundleDiscount = 0;
  let tvFee = 0, settopFee = 0;

  if (st.tv !== 'none') {
    tvInfo = DATA[carrier].tv[st.tv];
    if (!tvInfo) tvInfo = { name:'기본형TV', fee:15400, channels:200 };
    tvFee = tvInfo.fee;
    total += tvFee;
    
    settopInfo = getSettopByTier(carrier, st.settopTier);
    if (settopInfo) {
      settopFee = settopInfo.fee;
      total += settopFee;
    }

    const speedNum = Number(st.speed);
    if (carrier === 'kt' || carrier === 'lg') {
      if (speedNum === 100) bundleDiscount = 0;
      else if (speedNum === 500 || speedNum === 1000) bundleDiscount = 5500;
    } else if (carrier === 'skb' || carrier === 'skt') {
      if (speedNum === 100) bundleDiscount = 1100;
      else if (speedNum === 500) bundleDiscount = 5500;
      else if (speedNum === 1000) bundleDiscount = 5500;
    }
    // SKY(sky): 인터넷+TV 결합할인 규칙 미확정 → 0원(위 분기에 해당하지 않으면 bundleDiscount 는 0)
    total -= bundleDiscount;

    tvBundleDiscount = TV_BUNDLE_DISCOUNT[carrier]?.[st.tv] || 0;
    total -= tvBundleDiscount;
  }

  // ---- 서브 TV (2대째부터) ----
  // 요금: 선택한 채널 요금제의 50%, 셋탑박스 요금: 동일(할인 없음)
  // TV결합할인은 메인 TV에만 적용되며 서브 TV에는 적용하지 않음
  let extraTvFee = 0;
  const extraTvDetails = [];
  if (st.tv !== 'none' && Array.isArray(st.extraTVs)) {
    st.extraTVs.forEach(ex => {
      const exTvInfo = DATA[carrier]?.tv[ex.tv] || { name:'기본형TV', fee:15400, channels:200 };
      const exSettopInfo = getSettopByTier(carrier, ex.settopTier);
      const exTvHalfFee = Math.round(exTvInfo.fee / 2);
      const exSettopFee = exSettopInfo ? exSettopInfo.fee : 0;
      extraTvFee += exTvHalfFee + exSettopFee;
      extraTvDetails.push({
        tvName: exTvInfo.name,
        tvChannels: exTvInfo.channels || 200,
        tvHalfFee: exTvHalfFee,
        settopName: exSettopInfo ? exSettopInfo.name : '기본셋톱',
        settopFee: exSettopFee
      });
    });
    total += extraTvFee;
  }

  return { available:true, total, internetFee, routerFee: actualRouterFee, tvFee, settopFee, bundleDiscount, tvBundleDiscount, tvInfo, settopInfo, extraTvFee, extraTvDetails };
}

function nearestFeeRangeValue(fee){
  let best = FEE_RANGES[0].value;
  FEE_RANGES.forEach(r => { if (fee >= r.value) best = r.value; });
  return best;
}

// ---- 공통 유틸 ----

function basicAvailText(count){
  return count > 0 ? '가입 가능' : '매칭 회선 없음';
}

function distributeAmount(lines, totalAmount, mode){
  const n = lines.length;
  let shares = new Array(n).fill(0);
  if (totalAmount <= 0 || n === 0) return shares;
  const feeSum = lines.reduce((a,p)=>a+(Number(p.fee)||0),0);
  if (mode === 'concentrate') {
    shares[0] = totalAmount;
  } else if (mode === 'contribution' && feeSum > 0) {
    let remaining = totalAmount;
    lines.forEach((p, i) => {
      if (i === n - 1) { shares[i] = remaining; }
      else {
        const share = Math.round((totalAmount * (Number(p.fee)||0) / feeSum) / 10) * 10;
        shares[i] = share;
        remaining -= share;
      }
    });
  } else { // equal
    let remaining = totalAmount;
    lines.forEach((p, i) => {
      if (i === n - 1) { shares[i] = remaining; }
      else {
        const share = Math.round((totalAmount / n) / 10) * 10;
        shares[i] = share;
        remaining -= share;
      }
    });
  }
  return shares;
}

// ---- KT ----

function tcInternetDiscountByTotal(total, is100){
  if (total < 22000) return is100 ? 1650 : 2200;
  if (total < 64900) return is100 ? 3300 : 5500;
  return 5500;
}

function tcMobileDiscountByTotal(total, is100){
  if (total < 64900) return 0;
  if (total < 108900) return is100 ? 3300 : 5500;
  if (total < 141900) return is100 ? 14300 : 16610;
  if (total < 174900) return is100 ? 18700 : 22110;
  return is100 ? 23100 : 27610;
}

function dcMobileDiscountByFee(fee){
  if (fee >= 77000) return 7000;
  if (fee >= 61000) return 5000;
  if (fee >= 37000) return 3000;
  return 0;
}

function ktPremiumFamily(lines, speedNum){
  const count77kPlus = lines.filter(p => (Number(p.fee)||0) >= 77000).length;
  const avail = (speedNum >= 500 && count77kPlus >= 2 && lines.length >= 2);
  if (!avail) return { avail:false, internetDiscount:0, lineShares: lines.map(()=>0) };

  const is100 = speedNum === 100;
  let shares = new Array(lines.length).fill(0);
  let poolIdx = [], poolFeeSum = 0;

  lines.forEach((line, idx) => {
    const fee = Number(line.fee) || 0;
    const is25Eligible = (idx >= 1 && idx <= 6 && fee >= 77000);
    if (is25Eligible) {
      let d = Math.round(fee * 0.25 / 10) * 10;
      if (line.teen && fee >= 80000) {
        const hasGuardian80k = lines.some((l2, idx2) => idx2 !== idx && (Number(l2.fee)||0) >= 80000);
        if (hasGuardian80k) d += 5500;
      }
      shares[idx] = d;
    } else {
      poolIdx.push(idx);
      poolFeeSum += fee;
    }
  });

  const poolMobileTotal = poolFeeSum > 0 ? tcMobileDiscountByTotal(poolFeeSum, is100) : 0;
  if (poolMobileTotal > 0 && poolIdx.length > 0) {
    let remaining = poolMobileTotal;
    poolIdx.forEach((idx, i) => {
      if (i === poolIdx.length - 1) {
        shares[idx] = remaining;
      } else {
        const share = Math.round((poolMobileTotal * (lines[idx].fee / poolFeeSum)) / 10) * 10;
        shares[idx] = share;
        remaining -= share;
      }
    });
  }

  return { avail:true, internetDiscount:5500, lineShares:shares };
}

function ktPremiumSingle(lines, speedNum){
  const count77kPlus = lines.filter(p => (Number(p.fee)||0) >= 77000).length;
  const avail = (speedNum >= 500 && count77kPlus >= 1 && lines.length === 1);
  if (!avail) return { avail:false, internetDiscount:0, lineShares: lines.map(()=>0) };

  const lineShares = lines.map(line => {
    const fee = Number(line.fee) || 0;
    return fee >= 77000 ? Math.round(fee * 0.25 / 10) * 10 : 0;
  });
  return { avail:true, internetDiscount:5500, lineShares };
}

function computeKTOptions(lines, speedNum, tcDistMode){
  const is100 = speedNum === 100;
  const count = lines.length;
  const sum = lines.reduce((a,p)=>a+(Number(p.fee)||0),0);

  const tcInternet = count > 0 ? tcInternetDiscountByTotal(sum, is100) : 0;
  const tcMobileTotal = count > 0 ? tcMobileDiscountByTotal(sum, is100) : 0;
  const tcShares = distributeAmount(lines, tcMobileTotal, tcDistMode);

  const dcInternet = count > 0 ? 5500 : 0;
  const dcShares = lines.map(p => dcMobileDiscountByFee(Number(p.fee)||0));
  const dcMobileTotal = dcShares.reduce((a,b)=>a+b,0);

  const pf = ktPremiumFamily(lines, speedNum);
  const ps = ktPremiumSingle(lines, speedNum);

  return [
    {
      key:'kt-total', name:'총액 결합', avail: count > 0,
      availText: basicAvailText(count),
      internetDiscount: tcInternet, lineShares: tcShares,
      total: tcInternet + tcMobileTotal, hasDistMode: true,
      desc: 'KT 매칭 회선의 요금제 합산액 구간에 따라 인터넷 할인과 모바일 할인 총액이 정해지고, 모바일 할인 총액은 아래 배분 방식대로 회선별로 나눠집니다.'
    },
    {
      key:'kt-flat', name:'정액 결합', avail: count > 0,
      availText: basicAvailText(count),
      internetDiscount: dcInternet, lineShares: dcShares,
      total: dcInternet + dcMobileTotal,
      desc: '인터넷 할인 5,500원 고정, 회선별 요금제 구간(37,000/61,000/77,000원 이상)에 따라 회선마다 개별 할인이 적용됩니다.'
    },
    {
      key:'kt-premium-family', name:'프리미엄 가족결합', avail: pf.avail,
      availText: pf.avail ? '가입 가능' : '조건 미달',
      reason: pf.avail ? null : '500M↑, 77,000원↑ 요금제 2회선 필요',
      internetDiscount: pf.internetDiscount, lineShares: pf.lineShares,
      total: pf.internetDiscount + pf.lineShares.reduce((a,b)=>a+b,0),
      desc: '인터넷 500M 이상 + 77,000원 이상 요금제 2회선 이상일 때 가능. 2~7번째 회선 중 77,000원 이상 회선은 25% 할인(청소년 조건 충족 시 5,500원 추가), 나머지 회선은 총액결합 모바일 할인 풀을 요금 비율로 배분받습니다.'
    },
    {
      key:'kt-premium-single', name:'프리미엄 싱글결합', avail: ps.avail,
      availText: ps.avail ? '가입 가능' : '조건 미달',
      reason: ps.avail ? null : '500M↑, 77,000원↑ 요금제 1회선 전용',
      internetDiscount: ps.internetDiscount, lineShares: ps.lineShares,
      total: ps.internetDiscount + ps.lineShares.reduce((a,b)=>a+b,0),
      desc: '인터넷 500M 이상 + 77,000원 이상 요금제 1회선만 있을 때 가능. 인터넷 5,500원 할인 + 해당 회선 25% 할인이 적용됩니다.'
    }
  ];
}

// ---- LG ----

function computeLGOptions(lines, speedNum){
  const count = lines.length;
  const internetMap = { 100:5500, 500:9900, 1000:13200 };
  const internetDiscount = count > 0 ? (internetMap[speedNum] || 0) : 0;

  let countBucket;
  if (count === 1) countBucket = 1;
  else if (count === 2) countBucket = 2;
  else if (count === 3) countBucket = 3;
  else countBucket = 4;

  const matrix = {
    1: { low:0, mid:0, high:0 },
    2: { low:2200, mid:3300, high:4400 },
    3: { low:3300, mid:5500, high:6600 },
    4: { low:4400, mid:6600, high:8800 }
  };
  const lineShares = lines.map(p => {
    const fee = Number(p.fee) || 0;
    let tier = 'low';
    if (fee >= 88000) tier = 'high';
    else if (fee >= 69000) tier = 'mid';
    return count > 0 ? matrix[countBucket][tier] : 0;
  });
  const mobileTotal = lineShares.reduce((a,b)=>a+b,0);

  // ---- 투게더결합할인 ----
  const togetherQualCount = lines.filter(p => (Number(p.fee)||0) >= 85000).length;
  const togetherEligible = speedNum >= 500 && togetherQualCount > 0;
  let togetherPerLine = 0;
  if (togetherQualCount === 2) togetherPerLine = 10000;
  else if (togetherQualCount === 3) togetherPerLine = 14000;
  else if (togetherQualCount >= 4) togetherPerLine = 20000;
  const togetherLineShares = togetherEligible
    ? lines.map(p => ((Number(p.fee)||0) >= 85000 ? togetherPerLine + (p.teen ? 10000 : 0) : 0))
    : lines.map(()=>0);
  const togetherInternetDiscount = togetherEligible ? 11000 : 0;
  const togetherMobileTotal = togetherLineShares.reduce((a,b)=>a+b,0);

  return [
    {
      key:'lg-easy-family', name:'참쉬운가족결합', avail: count > 0,
      availText: basicAvailText(count),
      internetDiscount, lineShares, total: internetDiscount + mobileTotal,
      desc: 'LG 매칭 회선 수와 인터넷 속도 구간에 따라 인터넷 할인이 정해지고, 회선별 요금제 구간(저가/중가/고가)에 따라 개별 모바일 할인이 적용됩니다.'
    },
    {
      key:'lg-together', name:'투게더결합', avail: togetherEligible,
      availText: togetherEligible ? '가입 가능' : '조건 미달',
      reason: togetherEligible ? null : '500M↑ 인터넷 + 85,000원↑ 요금제 1회선 필요',
      internetDiscount: togetherInternetDiscount, lineShares: togetherLineShares,
      total: togetherInternetDiscount + togetherMobileTotal,
      desc: '인터넷 500M 이상 + 매칭 회선 중 85,000원 이상 요금제 1회선 이상일 때 가능(알뜰폰 제외 LG 휴대폰 기준). 인터넷 할인 11,000원 고정, 85,000원 이상인 회선만 회선 수로 카운트되어 그 수에 따라 회선당 정액 할인(2회선 10,000원/3회선 14,000원/4회선 이상 20,000원)이 적용되며(85,000원 미만 회선은 할인 대상에서 제외), 만 18세 이하 청소년 회선은 회선당 10,000원이 추가로 할인됩니다.'
    }
  ];
}

// ---- 유심(모바일) 결합개통 수수료 구간표 ----
// carrier_commissions 테이블(product_type=USIM_MOBILE)의 요금제군별 dongpan_fee(결합개통)를
// usim_plans의 monthly_fee 구간으로 환산한 표입니다. 요금제군 자체가 DB에 숫자 구간으로
// 저장되어 있지 않아 실제 요금제 목록을 기준으로 구간을 정리했습니다.
// (요금제군이 신설/변경되면 이 표도 함께 업데이트가 필요합니다.)
const USIM_COMMISSION_BANDS = {
  SK: [
    { max: 38999, fee: 320000 },
    { max: 48999, fee: 370000 },
    { max: 68999, fee: 410000 },
    { max: 88999, fee: 460000 },
    { max: Infinity, fee: 530000 }
  ],
  KT: [
    { max: 43999, fee: 40000 },
    { max: 58999, fee: 300000 },
    { max: 69999, fee: 340000 },
    { max: 74999, fee: 370000 },
    { max: 84999, fee: 410000 },
    { max: 94999, fee: 440000 },
    { max: 104999, fee: 460000 },
    { max: 114999, fee: 480000 },
    { max: Infinity, fee: 490000 }
  ],
  LG: [
    { max: 32999, fee: 40000 },
    { max: 54999, fee: 200000 },
    { max: 60999, fee: 300000 },
    { max: 69999, fee: 340000 },
    { max: 74999, fee: 370000 },
    { max: 84999, fee: 410000 },
    { max: 94999, fee: 440000 },
    { max: 104999, fee: 460000 },
    { max: 114999, fee: 480000 },
    { max: Infinity, fee: 490000 }
  ]
};

function getUsimCommission(carrier, monthlyFee){
  const bands = USIM_COMMISSION_BANDS[carrier];
  const fee = Number(monthlyFee) || 0;
  if (!bands) return 0;
  const band = bands.find(b => fee <= b.max);
  return band ? band.fee : 0;
}

// ---- SKY(스카이라이프) ----
// 휴대폰 결합할인은 계산하지 않습니다(2026-10-06 결정). 결합 규칙이 정해지면 여기에 옵션을 만들어 돌려주세요.
function computeSkyOptions(){ return []; }

// ---- SKB / SKT ----

// 요즘가족결합 : 인터넷+IPTV 결합 시 인터넷 회선당 IPTV 할인 1,100원이 인터넷 할인과 별도로 붙습니다.
const SK_IPTV_DISCOUNT = 1100;

// hasTv : 선택한 상품에 TV가 포함되어 있으면 true (IPTV 할인은 TV 포함일 때만 적용)
function computeSKOptions(lines, speedNum, groupKey, hasTv){
  const count = lines.length;
  const internetMap = { 100:4400, 500:11000, 1000:13200 };
  const internetDiscount = count > 0 ? (internetMap[speedNum] || 0) : 0;

  let mobileTotal = 0;
  if (count === 1) mobileTotal = 3500;
  else if (count === 2) mobileTotal = 3500 * 2;
  else if (count === 3) mobileTotal = 6000 * 3;
  else if (count >= 4) mobileTotal = 18000;

  const lineShares = distributeAmount(lines, mobileTotal, 'equal');
  const tvDiscount = (count > 0 && hasTv) ? SK_IPTV_DISCOUNT : 0;

  return [
    {
      key:`sk-${groupKey}`, name:'요즘가족결합', avail: count > 0,
      availText: basicAvailText(count),
      internetDiscount, tvDiscount, lineShares, total: internetDiscount + tvDiscount + mobileTotal,
      desc: 'SK 매칭 회선 수와 인터넷 속도 구간에 따라 인터넷 할인이 정해지고(TV 포함 시 IPTV 할인 1,100원 추가), 모바일 할인 총액은 회선 수 기준으로 산정됩니다(회선별 금액은 이해를 돕기 위한 균등 배분 표시입니다).'
    }
  ];
}

// ============================================================
// 고객부재 재안내(컨택) 일정 계산
// 규칙 값(3회 / 3시간 / 09:00~18:00 / 다음 영업일 10:00)과 공휴일 목록은 config.js
// (CONTACT_RULES, KOREAN_HOLIDAYS)에 있습니다. 브라우저 로컬 시간(한국 시간) 기준입니다.
// ============================================================

function contactYmd(d){
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 주말·공휴일이 아니면 영업일
function isBusinessDay(d){
  const w = d.getDay();
  if (w === 0 || w === 6) return false;
  return !KOREAN_HOLIDAYS.includes(contactYmd(d));
}

// 영업일이면서 근무시간(09:00 ~ 18:00 정각까지) 안인지
function isWithinWorkHours(d){
  if (!isBusinessDay(d)) return false;
  const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  return sec >= CONTACT_RULES.workStartHour * 3600 && sec <= CONTACT_RULES.workEndHour * 3600;
}

// 기준일 "다음 날"부터 찾은 첫 영업일의 hour시 정각
function nextBusinessDayAt(d, hour){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hour, 0, 0, 0);
  while (!isBusinessDay(x)) x.setDate(x.getDate() + 1);
  return x;
}

// 근무시간 밖 시각을 만났을 때 이어갈 시각
//  - 영업일 근무 시작 전(예: 07:00) → 당일 10:00
//  - 18:00 이후 / 주말 / 공휴일 → 다음 영업일 10:00
function contactSlotAfterHours(d){
  if (isBusinessDay(d)) {
    const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    if (sec < CONTACT_RULES.workStartHour * 3600) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), CONTACT_RULES.nextDayStartHour, 0, 0, 0);
    }
  }
  return nextBusinessDayAt(d, CONTACT_RULES.nextDayStartHour);
}

// 1회차(최초 컨택) 시각: 근무시간 안 인입이면 인입 시각 그대로, 밖이면 다음 영업일 10:00
function computeFirstContactTime(inflow){
  const t = new Date(inflow.getTime());
  t.setSeconds(0, 0);
  return isWithinWorkHours(t) ? t : contactSlotAfterHours(t);
}

// 재안내 시각: 직전 컨택(실제 시도 시각) + 3시간. 근무시간을 벗어나면 다음 영업일 10:00부터 이어감
function computeNextContactTime(prevContactedAt){
  const prev = new Date(prevContactedAt.getTime());
  const cand = new Date(prev.getTime() + CONTACT_RULES.intervalHours * 3600 * 1000);
  cand.setSeconds(0, 0);
  if (isWithinWorkHours(cand)) return cand;
  // 자정을 넘겨도 "직전 컨택일의 다음 영업일"이 기준이 되도록 prev 기준으로 계산
  const sameDayBeforeStart = isBusinessDay(cand) && contactYmd(cand) === contactYmd(prev)
    && cand.getHours() * 3600 + cand.getMinutes() * 60 < CONTACT_RULES.workStartHour * 3600;
  if (sameDayBeforeStart) return contactSlotAfterHours(cand);
  return nextBusinessDayAt(prev, CONTACT_RULES.nextDayStartHour);
}

// 공휴일 목록이 끝난 뒤의 날짜를 계산하면 true (주말만 제외하고 계산되므로 안내용)
function isBeyondHolidayCoverage(d){
  return d.getFullYear() > KOREAN_HOLIDAYS_LAST_YEAR;
}
