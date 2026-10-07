# 인생비서 CS 툴 — 구조 안내서 (STRUCTURE.md)

고객상담 · 상품설계 · 가입진행 웹툴(`isbs/CS_new.html`)의 구조 문서입니다.
**다른 AI나 새 작업자가 코드를 열기 전에 전체 그림을 잡는 용도**이며, 코드 수정 시에는 이 문서와 해당 코드 파일을 함께 참고하세요.

- **기준일: 2026-10-07**, 기준 버전: `Styles.css?v=20261007c` / `config.js?v=20261006b` / `Calculator.js?v=20261006a` / `Supabaseservice.js?v=20261006c`
- 줄 번호는 근사치입니다. 실제 위치는 **함수명 검색**으로 찾으세요.
- 표시 규칙: 코드에서 직접 확인한 내용은 사실로, DB 컬럼처럼 코드로 추정한 내용은 **(코드 기준 추정)** 으로 표시했습니다.
- 수수료 금액·구간 등 민감한 숫자는 이 문서에 적지 않았습니다. 필요하면 해당 코드를 보세요.
- 이전 판(2026-09-30)은 고객 1명에 안내상품을 `customers` 한 행에 넣던 **구 구조** 기준이었습니다. 이번 판은 **고객 > 계약 > 상품** 새 구조, SKY(5번째 통신사), 대시보드·고객상세·필수안내 탭, 수수료 에이전시 비교를 반영했습니다.

---

## 0. 다른 AI에게 작업을 맡길 때

1. 이 문서 + **수정 대상 파일**(필요하면 5개 전부)을 함께 전달합니다.
2. 요청에 아래 제약을 적어 주세요.
   - "일반 `<script>` 방식 유지 (ES module 금지)"
   - "`onclick` 함수는 전역 유지"
   - "상태 변경은 `changeStatus()`만 거친다 (직접 `update` 금지)"
   - "로직 변경 없이 이동만" 등
3. 결과를 받으면 14번(배포 체크리스트)대로 확인하세요.
4. **반영은 GitHub 웹 화면에서** 합니다 (터미널·git 명령 사용 안 함).
   - 저장소 `Quest-K/MEOAI` → `isbs` 폴더 → 바꿀 파일 열기 → ✏️(편집) 또는 **Add file ▸ Upload files**로 덮어쓰기 → 하단 **Commit changes**
   - 배포 주소(GitHub Pages)는 반영 후 1~2분 뒤 새로고침으로 확인합니다.

---

## 1. 서비스 개요와 용어

통신사(KT/LG/SK/SKY) 가입 리퍼럴 상담 도구입니다. 상담원이 고객 정보를 입력하면 통신사별 요금·사은품·결합할인을 비교해 상품을 제안하고, 상담 내용을 Supabase에 **고객 > 계약 > 상품** 구조로 저장합니다. 가입 접수 이후 지급·환수까지 한 화면 흐름에서 관리합니다.

| 용어 | 뜻 |
|---|---|
| 홈상품 (`home`) | 인터넷 + TV 묶음 상품 |
| 유심 (`usim`) | 휴대폰 유심 가입 상품 |
| 동판 | 홈상품과 유심을 함께 가입하는 상품 |
| 추천상품 → 제안상품 → 최종상품 | 상담 단계. 후보를 좌측에서 우측으로 골라 나감 |
| **고객** (`customers`) | 연락처 1개 = 고객 1명. 연락처는 DB에 **숫자만** 저장, 화면에서만 하이픈 표시 |
| **계약** (`contracts`) | 상품 구성 단위. `home`(인터넷·TV) 계약 1건 + `usim` 계약(회선 1개당 1건). 계약마다 주소·납부방법·명의·설치일이 다를 수 있음. 번호 표기 `CT-0001`은 화면에서만 만듦 |
| **상품** (`contract_items`) | 계약 안의 인터넷 / TV / 유심 행. 진행 상태만 가짐. 번호 표기 `IT-3938`은 화면에서만 만듦 |
| **제안** (`contract_proposals`) | 상담 때 안내한 상품 스냅샷(안내용). 대표 계약 단위로 통째로 교체 저장 |
| 상담 스냅샷 (`contracts.consult_snapshot`) | 상담 화면을 그대로 복원하기 위한 JSON(제안·최종·가족회선). `snapshotVersion` 2가 새 방식 |
| 대표 계약 | `consult_snapshot`이 있는 가장 최근 `home` 계약. 상담 화면이 다시 저장할 때 이 계약을 재사용 |
| 접수 (`received_at`) | 계약이 처음 `접수완료`가 된 시각. 한 번 기록되면 지우지 않음 |
| 유치 | 접수 이력이 있는 고객(`is_acquired`). 이후 이탈·제외·계약취소가 돼도 유치로 셈 |
| 지급 / 환수 | 사은품 지급·환수는 **상품이 아니라 계약 단위**(`payout_status` / `clawback_status`) |
| 사은품 | 고객에게 주는 상품권 + 현금 (+ 경품고시제 초과분 `추가지급`) |
| 수수료(commission) | 대리점이 받는 판매 수수료. **로그인(관리자)했을 때만** 보임 |
| 수수료 에이전시 | 수수료를 주는 곳이 2곳 이상. 화면은 합계가 가장 큰 곳의 금액과 에이전시 표식을 보여 줌 |
| SKB / SKT | SK브로드밴드(인터넷·TV) / SK텔레콤. 유심 쪽에서는 둘 다 "SK"로 묶임 |
| SKY | 스카이라이프(5번째 통신사). 휴대폰 결합할인은 **계산하지 않음(0원)** |
| LG 홈 / 소호 | 요금제는 같고 **수수료만 다름**. 화면 키 `lg` + 구분 `soho`(수수료 행은 DB `LGbiz`) |

---

## 2. 상태 모델 (3계층) — 가장 중요

상태값 정의는 전부 `config.js` **9~11장**에 있습니다. DB에는 CHECK 제약이 없고(사유 등은 자유 문자열) **허용 목록은 config가 기준**입니다.

### 2-1. 고객 상태 (`customers.customer_status`)

| DB 값 | 화면 표시 | 비고 |
|---|---|---|
| 상담대기 | 상담대기 | 신규 기본값 |
| 상담중 | 상담중 | 부가표시 `consult_substatus` = 상품안내 / 상담예약 / 고객부재 (상담중일 때만) |
| 상담완료 | **유치** | 접수대기·접수보류·접수완료 계약이 1건이라도 있는 고객 (**자동 계산**) |
| 이탈 | 이탈 | 사유 `status_reason` = 기존유지 / 타사가입 / 고객부재 (필수) |
| 제외 | 제외 | 사유 = 오인입 / 타부서 / 없는번호 / 테스트 (필수) |

### 2-2. 계약 상태 (`contracts.contract_status`)

작성중 → 접수대기 → 접수보류 / 접수불가 / 접수완료. **계약취소는 저장하지 않고** `v_contract_overview.effective_status`로 계산합니다.

| DB 값 | 화면 묶음 (`CONTRACT_DISPLAY_GROUP`) |
|---|---|
| 작성중, 접수대기 | 계약진행 |
| 접수보류 | 보류확인 |
| 접수불가 | 접수불가 |
| 접수완료 | 접수완료 |

### 2-3. 상품·지급·환수

| 축 | 위치 | 값 |
|---|---|---|
| 상품 진행 | `contract_items.progress_status` | 설치대기 / 설치완료 / 접수취소 (상품이 **전부** 설치완료면 화면에서 `개통완료`로 계산 표시) |
| 지급 | `contracts.payout_status` | 지급요청 / 지급보류 / 지급완료 (없으면 미설정) |
| 환수 | `contracts.clawback_status` | 환수요청 / 환수보류 / 환수진행 / 환수완료 |

### 2-4. 상태 변경 규칙 — `changeStatus()` 하나만

- 고객·계약·상품의 상태는 **전부 `changeStatus({target, id, axis, to, reason, substatus, extra})`만** 거쳐 바꿉니다. 직접 `update`로 상태를 바꾸지 마세요.
- 순서: 현재값 읽기 → **이력(`status_history`) 먼저 저장** → 값 갱신(읽은 값과 같을 때만) → 실패하면 방금 저장한 이력 삭제. 이력 저장이 실패하면 상태를 바꾸지 않습니다.
- `received_at`은 **처음 `접수완료`가 될 때만** 기록하고 이후 되돌려도 지우지 않습니다.
- 계약 상태가 바뀌면 고객 상태를 자동으로 맞춥니다 (`deriveCustomerStatus`): 접수대기·접수보류·접수완료 계약(또는 접수 이력)이 있으면 상담완료, 없는데 상담완료면 상담중으로 되돌림. **이탈·제외는 자동으로 바꾸지 않음.**
- 결과 형태: `{ ok, changed, from, to, historyId, auto, autoError, userMessage, error }`. 모든 데이터 함수는 예외를 던지지 않고 `{ok, error}`로 돌려줍니다.

