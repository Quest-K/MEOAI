# 인생비서 CS 툴 — 파일 구조 안내 (STRUCTURE.md)

고객상담 · 상품설계 · 가입진행 웹툴(`isbs/CS.html`)의 파일 구성과 수정 가이드입니다.
분리 작업(1~2단계) 기준이며, 줄 번호는 수정에 따라 달라지므로 **"약"** 으로만 봐주세요.

## 1. 파일 구성 (5개)

| 파일 | 줄 수 | 역할 | 넣는 것 / 넣지 않는 것 |
|---|---|---|---|
| `CS.html` | 약 3,000 | 화면 마크업 + 상담·고객관리 로직(인라인 스크립트) | 화면 상태값(`let`)과 렌더/이벤트 함수 |
| `Styles.css` | 약 1,670 | 전체 스타일 (기존 CSS + 인라인에서 이동한 CS 화면 CSS) | 스타일만 |
| `config.js` | 약 140 | **고정 상수** (라벨, 요금 구간, 사은품 비율, 퍼널 단계, 태그 등) | `const` 상수만. 상태값·함수 금지 |
| `Calculator.js` | 약 390 | 요금 계산, 결합할인(KT/LG/SK), 유심 수수료 구간 | 계산 함수 |
| `Supabaseservice.js` | 약 190 | Supabase 연결, 상품·수수료·프로모션 조회, 로그인/로그아웃 | DB·인증 함수 |

## 2. 로드 순서 (바꾸면 안 됨)

```
supabase-js (CDN)
  → Styles.css              (head)
  → config.js               상수 정의
  → Calculator.js           계산 함수
  → Supabaseservice.js      sb 클라이언트 + DB 함수
  → [로드 점검 스크립트]    빠진 파일이 있으면 화면 상단에 빨간 경고
  → CS.html 인라인 스크립트  상태값 + 화면 로직 + init()
```

- 모두 **일반 `<script>`** 입니다. `type="module"`을 쓰면 HTML의 `onclick="..."`(약 46곳)이 동작하지 않으므로 사용하지 않습니다.
- 파일명 뒤 `?v=20260928a` 는 캐시 방지용입니다. **파일을 수정해 배포할 때마다 값을 올리세요**(예: `20260929a`).

## 3. 파일 간 의존 관계

모든 파일이 전역 스코프를 공유하고, **호출 시점에** 서로를 참조합니다.

| 참조하는 쪽 | 참조 대상 | 정의된 곳 |
|---|---|---|
| Calculator.js | `FEE_RANGES`, `TV_BUNDLE_DISCOUNT` | config.js |
| Calculator.js | `DATA`, `state` | CS.html 인라인 |
| Supabaseservice.js | `CARRIERS` | config.js |
| Supabaseservice.js | `DATA`, `logs`, `isLoggedIn`, `recoState`, `recoUsimTier`, `COMMISSION_DATA`, `RAW_COMMISSION_DATA`, `PROMOTION_DATA` | CS.html 인라인 |
| Supabaseservice.js | `addLog`, `renderRecoCards`, `renderProposalLists`, `renderFinalProducts`, `updateAuthUI`, `closeLoginModal`, `fetchRecoUsimPlans` | CS.html 인라인 |
| CS.html 인라인 | 계산 함수(`computePrice`, `computeKTOptions` 등), DB 함수(`loadData`, `loadFinanceData`), `sb` | Calculator.js / Supabaseservice.js |

config.js 내부 선언 순서 의존: `RECO_USIM_COLUMNS`→`CARRIER_LABEL`, `PRE_STAGE_STATUSES`→`DEFAULT_FUNNEL_STATUS`, `DASHBOARD_GROUPS`→`FUNNEL_STAGES`·`PRE_STAGE_STATUSES`. **순서를 바꾸지 마세요.**

## 4. config.js 내용

1. 통신사·요금 구간·라벨: `CARRIERS`, `BRAND_LABEL`, `CARRIER_LABEL`, `TV_BUNDLE_DISCOUNT`, `SPEED_LABEL`, `ROUTER_LABEL`, `FEE_RANGES`, `OLD_INTERNET_FEE_RANGES`, `HOME_CARRIER_OPTIONS`, `MOBILE_CARRIER_OPTIONS`, `ISP_HOME_CARRIER_MAP`, `MOBILE_GROUP_MAP`, `USIM_TIER_RANGE`, `USIM_TIER_LABEL`
2. 사은품 정책: `PROPER_GIFT_BASE_PERCENT`, `PROPER_GIFT_SPEED_BONUS`, `PROPER_GIFT_TV_BONUS`
3. 추천/제안 표시 옵션: `RECO_USIM_COLUMNS`, `USIM_VISIBLE_COUNT`, `EXTRA_TV_TIER_OPTIONS`, `EXTRA_TV_SETTOP_OPTIONS`, `PROPOSAL_USIM_COLUMNS`
4. 고객 태그: `CUSTOMER_TAG_GROUPS`
5. 퍼널: `FUNNEL_STAGES`, `DEFAULT_FUNNEL_STATUS`, `RESERVATION_STATUS`, `PRE_STAGE_STATUSES`, `NAME_PREFIX`, `DASHBOARD_GROUPS`

