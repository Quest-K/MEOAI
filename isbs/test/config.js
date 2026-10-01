// ============================================================
// config.js
// 고정 상수(라벨, 요금 구간, 정책 비율, 퍼널 단계, 태그 등) 전용 파일
// - 값이 바뀌지 않는 상수(const)만 둡니다. 화면 상태값(let)·함수는 넣지 않습니다.
// - 반드시 Calculator.js / Supabaseservice.js / CS.html 인라인 스크립트보다 먼저 로드
//   (로드 순서: supabase-js -> config.js -> Calculator.js -> Supabaseservice.js -> CS.html 인라인)
// - 일반 스크립트이므로 여기서 선언한 const는 다른 스크립트에서 그대로 참조됩니다.
// - 상수 간 의존: RECO_USIM_COLUMNS는 CARRIER_LABEL을, PRE_STAGE_STATUSES는
//   DEFAULT_FUNNEL_STATUS를, DASHBOARD_GROUPS는 FUNNEL_STAGES/PRE_STAGE_STATUSES를 참조하므로
//   아래 선언 순서를 바꾸지 마세요.
// ============================================================

/* ---------- 1. 통신사 · 요금 구간 · 라벨 ---------- */
const CARRIERS = ['kt', 'lg', 'skb', 'skt'];
const BRAND_LABEL = { kt:'KT', lg:'LG', skb:'SKB', skt:'SKT' };

const TV_BUNDLE_DISCOUNT = {
  kt: { low:2090, basic:2640, premium:2640 },
  lg: { low:2200, basic:2200, premium:2200 },
  skb: { low:2200, basic:2200, premium:2200 },
  skt: { low:2200, basic:2200, premium:2200 }
};

const SPEED_LABEL = { 100:'100M', 500:'500M', 1000:'1기가' };
const ROUTER_LABEL = { N:'미포함', Y:'포함' };

const FEE_RANGES = [
  { value: 25000, label: '3만원 이하' },
  { value: 30000, label: '3만원대' },
  { value: 40000, label: '4만원대' },
  { value: 50000, label: '5만원대' },
  { value: 60000, label: '6만원대' },
  { value: 70000, label: '7만원대' },
  { value: 80000, label: '8만원대' },
  { value: 90000, label: '9만원대' },
  { value: 100000, label: '10만원 이상' }
];

// 가족 회선 - 기존 인터넷 요금 구간 (참고용, 결합할인 계산 미사용)
const OLD_INTERNET_FEE_RANGES = [
  '2만원대 미만', '2만원대', '3만원대', '4만원대', '5만원대 이상'
];

const HOME_CARRIER_OPTIONS = ['KT', 'LG', 'SK', '기타'];
const MOBILE_CARRIER_OPTIONS = ['KT', 'LG', 'SK', 'KT알뜰', 'LG알뜰', 'SK알뜰'];

const CARRIER_LABEL = { kt:'KT', lg:'LG', skb:'SK브로드밴드', skt:'SK텔레콤' };
const ISP_HOME_CARRIER_MAP = { 'KT':['kt'], 'LG':['lg'], 'SK':['skb','skt'], '기타':[] };
const MOBILE_GROUP_MAP = { kt:'KT', lg:'LG', skb:'SK', skt:'SK' };
const USIM_TIER_RANGE = { low:[0,29999], mid:[30000,49999], high:[50000,79999], premium:[80000,Infinity] };
const USIM_TIER_LABEL = { low:'저가형', mid:'중가형', high:'고가형', premium:'프리미엄' };

/* ---------- 2. 사은품 정책 ---------- */
// 적정사은품 정책 : 기본 60% + 속도(500M +5%, 1기가 +10%) + TV등급(기본형 +5%, 고급형 +10%)
// 대리점 판매 수수료 총액(comm.totalComm) 기준, 결과는 10,000원 단위 내림
const PROPER_GIFT_BASE_PERCENT = 60;
const PROPER_GIFT_SPEED_BONUS = { 100: 0, 500: 5, 1000: 10 };
const PROPER_GIFT_TV_BONUS = { none: 0, low: 0, basic: 5, premium: 10 };