### 2-5. 삭제 규칙

- **작성중이고 `received_at`이 없는 계약·상품만** 삭제 가능합니다(DB 트리거도 같은 규칙). 접수 이후 상품은 `접수취소`로 바꿉니다.
- 고객 삭제는 접수 이후 계약이 있으면 막힙니다 (`checkCustomerDeletable`). 삭제 시 계약·상품·제안·이력을 함께 정리합니다 (`deleteCustomerNewData`).
- 계약·상품 삭제 전, 그 이력은 **공통 이력(`contract_id` null)** 으로 바꿔 남깁니다 (`s6DetachHistory`).

### 2-6. 구 퍼널(22개 상태값)과의 관계

`config.js` 5장(`FUNNEL_STAGES` 등)과 `customers.funnel_status`는 **구 구조 흔적**입니다.
- `FUNNEL_TO_NEW_STRUCTURE` 변환표가 구 값을 새 상태로 바꿉니다 (개통대기→접수완료 등 `LEGACY_STATUS_MAP` 포함).
- 새 고객을 만들 때만 `funnel_status`에 기본값을 함께 넣습니다 (구 화면·DB 제약 대비).
- `customer_status`가 비어 있는 고객은 `custStatusInfo()`가 `funnel_status`를 변환해서 표시용으로만 씁니다.
- `config.js` 주석상 **S11(정리 단계)에서 삭제 예정**입니다. 새 코드는 5장 상수를 쓰지 말고 9~11장을 쓰세요.

---

## 3. 파일 구성 (5개)

| 파일 | 줄 수(약) | 역할 | 넣는 것 / 넣지 않는 것 |
|---|---|---|---|
| `CS_new.html` | 5,580 | 화면 마크업(약 670줄) + 인라인 스크립트(약 4,870줄: 상담·고객·대시보드·실적·필수안내 로직) | 화면 상태값(`let`)과 렌더/이벤트 함수 |
| `Styles.css` | 2,070 | 전체 스타일 (인라인에서 이동한 CS 화면·에이전시·고객상세 CSS 포함) | 스타일만. **HTML 안에 `<style>`을 새로 만들지 않음** |
| `config.js` | 310 | **고정 상수** 11개 장(통신사·요금 구간·사은품 비율·구 퍼널·태그·재안내 규칙·공휴일·**새 상태 사전**·실적 기준) | `const` 상수만. 상태값·함수 금지 |
| `Calculator.js` | 460 | 요금 계산, 통신사별 결합할인(KT/LG/SK/SKY), 유심 수수료 구간표, 고객부재 재안내 일정 계산 | 계산 함수 |
| `Supabaseservice.js` | 1,740 | Supabase 연결, 상품·수수료·프로모션 조회, 로그인/로그아웃, **새 구조 데이터 접근(S2~S8)** | DB·인증 함수 |

보조 SQL(저장소/작업 폴더, **코드가 아니라 DB에서 실행**하는 파일): `01_structure.sql`(새 테이블·뷰), `02_migration.sql`(구→신 이전), `03a_cutover_prepare.sql` / `03b_cutover_finalize.sql`(컷오버), `customer_contacts.sql`, `customer_status_logs.sql`, `inflow_route.sql`, `funnel_status_migration.sql`, `rls_hardening.sql`. (파일 존재 여부는 저장소에서 확인하세요.)

> 구 `CS.html`이 같은 저장소에 병행돼 있다면 같은 `config.js`·`Calculator.js`·`Supabaseservice.js`를 공유합니다. 이 파일들을 고칠 때는 **구 화면에 영향이 없는지**도 확인하세요 (예: 통신사 열 수는 새 화면만 5열).

---

## 4. 로드 순서 (바꾸면 안 됨)

```
supabase-js (CDN)
  → Styles.css?v=...           (head)
  → config.js?v=...            상수 정의
  → Calculator.js?v=...        계산 함수
  → Supabaseservice.js?v=...   sb 클라이언트 + DB 함수
  → [짧은 인라인 스크립트]      HOME_CARRIERS 정의 + 로드 점검(빠진/뒤바뀐 파일이면 상단 빨간 경고)
  → [메인 인라인 스크립트]      상태값 + 화면 로직 + 시작 코드(IIFE)
  → (본문 끝) 고객정보 편집 패널(#cs-edit-drawer) 마크업
```

- 모두 **일반 `<script>`** 입니다. `type="module"`을 쓰면 HTML의 `onclick="..."`이 함수를 찾지 못해 동작하지 않습니다.
- `?v=`는 캐시 방지용입니다. **파일을 고쳐 배포할 때마다 해당 파일의 값을 올리세요.** (HTML 안의 `<link>`/`<script>` 줄에 있으므로 HTML도 함께 올려야 반영됩니다.)
- 로드 점검은 `supabase`, `CARRIERS`(config.js), `computePrice`(Calculator.js), `loadData`(Supabaseservice.js) 4가지를 확인합니다. **새 파일을 추가하면 이 점검에도 항목을 추가하세요.**

---

## 5. 파일 간 의존 관계

모든 파일이 전역 스코프를 공유하고, 함수는 **호출 시점에** 서로를 참조합니다.

| 참조하는 쪽 | 참조 대상 | 정의된 곳 |
|---|---|---|
| Calculator.js | `FEE_RANGES`, `TV_BUNDLE_DISCOUNT`, `CONTACT_RULES`, `KOREAN_HOLIDAYS` 등 | config.js |
| Calculator.js | `DATA`, `state` | CS_new.html 인라인 |
| Supabaseservice.js | `CARRIERS`, 상태 사전(9~11장), `STATUS_REASONS` 등 | config.js |
| Supabaseservice.js | `getUsimCommission` 등 | Calculator.js |
| Supabaseservice.js | `DATA`, `logs`, `isLoggedIn`, `recoState`, `recoUsimTier`, `COMMISSION_DATA`, `RAW_COMMISSION_DATA`, `PROMOTION_DATA` | CS_new.html 인라인 |
| Supabaseservice.js | `addLog`, `renderRecoCards`, `renderProposalLists`, `renderFinalProducts`, `updateAuthUI`, `closeLoginModal`, `fetchRecoUsimPlans`, `refreshCustomerListView`, `refreshPerformanceView` (뒤 두 개는 `typeof` 확인 후 호출) | CS_new.html 인라인 |
| CS_new.html 인라인 | `computePrice`, `computeKTOptions`, `computeLGOptions`, `computeSKOptions`, `computeSkyOptions`, `getUsimCommission`, 재안내 일정 함수 | Calculator.js |
| CS_new.html 인라인 | `sb`, `loadData`, `loadFinanceData`, `lookupCommission`, `changeStatus`, `loadCustomerBundle`, `loadCustomerOverviewList`, `loadContractOverviewList`, `loadPerformanceData`, `saveConsultSet`, `loadConsultForScreen`, `create/save/delete Contract·Item` 계열, `handleLogin`, `handleLogout` | Supabaseservice.js |

**config.js 내부 선언 순서 의존** (바꾸지 마세요): `RECO_USIM_COLUMNS`→`CARRIER_LABEL`, `PRE_STAGE_STATUSES`→`DEFAULT_FUNNEL_STATUS`, `DASHBOARD_GROUPS`→`FUNNEL_STAGES`·`PRE_STAGE_STATUSES`, `PERFORMANCE_WON_STATUSES`→`FUNNEL_STAGES`, `CONTACT_CYCLE_NEW`→`CONTACT_CYCLE_STATUS`, `FUNNEL_TO_NEW_STRUCTURE`→`LEGACY_STATUS_MAP`.

---

## 6. 화면 구조

상단 탭 6개(`switchTab`): **대시보드 / 실적조회 / 고객조회 / 고객상담(기본) / 고객상세 / 필수안내**. 상담 탭 안에는 4단계 마법사(`goCsStep`)가 있습니다.

