// ============================================================
// calculator.js
// 통신사별(KT/LG/SKB/SKT) 결합 할인 및 요금 계산 로직
// 이 파일은 CS.html 보다 먼저(또는 그 직전에) 로드되어야 합니다.
// DATA / state / TV_BUNDLE_DISCOUNT / FEE_RANGES 등은 CS.html 쪽 전역
// 변수를 그대로 참조합니다 (모듈이 아닌 일반 스크립트로 로드).
// ============================================================

function getSettopByTier(carrier, tier) {
  const list = DATA[carrier]?.settopList || [];
  if (!list.length) return { name:'기본 셋톱박스', fee:3300 };
  if (tier === 'basic') return list.find(s => s.fee <= 4400) || list[0];
  if (tier === 'advanced') return list.find(s => s.fee > 4400 && s.fee <= 7700) || list[1] || list[0];
  return list.find(s => s.fee >= 8800) || list[list.length - 1];
}

function computePrice(carrier, overrideState){
  const st = overrideState || state;
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

// ---- SKB / SKT ----

function computeSKOptions(lines, speedNum, groupKey){
  const count = lines.length;
  const internetMap = { 100:4400, 500:11000, 1000:13200 };
  const internetDiscount = count > 0 ? (internetMap[speedNum] || 0) : 0;

  let mobileTotal = 0;
  if (count === 1) mobileTotal = 3500;
  else if (count === 2) mobileTotal = 3500 * 2;
  else if (count === 3) mobileTotal = 6000 * 3;
  else if (count >= 4) mobileTotal = 18000;

  const lineShares = distributeAmount(lines, mobileTotal, 'equal');

  return [
    {
      key:`sk-${groupKey}`, name:'요즘가족결합', avail: count > 0,
      availText: basicAvailText(count),
      internetDiscount, lineShares, total: internetDiscount + mobileTotal,
      desc: 'SK 매칭 회선 수와 인터넷 속도 구간에 따라 인터넷 할인이 정해지고, 모바일 할인 총액은 회선 수 기준으로 산정됩니다(회선별 금액은 이해를 돕기 위한 균등 배분 표시입니다).'
    }
  ];
}