/* ---------- 3. 추천/제안 화면 표시 옵션 ---------- */
const RECO_USIM_COLUMNS = [
  { key:'kt', label:'KT', net:'KT' },
  { key:'lg', label:'LG', net:'LG' },
  { key:'skb', label:CARRIER_LABEL.skb, net:'SK' },
  { key:'skt', label:CARRIER_LABEL.skt, net:'SK' }
];

const USIM_VISIBLE_COUNT = 5;

// 서브 TV(2대째부터) 채널등급/셋탑박스 선택 UI
// 요금 계산(채널요금 50% + 셋탑박스 동일 적용)은 Calculator.js의 computePrice에서 처리
const EXTRA_TV_TIER_OPTIONS = [
  { value:'low', label:'저가형' },
  { value:'basic', label:'기본형' },
  { value:'premium', label:'고급형' }
];
const EXTRA_TV_SETTOP_OPTIONS = [
  { value:'basic', label:'기본형' },
  { value:'advanced', label:'고급형/AI' },
  { value:'soundbar', label:'사운드바' }
];

// 제안상품 유심 : 통신사 컬럼 구분 (SK 유심은 SKB/SKT 공통)
const PROPOSAL_USIM_COLUMNS = [
  { key:'kt',  label:'KT',           test: c => c === 'KT' },
  { key:'lg',  label:'LG',           test: c => c === 'LG' },
  { key:'skt', label:'SK',           test: c => c === 'SK' },
  { key:'etc', label:'알뜰 · 기타',   test: c => !['KT', 'LG', 'SK'].includes(c) }
];

/* ---------- 4. 고객 태그 ---------- */
// 고객 태그 시스템 : 카테고리별 태그 + 판별근거/참고포인트 (교육 문서 기준)
const CUSTOMER_TAG_GROUPS = [
  { label: '연령대', single: true, tags: [
    { key: '2030청년', desc: '판별근거: "자취", "1인가구", "이사" 등 언급, 빠르고 캐주얼한 말투\n참고: 복잡한 설명 배제, 현금성 사은품·빠른 개통일정 위주 안내' },
    { key: '4050중장년', desc: '판별근거: "아이들", "가족", "부모님" 등 언급\n참고: 가족결합·안정성 논리 강조. 단, [관계/명의] 태그와 함께 확인' },
    { key: '60대이상시니어', desc: '판별근거: 통신 용어에 낯설어함, 재질문이 잦음\n참고: 전문용어 배제, 친절한 톤으로 안심 부여' }
  ]},
  { label: '관계/명의', single: true, tags: [
    { key: '본인가입', desc: '판별근거: "제가 쓸 거예요", "이사해서" 등 본인 사용 명시\n참고: 연령대별 표준 전략 그대로 적용' },
    { key: '대리상담-자녀몫', desc: '판별근거: "자취방에 놓을 거예요", "제 방에" 등 자녀/가족 몫으로 별도 회선 신설\n참고: 계약자와 실사용자가 다름 → 실사용자 사용 패턴 별도 확인' },
    { key: '대리상담-부모님댁', desc: '판별근거: "부모님 댁 약정이 끝나서", "본가에" 등 대신 상담\n참고: 명의자(부모님) 본인확인 절차 사전 안내. 실사용자 니즈는 자녀에게 되물어 간접 확인' }
  ]},
  { label: '성 성향', single: true, tags: [
    { key: '남성-기술/혜택중시', desc: '판별근거: 속도(Mbps), 커버리지, 사은품 액수를 구체적 수치로 캐물음\n참고: 수치 기반 어필 (속도, 사은품 금액을 투명하게 제시)' },
    { key: '여성-가계경제/절감중시', desc: '판별근거: "매달 얼마씩 나가는지"를 반복 질문\n참고: 월 실납부액 절감분을 구체적 금액으로 제시' }
  ]},
  { label: '약정 상태', single: true, tags: [
    { key: '신규가입', desc: '판별근거: 완전 신규 회선(비교 대상이 되는 기존 약정 자체가 없음)\n참고: 만료임박/약정많이남음 화법 대신, 신규가입 전용 안내(가족결합·최초 요금제 설계)로 접근' },
    { key: '만료임박/지났음', desc: '판별근거: "약정 언제 끝났는지 모르겠다" 등\n참고: 처음부터 저렴하게 세팅하는 화법 적용' },
    { key: '약정많이남음', desc: '판별근거: 위약금 언급, 이동에 망설임\n참고: 12개월 경과 골든타임 화법 적용' }
  ]},
  { label: '핵심 니즈', tags: [
    { key: '상품조합(인터넷/TV/유심)', desc: '판별근거: "인터넷이랑 TV랑 같이" 등 언급\n참고: 결합 할인 극대화 강조' },
    { key: '사은품최우선', desc: '판별근거: 첫마디부터 "사은품 얼마예요?"\n참고: 니즈 확인 질문 플로우로 실제 우선순위 재확인' },
    { key: '요금고정비절감', desc: '판별근거: "요금 줄이고 싶어요" 등 언급\n참고: 니즈 확인 질문 플로우의 "요금 선택" 분기로 연결' }
  ]},
  { label: '상담 성향', tags: [
    { key: '체리피커(이동선호)', desc: '판별근거: 여러 통신사 견적을 비교 중, 타사 언급이 잦음\n참고: 타사 조건 이상 매칭 제시' },
    { key: '안정지향(재약정/귀찮음)', desc: '판별근거: "그냥 지금 통신사로 편하게"\n참고: 재약정 시 손해 여부만 간단히 안내, 무리한 이동 유도 지양' },
    { key: '프로슈머(정보완료)', desc: '판별근거: 전문용어·숫자를 직접 언급, 비교표 요구\n참고: 투명한 수치 비교자료 즉시 제공' }
  ]}
];