> `USIM_COMMISSION_BANDS`(유심 수수료 구간)는 계산 로직과 밀접해 Calculator.js에 그대로 두었습니다.

## 5. CS.html 인라인 스크립트 지도 (약 2,500줄)

| 구간(약) | 내용 | 대표 함수 |
|---|---|---|
| 489~620 | 상태값, 공용 유틸, 탭 전환 | `showToast`, `setBtnLoading`, `switchTab`, `goCsStep`, `addLog` |
| 620~1010 | **추천상품**: 통신사 카드, 사은품 계산, 유심 추천 | `renderRecoCards`, `reflectRecoCardToProposal`, `fetchRecoUsimPlans`, `reflectRecoUsimPlan` |
| 1005~1180 | 서브 TV, 프리셋, 기존 인터넷·가족 회선 | `renderExtraTvControls`, `applyRecoPreset`, `toggleOldInternetSection`, `renderFamilyLines` |
| 1177~1370 | **제안상품**: 유심 라인 | `syncToDesignPhones`, `renderAddedUsimLines` |
| 1369~1580 | 결합할인 아코디언, 상담요약 | `renderFamilyDiscountAccordion`, `buildConsultSummary`, `updateCsSummaryPanel` |
| 1580~1800 | 제안·최종상품 목록, 수수료 패널 | `renderProposalLists`, `renderFinalProducts`, `renderCommissionPanels` |
| 1800~1930 | 로그인 모달, 상담 예약, 인증 UI | `openLoginModal`, `submitReservation`, `updateAuthUI` |
| 1930~2030 | 고객 태그 | `renderTagChips`, `toggleCustomerTag` |
| 2030~2280 | 퍼널, 상담 저장/초기화 | `buildCustomerPayload`, `saveConsultation`, `resetConsultation` |
| 2280~2970 | **고객조회**: 대시보드, 검색, 상세, 상품표, 수정/삭제 | `loadFunnelDashboard`, `searchCustomers`, `openCustomer`, `updateCustomer`, `loadCustomerToConsult` |
| 2970~3010 | 초기화 | `init()` |

## 6. 무엇을 바꾸려면 어느 파일?

| 바꾸려는 것 | 파일 |
|---|---|
| 화면 디자인, 간격, 색 | `Styles.css` |
| 요금 구간 라벨, 퍼널 상태값, 태그 문구, 사은품 비율 | `config.js` |
| 결합할인·요금 계산 규칙, 유심 수수료 구간 | `Calculator.js` |
| DB 조회, 로그인, 테이블/컬럼 변경 | `Supabaseservice.js` (고객 테이블 관련은 `CS.html`) |
| 화면 구성(입력칸, 버튼), 상담 흐름 | `CS.html` |

## 7. 사용하는 Supabase 대상

`internet_plans`, `tv_plans`, `settop_boxes`, `carrier_promotions`, `usim_plans`, `customers`, `customer_products`, RPC `get_admin_commissions`(로그인 시에만 수수료 조회).

## 8. 배포 전 체크리스트

1. 수정한 파일만이 아니라 **함께 바뀐 파일을 모두** 올렸는지 확인 (파일 5개)
2. `?v=` 값을 올렸는지 확인
3. 브라우저 새로고침 후 화면 상단에 **빨간 "파일 로드 실패" 배너가 없는지** 확인
4. 추천상품 카드 표시 → 제안상품 반영 → 최종상품 → 상담 저장 → 고객조회 순으로 한 번씩 클릭
5. 로그인/비로그인 각각에서 수수료 노출 여부 확인

## 9. 이후 분리 계획 (미진행)

| 단계 | 새 파일 | 대상 |
|---|---|---|
| 3 | `customer.js` | 퍼널 저장, 고객조회 (약 1,000줄, 상담 화면과 결합이 약함) |
| 4 | `reco.js` | 추천상품, 유심 추천, 프리셋 |
| 5 | `proposal.js` | 제안·최종상품, 결합할인, 상담요약 |
| 6 | `main.js` | 초기화, 탭, 모달·인증 UI |

한 단계씩 진행하고, 매번 위 체크리스트로 확인한 뒤 다음으로 넘어갑니다. 새 파일을 추가하면 이 문서의 1~3번 표와 로드 순서를 함께 갱신하세요.

## 10. 알아둘 점

- Calculator.js가 CSS 내용으로 바뀌어 화면이 깨진 적이 있어, 로드 점검 스크립트가 파일 누락·뒤바뀜을 화면에 알려줍니다.
- `USIM_COMMISSION_BANDS`는 로그인과 무관하게 소스에서 볼 수 있으므로, 비공개가 필요하면 인터넷·TV 수수료처럼 서버(RPC) 조회로 바꾸는 것을 검토하세요.
- Supabase anon key는 공개용 키입니다. 데이터 보호는 테이블 RLS 정책이 담당하므로 정책 유지가 중요합니다.

## 변경 이력

- 2026-09-28: 인라인 CSS를 `Styles.css`로 이동, 상수를 `config.js`로 분리, 로드 점검·버전 쿼리 추가 (로직 변경 없음)
