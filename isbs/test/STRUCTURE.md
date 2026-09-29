# 인생비서 CS 툴 — 구조 안내서 (STRUCTURE.md)

고객상담 · 상품설계 · 가입진행 웹툴(`isbs/CS.html`)의 구조 문서입니다.
**다른 AI나 새 작업자가 코드를 열기 전에 전체 그림을 잡는 용도**이며, 코드 수정 시에는 이 문서와 해당 코드 파일을 함께 참고하세요.

- 줄 번호는 근사치입니다. 실제 위치는 **함수명 검색**으로 찾으세요.
- 표시 규칙: 코드에서 직접 확인한 내용은 사실로, DB 컬럼처럼 코드로 추정한 내용은 **(코드 기준 추정)** 으로 표시했습니다.
- 수수료 금액·구간 등 민감한 숫자는 이 문서에 적지 않았습니다. 필요하면 해당 코드를 보세요.

---

## 0. 다른 AI에게 작업을 맡길 때

1. 이 문서 + **수정 대상 파일**(필요하면 5개 전부)을 함께 전달합니다.
2. 요청에 "일반 `<script>` 방식 유지 (ES module 금지)", "`onclick` 함수는 전역 유지", "로직 변경 없이 이동만" 같은 제약을 적어 주세요.
3. 결과를 받으면 8번(배포 체크리스트)대로 확인하세요.

---

## 1. 서비스 개요와 용어

통신사(KT/LG/SK) 가입 리퍼럴 상담 도구입니다. 상담원이 고객 정보를 입력하면 통신사별 요금·사은품·결합할인을 비교해 상품을 제안하고, 상담 내용을 Supabase에 저장합니다.

| 용어 | 뜻 |
|---|---|
| 홈상품 (`home`) | 인터넷 + TV 묶음 상품 |
| 유심 (`usim`) | 휴대폰 유심 가입 상품 |
| 동판 | 홈상품과 유심을 함께 가입하는 상품 (UIT: 인터넷+TV+유심, UI: 인터넷+유심) |
| 추천상품 → 제안상품 → 최종상품 | 상담 단계. 후보를 좌측에서 우측으로 골라 나감 |
| 사은품 | 고객에게 주는 상품권 + 현금 |
| 수수료(commission) | 대리점이 받는 판매 수수료. **로그인(관리자)했을 때만** 보임 |
| 퍼널 상태값 | 고객의 진행 단계(상담대기 ~ 종결). 24개, 5단계 (`FUNNEL_STAGES`) |
| SKB / SKT | SK브로드밴드(인터넷·TV) / SK텔레콤. 유심 쪽에서는 둘 다 "SK"로 묶임 |

---

## 2. 파일 구성 (5개)

| 파일 | 줄 수(약) | 역할 | 넣는 것 / 넣지 않는 것 |
|---|---|---|---|
| `CS.html` | 3,900 | 화면 마크업 + 상담·고객관리 로직(인라인 스크립트) | 화면 상태값(`let`)과 렌더/이벤트 함수 |
| `Styles.css` | 1,780 | 전체 스타일 (기존 CSS + 인라인에서 이동한 CS 화면 CSS) | 스타일만 |
| `config.js` | 195 | **고정 상수** (라벨, 요금 구간, 사은품 비율, 퍼널 단계, 태그, **재안내 규칙·공휴일**, **실적조회 기준**) | `const` 상수만. 상태값·함수 금지 |
| `Calculator.js` | 460 | 요금 계산, 통신사별 결합할인, 유심 수수료 구간표, **고객부재 재안내 일정 계산** | 계산 함수 |
| `Supabaseservice.js` | 190 | Supabase 연결, 상품·수수료·프로모션 조회, 로그인/로그아웃 | DB·인증 함수 |

---

## 3. 로드 순서 (바꾸면 안 됨)

```
supabase-js (CDN)
  → Styles.css?v=...           (head)
  → config.js?v=...            상수 정의
  → Calculator.js?v=...        계산 함수
  → Supabaseservice.js?v=...   sb 클라이언트 + DB 함수
  → [로드 점검 스크립트]        빠진/뒤바뀐 파일이 있으면 화면 상단에 빨간 경고
  → CS.html 인라인 스크립트     상태값 + 화면 로직 + init()
```

- 모두 **일반 `<script>`** 입니다. `type="module"`을 쓰면 HTML의 `onclick="..."`(약 46곳)이 함수를 찾지 못해 동작하지 않습니다.
- `?v=20260930c`는 캐시 방지용입니다. **파일을 고쳐 배포할 때마다 올리세요.**
- 로드 점검 스크립트는 `supabase`, `CARRIERS`(config.js), `computePrice`(Calculator.js), `loadData`(Supabaseservice.js)가 있는지 확인합니다. **새 파일을 추가하면 이 점검에도 항목을 추가하세요.**

---

## 4. 파일 간 의존 관계

모든 파일이 전역 스코프를 공유하고, 함수는 **호출 시점에** 서로를 참조합니다.