| 영역 | 주요 `id` | 설명 |
|---|---|---|
| 상단 고정 바 | `auth-box`, `top-quick-contact`, `cust-tab-bar` | 관리자 로그인, **이름·연락처 한 칸 빠른조회**(`quickTopSearch`: 숫자·하이픈만이면 연락처, 글자가 있으면 이름 부분일치), **고객 탭 최대 5명**(`custTab*`, 브라우저 저장 키 `cs_cust_tabs_v1`) |
| **탭 대시보드** `view-dashboard` | `funnel-dashboard`, `dash-list-card` | 고객 현황(명)·계약 현황(건) 카드 → 항목 선택 시 리스트. 오늘 컨택 예정·지연 칩, 미지급·환수 플래그 칩 |
| **탭 고객상담** `view-cs` | `status-banner`, `cs-banner-logs`, `cs-wiz-nav`, `cs-cust-strip` | 데이터 로드 로그, 단계 이동, 상단 고객 요약줄 |
| 1단계 고객정보 `cs-wiz-panel-1` | `cust-name`, `cust-contact`, `cust-inflow`, `cust-mobile-carrier`, `cust-mobile-fee`, `cust-dup-hint`, `old-internet-toggle`, `family-line-toggle`, `family-lines-list`, `customer-tags-body`, `cust-funnel-status`, `cust-next-contact`, `cust-notes` | 기본정보, 기존 인터넷, 가족 회선(연락처·관계·금액대), 태그, 상태·관리정보. 연락처 입력 직후 기존 고객이면 안내(`checkDuplicateContact`) |
| 2단계 추천상품 `cs-wiz-panel-2` | `reco-seg-*`, `reco-extra-tv-list`, `reco-carrier-cards`, `reco-usim-tier-buttons`, `reco-usim-cards`, `reco-preset-*` | 속도·공유기·TV채널·셋탑·**서브 TV**, 통신사 **3분할 카드**, 유심 추천 |
| 3단계 제안상품 `cs-wiz-panel-3` | `proposal-home-list`, `proposal-usim-list`, `final-combo-discount` | 반영된 상품, 결합할인 아코디언 |
| 4단계 최종상품 `cs-wiz-panel-4` | `final-products-home`, `final-products-usim`, `commission-home-panel`, `commission-usim-panel`, `consult-save-state`, `cs-live-customer-info`, `cs-live-products-info` | 최종 확정, 수수료(로그인 시), 저장, 상담요약 |
| 고객정보 편집 패널 | `cs-edit-drawer` | 상담 화면에서 오른쪽에 펼쳐 **고객 기본정보만** 저장(`saveCustomerOnlyFromConsult`). 상품·계약은 [상담저장] |
| **탭 고객조회** `view-customers` | `cust-search-contact`, `cust-search-name`, `cust-search-status`, `cust-list-table`, `cust-list` | 연락처·이름·상태 검색, 목록(정렬·계약 집계·상태 칩), **[📥 엑셀 다운로드]**(CSV) |
| **탭 고객상세** `view-customer-detail` | `cust-detail` | 고객 요약, 가족, **계약 카드**(접수·지급·환수 상태 + 상품별 설치 진행), 컨택 이력 1~3차, 특이사항 누적, **변경 이력**(계약별 / 공통 필터) |
| **탭 실적조회** `view-performance` | `perf-from`, `perf-to`, `perf-summary`, `perf-funnel`, `perf-contracts`, `perf-list-title`, `perf-list` | 기간 필터, 요약, 고객 상태별 건수, 계약 기준 집계, 접수 리스트 |
| **탭 필수안내** `view-notice` | `ntc-agree-all`, `ntc-signature-pad` | 필수 안내 4~5개 항목 동의 체크 + 전자 서명(캔버스). **현재는 확인 알림만 띄우고 서버에 저장하지 않음** |
| 모달 | `login-modal`, `reservation-modal`, `toast-container` | 로그인, 상담 예약, 토스트 알림 |

### 추천상품 카드 구성 (3분할)

- `RECO_GROUPS`: **[KT·SKY] / [LG] / [SKB·SKT]** 3개 열. 한 열에 통신사 1개를 보여 주고, 카드 제목 오른쪽 버튼으로 전환합니다 (LG는 [홈]/[소호], SK 열은 제목을 "SK"로 고정).
- 고객의 기존 인터넷과 같은 통신사는 숨기지 않고 회색 + "가입불가"로 표시합니다.
- 빠른선택 프리셋 3개: 요금절약 / 가성비 / 최고사은품 (`applyRecoPreset`).
- 수수료는 에이전시별로 한 줄씩(높은 순) 보여 줍니다. 말풍선은 즉시 뜨는 커스텀 말풍선(`agBadgeHtml`).

---

## 7. 데이터 흐름

```
[앱 시작 — 메인 스크립트 끝의 IIFE]
  화면 컨트롤 준비 → 로그인 세션 확인(isLoggedIn) → probeCustomerSchema()
  → loadData() → DATA            (요금제·TV·셋탑)
  → loadFinanceData()            PROMOTION_DATA(사은품 한도), COMMISSION_DATA / RAW_COMMISSION_DATA(로그인 시에만)
  → renderRecoCards()

[1단계 고객정보 입력] ─(input/change)→ updateCsSummaryPanel(), renderRecoCards()

[2단계 추천상품]
  recoState + DATA → computePrice() → 통신사 카드(renderRecoCards)
      └ [상품반영] reflectRecoCardToProposal()  ──┐
  usim_plans 조회 → 유심 카드(fetchRecoUsimPlans)  │
      └ [반영] reflectRecoUsimPlan()  ────────────┤ → reflectedProducts[] (+ 유심은 addedUsimLines[]에도)
                                                  ▼
[3단계 제안상품] renderProposalLists(), 결합할인 renderFamilyDiscountAccordion()
      └ [최종으로] moveProposalToFinal() → finalProducts[]  (home은 1개, usim은 여러 개)

[4단계 최종상품] renderFinalProducts(), computeFinalCombo() → 최적 결합할인
      └ [저장] saveConsultation()  (아래 7-1)

[고객조회·대시보드] loadDashList → loadCustomerOverviewList / loadContractOverviewList
      └ openCustomerDetail → refreshDetailBundle → loadCustomerBundle(고객·계약·상품·제안·이력 한 번에)
      └ [상담으로 불러오기] loadCustomerToConsult() (아래 7-2)

[실적조회] switchTab('performance') → loadPerformance() → loadPerformanceData({from,to}) → computePerfStats → renderPerformance
```

핵심: **`reflectedProducts`(제안)와 `finalProducts`(최종)는 같은 객체를 공유**합니다(`moveProposalToFinal`은 복사가 아니라 같은 객체를 push). 한쪽에서 수정하면 다른 쪽에도 반영됩니다.

### 7-1. 상담 저장 (`saveConsultation`)

1. 연락처 필수(숫자 9~11자리). 같은 연락처 고객이 있으면 기존 고객으로 업데이트, 없으면 신규 insert. 고객을 불러오는 중이면 끝날 때까지 기다립니다(계약 중복 생성 방지).
2. **고객 기본정보** 저장 (`buildCustomerPayload`): 이름·연락처·휴대폰·기존 인터넷·태그·인입경로·특이사항 등. **안내상품(`guided_*`·`usim_*`)·상태값·`proposal_snapshot`은 더 이상 `customers`에 저장하지 않습니다.** 신규일 때만 `customer_status=상담대기`(+ 구 `funnel_status` 기본값)를 넣습니다.
3. **상태값**: 상태 선택칸을 바꾼 경우에만 `changeStatus`로 저장(이력 1건). 실패해도 4번은 계속합니다.
4. **고객부재 재안내**: 선택 상태가 `상담중 · 고객부재`이고 컨택 이력이 없으면 1차 컨택을 자동 반영(`autoStartContactCycle`).
5. **상담 세트 저장** `saveConsultSet`: 변환(`s7BuildConsultPlan`) → 계약(`s7SaveConsultContracts`) → 상품(`s7SaveContractItems`) → 제안(`s7ReplaceProposals`).
   - **계약·상품은 최종상품(`finalProducts`)에서만** 만듭니다. 제안상품은 안내용이라 제안 행으로만 남습니다.
   - 같은 계약·상품을 다시 찾는 키(`matchKey`): home 계약 `'home'`, 그 안의 상품 `'internet'`/`'tv'`, 유심 계약은 상담 화면 상품 ID(`detail.consultKey`).
   - 상품은 **ID를 유지하며 갱신**, 최종에서 뺀 상품은 작성중 계약이면 삭제. 제안은 새 행 저장 → 옛 행 삭제 순서로 통째 교체.
   - "고객 본인 회선(상담정보 연동)" 자동 유심 행은 판매 상품이 아니라 **계약으로 만들지 않고** 스냅샷 `customerInfo`에만 남깁니다.
   - 유심 계약은 인터넷·TV 최종상품이 있을 때만 대표 계약에 연결(`linked_contract_id`)합니다.