/* ---------- 5. 퍼널 상태값 · 대시보드 ---------- */
// 인생비서 퍼널 상태값 (22개 · 6그룹, 그룹명은 2글자로 통일)
//  - 상담 : 아직 계약 전 단계 (상담대기·상담예약·고객부재 포함)
//  - 계약 : 접수완료 = 개통 대기 (설치 예정일 입력)
//  - 지급 : 개통완료 이후 사은품 지급
//  - 이탈(고객부재)는 3회 재안내 후에도 부재일 때 담당자가 직접 변경합니다 (자동 전환 없음)
const FUNNEL_STAGES = [
  { stage: 1, label: '상담', items: ['상담대기', '상담예약', '고객부재', '상품안내'] },
  { stage: 2, label: '계약', items: ['계약진행', '보류확인', '접수불가', '접수완료'] },
  { stage: 3, label: '지급', items: ['개통완료', '지급요청', '지급보류', '지급완료'] },
  { stage: 4, label: '환수', items: ['환수필요', '환수요청', '환수진행', '환수완료'] },
  { stage: 5, label: '종결', items: ['종결(정상)', '종결(오인입)', '종결(타부서)'] },
  { stage: 6, label: '이탈', items: ['이탈(기존유지)', '이탈(타사가입)', '이탈(고객부재)'] }
];

// 삭제·통합된 예전 상태값 -> 현재 상태값. DB에 예전 값이 남아 있어도 대시보드·실적·칩 색상이 현재 그룹으로 집계됩니다.
// (DB 값 자체는 funnel_status_migration.sql 로 한 번 변환해 두는 것을 권장)
const LEGACY_STATUS_MAP = {
  '개통대기': '접수완료',
  '고객부재_종결': '이탈(고객부재)',
  '종결(컨택불가)': '이탈(고객부재)'
};