| 참조하는 쪽 | 참조 대상 | 정의된 곳 |
|---|---|---|
| Calculator.js | `FEE_RANGES`, `TV_BUNDLE_DISCOUNT` | config.js |
| Calculator.js | `DATA`, `state` | CS.html 인라인 |
| Supabaseservice.js | `CARRIERS` | config.js |
| Supabaseservice.js | `DATA`, `logs`, `isLoggedIn`, `recoState`, `recoUsimTier`, `COMMISSION_DATA`, `RAW_COMMISSION_DATA`, `PROMOTION_DATA` | CS.html 인라인 |
| Supabaseservice.js | `addLog`, `renderRecoCards`, `renderProposalLists`, `renderFinalProducts`, `updateAuthUI`, `closeLoginModal`, `fetchRecoUsimPlans`, `refreshCustomerListView`, `refreshPerformanceView` (뒤 두 개는 `typeof` 확인 후 호출) | CS.html 인라인 |
| CS.html 인라인 | `computePrice`, `computeKTOptions`, `computeLGOptions`, `computeSKOptions`, `getUsimCommission` | Calculator.js |
| CS.html 인라인 | `sb`, `loadData`, `loadFinanceData`, `lookupCommission`, `handleLogin`, `handleLogout` | Supabaseservice.js |

**config.js 내부 선언 순서 의존** (바꾸지 마세요): `RECO_USIM_COLUMNS`→`CARRIER_LABEL`, `PRE_STAGE_STATUSES`→`DEFAULT_FUNNEL_STATUS`, `DASHBOARD_GROUPS`→`FUNNEL_STAGES`·`PRE_STAGE_STATUSES`.

---

## 5. 화면 구조

탭 3개(`switchTab`: 고객상담 / 고객조회 / 실적조회), 상담 탭 안에 4단계 마법사(`goCsStep`)가 있습니다.

| 영역 | 주요 `id` | 설명 |
|---|---|---|
| 상단 | `status-banner`, `cs-banner-logs`, `cs-wiz-nav` | 데이터 로드 로그, 단계 이동 버튼 |
| **탭1 `view-cs` 고객상담** | | |
| 1단계 고객정보 `cs-wiz-panel-1` | `cust-name`, `cust-contact`, `cust-mobile-carrier`, `cust-mobile-fee`, `old-internet-toggle/-body`, `old-isp`, `old-tv-count`, `old-internet-fee`, `old-contract-end`, `family-line-toggle/-body`, `family-lines-list`, `customer-tags-body`, `cust-funnel-status`, `cust-next-contact`, `cust-notes` | 고객 기본정보, 기존 인터넷, 가족 회선, 태그, 관리정보 |
| 2단계 추천상품 `cs-wiz-panel-2` | `reco-seg-speed/-router/-tv/-settop`, `reco-tv-onoff-toggle`, `reco-extra-tv-list`, `reco-carrier-cards`, `reco-usim-tier-buttons`, `reco-usim-cards`, `reco-preset-*` | 속도·TV 선택, 통신사 4분할 카드, 유심 추천 |
| 3단계 제안상품 `cs-wiz-panel-3` | `proposal-home-list`, `proposal-usim-list`, `final-combo-discount` | 반영된 상품 목록, 결합할인 |
| 4단계 최종상품 `cs-wiz-panel-4` | `final-products-home`, `final-products-usim`, `commission-home-panel`, `commission-usim-panel`, `consult-save-state`, `cs-live-customer-info`, `cs-live-products-info` | 최종 확정, 수수료(로그인 시), 저장, 상담요약 |
| **탭2 `view-customers` 고객조회** | `funnel-dashboard`, `cust-search-contact`, `cust-search-status`, `cust-list-table`, `cust-list`, `cust-detail`, `cust-products`, `contact-section`, `cf-notes`, `cf-note-input`, `status-log-section` | 퍼널 대시보드(오늘 컨택 예정·지연 칩 포함), 검색, **[📥 엑셀 다운로드]**, 목록(안내상품 여러 건 + 요금·사은품·수수료), 상세(**상태값 변경 이력**, 컨택 이력 1~3차, 특이사항 누적, 안내상품 표) |
| **탭3 `view-performance` 실적조회** | `perf-from`, `perf-to`, `perf-summary`, `perf-funnel`, `perf-list-title`, `perf-list` | 기간 필터, 유치율 카드, 퍼널별 건수·전체 대비 비율(단계별 접기/펼치기), 접수완료 리스트(사은품·수수료·마진·마진율) |
| 모달 | `login-modal`, `reservation-modal`, `toast-container` | 로그인, 상담 예약, 토스트 알림 |

---

## 6. 데이터 흐름