6. **수정 가능 범위**: `작성중·접수대기·접수보류` 이면서 `received_at`이 없는 계약만 상담 저장으로 바뀝니다(`S7_EDITABLE_STATUSES`). 접수완료·접수불가·접수 이력 있는 계약은 건너뜁니다.
7. **변경 메모**: 접수 단계(작성중이 아닌) 계약의 상품·사은품·수수료가 바뀌면 무엇이 어떻게 바뀌었는지 `status_history`에 `event_type='memo'`로 남깁니다. 작성중 계약은 남기지 않습니다. 저장 순서는 changeStatus와 같습니다(메모 먼저 → 값 저장 → 실패 시 메모 삭제).
8. 중간에 실패하면 그때까지 만든 `carrierContractId`·`usimByKey`를 돌려주고 화면이 기억합니다(`consultTargets`) → 다시 저장하면 이어서 저장합니다.
9. 테스트 모드(`?commMock=1`)에서는 저장이 막힙니다.

### 7-2. 상담 불러오기 (`loadCustomerToConsult`)

먼저 구 방식 값(`customers.proposal_snapshot`)으로 화면을 채우고(`fillConsultFormFromCustomer`), 새 구조(`contracts.consult_snapshot`)에서 읽은 값이 있으면 바로 덮어씁니다(`loadConsultFromContracts` → `loadConsultForScreen`).
- `snapshotVersion` 2인 스냅샷은 **계약·상품이 지워진 최종상품을 화면 값에서 뺍니다**(제안은 그대로).
- 대표 계약이 없으면 `{ok:true, found:false}` → 구 방식 값을 그대로 씁니다.

---

## 8. 전역 상태와 주요 데이터 형태

### 8-1. 상태 변수 (CS_new.html 인라인)

| 변수 | 용도 | 비고 |
|---|---|---|
| `DATA` | DB에서 읽은 상품 정보 | 8-2 |
| `recoState` | 추천상품 화면의 현재 선택값 | `{speed:'500', tv:'basic', settopTier:'basic', router:'Y', extraTVs:[{tv, settopTier}]}` — speed는 문자열 |
| `state` | 예전 상품설계 화면용 선택값 | `computePrice`의 기본 인자 |
| `recoGroupSel`, `LG_VARIANT` | 3분할 열별 선택 통신사 / LG 홈·소호 | `RECO_GROUPS` |
| `reflectedProducts` / `finalProducts` | 제안 / 최종상품 목록 | **같은 객체 참조** |
| `addedUsimLines` | 유심 회선 목록(결합할인 입력) | `{id, carrier, planName, fee, teen, gift, synced?}` — `synced`는 고객정보의 휴대폰에서 자동 생성된 줄 |
| `familyLines` | 가족 회선(참고 정보) | `{id, type:'internet'\|'mobile', carrier, feeLabel \| feeValue, contact, relation}` — 결합할인 계산에는 미사용, 요약·스냅샷 저장용 |
| `PROMOTION_DATA` | 통신사별 사은품 한도 | `{[carrier]: {giftCard, cash, maxLimit}}` (DB 행이 없으면 코드 기본값) |
| `COMMISSION_DATA` | 통신사별 수수료 (현재 속도/TV 기준) | `{[carrier]: {internetComm, tvComm, totalComm, startAt}}` — 비로그인 시 빈 값 |
| `RAW_COMMISSION_DATA` | 수수료 원본 행 | `lookupCommission()`이 사용 |
| `customGiftValues` / `customUsimGiftValues` | 상담원이 직접 고친 사은품 | 홈 `{[carrier]}` / 유심 `{'NET\|요금제명'}` |
| `isLoggedIn` | 관리자 로그인 여부 | 수수료·마진 노출 기준 |
| `currentCustomerId` | 지금 상담 중인 고객 ID | 있으면 저장 시 update |
| `consultTargets` | 상담 화면이 기억하는 계약 | `{carrierContractId, usimByKey}` — `emptyConsultTargets()` |
| `detailCustomerId`, `detailBundle`, `detailHistoryFilter`, `ctOpenMap` | 고객상세의 현재 고객·묶음 데이터·이력 필터·열린 계약 카드 | |
| `customerListCache`, `customerProductsMap`, `customerContactsMap` | 고객조회 목록 캐시와 부가 데이터 | |
| `dashCust`, `dashCt`, `dashDue`, `dashSel`, `dashContractSel`, `dashMode`, `dashRows` | 대시보드 집계·선택 상태 | `DASH_LIST_LIMIT` 200건까지 표시, 넘으면 `dashTruncated` |
| `perfData`, `perfOpenGroups` | 실적조회 결과 / 펼친 그룹 | 로그인·로그아웃 시 재조회 없이 다시 그림 |
| `custTabs`, `custTabActive` | 상단 고객 탭 (최대 `CUST_TAB_MAX`=5) | 브라우저에 저장 |
| `selectedCustomerTags` / `detailCustomerTags` | 태그 선택 (상담 / 상세, 서로 독립) | `Set` |
| `CUSTOMER_SCHEMA` | DB에 있는 구 테이블·칼럼 점검 결과 | `probeCustomerSchema()` |
| `logs` | 데이터 로드 로그 | 테이블명이 key |

### 8-2. `DATA` 형태 (`loadData()`가 만듦)

```js
DATA[carrier] = {                       // carrier: 'kt' | 'lg' | 'skb' | 'skt' | 'sky'
  internet: { [speed]: { fee, routerFee } },              // speed: 100 | 500 | 1000
  tv:       { low, basic, premium },                      // 각 { name, fee, channels }
  settopList: [ { name, fee } ]
}
```

- TV 요금제 등급(low/basic/premium)은 DB `plan_name`에 **특정 단어가 들어 있는지**로 판별합니다(통신사별로 다름). **DB의 요금제 이름이 바뀌면 매핑이 깨질 수 있으니** `loadData()`의 매핑 부분을 함께 확인하세요.
- **SKY**: TV 요금제가 2개(베이직·플러스)뿐이라 저가형=베이직, 기본형·고급형=플러스로 매핑합니다.
- DB의 SKY 값이 `skylife` / `SKYLIFE` / `SKY`로 섞여 있어 `carrierKeyOf()`로 화면 키 `sky`에 모아 읽습니다. DB 조회는 대소문자를 구분하므로 `dbCarrierNames()`를 씁니다.

### 8-3. 제안상품 객체 (`reflectedProducts`의 원소)

- **home**: `id`, `type:'home'`, `carrierName`, `carrierKey`, `speedNum`, `tvTier`, `internetLabel`, `internetFee`, `routerLabel`, `routerFee`, `bundleDiscount`, `tvLabel`, `tvName`, `tvChannels`, `tvFee`, `settopLabel`, `settopFee`, `tvBundleDiscount`, `totalFee`, `extraTVs`, `extraTvFee`, `extraTvDetails`, `benefitTotal`, `giftCard`, `cash`, `extraPay`(추가지급)
- **usim**: `id`, `type:'usim'`, `carrier`('KT'/'LG'/'SK'/알뜰 등), `planName`, `fee`, `contractFee`, `dataAllowance`, `voiceAllowance`, `smsAllowance`, `tethering`, `membership`, `targetAge`, `gift`

### 8-4. `computePrice(carrier, stateObj)` 반환값

성공: `{available:true, total, internetFee, routerFee, tvFee, settopFee, bundleDiscount, tvBundleDiscount, tvInfo, settopInfo, extraTvFee, extraTvDetails}` / 실패(해당 속도 상품 없음): `{available:false}`

### 8-5. 결합할인 옵션 (`compute*Options`의 반환 원소)

`{key, name, avail, availText, internetDiscount, lineShares[], total, desc, ...}`
- KT(총액 결합 / 정액 결합 / 프리미엄 가족결합 / 프리미엄 싱글결합), LG(참쉬운가족결합 / 투게더결합), SK(요즘가족결합)
- **SKY는 `computeSkyOptions()`가 빈 배열**을 돌려줍니다(2026-10-06 결정: 휴대폰 결합할인 0원, 결합 규칙이 정해지면 여기에 추가).
- 최종상품에서는 **가능한(`avail`) 옵션 중 `total`이 가장 큰 것**을 선택합니다(`computeFinalCombo`).