const DEFAULT_FUNNEL_STATUS = '상담대기';
const RESERVATION_STATUS = '상담예약';
// 아직 본 상담 전 단계로 취급하는 상태값들 (대시보드 "상담" 묶음에 함께 표시)
const PRE_STAGE_STATUSES = [DEFAULT_FUNNEL_STATUS, RESERVATION_STATUS, '고객부재'];   // 모두 '상담' 그룹 소속
const NAME_PREFIX = '(인생비서)';
// 고객정보 인입경로 선택지 (customers.inflow_route 칼럼에 저장). 항목을 늘리려면 여기에 추가하세요.
const INFLOW_ROUTES = ['전화인입', '상담요청'];

// 퍼널 대시보드 : 상태값별 건수를 6그룹(상담·계약·지급·환수·종결·이탈)으로 묶어 표시, 클릭 시 하위 상태값 건수 토글
const DASHBOARD_GROUPS = FUNNEL_STAGES.map(g => ({ key: 's' + g.stage, label: g.label, items: g.items }));

/* ---------- 6. 고객부재 재안내(컨택) 규칙 ---------- */
// 인생비서 "3-5 공통 규칙과 예외 처리" 기준. 규칙이 바뀌면 이 값만 고치면 됩니다.
//  - 총 3회(최초 1회 + 재안내 2회), 직전 컨택(실제 시도 시각) 기준 3시간 뒤 재안내
//  - 근무시간 09:00~18:00 (18:00 정각까지는 당일 진행), 넘으면 다음 영업일 10:00부터 이어감
//  - 근무시간 외(18시 이후, 주말, 공휴일) 인입은 다음 영업일 10:00를 1회차로 함
const CONTACT_RULES = {
  maxAttempts: 3,
  intervalHours: 3,
  workStartHour: 9,
  workEndHour: 18,
  nextDayStartHour: 10
};
const CONTACT_METHODS = ['전화', '문자', '카카오톡', '기타'];
const CONTACT_RESULT_ABSENT = '부재';      // 미연결 · 무응답 → 다음 회차 자동 예약
const CONTACT_RESULT_CONNECTED = '연결';   // 통화/응답 성공 → 재안내 중단
const CONTACT_CYCLE_STATUS = '고객부재';           // 재안내 진행 중 상태값
const CONTACT_CLOSED_STATUS = '이탈(고객부재)';     // 3회 모두 부재일 때 담당자가 직접 변경하는 상태값 (자동 전환 없음)
const CONTACT_CONNECTED_STATUS = DEFAULT_FUNNEL_STATUS; // 연결되면 복귀할 상태값 (기본: 상담대기)

// 영업일 계산용 공휴일 (주말은 코드에서 자동 제외). 형식 'YYYY-MM-DD'
// ※ 매년 갱신이 필요합니다. 아래는 2026~2027년 관공서 공휴일(대체공휴일 포함) 기준이며,
//    목록에 없는 해는 주말만 쉬는 날로 계산합니다. 회사 자체 휴무일이 있으면 여기에 추가하세요.
const KOREAN_HOLIDAYS = [
  // 2026
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-01', '2026-05-05',
  '2026-05-25', '2026-06-03', '2026-07-17', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26',
  '2026-10-05', '2026-10-09', '2026-12-25',
  // 2027
  '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-05',
  '2027-05-13', '2027-06-07', '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-04',
  '2027-10-11', '2027-12-27'
];
const KOREAN_HOLIDAYS_LAST_YEAR = 2027;  // 공휴일 목록이 커버하는 마지막 연도 (초과 시 화면에 안내)

/* ---------- 7. 고객조회 · 안내상품 표 열 폭(px) ---------- */
// 0은 남는 폭을 나눠 갖는 자동 폭 열. 좌우 스크롤이 생기지 않도록 요금·사은품·수수료는 좁게 고정합니다.
// 인터넷/TV : 통신사, 인터넷속도, 공유기, TV채널, 셋탑박스, 요금, 사은품, 수수료 (+ 최종, 관리는 코드에서 추가)
const GUIDED_HOME_COLS = [58, 76, 58, 0, 0, 72, 82, 88];
// 유심 : 유심통신사, 요금제, 요금, 사은품, 수수료 (+ 최종, 관리는 코드에서 추가)
const GUIDED_USIM_COLS = [80, 0, 72, 82, 88];