```
[DB 조회: 앱 시작 init()]
  loadData()         → DATA            (요금제, TV, 셋톱)
  loadFinanceData()  → PROMOTION_DATA  (사은품 프로모션)
                     → COMMISSION_DATA / RAW_COMMISSION_DATA (수수료, 로그인 시에만)

[1단계 고객정보 입력] ─(input/change 이벤트)→ updateCsSummaryPanel(), renderRecoCards()

[2단계 추천상품]
  recoState(속도·TV·공유기·셋톱·서브TV) + DATA → computePrice() → 통신사 카드(renderRecoCards)
      └ [상품반영] reflectRecoCardToProposal()  ──┐
  usim_plans 조회 → 유심 카드(fetchRecoUsimPlans)   │
      └ [반영] reflectRecoUsimPlan()  ────────────┤ → reflectedProducts[] (+ 유심은 addedUsimLines[]에도)
                                                  ▼
[3단계 제안상품] renderProposalLists(), 결합할인 renderFamilyDiscountAccordion()
      └ [최종으로] moveProposalToFinal() → finalProducts[]  (home은 1개만, usim은 여러 개)

[4단계 최종상품] renderFinalProducts(), computeFinalCombo() → 최적 결합할인
      └ [저장] saveConsultation()
            → customers 저장(insert/update)  +  customer_products 전체 교체(delete 후 insert)
            → proposal_snapshot(제안·최종·가족회선 통째로) 저장

[고객조회 탭] loadFunnelDashboard / searchCustomers → openCustomer → 상세 수정 updateCustomer
      └ [상담으로 불러오기] loadCustomerToConsult() → proposal_snapshot으로 위 배열들을 복원
      └ [📥 엑셀 다운로드] exportCustomerListCsv() → customerListCache를 CSV로 저장

[상태값이 바뀌는 모든 지점] → logStatusChange() → customer_status_logs insert → 상세의 '상태값 변경 이력'

[실적조회 탭] switchTab('performance') → loadPerformance()
      customers(기간 필터, 1000행씩 페이징) → 퍼널 집계·유치율 renderPerformance()
      상태값 '접수완료' 고객 → customer_products → 접수완료 리스트 renderPerformanceList()
```

핵심: **`reflectedProducts`(제안)와 `finalProducts`(최종)는 같은 객체를 공유**합니다(`moveProposalToFinal`은 복사가 아니라 같은 객체를 push). 한쪽에서 수정하면 다른 쪽에도 반영됩니다.

---

## 7. 전역 상태와 주요 데이터 형태

### 7-1. 상태 변수 (CS.html 인라인)

| 변수 | 용도 | 비고 |
|---|---|---|
| `DATA` | DB에서 읽은 상품 정보 | 아래 7-2 |
| `recoState` | **추천상품 화면의 현재 선택값** | `{speed:'500', tv:'basic', settopTier:'basic', router:'Y', extraTVs:[{tv, settopTier}]}` — speed는 문자열 |
| `state` | 예전 상품설계 화면용 선택값 | `computePrice`의 기본 인자. 추천상품은 `recoState`를 넘겨서 사용 |
| `reflectedProducts` | 제안상품 목록 | home/usim 혼합 (7-3) |
| `finalProducts` | 최종상품 목록 | 같은 객체 참조 |
| `addedUsimLines` | 유심 회선 목록(결합할인 계산 입력) | `{id, carrier, planName, fee, teen, gift, synced?}` — `id`는 제안상품 유심과 동일(연결 키). `synced`는 고객정보의 현재 휴대폰에서 자동 생성된 줄 |
| `familyLines` | 가족 회선(참고 정보) | `{id, type:'internet'\|'mobile', carrier, feeLabel(인터넷) \| feeValue(휴대폰)}` — 결합할인 계산에는 아직 미사용 |
| `PROMOTION_DATA` | 통신사별 사은품 한도 | `{[carrier]: {giftCard, cash, maxLimit}}` |
| `COMMISSION_DATA` | 통신사별 수수료 (현재 속도/TV 기준) | `{[carrier]: {internetComm, tvComm, totalComm, startAt}}` — 비로그인 시 빈 값 |
| `RAW_COMMISSION_DATA` | 수수료 원본 행 | `lookupCommission()`이 사용 |
| `customGiftValues` | 상담원이 직접 고친 홈 사은품 | `{[carrier]: 금액}` |
| `customUsimGiftValues` | 상담원이 직접 고친 유심 사은품 | `{'NET\|요금제명': 금액}` |
| `isLoggedIn` | 관리자 로그인 여부 | 수수료 노출 여부를 결정 |
| `recoUsimTier`, `recoUsimPlanPool` | 유심 추천 구간 / 조회된 요금제 목록 | |
| `CUSTOMER_SCHEMA` | DB에 어떤 컬럼/테이블이 있는지 점검한 결과 | `{hasProductsTable, hasSnapshot, hasTags, hasContactsTable, hasStatusLogsTable, checked}` |
| `currentCustomerId` | 지금 상담 중인 고객 ID | 있으면 저장 시 update |
| `customerListCache` | 고객조회 목록 캐시 | |
| `selectedCustomerTags` / `detailCustomerTags` | 태그 선택 (상담 화면 / 조회 화면, 서로 독립) | `Set` |
| `logs` | 데이터 로드 로그 | 테이블명이 key |
| `perfCustomers`, `perfProdMap` | 실적조회 조회 결과(고객 행 / 접수완료 고객의 상품 행) | 로그인·로그아웃 시 재조회 없이 다시 그리는 용도 |
| `perfOpenGroups` | 실적조회 퍼널 표에서 펼쳐 둔 단계 key | `Set`, 기본은 모두 접힘 |

### 7-2. `DATA` 형태 (`loadData()`가 만듦)

```js
DATA[carrier] = {                       // carrier: 'kt' | 'lg' | 'skb' | 'skt'
  internet: { [speed]: { fee, routerFee } },              // speed: 100 | 500 | 1000
  tv:       { low, basic, premium },                      // 각 { name, fee, channels }
  settopList: [ { name, fee } ]
}
```