### 8-6. 데이터 접근 함수의 반환 형태 (Supabaseservice.js)

| 함수 | 반환 |
|---|---|
| `loadCustomerBundle(id)` | `{ok, customer, summary, contracts[{..., items[], proposals[]}], history[]}` — 계약은 `v_contract_overview` 기준(`effective_status`, `is_acquired` 포함), 이력은 최신순 최대 500건, 공통 이력은 `contract_id` null |
| `loadCustomerOverviewList(filters)` | `{ok, rows[{...customers, overview:{...}}], total}` — 필터: contact·name·customerStatus·substatus·reason·acquired·openPayout·unpaid·openClawback·orderBy·ascending·limit(기본 200) |
| `loadContractOverviewList(filters)` | 계약 목록(`v_contract_overview`) + 고객 이름·연락처 (`consult_snapshot`은 목록에서 제외) |
| `loadPerformanceData({from,to})` | `{ok, customers[], acquired{}, contracts[], itemsByContract{}, truncated{}, period}` |
| `changeStatus(...)` | 2-4 참고 |

---

## 9. Supabase (코드 기준 추정)

접속 정보는 `Supabaseservice.js` 상단(URL + anon 공개 키)에 있습니다. **anon 키는 공개용이므로 데이터 보호는 테이블 RLS 정책이 담당**합니다. 새 테이블·뷰는 **로그인한 사용자만** 읽을 수 있습니다(미로그인이면 `{ok:false}`).

### 9-1. 새 구조 (주 사용)

| 대상 | 읽기/쓰기 | 코드에서 쓰는 컬럼·역할 |
|---|---|---|
| `customers` | 읽기/쓰기 | customer_id, name, contact(숫자만), customer_status, consult_substatus, status_reason, inflow_route, customer_tags, notes, next_contact_at, created_at, updated_at 등. 구 칼럼(`funnel_status`, `proposal_snapshot`, `guided_*`, `usim_*`)은 남아 있으나 새 저장은 쓰지 않음 |
| `contracts` | 읽기/쓰기 | contract_id, customer_id, seq, contract_type(`home`/`usim`), label, linked_contract_id, contract_status, status_reason, received_at(+received_at_source), install_scheduled_at, external_ref, address_zip·address·address_detail, contractor_name·contractor_relation, payment_method, gift_total·gift_card·gift_cash·gift_extra, commission_total, payout_status·payout_at, clawback_status·clawback_amount·clawback_reason, memo, consult_snapshot, source(`legacy`/`migrated`/`app`) |
| `contract_items` | 읽기/쓰기 | item_id, contract_id, product_type(`internet`/`tv`/`usim`), carrier, product_name, monthly_fee, commission, progress_status, detail(JSON: consultKey 등) |
| `contract_proposals` | 읽기/쓰기 | 제안 스냅샷 행. detail = `{consultKey, isFinal, product}` |
| `status_history` | 읽기/쓰기 | history_id, customer_id(필수), contract_id/item_id(선택), event_type(`status_change`/`memo` 등), target_type(`customer`/`contract`/`item`), axis, from/to, reason, note, changed_by 등. `target_type`이 contract/item이면 해당 ID가 있어야 한다는 제약이 있음 |
| `v_customer_overview` (뷰) | 읽기 | contract_count, acquired_contract_count, acquired_home_count, acquired_usim_count, active_contract_count, is_acquired, first_received_at, open_payout_count, unpaid_contract_count, open_clawback_count |
| `v_contract_overview` (뷰) | 읽기 | 계약 칼럼 + effective_status(계약취소 계산값), item_count, canceled_item_count, is_acquired |

### 9-2. 상품·요금·수수료

| 대상 | 읽기/쓰기 | 코드에서 쓰는 컬럼 |
|---|---|---|
| `internet_plans` | 읽기 | carrier, speed, monthly_fee, router_fee |
| `tv_plans` | 읽기 | carrier, plan_name, monthly_fee, channel_count |
| `settop_boxes` | 읽기 | carrier, model_name, monthly_fee |
| `carrier_promotions` | 읽기 | carrier, speed, tv_tier(`none`/`all`), gift_card, cash_amount, max_promo_limit |
| RPC `get_admin_commissions` | 읽기(**로그인 시에만 호출**) | carrier, speed, tv_tier(`none`/`low`/`basic`/`premium`), commission_amount, start_at (+ 에이전시 칼럼이 생기면 `COMMISSION_ROW_FIELDS.agency`만 고치면 됨) |
| `usim_plans` | 읽기 | is_active, monthly_fee, carrier, plan_name, contract_discount_fee, data_allowance, voice_allowance, sms_allowance, tethering_allowance, membership_benefit, target_age |

### 9-3. 구 구조 / 병행 테이블

| 대상 | 현재 상태 |
|---|---|
| `customer_contacts` | **계속 사용 중**: 고객부재 재안내 1~3차 컨택 이력 (customer_id, attempt_no(1~3), scheduled_at, contacted_at, method, result(`부재`/`연결`), content, created_by). 로그인 전용 RLS로 전환됨 |
| `customer_products` | 고객조회 목록의 부가 표시, 고객상세의 구 안내상품 표(`renderGuidedProductTables`, `renderCustomerProducts`)와 편집(`saveGuidedProductRow` 등), 고객 삭제 시 정리에 **아직 남아 있음**. 새 저장 경로는 쓰지 않음 → 정리 대상 |
| `customer_status_logs` | 예전 상태 변경 이력. `logStatusChange()` **함수만 남아 있고 호출하는 곳은 없음** → 이력은 `status_history`가 대신함. 정리 대상 |

**스키마 점검 방식:** `probeCustomerSchema()`가 `proposal_snapshot`, `customer_products`, `customer_contacts`, `customer_status_logs` 존재 여부를 조회해 `CUSTOMER_SCHEMA`에 담고, 없으면 해당 기능만 건너뜁니다.

**정확한 컬럼 타입과 제약은 코드에 없습니다.** 정확한 스키마는 Supabase 테이블 정의(`01_structure.sql`)를 확인하세요.

---

## 10. 업무 규칙 (코드에서 확인)

**사은품**
- 추천상품 기본 사은품은 `carrier_promotions`의 한도(`maxLimit`)입니다. 해당 통신사·속도 행이 없으면 **코드 안의 기본값**을 씁니다.
- **경품고시제 배분** (`computeGiftBreakdown`): 한도 안에서 상품권 → 현금 순으로 채우고, 초과분은 **추가지급(`extraPay`)** 으로 분리합니다. 제안·최종·수수료 패널·상담요약에 모두 반영됩니다.
- **적정사은품**: 수수료 총액 × (기본 비율 + 속도 가산 + TV 등급 가산)%, 만 원 단위 내림. 비율은 `config.js`의 `PROPER_GIFT_*`, 계산은 `computeProperGiftAmount()`. 상담원이 직접 사은품을 고칠 수 있습니다(`customGiftValues`).
- **유심 사은품 기본값** = 유심 수수료 − 기준액(`S7_USIM_GIFT_BASE`, 최소 0). 로그인했을 때만 자동 계산되고 추천·제안·최종 단계 각각에서 수정할 수 있습니다.

**수수료 노출·에이전시**
- 인터넷·TV 수수료는 로그인 시에만 RPC로 가져옵니다. 같은 조합의 행이 여러 개면 **`start_at`이 이미 지난 행 중 가장 최근 것**을 씁니다(`pickLatestRow`).
- 에이전시가 여러 곳이면 **에이전시별 합계(인터넷+TV)가 가장 큰 곳**을 대표값으로 씁니다(`pickBestCommission`). 기존 필드(`internetComm`·`tvComm`·`totalComm`)는 대표값이라 기존 화면 코드가 그대로 동작하고, 추가 필드 `agency`·`agencies`(높은 순)가 붙습니다. 선택 규칙은 **`pickBestCommission` 한 곳에만** 둡니다.
- 유심 수수료는 `Calculator.js`의 `USIM_COMMISSION_BANDS`(월요금 구간표) 기준이고 `usimCommissionInfo()`가 에이전시 비교를 합니다. 화면 노출은 로그인 시에만이지만 **구간표 자체는 소스에 들어 있어 비로그인 사용자도 볼 수 있습니다.**
- **화면 확인용 가짜 에이전시**: 주소 끝에 `?commMock=1` (DB와 무관, **저장은 막힘**).
- 고객에게 보이는 곳(사은품, 요금, 데이터 제공량)과 관리자에게만 보이는 곳(수수료, 마진)을 섞지 마세요. 로그인 전용 정보는 반드시 `isLoggedIn` 조건을 거세요.