/* ---------- 8. 실적조회 ---------- */
// 유치 = 접수완료 이후 단계(접수완료 · 지급 · 환수)로 넘어간 건. 유치율 = 유치 건수 ÷ 전체 건수
// 유치로 볼 상태값 범위를 바꾸려면 이 배열만 고치세요. (예: 환수 제외 → stage 3만)
const PERFORMANCE_WON_STATUSES = ['접수완료', ...FUNNEL_STAGES.filter(g => g.stage >= 3 && g.stage <= 4).flatMap(g => g.items)];
// "접수완료 리스트"에 보여줄 상태값
const PERFORMANCE_LIST_STATUS = '접수완료';


/* ---------- 9. 새 구조 상태 사전 (S3) ---------- */
// 새 DB 구조(고객 > 계약 > 상품)의 상태 목록입니다. 위 5번의 FUNNEL_* 상수는 화면 전환(S5~S7)이 끝날 때까지 그대로 둡니다.
// 값(DB에 저장되는 문자열)은 01_structure.sql 과 동일해야 합니다. 이 섹션은 추가만 했고 기존 상수는 바꾸지 않았습니다.

// 고객 상태 : customers.customer_status (DB 값)
const CUSTOMER_STATUSES = ['상담대기', '상담중', '상담완료', '이탈', '제외'];
const DEFAULT_CUSTOMER_STATUS = '상담대기';
// 화면 칩에 보이는 이름. DB 값 '상담완료'는 화면에서 '유치'로 표시합니다. (결정 2026-10-01)
// ※ 상담완료 = 접수대기·보류·완료 계약이 1건이라도 있는 고객(D16). 실제 유치(접수 이력)는 v_customer_overview.is_acquired 로 따로 계산합니다.
const CUSTOMER_STATUS_LABEL = { '상담대기': '상담대기', '상담중': '상담중', '상담완료': '유치', '이탈': '이탈', '제외': '제외' };

// 상담중 부가표시 : customers.consult_substatus (customer_status = 상담중 일 때만 사용)
const CONSULT_SUBSTATUSES = ['상품안내', '상담예약', '고객부재'];

// 이탈·제외 사유 : customers.status_reason (customer_status 별로 선택)
//  - 이탈(고객부재)는 3회 재안내 후 담당자가 직접 변경합니다(자동 전환 없음, D18)
//  - 제외 사유: 현재 쓰는 오인입·타부서에 01_structure.sql 주석의 없는번호·테스트를 더해 4개로 둡니다. (DB는 사유를 자유 문자열로 저장하므로 목록은 여기서만 관리하며, 줄이거나 늘려도 DB 변경이 필요 없습니다)
const STATUS_REASONS = {
  '이탈': ['기존유지', '타사가입', '고객부재'],
  '제외': ['오인입', '타부서', '없는번호', '테스트']
};

// 계약 상태 : contracts.contract_status (계약취소는 저장하지 않고 v_contract_overview.effective_status 로 계산)
const CONTRACT_STATUSES = ['작성중', '접수대기', '접수보류', '접수불가', '접수완료'];
const DEFAULT_CONTRACT_STATUS = '작성중';
const CONTRACT_CANCELED_LABEL = '계약취소';   // effective_status 에만 나타나는 계산값
// 화면 묶음 이름 (D3-1) : 계약진행 = 작성중 + 접수대기, 보류확인 = 접수보류
const CONTRACT_DISPLAY_GROUP = {
  '작성중': '계약진행', '접수대기': '계약진행', '접수보류': '보류확인', '접수불가': '접수불가', '접수완료': '접수완료'
};