TV 요금제 등급(low/basic/premium)은 DB의 `plan_name` 문자열에 특정 단어가 들어 있는지로 판별합니다(통신사별로 다름). **DB의 요금제 이름이 바뀌면 매핑이 깨질 수 있으니** `loadData()`의 매핑 부분을 함께 확인하세요.

### 7-3. 제안상품 객체 (`reflectedProducts`의 원소)

- **home**: `id`, `type:'home'`, `carrierName`, `carrierKey`, `speedNum`, `tvTier`, `internetLabel`, `internetFee`, `routerLabel`, `routerFee`, `bundleDiscount`, `tvLabel`, `tvName`, `tvChannels`, `tvFee`, `settopLabel`, `settopFee`, `tvBundleDiscount`, `totalFee`, `extraTVs`, `extraTvFee`, `extraTvDetails`, `benefitTotal`(사은품 합계), `giftCard`, `cash`
- **usim**: `id`, `type:'usim'`, `carrier`('KT'/'LG'/'SK'/알뜰 등), `planName`, `fee`, `contractFee`, `dataAllowance`, `voiceAllowance`, `smsAllowance`, `tethering`, `membership`, `targetAge`, `gift`

### 7-4. `computePrice(carrier, stateObj)` 반환값

성공: `{available:true, total, internetFee, routerFee, tvFee, settopFee, bundleDiscount, tvBundleDiscount, tvInfo, settopInfo, extraTvFee, extraTvDetails}`
실패(해당 속도 상품 없음): `{available:false}`

### 7-5. 결합할인 옵션 (`compute*Options`의 반환 원소)

`{key, name, avail, availText, internetDiscount, lineShares[], total, desc, ...}`
현재 옵션: KT(총액 결합 / 정액 결합 / 프리미엄 가족결합 / 프리미엄 싱글결합), LG(참쉬운가족결합 / 투게더결합), SK(요즘가족결합). 최종상품에서는 **가능한(`avail`) 옵션 중 `total`이 가장 큰 것**을 선택합니다(`computeFinalCombo`).

---

## 8. Supabase (코드 기준 추정)

접속 정보는 `Supabaseservice.js` 상단(URL + anon 공개 키)에 있습니다. **anon 키는 공개용이므로 데이터 보호는 테이블 RLS 정책이 담당**합니다.

| 대상 | 읽기/쓰기 | 코드에서 쓰는 컬럼 |
|---|---|---|
| `internet_plans` | 읽기 | carrier, speed, monthly_fee, router_fee |
| `tv_plans` | 읽기 | carrier, plan_name, monthly_fee, channel_count |
| `settop_boxes` | 읽기 | carrier, model_name, monthly_fee |
| `carrier_promotions` | 읽기 | carrier, speed, tv_tier(`none`/`all`), gift_card, cash_amount, max_promo_limit |
| RPC `get_admin_commissions` | 읽기(**로그인 시에만 호출**) | carrier, speed, tv_tier(`none`/`low`/`basic`/`premium`), commission_amount, start_at |
| `usim_plans` | 읽기 | is_active, monthly_fee, carrier, plan_name, contract_discount_fee, data_allowance, voice_allowance, sms_allowance, tethering_allowance, membership_benefit, target_age |
| `customers` | 읽기/쓰기 | customer_id, name, contact, telecom, old_isp, old_tv_count, desired_product, guided_carrier, guided_internet_speed, guided_router, guided_tv_channel, guided_settop, guided_home_fee, guided_home_gift, guided_home_commission, usim_telecom, usim_plan, usim_fee, usim_gift, usim_commission, notes, funnel_status, next_contact_at, customer_tags, proposal_snapshot, updated_at |
| `customer_products` | 읽기/쓰기 | id, customer_id, product_type(`home`/`usim`), is_final, carrier, product_name, monthly_fee, gift_amount, commission, detail(JSON) |
| `customer_contacts` | 읽기/쓰기 | id, customer_id, attempt_no(1~3), scheduled_at(예정), contacted_at(실제·비어 있으면 예약 상태), method, result(`부재`/`연결`), content, created_by. `customer_contacts.sql`로 생성 |
| `customer_status_logs` | 읽기/쓰기(insert만) | id, customer_id, from_status(신규는 null), to_status, changed_by(로그인 이메일, 없으면 null), changed_at(기본값 `now()` 필요). `customer_status_logs.sql`로 생성. **RLS를 켰다면 INSERT·SELECT 정책이 모두 있어야 합니다** |

**스키마 점검 방식:** `probeCustomerSchema()`가 `proposal_snapshot`, `customer_products`, `customer_tags`, `customer_contacts`, `customer_status_logs`가 있는지 조회해 보고(`CUSTOMER_SCHEMA`), 없으면 해당 저장을 건너뜁니다. 컬럼을 새로 만들지 않고도 앱이 동작하는 이유입니다.

**정확한 컬럼 타입과 제약은 코드에 없습니다.** 정확한 스키마는 Supabase 테이블 정의를 별도로 확인하세요.

---

## 9. 업무 규칙 (코드에서 확인)