**요금 계산 (`computePrice`)**
- 인터넷 + 공유기 + TV + 셋탑 − 결합할인 − TV결합할인. 통신사·속도별 예외(공유기 무료 조건 등)는 코드에 직접 들어 있습니다.
- 서브 TV(2대째부터): 채널 요금 50% + 셋탑 요금 전액. TV결합할인은 메인 TV에만 적용합니다.
- SKY: 인터넷+TV 결합할인·TV결합할인 규칙이 미확정이라 0원입니다.

**결합할인**
- 최종상품의 홈상품 통신사와 **같은 그룹의 유심**만 계산 대상입니다(`MOBILE_GROUP_MAP`: KT→KT, LG→LG, SKB·SKT→SK, SKY→어디와도 매칭 안 됨).
- 가족 회선(`familyLines`)은 참고 정보이며 계산에 반영되지 않습니다.

**고객부재 재안내(컨택) 규칙** (인생비서 3-5 규칙, 값은 `config.js`의 `CONTACT_RULES`)
- 총 3회(최초 1회 + 재안내 2회), **직전 실제 컨택 시각 + 3시간** 뒤 재안내. 근무시간 09:00~18:00(18:00 정각까지 당일), 넘으면 다음 영업일 10:00부터 이어감. 근무시간 외(18시 이후·주말·공휴일) 인입은 다음 영업일 10:00를 1회차로 함.
- 영업일 판정은 주말 + `KOREAN_HOLIDAYS`(**매년 갱신 필요**, 현재 2026~2027). 범위를 넘으면 `isBeyondHolidayCoverage`로 화면에 안내합니다.
- 계산은 `Calculator.js`의 `computeFirstContactTime` / `computeNextContactTime`(순수 함수), 저장·회차 갱신은 `saveContactAttempt` → `applyContactCycle`(여러 번 실행해도 결과가 같음).
- 상태 표현(새 구조): **`상담중 + 부가표시 고객부재`** = 재안내 중 (`CONTACT_CYCLE_NEW`).
  - 결과 `부재` → 다음 회차 자동 예약(+ `customers.next_contact_at` 갱신).
  - 결과 `연결` → 예약만 된 회차 삭제, 재안내 중(상담중+고객부재)이면 **`상담중`(부가표시 없음)** 으로 변경. 이탈·제외·유치 상태는 건드리지 않음.
  - 3회 모두 `부재` → **자동 전환하지 않고** 담당자가 직접 `이탈(고객부재)`로 변경(`CONTACT_CLOSED_NEW`).
  - 부재 기록으로 재안내 상태가 되는 현재 상태: `상담대기`, 또는 `상담중`(부가표시 없음·상담예약). 상품안내 중·이탈·제외·유치는 바꾸지 않음(`CONTACT_START_FROM_NEW`).
- "자동"은 기록 시점에 계산·저장한다는 뜻이며 시간이 지나면 저절로 알림이 뜨지는 않습니다(대시보드의 오늘 예정·지연 건수로 확인).

**특이사항 누적**
- 별도 칼럼 없이 `customers.notes`에 `[YY-MM-DD HH:mm] 내용` 줄을 최신순(맨 위)으로 쌓습니다(`prependNoteLine`). 컨택을 처음 기록할 때도 한 줄이 자동으로 쌓입니다.

**고객조회 / 엑셀(CSV)**
- 검색: 연락처는 하이픈 유무와 관계없이 부분일치(`buildContactOrFilter`), 이름은 부분일치, 둘을 함께 쓰면 AND. 목록에는 계약 집계와 상태 칩, 수수료 열(로그인 시만)이 보입니다.
- `exportCustomerListCsv`: **현재 화면 목록**을 같은 정렬로 CSV(UTF-8 BOM) 저장. 파일에 연락처가 그대로 들어가므로 내려받기를 제한하려면 이 함수 앞에 `isLoggedIn` 조건을 거세요.

**대시보드**
- 고객 현황은 `CUSTOMER_STATUS_STAGE` 기준 5개 상태 카드(상담중은 부가표시별, 이탈·제외는 사유별 하위 칩), 계약 현황은 `DASH_CONTRACT_STATUS_CHIPS`(접수대기·접수보류·접수불가·접수완료·계약취소; **작성중은 접수 전이라 제외**)와 지급·환수 칩, 오늘 컨택 예정·지연, 미지급·환수 플래그를 보여 줍니다. 리스트는 200건까지.

**실적조회 (S8 기준, 화면 설명 문구와 동일)**
- **고객** = 기간 안에 **등록한**(`customers.created_at`) 고객.
- **유치 고객** = 그 고객 중 접수 이력이 있는 고객(`is_acquired`). 이후 이탈·제외·계약취소가 돼도 포함.
- **유치 계약** = 기간 안에 **접수된**(`received_at`) 계약. 접수 후 취소된 계약도 포함(`effective_status = 계약취소`).
- 기간은 한국 시간 기준, 시작일 0시 ~ 종료일 23:59:59.999(양쪽 포함), 비우면 전체. 1,000건씩 나눠 읽고 상한(기본 20,000건)에 닿으면 `truncated`로 알립니다.
- 수수료·마진·마진율은 로그인했을 때만 보이며, 로그인·로그아웃 시 `refreshPerformanceView()`가 다시 그립니다.
- 8장의 구 상수 `PERFORMANCE_WON_STATUSES`·`PERFORMANCE_LIST_STATUS`(config.js 8장)는 **더 이상 쓰지 않습니다**(S11에서 삭제 예정). 새 기준은 config.js 11장 라벨(`PERF_*`)과 계약 상태입니다.

**고객상세 — 계약 카드**
- 계약 카드 헤더에 접수·지급·환수 상태, 상품 줄에 설치 진행 상태가 있고 **모두 `changeStatus`를 거쳐 이력이 1건씩** 남습니다. 고객 상태는 선택하는 즉시 저장되며 [수정 저장]에는 포함되지 않습니다.
- 계약 생성·정보 수정·상품 추가/수정/삭제·계약 삭제는 `createContractUi`, `saveContractMetaUi`, `addItemUi`, `saveItemUi`, `deleteItemUi`, `deleteContractUi`이고 DB 쪽은 S6 함수(`createContract`, `saveContractMeta`, `addContractItem`, `saveContractItem`, `deleteContractItem`, `deleteContract`)입니다.
- 변경 이력은 `status_history`를 보여 주며 "공통 / 계약1 / 계약2…" 필터가 있습니다(`setHistoryFilter`).

**필수안내**
- `noticeToggleAll` / `noticeCheckAll` / `noticeSubmit`이 동의 체크와 서명 여부만 확인하고 알림만 띄웁니다. **동의·서명 내용은 저장하지 않습니다.** 저장이 필요해지면 별도 테이블과 저장 함수가 필요합니다.

---

## 11. config.js 내용 (11개 장)