// 상품 진행 상태 : contract_items.progress_status (개통완료는 저장하지 않고 '상품이 전부 설치완료'일 때의 계산 표시값, D3-3)
const ITEM_PROGRESS = ['설치대기', '설치완료', '접수취소'];
const ITEM_ALL_INSTALLED_LABEL = '개통완료';

// 지급 / 환수 : contracts.payout_status / contracts.clawback_status (계약 단위, 값이 없으면 미설정)
const PAYOUT_STATUSES = ['지급요청', '지급보류', '지급완료'];
const CLAWBACK_STATUSES = ['환수요청', '환수보류', '환수진행', '환수완료'];

// 구 상태값(funnel_status 22개 + LEGACY_STATUS_MAP 의 예전 값) -> 새 구조 변환표
//  customer : { status, substatus?, reason? }  고객 상태 (이전 기준 D17)
//  contract : { contract_status?, payout_status?, clawback_status?, allInstalled? }  계약 쪽 대응 (없으면 고객 상태만 해당)
//  - 계약진행의 contract_status 는 작성중/접수대기 중 어느 쪽인지 구 데이터만으로 알 수 없어 '접수대기'를 기본으로 둡니다.
//  - 환수필요는 폐지되어 환수요청으로 변환합니다(D3-2). 개통완료는 allInstalled(상품 전부 설치완료)로 표시합니다.
//  - 종결(정상)은 지급완료로 이전했습니다.
const FUNNEL_TO_NEW_STRUCTURE = (() => {
  const issued = { contract_status: '접수완료' };
  const m = {
    '상담대기':       { customer: { status: '상담대기' } },
    '상담예약':       { customer: { status: '상담중', substatus: '상담예약' } },
    '고객부재':       { customer: { status: '상담중', substatus: '고객부재' } },
    '상품안내':       { customer: { status: '상담중', substatus: '상품안내' } },
    '계약진행':       { customer: { status: '상담중' }, contract: { contract_status: '접수대기' } },
    '보류확인':       { customer: { status: '상담중' }, contract: { contract_status: '접수보류' } },
    '접수불가':       { customer: { status: '상담중' }, contract: { contract_status: '접수불가' } },
    '접수완료':       { customer: { status: '상담완료' }, contract: { ...issued } },
    '개통완료':       { customer: { status: '상담완료' }, contract: { ...issued, allInstalled: true } },
    '지급요청':       { customer: { status: '상담완료' }, contract: { ...issued, payout_status: '지급요청' } },
    '지급보류':       { customer: { status: '상담완료' }, contract: { ...issued, payout_status: '지급보류' } },
    '지급완료':       { customer: { status: '상담완료' }, contract: { ...issued, payout_status: '지급완료' } },
    '환수필요':       { customer: { status: '상담완료' }, contract: { ...issued, clawback_status: '환수요청' } },
    '환수요청':       { customer: { status: '상담완료' }, contract: { ...issued, clawback_status: '환수요청' } },
    '환수진행':       { customer: { status: '상담완료' }, contract: { ...issued, clawback_status: '환수진행' } },
    '환수완료':       { customer: { status: '상담완료' }, contract: { ...issued, clawback_status: '환수완료' } },
    '종결(정상)':     { customer: { status: '상담완료' }, contract: { ...issued, payout_status: '지급완료' } },
    '종결(오인입)':   { customer: { status: '제외', reason: '오인입' } },
    '종결(타부서)':   { customer: { status: '제외', reason: '타부서' } },
    '이탈(기존유지)': { customer: { status: '이탈', reason: '기존유지' } },
    '이탈(타사가입)': { customer: { status: '이탈', reason: '타사가입' } },
    '이탈(고객부재)': { customer: { status: '이탈', reason: '고객부재' } }
  };
  // 삭제·통합된 예전 값(개통대기 등)은 LEGACY_STATUS_MAP 으로 현재 값을 거쳐 같은 변환을 따릅니다.
  Object.keys(LEGACY_STATUS_MAP).forEach(old => { m[old] = m[LEGACY_STATUS_MAP[old]]; });
  return m;
})();