**사은품**
- 추천상품 기본 사은품은 `carrier_promotions`의 한도(`maxLimit`)입니다. 해당 통신사·속도 행이 없으면 **코드 안의 기본값**을 씁니다.
- 현금 = 사은품 합계 − 상품권. 상담원이 사은품을 직접 고칠 수 있습니다(`customGiftValues`).
- **적정사은품 산식**: 수수료 총액 × (기본 비율 + 속도 가산 + TV 등급 가산)%, 만 원 단위 내림. 비율은 `config.js`의 `PROPER_GIFT_*`, 계산은 `computeProperGiftAmount()`입니다.
- **유심 사은품 기본값** = 유심 수수료 − 15만 원(최소 0). 로그인했을 때만 자동 계산되고, 이후 상담원이 수정할 수 있습니다(`customUsimGiftValues`).

**수수료 노출**
- 인터넷·TV 수수료: 로그인 시에만 RPC로 가져옵니다. 같은 조합의 행이 여러 개면 **`start_at`이 이미 지난 행 중 가장 최근 것**을 씁니다(`pickLatestRow`).
- 유심 수수료: `Calculator.js`의 `USIM_COMMISSION_BANDS`(월요금 구간표) 기준입니다. 화면 노출은 로그인 시에만 하지만 **구간표 자체는 소스에 들어 있어 비로그인 사용자도 볼 수 있습니다.**
- 고객에게 보이는 곳(사은품, 요금, 데이터 제공량)과 관리자에게만 보이는 곳(수수료, 마진)을 섞지 마세요.

**요금 계산 (`computePrice`)**
- 인터넷 + 공유기 + TV + 셋톱 − 결합할인 − TV결합할인. 통신사·속도별 예외(공유기 무료 조건 등)는 코드에 직접 들어 있습니다.
- 서브 TV(2대째부터): 채널 요금 50% + 셋톱 요금 전액. TV결합할인은 메인 TV에만 적용합니다.

**추천상품 카드**
- 통신사 4개(KT/LG/SKB/SKT)를 항상 4분할로 표시합니다. 고객의 **기존 인터넷과 같은 통신사**는 숨기지 않고 회색 + "가입불가"로 표시합니다.
- 빠른선택 프리셋 3개: 요금절약(100M+TV저가형) / 가성비(500M+TV기본형) / 최고사은품(1기가+TV고급형).

**결합할인**
- 최종상품의 홈상품 통신사와 **같은 그룹의 유심**만 계산 대상입니다(`MOBILE_GROUP_MAP`: KT→KT, LG→LG, SKB·SKT→SK).
- 가족 회선(`familyLines`)은 현재 참고 정보이며 결합할인 계산에는 반영되지 않습니다.

**고객부재 재안내(컨택) 규칙** (인생비서 3-5 규칙, 값은 `config.js`의 `CONTACT_RULES`)
- 총 3회(최초 1회 + 재안내 2회), **직전 실제 컨택 시각 + 3시간** 뒤 재안내. 근무시간 09:00~18:00(18:00 정각까지 당일), 넘으면 다음 영업일 10:00부터 이어감.
- 근무시간 외(18시 이후·주말·공휴일) 인입은 다음 영업일 10:00를 1회차로 함. 영업일 판정은 주말 + `KOREAN_HOLIDAYS`(**매년 갱신 필요**, 현재 2026~2027).
- 계산은 `Calculator.js`의 `computeFirstContactTime` / `computeNextContactTime`(순수 함수)이 하고, 컨택 기록 저장·회차 갱신은 CS.html의 `saveContactAttempt` → `applyContactCycle`이 합니다. `applyContactCycle`은 여러 번 실행해도 결과가 같습니다.
- 결과 `부재` → 다음 회차 자동 예약(+ `customers.next_contact_at`에 반영, 목록의 상담예약일시). 결과 `연결` → 예약만 된 회차 삭제, `고객부재` 상태면 `상담대기`로 복귀(`CONTACT_CONNECTED_STATUS`). 3회 모두 `부재` → 확인 후 `고객부재_종결`.
- 상태값이 `고객부재`가 되는 순간(상담저장 / 상세 수정저장 / 목록 상태변경) 컨택 이력이 **없으면** `autoStartContactCycle`이 1차를 자동 반영합니다(근무시간 안: 지금을 1차 부재로 기록 + 2차 예약, 밖: 다음 영업일 10:00를 1차 예약).
- 회차는 상태값을 늘리지 않고 `customer_contacts`로 관리하며, 목록에는 `1/3` 배지로 표시합니다. "자동"은 기록 시점에 계산·저장한다는 뜻이며 시간이 지나면 저절로 알림이 뜨거나 종결되지는 않습니다(대시보드의 오늘 예정·지연 건수로 확인).

**상태값 변경 이력**
- 상태값이 바뀌는 모든 지점(목록 빠른 변경, 상세 저장 `updateCustomer`, 상담 저장 `saveConsultation`, 상담예약 `submitReservation`, 컨택 자동 전환·자동 종결 `setCustomerPatch`)에서 `logStatusChange(customerId, 이전값, 새값)`이 한 줄씩 기록합니다. 값이 같으면 기록하지 않습니다.
- 상세 화면의 '상태값 변경 이력'(`renderStatusLogSection`)이 최근 50건을 최신순으로 보여줍니다.
- **기록 실패는 화면에 알리지 않고 콘솔 경고(`상태값 변경 로그 저장 실패`)만 남깁니다.** 이력이 안 쌓이면 콘솔의 메시지를 먼저 보세요. `row-level security policy` 오류(403)라면 `customer_status_logs`에 INSERT 정책이 없는 것입니다.