1. 통신사·요금 구간·라벨: `CARRIERS`(kt·lg·skb·skt·sky), `LG_VARIANT_*`, `BRAND_LABEL`, `CARRIER_LABEL`, `TV_BUNDLE_DISCOUNT`, `SPEED_LABEL`, `ROUTER_LABEL`, `FEE_RANGES`, `OLD_INTERNET_FEE_RANGES`, `HOME_CARRIER_OPTIONS`, `MOBILE_CARRIER_OPTIONS`, `ISP_HOME_CARRIER_MAP`, `MOBILE_GROUP_MAP`, `USIM_TIER_RANGE`, `USIM_TIER_LABEL`
2. 사은품 정책: `PROPER_GIFT_BASE_PERCENT`, `PROPER_GIFT_SPEED_BONUS`, `PROPER_GIFT_TV_BONUS`
3. 추천/제안 표시 옵션: `RECO_USIM_COLUMNS`, `USIM_VISIBLE_COUNT`, `EXTRA_TV_TIER_OPTIONS`, `EXTRA_TV_SETTOP_OPTIONS`, `PROPOSAL_USIM_COLUMNS`
4. 고객 태그: `CUSTOMER_TAG_GROUPS` (연령대 / 관계·명의 / 성향 / 약정 상태 / 핵심 니즈 / 상담 성향, 판별근거·참고 문구 포함)
5. **(구)** 퍼널 상태값: `FUNNEL_STAGES`(22개·6그룹), `LEGACY_STATUS_MAP`, `DEFAULT_FUNNEL_STATUS`, `RESERVATION_STATUS`, `PRE_STAGE_STATUSES`, `NAME_PREFIX`(`(인생비서)`), `INFLOW_ROUTES`(전화인입·상담요청), `DASHBOARD_GROUPS`
6. 고객부재 재안내(구 값 포함): `CONTACT_RULES`, `CONTACT_METHODS`, `CONTACT_RESULT_*`, `CONTACT_*_STATUS`, `KOREAN_HOLIDAYS`, `KOREAN_HOLIDAYS_LAST_YEAR`
7. 안내상품 표 열 폭: `GUIDED_HOME_COLS`, `GUIDED_USIM_COLS`
8. **(구)** 실적조회: `PERFORMANCE_WON_STATUSES`, `PERFORMANCE_LIST_STATUS` — 사용 안 함
9. **새 구조 상태 사전**: `CUSTOMER_STATUSES`, `CUSTOMER_STATUS_LABEL`, `CONSULT_SUBSTATUSES`, `STATUS_REASONS`, `CONTRACT_STATUSES`, `CONTRACT_DISPLAY_GROUP`, `ITEM_PROGRESS`, `PAYOUT_STATUSES`, `CLAWBACK_STATUSES`, `FUNNEL_TO_NEW_STRUCTURE`
10. 재안내 새 구조 대응값: `CONTACT_CYCLE_NEW`, `CONTACT_CYCLE_VALUE`, `CONTACT_CLOSED_NEW`, `CONTACT_CONNECTED_NEW`, `CONTACT_START_FROM_NEW`
11. 실적조회 새 기준 라벨: `PERF_CONTRACT_TYPE_LABEL`, `PERF_ITEM_TYPE_LABEL`, `PERF_CUSTOMER_DETAIL_EMPTY`

`USIM_COMMISSION_BANDS`는 계산 로직과 밀접해 Calculator.js에 남겨 두었습니다.

---

## 12. 인라인 스크립트 지도 (CS_new.html, 약 4,870줄)

줄 번호는 근사치입니다. 함수명으로 검색하세요.

| 구간(약) | 내용 | 대표 함수 |
|---|---|---|
| 697~860 | 전역 상태, 공용 유틸, **3분할 그룹**, 탭 전환 | `showToast`, `RECO_GROUPS`, `recoVisibleCarriers`, `switchTab`, `goCsStep`, `addLog` |
| 860~1270 | **추천상품**: 사은품 계산, 통신사 카드, 유심 추천 | `renderRecoCards`, `computeProperGiftAmount`, `reflectRecoCardToProposal`, `fetchRecoUsimPlans`, `reflectRecoUsimPlan` |
| 1270~1470 | 서브 TV, 프리셋, 기존 인터넷·가족 회선 | `renderExtraTvControls`, `applyRecoPreset`, `renderFamilyLines`, `syncToDesignPhones` |
| 1470~1700 | 제안 유심 카드, **결합할인 아코디언**, 경품고시제 | `buildProposalUsimCard`, `renderFamilyDiscountAccordion`, `computeGiftBreakdown` |
| 1700~2040 | 상담요약, 중복 연락처 안내, 고객정보 편집 패널, **필수안내** | `buildConsultSummary`, `checkDuplicateContact`, `openCustEditDrawer`, `noticeSubmit` |
| 2040~2340 | 제안·최종상품 목록, 수수료 패널 | `renderProposalLists`, `moveProposalToFinal`, `computeFinalCombo`, `renderFinalProducts`, `renderCommissionPanels` |
| 2340~2470 | 로그인 모달, 상담 예약 | `openLoginModal`, `submitReservation`, `updateAuthUI` |
| 2470~2580 | 고객 태그 | `renderTagChips`, `toggleCustomerTag` |
| 2580~3000 | 상태 선택칸, 에이전시 표시, **상담 저장·초기화** | `applyConsultStatus`, `agBadgeHtml`, `buildCustomerPayload`, `buildConsultSetInput`, `saveConsultation`, `startNewConsultWithContact` |
| 3000~3360 | **대시보드** | `loadFunnelDashboard`, `renderFunnelDashboard`, `loadDashList`, `renderDashList`, `renderDashContractList` |
| 3360~3560 | **고객조회**: 목록·엑셀 | `renderCustomerList`, `loadCustomerListExtras`, `exportCustomerListCsv` |
| 3560~3830 | **실적조회** | `loadPerformance`, `computePerfStats`, `buildPerfSummaryHtml`, `buildPerfFunnelHtml`, `buildPerfContractsHtml`, `buildPerfListHtml` |
| 3830~4175 | 정렬, 빠른 상태변경, 검색, **상세 열기** | `sortCustomerList`, `quickUpdateCustomerStatus`, `searchCustomers`, `openCustomerDetail`, `renderDetailSummary`, `openCustomer` |
| 4175~4520 | 구 안내상품 표, 특이사항 | `renderGuidedProductTables`, `buildLegacyHomeTable`, `prependNoteLine`, `addCustomerNote` |
| 4520~4770 | **컨택 이력**(고객부재 재안내) | `renderContactSection`, `applyContactCycle`, `saveContactAttempt`, `autoStartContactCycle`, `logStatusChange`(미사용) |
| 4770~5150 | **계약 카드·이력·계약 편집 UI** | `refreshDetailBundle`, `renderContractCard`, `renderContractSection`, `renderStatusLogSection`, `changeContractStatus`, `changeItemProgress`, `createContractUi`, `addItemUi` |
| 5150~5320 | 고객 수정·삭제, **상담 불러오기** | `updateCustomer`, `deleteCustomer`, `fillConsultFormFromCustomer`, `loadConsultFromContracts`, `loadCustomerToConsult` |
| 5320~5570 | 상단 고객 탭, 빠른조회, 시작 코드 | `custTab*`, `quickTopSearch`, 마지막 IIFE |

### Supabaseservice.js 지도 (약 1,740줄)

| 구간(약) | 내용 | 대표 함수 |
|---|---|---|
| 1~60 | 연결, 연락처 헬퍼, 통신사 키 | `normalizeContact`, `isValidContactDigits`, `formatContactDisplay`, `carrierKeyOf`, `commissionKeyOf`, `dbCarrierNames` |
| 55~120 | 상품·요금 로드 | `loadData` |
| 120~300 | **수수료·에이전시·프로모션**, 로그인 | `pickLatestRow`, `pickBestCommission`, `lookupCommission`, `usimCommissionInfo`, `loadFinanceData`, `handleLogin`, `handleLogout` |
| 333~560 | **S2 읽기 계층** | `loadCustomerBundle`, `loadCustomerOverviewList`, `loadContractOverviewList` |
| 564~790 | **S4 상태 변경 단일 함수** | `changeStatus`, `deriveCustomerStatus` |
| 788~1030 | **S6 계약·상품 생성/수정/삭제** | `createContract`, `saveContractMeta`, `addContractItem`, `saveContractItem`, `deleteContract`, `checkCustomerDeletable` |
| 1031~1660 | **S7 상담 저장·불러오기** | `s7BuildConsultPlan`, `s7SaveConsultContracts`, `s7SaveContractItems`, `s7ReplaceProposals`, `saveConsultSet`, `loadConsultForScreen` |
| 1657~1740 | **S8 실적 데이터** | `loadPerformanceData` |

### Calculator.js 지도 (약 460줄)

`getSettopByTier`, `computePrice`, `distributeAmount`, `computeKTOptions`, `computeLGOptions`, `computeSkyOptions`(빈 배열), `computeSKOptions`, `USIM_COMMISSION_BANDS`, `getUsimCommission`, 재안내 일정(`isBusinessDay`, `computeFirstContactTime`, `computeNextContactTime`, `isBeyondHolidayCoverage`).

---

## 13. 무엇을 바꾸려면 어느 파일?