**특이사항 누적**
- 별도 칼럼 없이 `customers.notes` 한 칼럼에 `[YY-MM-DD HH:mm] 내용` 줄을 최신순(맨 위)으로 쌓습니다(`prependNoteLine`). 컨택을 처음 기록할 때도 한 줄이 자동으로 쌓입니다. 예전에 날짜 없이 적은 내용은 아래에 그대로 남습니다.

**고객조회 목록**
- 상품(인터넷/TV)·요금·사은품·수수료는 `customer_products`의 `home` 행을 **모두** 줄 단위로 표시합니다(`customerHomeLines`). 해당 고객 행이 하나도 없을 때만 `customers.guided_*` 단일 값을 대신 보여줍니다. **수수료 컬럼은 로그인했을 때만** 보입니다(`refreshCustomerListView`, `hide-comm`).

**엑셀(CSV) 다운로드 (`exportCustomerListCsv`)**
- 고객조회의 [📥 엑셀 다운로드]는 **현재 화면에 조회된 목록(`customerListCache`)** 을 화면과 같은 정렬 순서로 내려받습니다. 라이브러리 없이 CSV(UTF-8 BOM)로 만들며 엑셀에서 바로 열립니다.
- 안내상품이 여러 건이면 **상품 1건당 1행**으로 나누고 고객 정보는 각 행에 반복합니다. 금액은 쉼표 없는 숫자입니다.
- **수수료 열은 로그인했을 때만 포함**합니다. 파일에는 고객 연락처가 그대로 들어가므로, 내려받기 권한을 제한하려면 이 함수 앞에 `isLoggedIn` 조건을 거세요.

**실적조회 (`loadPerformance` / `renderPerformance`)**
- 기간 필터는 `customers.created_at`(최초저장일) 기준이고, 비우면 전체 기간입니다. Supabase의 1회 최대 1,000행 제한 때문에 `range()`로 나눠서 전부 가져옵니다.
- **유치율 = 유치 건수 ÷ 전체 건수.** 유치 상태값 범위는 `config.js`의 `PERFORMANCE_WON_STATUSES`(기본: 설치·사은품 지급·환수 단계 = 접수완료 이후 전부)입니다. 퍼널 표에는 모든 상태값의 건수와 전체 대비 %가 단계별로 접었다 펼 수 있게 나옵니다. 어떤 단계에도 없는 상태값(예: 신규접수)은 '기타(분류 외)'로 묶입니다.
- **접수완료 리스트**는 `PERFORMANCE_LIST_STATUS`(기본 '접수완료') 고객의 `customer_products`를 상품 1건당 1행으로 보여줍니다. 최종상품(`is_final`)이 있으면 그것만, 없으면 안내상품 전체입니다.
- **마진 = 수수료 − 사은품 합계, 마진율 = 마진 ÷ 수수료.** 수수료·마진·마진율 열은 로그인했을 때만 보이며, 로그인·로그아웃 시 `refreshPerformanceView()`가 다시 그립니다.
- 수수료(`customer_products.commission`)는 **로그인 상태에서 저장된 상품에만** 값이 있습니다. 없는 상품은 '-'로 표시하고 마진 합계에서 제외합니다.
- 상품권/현금은 `customer_products.detail`의 `giftCard`, `cash`에서 읽습니다. **유심은 이 구분이 저장되지 않아** 사은품 합계만 표시됩니다.

**저장 (`saveConsultation`)**
- 연락처 필수(숫자 형식 검증). 같은 연락처의 고객이 있으면 확인 후 **업데이트**, 없으면 신규 insert.
- `customer_products`는 **해당 고객 행을 전부 지우고 다시 넣는** 방식입니다(부분 수정 아님).
- 상담 예약(`submitReservation`)은 `funnel_status`를 '상담예약'으로 하여 같은 방식으로 저장합니다.

---

## 10. config.js 내용

1. 통신사·요금 구간·라벨: `CARRIERS`, `BRAND_LABEL`, `CARRIER_LABEL`, `TV_BUNDLE_DISCOUNT`, `SPEED_LABEL`, `ROUTER_LABEL`, `FEE_RANGES`, `OLD_INTERNET_FEE_RANGES`, `HOME_CARRIER_OPTIONS`, `MOBILE_CARRIER_OPTIONS`, `ISP_HOME_CARRIER_MAP`, `MOBILE_GROUP_MAP`, `USIM_TIER_RANGE`, `USIM_TIER_LABEL`
2. 사은품 정책: `PROPER_GIFT_BASE_PERCENT`, `PROPER_GIFT_SPEED_BONUS`, `PROPER_GIFT_TV_BONUS`
3. 추천/제안 표시 옵션: `RECO_USIM_COLUMNS`, `USIM_VISIBLE_COUNT`, `EXTRA_TV_TIER_OPTIONS`, `EXTRA_TV_SETTOP_OPTIONS`, `PROPOSAL_USIM_COLUMNS`
4. 고객 태그: `CUSTOMER_TAG_GROUPS`
5. 퍼널: `FUNNEL_STAGES`, `DEFAULT_FUNNEL_STATUS`, `RESERVATION_STATUS`, `PRE_STAGE_STATUSES`, `NAME_PREFIX`, `DASHBOARD_GROUPS`

6. 고객부재 재안내: `CONTACT_RULES`, `CONTACT_METHODS`, `CONTACT_RESULT_ABSENT`, `CONTACT_RESULT_CONNECTED`, `CONTACT_CYCLE_STATUS`, `CONTACT_CLOSED_STATUS`, `CONTACT_CONNECTED_STATUS`, `KOREAN_HOLIDAYS`, `KOREAN_HOLIDAYS_LAST_YEAR`
7. 안내상품 표 열 폭: `GUIDED_HOME_COLS`, `GUIDED_USIM_COLS` (좌우 스크롤이 생기지 않도록 요금·사은품·수수료를 좁게 고정)
8. 실적조회: `PERFORMANCE_WON_STATUSES`(유치로 볼 상태값), `PERFORMANCE_LIST_STATUS`(리스트에 보여줄 상태값). `FUNNEL_STAGES` 뒤에 선언되어야 합니다.

`USIM_COMMISSION_BANDS`는 계산 로직과 밀접해 Calculator.js에 남겨 두었습니다.

---

## 11. CS.html 인라인 스크립트 지도 (약 3,350줄)

줄 번호는 근사치입니다. 함수명으로 검색하세요.

| 구간(약) | 내용 | 대표 함수 |
|---|---|---|
| 526~660 | 상태값, 공용 유틸, 탭 전환 | `showToast`, `setBtnLoading`, `switchTab`, `goCsStep`, `addLog` |
| 660~1050 | **추천상품**: 통신사 카드, 사은품 계산, 유심 추천 | `renderRecoCards`, `reflectRecoCardToProposal`, `fetchRecoUsimPlans`, `reflectRecoUsimPlan` |
| 1050~1280 | 서브 TV, 프리셋, 기존 인터넷·가족 회선, **제안상품** 유심 라인 | `renderExtraTvControls`, `applyRecoPreset`, `renderFamilyLines`, `syncToDesignPhones`, `renderAddedUsimLines` |
| 1280~1620 | 결합할인 아코디언, 상담요약 | `renderFamilyDiscountAccordion`, `buildConsultSummary`, `updateCsSummaryPanel` |
| 1620~1950 | 제안·최종상품 목록, 수수료 패널, 로그인 모달, 상담 예약 | `renderProposalLists`, `renderFinalProducts`, `renderCommissionPanels`, `openLoginModal`, `submitReservation`, `updateAuthUI` |
| 1950~2370 | 고객 태그, 퍼널, 상담 저장/초기화 | `renderTagChips`, `toggleCustomerTag`, `buildCustomerPayload`, `saveConsultation`, `resetConsultation` |
| 2370~2670 | **고객조회**: 대시보드, 검색, 목록, 정렬, **엑셀 다운로드** | `loadFunnelDashboard`, `searchCustomers`, `renderCustomerList`, `exportCustomerListCsv` |
| 2670~2930 | **실적조회**: 조회·집계, 단계별 접기/펼치기, 접수완료 리스트 | `loadPerformance`, `renderPerformance`, `togglePerfGroup`, `renderPerformanceList`, `refreshPerformanceView` |
| 2930~3790 | 고객조회 상세: 상품표, 특이사항 누적, **컨택 이력**, **상태값 변경 이력**, 수정/삭제 | `openCustomer`, `prependNoteLine`, `renderContactSection`, `saveContactAttempt`, `applyContactCycle`, `autoStartContactCycle`, `logStatusChange`, `renderStatusLogSection`, `updateCustomer`, `loadCustomerToConsult` |
| 3830~3880 | 초기화 | `init()` |

**앱 시작 순서 (`init`)**: 화면 컨트롤 준비 → 로그인 세션 확인(`isLoggedIn`) → `probeCustomerSchema()` → `loadData()` → `loadFinanceData()` → `renderRecoCards()`.

---

## 12. 무엇을 바꾸려면 어느 파일?

| 바꾸려는 것 | 파일 |
|---|---|
| 화면 디자인, 간격, 색 | `Styles.css` |
| 요금 구간 라벨, 퍼널 상태값, 태그 문구, 사은품 비율, 표시 옵션 | `config.js` |
| 결합할인·요금 계산 규칙, 유심 수수료 구간 | `Calculator.js` |
| DB 조회, 로그인, 프로모션·수수료 조회 | `Supabaseservice.js` |
| 고객 저장/조회 테이블·컬럼 | `CS.html` (`buildCustomerPayload`, `buildProductRows`, `updateCustomer`) |
| 실적조회의 유치 범위·리스트 대상 상태값 | `config.js` (`PERFORMANCE_WON_STATUSES`, `PERFORMANCE_LIST_STATUS`) |
| 실적조회 집계·마진 계산·열 구성, 엑셀 내보내기 열 | `CS.html` (`renderPerformance`, `renderPerformanceList`, `exportCustomerListCsv`) |
| 화면 구성(입력칸, 버튼), 상담 흐름 | `CS.html` |

---

## 13. 수정 시 주의사항