| 바꾸려는 것 | 파일 |
|---|---|
| 화면 디자인, 간격, 색 | `Styles.css` (**HTML 안에 `<style>` 추가 금지**) |
| 요금 구간 라벨, 상태 목록·사유, 태그 문구, 사은품 비율, 표시 옵션, 공휴일 | `config.js` |
| 결합할인·요금 계산 규칙, 유심 수수료 구간, 재안내 일정 계산 | `Calculator.js` |
| DB 조회, 로그인, 프로모션·수수료 조회, 에이전시 선택 규칙 | `Supabaseservice.js` |
| 계약·상품 저장 방식, 상태 변경 규칙 | `Supabaseservice.js` (S4·S6·S7) |
| 고객 저장 칼럼 | `CS_new.html` (`buildCustomerPayload`, `updateCustomer`) |
| 실적조회 집계·열 구성, 엑셀 내보내기 열 | `CS_new.html` (`computePerfStats`, `buildPerf*Html`, `exportCustomerListCsv`) / 데이터 범위는 `loadPerformanceData` |
| 대시보드 칩·집계 | `CS_new.html` (`loadFunnelDashboard`, `renderFunnelDashboard`) |
| 화면 구성(입력칸, 버튼), 상담 흐름 | `CS_new.html` |
| 새 통신사 추가 | `config.js`(CARRIERS·라벨·그룹 맵) → `Calculator.js`(결합할인 함수) → `Supabaseservice.js`(`loadData` TV 매핑·`DB_CARRIER_ALIAS`) → `CS_new.html`(`RECO_GROUPS`) → `Styles.css`(열·색상) |

---

## 14. 수정 시 주의사항

1. `onclick="함수명()"`에서 부르는 함수는 **전역**이어야 합니다. 함수를 다른 파일로 옮겨도 이름과 전역 노출은 유지하세요.
2. `const`/`let`은 파일 사이에서 공유되지만 **`window.변수`로는 접근되지 않습니다.** 점검 코드도 `typeof 변수명`으로 확인합니다.
3. 새 상수는 `config.js`, 값이 바뀌는 상태는 CS_new.html에 둡니다.
4. **상태는 `changeStatus()`로만** 바꿉니다. 직접 `update`하면 이력이 빠지고 고객 상태 자동 맞춤(D16)도 건너뜁니다.
5. 계약·상품 삭제는 작성중·접수 이력 없음일 때만 가능합니다. 삭제 로직을 바꾸면 DB 트리거와 `status_history` 제약도 함께 확인하세요.
6. `reflectedProducts`와 `finalProducts`가 같은 객체를 공유한다는 점을 잊지 마세요.
7. 제안상품 객체에 필드를 추가하면 `consult_snapshot`과 `contract_proposals.detail`에도 저장되므로 **불러오기(`loadConsultForScreen`)와 조회 표**에 영향이 없는지 확인하세요.
8. 수수료 대표값 선택 규칙은 `pickBestCommission` **한 곳에만** 두세요.
9. 로그인 전용 정보를 화면에 추가할 때는 반드시 `isLoggedIn` 조건을 거세요.
10. DB에 칼럼을 추가하면 `probeCustomerSchema()`처럼 "있으면 저장, 없으면 건너뛰기" 방식을 따르면 안전합니다.
11. 구 퍼널(`FUNNEL_STAGES`, `funnel_status`), `customer_products`, `customer_status_logs`, `logStatusChange`는 **정리 대상**입니다. 새 기능에서 참조하지 마세요.

---

## 15. 배포 전 체크리스트

1. 함께 바뀐 파일을 **모두** GitHub 웹에서 커밋했는지 확인 (최대 5개)
2. `?v=` 값을 올렸는지 확인 (HTML 안의 해당 줄도 함께 수정)
3. 새 DB 칼럼·테이블이 필요한 변경이면 **Supabase에서 SQL을 먼저 실행**하고, RLS를 켰다면 INSERT·SELECT 정책을 확인
4. 새로고침 후 **빨간 "파일 로드 실패" 배너**가 없는지 확인
5. 상단 로드 로그(`cs-banner-logs`)에 오류가 없는지 확인
6. 추천상품 카드 → 제안상품 반영 → 최종상품 → 상담 저장 → 고객조회 → 고객상세(계약 카드 확인) 순으로 한 번씩 클릭
7. 로그인 / 비로그인 각각에서 수수료·마진 노출 여부 확인
8. 저장한 고객을 열어 [상담으로 불러오기]가 정상 복원되는지 확인
9. 상태를 바꿔 본 뒤 고객상세 변경 이력에 한 줄이 생기는지 확인 (실패 시 콘솔의 `row-level security policy` 오류부터 확인)
10. 대시보드 카드 건수와 실적조회 숫자가 서로 어긋나지 않는지 확인
11. 5개 통신사(KT·LG·SKB·SKT·SKY) 카드가 모두 나오는지, SKY 선택 시 결합할인이 0원으로 안내되는지 확인

---

## 16. 이후 계획 / 알아둘 점

**진행 계획 (미진행)**

| 단계 | 내용 |
|---|---|
| S7-9 | 마감 점검 (상담 저장 경로 전환의 테스트) |
| S11 | 구 코드 정리: `config.js` 5·8장과 구 퍼널 상수, `customer_products` 화면, `customer_status_logs`·`logStatusChange` 제거 |
| 컷오버 | 구 `CS.html` → 새 화면 전환 (연락처 숫자만 저장 변환·이전본 확정 SQL 포함) |
| 수수료 비교 | DB에 에이전시 칼럼 연결 (`COMMISSION_ROW_FIELDS.agency`, `USIM_COMMISSION_BY_AGENCY`) |
| TV 단독 상품 | 후순위 |
| 실적 카테고리 배치 | 후순위 |
| 가족 단위 관리 | 마지막 단계 (가족 구성원도 각자 고객 + 각자 유심 계약, 인터넷·TV 계약에 연결하는 방식으로 합의) |
| 파일 분리 | 인라인 스크립트를 `customer.js`, `reco.js`, `proposal.js`, `main.js` 등으로 단계별 분리 (한 단계씩, 매번 15번 체크리스트). 새 파일을 추가하면 이 문서의 3·4·5·12번과 로드 점검 스크립트를 함께 갱신 |

**알아둘 점**

- 과거에 Calculator.js 자리에 CSS 파일이 들어가 계산이 깨진 적이 있습니다. 로드 점검 스크립트가 이런 사고를 화면에서 알려줍니다.
- 공휴일 목록(`KOREAN_HOLIDAYS`)은 2027년까지입니다. **매년 갱신**하세요.
- 유심 수수료 구간표를 비공개로 하려면 인터넷·TV 수수료처럼 서버(RPC) 조회로 옮기는 방안을 검토하세요.
- 필수안내의 동의·서명은 저장되지 않습니다(10번 참고).
- 목록·대시보드·실적은 한 번에 읽는 행 수 제한(1,000건) 때문에 나눠 읽거나 상한(대시보드 리스트 200건, 실적 20,000건)을 둡니다. 고객 수가 크게 늘면 이 상한을 점검하세요.
- 새 테이블 이름·컬럼은 코드 기준 추정이므로, 정확한 정의는 `01_structure.sql`을 기준으로 하세요.

---

## 변경 이력

- 2026-09-28: 인라인 CSS를 `Styles.css`로 이동, 상수를 `config.js`로 분리, 로드 점검·버전 쿼리 추가 (로직 변경 없음)
- 2026-09-28: 고객조회 개선(안내상품 여러 건·요금·사은품·수수료 열, 특이사항 누적), 고객부재 재안내 1~3차 컨택 이력(`customer_contacts`) + 자동 예약
- 2026-09-29: 상태값 변경 이력 기능 문서화 (이후 `status_history`로 대체)
- 2026-09-30: 고객조회 엑셀(CSV) 다운로드, 실적조회 탭, 구 퍼널 22개·6그룹 개편
- 2026-10-01~02: **새 DB 구조(고객 > 계약 > 상품) 도입** — S2 읽기 계층, S4 `changeStatus`, S6 계약·상품 CRUD, S7 상담 저장·불러오기 계약 단위화, 고객부재 재안내 새 상태 대응
- 2026-10-02~06: S8 실적조회 계약 기준 전환, 대시보드 탭(고객·계약 현황), 고객상세 탭(계약 카드·이력), 필수안내 탭(동의·전자 서명), 상단 고객 탭·빠른조회, 고객정보 편집 패널, 수수료 에이전시 비교(`?commMock=1`), 추천상품 3분할, 인라인 `<style>`을 `Styles.css`로 이동
- 2026-10-06: **SKY(5번째 통신사) 추가** — 휴대폰 결합할인 0원, 화면 키 `sky`, DB `skylife`/`SKYLIFE`/`SKY` 통합 읽기
- 2026-10-07: **이 문서를 현재 코드 기준으로 전면 개정** (구 구조 설명을 새 구조로 교체, 상태 모델·상담 저장 흐름·Supabase 테이블·함수 지도 추가)