1. `onclick="함수명()"`에서 부르는 함수는 **전역**이어야 합니다. 함수를 다른 파일로 옮겨도 이름과 전역 노출은 유지하세요.
2. `const`/`let`은 파일 사이에서 공유되지만 **`window.변수`로는 접근되지 않습니다.** 점검 코드도 `typeof 변수명`으로 확인합니다.
3. 새 상수는 `config.js`, 값이 바뀌는 상태는 CS.html에 둡니다.
4. `reflectedProducts`와 `finalProducts`가 같은 객체를 공유한다는 점을 잊지 마세요(6번 참고).
5. 제안상품 객체에 필드를 추가하면 `proposal_snapshot`과 `customer_products.detail`에도 저장되므로, **불러오기(`loadCustomerToConsult`)와 조회 표(`buildMultiHomeTable` 등)에 영향**이 없는지 확인하세요.
6. 로그인 전용 정보를 화면에 추가할 때는 반드시 `isLoggedIn` 조건을 거세요.
7. DB에 컬럼을 추가하면 `probeCustomerSchema()`처럼 "있으면 저장, 없으면 건너뛰기" 방식을 따르면 안전합니다.

---

## 14. 배포 전 체크리스트

1. 함께 바뀐 파일을 **모두** 올렸는지 확인 (5개)
2. `?v=` 값을 올렸는지 확인
2-1. 컨택 이력을 쓰려면 Supabase에서 `customer_contacts.sql`을 먼저 실행 (실행 전에는 컨택 기능만 꺼진 상태로 동작)
2-2. 상태값 변경 이력을 쓰려면 `customer_status_logs.sql`을 실행하고, RLS를 켰다면 **INSERT·SELECT 정책**을 추가 (없으면 이력이 조용히 안 쌓임 → 콘솔 확인)
3. 새로고침 후 **빨간 "파일 로드 실패" 배너**가 없는지 확인
4. 추천상품 카드 → 제안상품 반영 → 최종상품 → 상담 저장 → 고객조회 순으로 한 번씩 클릭
5. 로그인 / 비로그인 각각에서 수수료 노출 여부 확인
6. 저장한 고객을 조회 탭에서 열고 [상담으로 불러오기]가 정상 복원되는지 확인
7. 상태값을 바꿔 저장한 뒤 상세의 '상태값 변경 이력'에 한 줄이 생기는지 확인
8. 고객조회에서 [📥 엑셀 다운로드], 실적조회 탭 조회(로그인 시 수수료·마진 열 노출)를 한 번씩 확인

---

## 15. 이후 분리 계획 (미진행)

| 단계 | 새 파일 | 대상 |
|---|---|---|
| 3 | `customer.js` | 퍼널 저장, 고객조회 (약 1,000줄, 상담 화면과 결합이 약함) |
| 4 | `reco.js` | 추천상품, 유심 추천, 프리셋 |
| 5 | `proposal.js` | 제안·최종상품, 결합할인, 상담요약 |
| 6 | `main.js` | 초기화, 탭, 모달·인증 UI |

한 단계씩 진행하고 매번 14번 체크리스트로 확인합니다. 새 파일을 추가하면 이 문서의 2~4번, 11번과 로드 점검 스크립트를 함께 갱신하세요.

---

## 16. 알아둘 점

- 과거에 Calculator.js 자리에 CSS 파일이 들어가 계산이 깨진 적이 있습니다. 로드 점검 스크립트가 이런 사고를 화면에서 알려줍니다.
- `loadFunnelDashboard`(고객조회 상단 대시보드)는 `limit(10000)`으로 한 번에 조회하는데, Supabase 기본 설정은 1회 1,000행에서 잘립니다. 고객이 1,000명을 넘으면 건수가 적게 나올 수 있어 실적조회처럼 `range()` 페이징으로 바꾸는 것을 검토하세요.
- 유심 수수료 구간표를 비공개로 하려면 인터넷·TV 수수료처럼 서버(RPC) 조회로 옮기는 방안을 검토하세요.

## 변경 이력

- 2026-09-28: 인라인 CSS를 `Styles.css`로 이동, 상수를 `config.js`로 분리, 로드 점검·버전 쿼리 추가 (로직 변경 없음)
- 2026-09-28: 데이터 흐름, 상태 변수·객체 형태, Supabase 컬럼, 업무 규칙, 화면 `id` 표 추가
- 2026-09-28: 고객조회 개선 — [상담예약 빠르게 등록] 버튼 삭제(모달·`submitReservation` 코드는 남겨 둠), 목록에 안내상품 여러 건 + 요금·사은품·수수료 컬럼, 안내상품 표 좌우 스크롤 제거, 특이사항 날짜별 누적, 고객부재 재안내 1~3차 컨택 이력(`customer_contacts`) + 자동 예약, 대시보드 오늘 컨택 예정·지연 칩. `?v=20260928b`
- 2026-09-29: 상태값 변경 이력(`customer_status_logs`) 기록이 RLS INSERT 정책 부재(403)로 실패하던 원인 확인 — 정책 추가로 해결. 문서에 이력 기능·테이블·점검 방법 반영
- 2026-09-30: 고객조회에 [📥 엑셀 다운로드](CSV) 추가. 상단 탭에 **실적조회** 추가(퍼널별 건수·전체 대비 비율·유치율, 접수완료 리스트의 사은품·수수료·마진·마진율), 퍼널 표 단계별 접기/펼치기. `config.js`에 실적조회 상수(8번), `Supabaseservice.js`의 로그인/로그아웃에 `refreshPerformanceView` 호출, `Styles.css`에 `.perf-*` 추가. `?v=20260930c`
