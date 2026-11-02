# CS 상담 시스템 — Supabase 테이블·칼럼 사용처 정리 (AI 학습용)

작성일: 2026-11-02
근거 파일: `CS_v2.html`(약 9,100줄), `Supabaseservice.js`(약 2,690줄), `Calculator.js`(약 670줄)

## 0. 이 문서를 읽는 법

- 이 문서는 위 3개 파일의 코드를 직접 읽어 정리한 것입니다. **DB 스키마 파일(`v2_*.sql` 등)은 보지 못했습니다.**
- 따라서 칼럼은 "코드에서 읽거나 쓰는 것이 확인된 칼럼"입니다. DB에는 이보다 칼럼이 더 있을 수 있고, 자료형·제약조건은 적지 않았습니다. 확정 스키마는 12장의 쿼리 결과로 보완하세요.
- 코드로 확인하지 못한 내용은 `(추정)` 또는 `(코드 미확인)`으로 표시했습니다.
- 줄 번호는 업로드한 원본 파일 기준입니다. 이후 수정으로 몇 줄 밀릴 수 있으니 **함수 이름을 기준**으로 찾으세요. 표기: `HTML` = CS_v2.html, `SVC` = Supabaseservice.js, `CALC` = Calculator.js.
- 이 3개 파일 외에 `config.js`(상수·상태값 목록), `StatusRules.js`(상태 규칙), `Styles.css`가 있으나 제공되지 않았습니다.

---

## 1. 시스템 개요

통신(인터넷·TV·유심) 고객 상담, 상품 설계(추천→제안→최종), 계약·정산 관리를 하는 단일 페이지 웹 시스템입니다. 프런트엔드는 `supabase-js`(CDN)로 Supabase에 직접 접속합니다(전역 변수 `sb`). 별도 서버 코드는 없습니다.

| 파일 | 역할 |
|---|---|
| `CS_v2.html` | 화면(HTML)과 화면별 로직. 대시보드·고객조회·고객상담·수수료·정산 화면의 DB 호출 대부분이 여기에 있음 |
| `Supabaseservice.js` | DB 접근 계층. 상품 데이터 로드, 수수료 조회(`lookupCommission`), 계약·상품·이력 저장, 상태 변경(`changeStatus`), 사은품, 실적 조회 |
| `Calculator.js` | 요금·결합할인 계산, 유심 수수료 구간표, LG헬로비전 수수료 고정표 |

### 1.1 로그인과 권한
- Supabase Auth 이메일/비밀번호 로그인(`handleLogin`, SVC). 로그인 여부는 전역 `isLoggedIn`.
- 새 구조 테이블(계약·상품·이력 등)과 뷰는 로그인한 사용자만 읽고 쓸 수 있습니다(RLS, `authenticated`). 코드도 `s6LoginErr()`로 먼저 막습니다.
- **수수료 값은 로그인해야 보입니다.** 로그인 전에는 수수료·마진이 숨겨집니다.
- 예외: `install_fees`, `install_fee_options`는 로그인 없이 조회합니다(HTML 주석 기준).

### 1.2 화면(탭) 구성 — `switchTab()`
| 탭 | view id | 비고 |
|---|---|---|
| 대시보드 | `view-dashboard` | 상태별 건수, 유치 현황 |
| 고객조회 | `view-customers` | 고객 검색·목록 |
| 인터넷 > 고객상담 | `view-cs` | 고객정보→추천상품→제안상품→최종상품 흐름, 상담 저장 |
| 인터넷 > 필수안내 | `view-notice` | 고객 동의·안내(DB 호출 없음) |
| 인터넷 > 수수료 | `view-fee` | 에이전시별 수수료 비교·수정 |
| 인터넷 > 정산 | `view-settlement` | 상품별 정산, 청구서(세금계산서) 관리 |
| 렌탈 > 고객상담 | `view-rental-cs` | 빈 화면(MVP). 데이터는 `RENTAL_DATA`(코드 상수)가 비어 있음 |
| (숨김) 실적조회, 고객상세 | `view-performance`, `view-customer-detail` | 대시보드·고객상담으로 통합되어 탭 버튼만 숨김 |

### 1.3 데이터 모델 (고객 > 계약 > 상품)
```
customers (고객)  1 ── N  contracts (계약)  1 ── N  contract_items (상품: internet / tv / usim)
                           │  ├─ contract_proposals (제안 스냅샷)   ├─ contract_gift_lines (사은품 줄)
                           │  └─ contract_fee_lines (수수료 내역)   └─ status_history (모든 상태 변경 이력)
                           └─ contract_type: 'home'(인터넷+TV) 또는 'usim'
                              유심 계약은 linked_contract_id 로 같은 고객의 home 계약에 연결
```
- 계약 1건 = 하나의 상품 구성 단위(예: A집 인터넷+TV, B집 인터넷+TV는 별도 계약). 유심은 별도 계약이며 회선 1개만 가집니다.
- 접수(`received_at`)된 계약은 "유치"로 집계됩니다.
- 정산·지급·환수는 **상품(contract_items) 단위**로 관리합니다(`item_status`, `pay_status`, `refund_status`, `settle_*`). 계약 단위의 `payout_status`, `clawback_status`는 이전 구조의 흔적이며 아직 읽는 코드가 있습니다.

### 1.4 상태값은 두 체계가 공존합니다 (전환 중)
- **체계 A (3계층, `changeStatus`)**: `customers.customer_status`(상담대기/상담중/상담완료/이탈/제외), `customers.consult_substatus`(상담중 부가표시: 고객부재/상담예약/상품안내), `contracts.contract_status`(작성중/접수대기/접수보류/접수불가/접수완료 등), `contracts.payout_status`, `contracts.clawback_status`, `contract_items.progress_status`(설치대기/설치완료/접수취소 등). 구 대시보드(`loadFunnelDashboard`)와 SVC가 사용.
- **체계 B (간소화, `StatusRules.js`/`statusApply`)**: `customers.consult_state`(상담대기/상담중/상담종료), `customers.customer_segment`(고객 구분: 가망/잠재 등), `customers.exclude_reason`, `contract_items.item_status`(상품제안/접수보류…), `pay_status`, `refund_status`. 새 대시보드(`v2FetchNewDash`)와 고객조회가 사용.
- 상수 목록(`CUSTOMER_STATUSES`, `CONTRACT_STATUSES`, `ITEM_PROGRESS` 등)은 `config.js`에 있어 이 문서에서는 값 전체를 확인하지 못했습니다.
- `customers.funnel_status`는 더 오래된 퍼널 칼럼으로, 새 고객 생성 시 호환용 기본값만 넣습니다.

---

## 2. 테이블·뷰 요약표

| 구분 | 이름 | 상태 | 읽기 | 쓰기 | 주 사용 화면 |
|---|---|---|---|---|---|
| 고객 | `customers` | 현역 | O | O | 고객상담, 고객조회, 대시보드 |
| 고객 | `customer_contacts` | 현역 | O | O | 고객상담(컨택 기록), 고객조회 |
| 고객 | `customer_products` | 레거시(전환 중) | O | O | 고객조회 안내상품 표, 고객 삭제 |
| 고객 | `customer_status_logs` | 레거시(존재 확인만) | O(존재 확인) | X | — |
| 계약 | `contracts` | 현역 | O | O | 고객상담, 고객조회, 정산 |
| 계약 | `contract_items` | 현역 | O | O | 고객상담, 정산, 대시보드 |
| 계약 | `contract_proposals` | 현역 | O | O | 고객상담(제안 저장), 고객조회 |
| 계약 | `contract_gift_lines` | 현역 | O | O | 정산, 사은품 저장 |
| 계약 | `contract_fee_lines` | 현역(읽기만) | O | X(이 코드에서는) | 정산 |
| 이력 | `status_history` | 현역 | O | O | 상태 변경 이력, 고객상세 |
| 정산 | `settlement_invoices` | 현역 | O | O | 정산 |
| 정산 | `agencies` | 현역 | O | O | 정산, 수수료 |
| 수수료 | `fee_rates` | 현역 | O | O | 수수료 탭, 추천상품 수수료 |
| 수수료 | `fee_settop` | 현역 | O | X | 추천상품 수수료(셋탑) |
| 수수료 | `install_fees` | 현역 | O | X | 설치비 안내 |
| 수수료 | `install_fee_options` | 현역 | O | X | 설치비 안내(TV 3대 이상) |
| 상품 | `internet_plans` | 현역 | O | X | 요금 계산 |
| 상품 | `tv_plans` | 현역 | O | X | 요금 계산 |
| 상품 | `settop_boxes` | 현역 | O | X | 요금 계산 |
| 상품 | `usim_plans` | 현역 | O | X | 추천상품(유심) |
| 상품 | `carrier_promotions` | 현역 | O | X | 사은품 기본값 |
| 설정 | `crm_settings` | 현역 | O | X | 상태 규칙 설정값 |
| 뷰 | `v_customer_overview` | 현역 | O | — | 고객 목록, 대시보드 |
| 뷰 | `v_contract_overview` | 현역 | O | — | 계약 목록, 대시보드 |
| 뷰 | `v_contract_state_v2` | 현역 | O | — | 대시보드 |
| 뷰 | `v_gift_guideline` | 현역 | O | — | 경품고시 가이드 |
| 뷰 | `v_metric_acquisition` | 현역 | O | — | 대시보드 |
| 뷰 | `v_metric_settlement_items` | 현역 | O | — | 대시보드 |
| RPC | `search_customers_by_family_contact` | 현역 | O | — | 고객조회(가족 연락처 검색) |

---

## 3. 고객 테이블

### 3.1 `customers` — 고객 기본정보와 상담 상태
**용도**: 고객 1명당 1행. 연락처(`contact`)가 사실상 고객 식별 키입니다(중복 확인 `checkDuplicateContact`). 연락처는 코드에서 `normalizeContact()`로 숫자만 저장하는 방향으로 정리 중이며, 예전 데이터는 하이픈 포함으로 저장돼 있습니다. 조회는 `buildContactOrFilter`가 둘 다 찾습니다(코드 미확인 세부).

| 칼럼 | 의미 | 근거 |
|---|---|---|
| `customer_id` | PK | 전 구간 |
| `name` | 고객 이름. 기본값 "(인생비서)" 접두 사용 | `buildCustomerPayload` |
| `contact` | 연락처 | `buildCustomerPayload` |
| `telecom` | 고객의 현재 휴대폰 통신사 | `buildCustomerPayload` |
| `old_isp`, `old_tv_count` | 기존 인터넷 통신사, 기존 TV 대수 | `buildCustomerPayload` |
| `desired_product` | 희망 상품 ('인터넷' 또는 '인터넷,TV'). 상품이 있을 때만 갱신 | `buildCustomerPayload` |
| `notes` | 특이사항. `[YY-MM-DD HH:mm]` 한 줄씩 최신순 누적 | `prependNoteLine` |
| `next_contact_at` | 다음 연락 예정(=상담예약) 일시 | `buildCustomerPayload`, 예약 등록 |
| `customer_status` | 체계 A 고객 상태 | `changeStatus`, `S8_CUSTOMER_COLUMNS` |
| `consult_substatus` | 체계 A 상담중 부가표시 | 동일 |
| `status_reason` | 이탈·제외 사유 | 동일 |
| `funnel_status` | 구 퍼널 상태(호환용 기본값만 기록) | `memoRaw`, `buildCustomerPayload` |
| `consult_state` | 체계 B 상담 상태(상담대기/상담중/상담종료) | `stCustomerCols`, 대시보드 |
| `customer_segment` | 체계 B 고객 구분(가망/잠재 등, DB값은 `ST_SEG_DB`로 변환) | `stCustomerCols` |
| `exclude_reason`, `exclude_memo` | 제외 사유·메모 | `stCustomerCols` |
| `customer_tags` | 태그 배열(칼럼이 없으면 저장 생략) | `probeCustomerSchema` |
| `inflow_route` | 인입경로(전화인입/상담요청). 칼럼 없으면 저장 생략 | `probeCustomerSchema` |
| `proposal_snapshot` | 옛 제안 스냅샷(존재 확인만) | `probeCustomerSchema` |
| `consult_draft` | 상담 임시저장 JSON | `loadConsultDraft`, `saveConsultDraft` |
| `created_at`, `updated_at` | 생성·수정 시각. `updated_at`은 동시 수정 충돌 방지(낙관적 잠금)에도 사용 | `stSave`, 실적 조회 |

**읽는 곳 (주요)**
- HTML `checkDuplicateContact`(4144), `memoRaw`(4759, 예약 등록 시 중복 확인), `saveConsultation`(5233), `refreshAfterConsultStatus`(5001), `loadDashList`(5748), `loadRecentCustomers`(6517), 고객 검색 `nameRaw`(6587)·`contact`(8750), 가족 조회(8768), `openCustomerFromDash`(5884), `openCustomerByIdV2`(8092), 대시보드 `v2FetchNewDash`(2096)·`v2LoadCustStateList`(2376)·`v2FetchPerfNew`(2431)·`staleDays`(2012), 구 대시보드 `loadFunnelDashboard`(5520), 정산 `smFetchAll`(1666, 이름·연락처만)
- SVC `loadCustomerBundle`(480), 고객 목록 병합(553~574), `loadPerformanceData`(1785, `S8_CUSTOMER_COLUMNS`), `loadConsultDraft`(2188), `stLoad`(2352)

**쓰는 곳 (주요)**
- 생성: `saveConsultation`(5249), `memoRaw` 예약 등록(4771)
- 수정: `saveConsultation`(5248), `saveCustomerOnlyFromConsult`(4228), `setCustomerPatch`(7123), `prependNoteLine`(7079, `notes`만), `saveConsultDraft`(2202), 상태 저장 `stSave`·`changeStatus`(SVC, 상태 칼럼)
- 삭제: `deleteCustomer`(8448)

### 3.2 `customer_contacts` — 고객부재 재안내 컨택 기록 (1~3차)
**용도**: 부재 시 재안내 일정과 결과를 회차별로 관리. 한 고객의 같은 회차(`attempt_no`)는 1행입니다. 규칙값(3회, 3시간 간격, 근무시간 등)은 `config.js`의 `CONTACT_RULES`, 일정 계산은 `Calculator.js`(코드 미확인 세부).

| 칼럼 | 의미 |
|---|---|
| `id` | PK |
| `customer_id` | 고객 FK |
| `attempt_no` | 회차(1~3) |
| `scheduled_at` | 예정 일시 |
| `contacted_at` | 실제 컨택 일시 |
| `method` | 컨택 방법(전화/문자 등) |
| `result` | 결과(부재/연결 등) |
| `content` | 안내 내용 |
| `created_by` | 기록자 이메일 |

**사용처**: `renderContactSection`(7196), `applyContactCycle`(7215~7251, 다음 회차 자동 예약·삭제), `v2SyncAbsence`(7284), 컨택 저장(7339~7352), `autoStartContactCycle`(7389~7399), `resetContactHistory`(7421), 고객 삭제(8447), 고객조회 목록 보조 정보 `refreshListRowExtras`(6114).

### 3.3 `customer_products` — (레거시) 안내상품 표
**용도**: 옛 구조에서 고객별 안내상품(인터넷/TV/유심)을 행으로 저장. 새 구조는 `contracts`/`contract_items`/`contract_proposals`로 대체됐고, 전환이 끝날 때까지 남아 있습니다. 새 계약이 없는 고객은 이 표로 대체 표시합니다.
- 칼럼(코드 확인): `id`(PK), `customer_id`, `product_type`, `carrier`, `product_name`, `monthly_fee`, `gift_amount`, `commission`, `is_final`, `detail`
- 사용처: `renderGuidedProductTables`(6837), `renderCustomerProducts`(7040), 수정(7014), 삭제 `deleteGuidedProductRow`(7022), 목록 보조(6083, 6108), 고객 삭제(8446), 존재 확인 `probeCustomerSchema`(5159).
- **지우면 안 됩니다**(현재 코드가 참조).

### 3.4 `customer_status_logs` — (레거시) 상태 변경 로그
- 코드에서는 `probeCustomerSchema`(5167)가 존재 여부만 확인합니다. 새 이력은 `status_history`를 씁니다.
- 칼럼은 코드에서 확인되지 않았습니다(이전 설계: `customer_id`, `from_status`, `to_status`, `changed_at`, `changed_by` — 코드 미확인).

---

## 4. 계약·상품 테이블

### 4.1 `contracts` — 계약
**용도**: 상품 구성 단위의 계약. 상담 저장 시 생성됩니다(처음엔 `작성중`).

| 칼럼 | 의미 |
|---|---|
| `contract_id` | PK. 화면 표시는 `CT-0001` 형식(`formatContractNo`) |
| `customer_id` | 고객 FK |
| `seq` | 고객 안에서의 순번(새 계약 시 최대값+1) |
| `contract_type` | `'home'`(인터넷+TV) / `'usim'` |
| `label` | 계약 이름(자동 이름은 화면에서 숨김) |
| `linked_contract_id` | 유심 계약이 연결된 home 계약 ID |
| `contract_status` | 계약 상태. 처음 `작성중`. 접수대기·접수보류·접수완료가 "유치" 대상 |
| `status_reason` | 접수불가·취소 사유 |
| `received_at`, `received_at_source` | 최초 접수 시각(접수완료로 처음 바뀔 때만 기록, 이후 지우지 않음)과 출처(log/snapshot 등) |
| `install_scheduled_at` | 설치 예정일 |
| `external_ref` | 외부 참조번호 |
| `address_zip`, `address`, `address_detail` | 주소(인터넷·TV는 설치주소, 유심은 배송주소) |
| `contractor_name`, `contractor_relation` | 명의자, 관계 |
| `payment_method` | 납부방법 |
| `memo` | 메모 |
| `gift_total`, `gift_card`, `gift_cash`, `gift_extra` | 사은품 합계·상품권·현금·추가지급 |
| `commission_total` | 계약 수수료 합계 |
| `payout_status`, `payout_at` | 지급 상태·시각(계약 단위, 이전 구조) |
| `clawback_status`, `clawback_amount`, `clawback_reason` | 환수 상태·금액·사유(계약 단위) |
| `consult_snapshot` | 상담 상태 전체 JSON(추천/제안/최종 복원용). 목록에서는 제외하고 상세에서만 읽음 |
| `agency_id` | 에이전시 FK(`agencies`) |
| `settle_invoice_id` | 청구서 FK(`settlement_invoices`) |
| `source` | 'app' / 'legacy' / 'migrated' |
| `created_by`, `created_at`, `updated_at` | 생성자·시각 |

- 메타 수정 가능 칼럼 화이트리스트(`saveContractMeta`): 텍스트 `label, address_zip, address, address_detail, contractor_name, contractor_relation, payment_method, external_ref, clawback_reason, memo` / 숫자 `gift_total, gift_card, gift_cash, gift_extra, commission_total, clawback_amount` / 날짜 `install_scheduled_at`.
- 생성: `createContract`(SVC 917~952). 삭제: `deleteContract`(SVC 1070~1086; 유심 연결은 해제만).
- 읽기: `v_contract_overview`(목록), `loadListContracts`(HTML 5977), 정산 `smFetchAll`(1653: `contract_id, customer_id, gift_total, gift_card, gift_cash, gift_extra`), `s7LoadConsultTargets`(SVC 1376), `findHomeCandidatesForUsim`(SVC 2030), `computeContractCombo`(SVC 2215).
- 상태 변경: `changeStatus`(SVC 702~) → `contract_status`/`payout_status`/`clawback_status`, 이력은 `status_history`.

### 4.2 `contract_items` — 상품(인터넷/TV/유심 1줄)과 정산 정보
**용도**: 계약에 속한 상품 한 줄. 상품 상태, 지급·환수, 정산 정보가 모두 이 표에 있습니다. 표시 번호는 `IT-0001`(`formatItemNo`).

| 구분 | 칼럼 | 의미 |
|---|---|---|
| 식별 | `item_id`, `contract_id`, `customer_id` | PK, 계약·고객 FK |
| 상품 | `product_type` | `'internet'` / `'tv'` / `'usim'` |
| | `carrier`, `product_name`, `monthly_fee`, `commission` | 통신사, 상품명, 월요금, 수수료 |
| | `detail` | 선택 옵션·상담 스냅샷 JSON |
| 상태(구) | `progress_status` | 설치대기/설치완료/접수취소 등(옛 화면 호환 유지) |
| 상태(신) | `item_status`, `item_status_reason`, `item_status_memo` | 상품제안/접수보류/… 상태와 사유·메모 |
| | `cancel_reason` | 취소 사유(상담 저장으로 자동 취소된 것 구분용) |
| | `change_from_item_id` | 상품 변경 시 이전 상품 FK(자기참조) |
| 일시 | `proposed_at`, `first_received_at`, `installed_at` | 제안·최초 접수·설치 시각 |
| 지급 | `pay_status`, `paid_at` | 사은품 지급 상태·일시 |
| 환수 | `refund_status`, `refund_done_at` | 환수 상태·완료일 |
| 청구 | `pay_invoice_status` | 발행예정/발행완료/수금완료 |
| | `pay_invoice_date`, `pay_invoice_amount`, `pay_collect_date`, `pay_collect_amount` | 발행·수금 일자와 금액 |
| 정산 | `agency_id`, `agency_pick_type` | 담당 에이전시, 선택 방식('manual' 등) |
| | `settle_invoice_id` | 청구서 FK |
| | `settle_hold` | 정산 보류 여부 |
| | `settle_fee_override` | 수수료 총액 수기 입력(비우면 자동) |
| | `settle_gift_upper_amt/_status`, `settle_gift_lower_amt/_status` | 사은품 상·하 정산 금액과 상태 |
| | `settle_memo` | 정산 메모 |
| 기타 | `source` | 'app' / 'legacy' / 'migrated' |

**쓰는 곳**
- 상품 추가·수정·삭제: `addContractItem`(SVC 997), `saveContractItem`(SVC 1031: 통신사·상품명·월요금·수수료만), `deleteContractItem`(SVC 1054), 상담 저장 교체 `s7SaveContractItems`(SVC 1549~1603)
- 상태: `changeStatus`·`stSave`(SVC)
- 정산: HTML `smSaveRow`(1791), `smSetAgency`(1752), `smApplyDefaultAgency`(1614), `smCreateInvoice`(1838), `smSaveCollect`(1904), `smChangeState`(1946), `smSetInstall`(1932)

**읽는 곳**: 정산 `smFetchAll`(1645~1652), 대시보드(2013, 2097, 2206, 2432), 고객조회 `loadListContracts`(5985), 상담 복원 `findRegisteredByProposal`(SVC 1916), 유심 결합 확인(SVC 2032~2235), 실적 `loadPerformanceData`(SVC 1816, `S8_ITEM_COLUMNS`).

### 4.3 `contract_proposals` — 제안상품 스냅샷
**용도**: 상담 중 제안한 상품 묶음을 보관. 상담 저장 때마다 해당 계약의 기존 제안을 **전부 지우고 새로 넣는 방식**입니다(`s7ReplaceProposals`, SVC 1640~1660).
- 칼럼: `proposal_id`(PK), `contract_id`, `customer_id`, `product_type`, `carrier`, `product_name`, `monthly_fee`, `gift_amount`, `commission`, `source`, `detail`
- `detail` JSON 구조: `{ consultKey, isFinal, product }` (최종상품 여부 `isFinal`)
- 읽기: `loadCustomerBundle`(SVC 484), `loadListContracts`(HTML 5995, 제안만 있고 최종상품 없는 계약을 "제안 N건"으로 표시). 쓰기: `s7ReplaceProposals`, 연결 등록(SVC 1997).

### 4.4 `contract_gift_lines` — 사은품 줄
**용도**: 계약의 사은품을 줄 단위(인터넷/TV/추가지급/유심)로 관리. `saveContractGift`(SVC 2634)는 같은 `line_type` 줄을 삭제→삽입하고, 실패하면 백업으로 되돌립니다.
- 칼럼: `gift_line_id`(PK), `contract_id`, `customer_id`, `line_type`(`internet`/`tv`/`extra`/`usim`), `item_id`(선택), `card_amount`(상품권), `cash_amount`(현금), `amount`(=상품권+현금), `guide_min`, `guide_max`(경품고시 하·상한), `guideline_id`(FK `gift_guidelines`), `is_legacy`(이전 데이터 줄 여부), `memo`
- 읽기: `loadContractGift`(SVC 2621), 정산 `smFetchAll`(HTML 1655, 상품별 사은품 합계는 `amount`, 상품권/현금은 `line_type != 'extra'`만 합산)

### 4.5 `contract_fee_lines` — 상품별 수수료 내역 (읽기 전용)
- 정산 화면이 상품별 수수료를 낼 때 **우선 사용**합니다. 이 줄이 없으면 `contract_items.commission`을 씁니다(수수료 원천 표시: "수수료 내역" 또는 "상품 수수료").
- 칼럼(코드 확인): `contract_id`, `item_id`(없으면 계약 대표 상품에 귀속), `fee_type`(`internet`/`tv`/`bundle`/`add_tv`/`usim…`/기타), `amount`
- 읽기: `smFetchAll`(HTML 1654). **이 3개 파일에는 쓰는 코드가 없습니다**(DB 쪽에서 채워짐 — 코드 미확인).

### 4.6 `status_history` — 상태 변경·메모 이력
**용도**: 고객·계약·상품의 모든 상태 변경과 상담 메모를 한 표에 기록합니다. `changeStatus`는 **이력을 먼저 저장하고, 실패하면 상태를 바꾸지 않으며**, 상태 갱신이 실패하면 방금 넣은 이력을 지웁니다.

| 칼럼 | 의미 |
|---|---|
| `history_id` | PK |
| `customer_id` | 고객 FK(필수) |
| `contract_id`, `item_id` | 관련 계약·상품(선택). 고객 수준 이력은 둘 다 비움 |
| `event_type` | `'status_change'` 또는 `'memo'` |
| `target_type` | `'customer'` / `'contract'` / `'item'` |
| `axis` | 어떤 축의 변경인지(status, substatus, payout, clawback, progress, customer_segment 등) |
| `from_value`, `to_value` | 이전·이후 값 |
| `reason`, `note` | 사유, 메모 |
| `changed_by` | 변경자 이메일(자동 변경은 '시스템') |
| `source` | 'app' |
| `changed_at` | 변경 시각(DB 기본값) |

- 쓰기: `changeStatus`(SVC 807), `s6WriteHistory`(SVC 911), 상태 규칙 저장 `stSave`(SVC 2433), 변경 메모 `s7WriteChangeMemo`. 삭제: 계약·고객 삭제 시 정리(SVC 1111), 되돌리기.
- 읽기: `loadCustomerBundle`(SVC 485).

---

## 5. 정산 테이블

### 5.1 `settlement_invoices` — 에이전시 청구서(세금계산서)
- 칼럼: `invoice_id`(PK), `agency_id`, `issue_date`, `memo`, `supply_amount`(공급가), `vat_amount`(세액, 공급가×10%), `total_amount`, `collect_status`(수금예정/수금완료), `expected_collect_date`, `collect_date`, `collect_amount`, `updated_at`
- 생성: `smCreateInvoice`(HTML 1834). 선택한 상품들의 `settle_invoice_id`를 연결하고, 연결 실패 시 청구서를 되돌려 삭제합니다.
- 수금 처리: `smSaveCollect`(1899~1904). 수금완료이면 연결된 상품의 `pay_invoice_status`를 '수금완료'로.
- 삭제: 연결 해제 후 삭제(1917~1919). 상태 변경 시 남은 상품으로 금액 재계산(`smChangeState` 1949~1950).

### 5.2 `agencies` — 에이전시(대리점) 정보
- 기본키는 에이전시 이름 문자열 `agency_id`(예: '티인포', '티코디', '백메가'). 코드는 `agency_id`, `agency_name`, `name`, `id` 중 있는 것을 기준 키(`SM.agKey`)로 사용.
- 칼럼(코드 확인): `agency_id`, `agency_name`, `description`(취급 통신사 설명), 사업자 정보 `biz_no`, `ceo_name`, `biz_address`, `biz_type`, `biz_item`, `tax_email`, `contact_name`, `contact_phone`, `biz_memo`
- 읽기 `smFetchAll`(1671), 수정 `smSaveAgency`(1977). 테이블을 못 읽으면 코드에 내장된 3개 에이전시(`SM_AG_FALLBACK`)로 대체 표시합니다.
- `contracts.agency_id`, `contract_items.agency_id`, `settlement_invoices.agency_id`, 청구서 등이 참조하므로 **삭제 금지**.

---

## 6. 수수료 테이블 — 가장 중요

### 6.1 구조 한눈에
```
추천/제안/최종 상품 화면  ──lookupCommission(SVC 231)──►  fee_rates  (인터넷·TV 수수료)
                                      └──settopFeeOf(SVC 181)──►  fee_settop (셋탑·추가 셋탑)
수수료 탭 (view-fee)  ──feeLoad/feeEdit(HTML 8974/9092)──►  fee_rates  (같은 데이터를 보고 수정)
LG헬로비전 수수료  ──computeHelloCommission(CALC 185)──►  코드에 고정된 표 (DB 아님)
유심 수수료  ──getUsimCommission / USIM_COMMISSION_BANDS(CALC 522~)──►  코드에 고정된 구간표 (DB 아님)
```

### 6.2 `fee_rates` — 에이전시별 인터넷·TV 수수료
**용도**: 에이전시(티코디·티인포·백메가) × 통신사 × 인터넷 속도 × TV 요금제 조합별 수수료. 정책표가 바뀌면 이 표의 값을 고칩니다.

| 칼럼 | 의미 |
|---|---|
| `agency` | 에이전시 이름('티코디', '티인포', '백메가') |
| `carrier_key` | 통신사 키: `kt`, `sky`, `lg`, `lgsoho`, `skb`, `skt` |
| `carrier_name` | 표시 이름(KT, 스카이라이프, LG, LG소호, SKB, SKT) |
| `internet_speed` | `'none'`, `'100'`, `'500'`, `'1000'` (200M 등은 없음) |
| `tv_plan` | `'none'` 또는 정책표 요금제명(예: KT `TV베이직`, SKB `이코노미`) |
| `internet_fee` | 인터넷 수수료(같은 통신사·속도의 모든 TV 줄에서 같은 값) |
| `tv_fee` | TV 수수료(정책표의 TV 기본+결합+추가 합계) |
| `total_fee` | 자동 계산 칼럼(`internet_fee`+`tv_fee`). **입력하면 안 됨** |
| `sort_order` | 정렬 번호 = 통신사순번×1000 + 속도순번×100 + (TV 요금제 순번+1) |
| (선택) `policy_date`, `updated_at` | 정책표 적용일, 마지막 수정 시각 — 날짜 기능용 SQL을 실행한 경우에만 존재 |

- 유일 키: (`agency`, `carrier_key`, `internet_speed`, `tv_plan`) — 수수료 탭이 `upsert`할 때 `onConflict`로 사용.
- **행 구조 규칙** (통신사마다 동일):
  1. 인터넷 단독: `internet_speed`=100/500/1000, `tv_plan`='none' → `internet_fee`만 값, `tv_fee`=NULL
  2. 인터넷+TV: 속도 × 요금제 → `internet_fee`(인터넷 단독과 같은 값), `tv_fee`
  3. TV 단독: `internet_speed`='none', 요금제별 → `internet_fee`=NULL, `tv_fee`만 값
  4. 정책표에 없는 칸은 추측하지 않고 NULL. NULL이면 그 에이전시는 비교·계산에서 빠짐(0원 취급 안 함)
- **VAT 기준**: KT만 부가세 포함 금액으로 입력, 나머지는 공급가(부가세 별도).
- **에이전시↔통신사 담당**: 티코디 = KT·스카이라이프, 티인포 = LG·LG소호·SKB·SKT, 백메가 = 전체 통신사(비교 대상).
- **추천상품은 백메가 값만** 사용: `RECO_FEE_AGENCY = '백메가'`(HTML 2640)를 `lookupCommission`의 `onlyAgency`로 전달(HTML 3057). 백메가 값이 비어 있으면 0원 + "미입력" 표시.
- **화면 TV 등급 → `tv_plan` 연결표** `FEE_TIER_PLAN`(SVC 193). 요금제 이름을 바꾸거나 연결을 바꿀 때는 이 표만 고칩니다.

  | 통신사 | 저가형(low) | 기본형(basic) | 고급형(premium) |
  |---|---|---|---|
  | kt | TV베이직 | TV에센스 | 모든G |
  | sky | IPTV 베이직 | IPTV 플러스 | IPTV 플러스 |
  | lg | TV실속형 | TV실속형 | TV프리미엄 |
  | lgsoho | 소호TV(실속형) | 소호TV(실속형) | 소호TV(프리미엄) |
  | skb | 이코노미 | 스탠다드 | 올 |
  | skt | 이코노미 | 스탠다드 | 올 |

  (LG소호는 프리미엄 구분이 없어 `소호TV(프리미엄)` 행에 `소호TV(실속형)`과 같은 금액을 복사해 둡니다.)
- **계산 로직** `feeRatesCandidates`(SVC 206): 에이전시별로 인터넷 수수료 = (선택 요금제 줄의 `internet_fee`, 없으면 `tv_plan='none'` 줄의 `internet_fee`), TV 수수료 = 선택 요금제 줄의 `tv_fee`. 필요한 값이 비면 그 에이전시는 비교에서 제외. 에이전시가 여럿이면 합계가 가장 큰 곳을 선택(`pickBestCommission`).
- **합계** `lookupCommission` 결과 `totalComm` = 인터넷 + TV + 셋탑 + 추가 셋탑.
- **읽기 시점**: `feeLoad()`(HTML 8974)가 한 번 읽어 `FEE.rows`에 보관하고, 이후 새로고침 전까지 재사용합니다. 추천상품은 `loadFinanceData`(SVC 317)에서 `feeLoad()`를 불러 같은 데이터를 씁니다.
  - 수수료 탭에서 고치면 `FEE.rows`와 DB가 같이 바뀌어 추천상품에 즉시 반영됩니다(`feeEdit` 후 `renderRecoCards`).
  - Supabase에서 SQL로 직접 고치면 **브라우저 새로고침(F5) 후** 반영됩니다.
  - 이미 저장된 계약·제안의 수수료(`contract_items.commission`, `contracts.commission_total`, `contract_proposals.commission`)는 저장 당시 값이라 바뀌지 않습니다.
- 수수료 탭: `feeLoad`(8974), `feeRender`(9008), `feeEdit`(9077~9092). 로그인한 사용자만 값 확인·수정 가능.

### 6.3 `fee_settop` — 셋탑 수수료
- 칼럼(코드 확인): `carrier`, `agency`, `settop_name`, `kind`(`'main'` 메인 셋탑 / `'extra'` 2대째 이후 추가 셋탑), `commission_amount`, `start_at`. (select '*'이므로 이외 칼럼 가능)
- 읽기: `loadSettopCommissions`(SVC 172). 조회 `settopFeeOf`(SVC 181): 통신사·에이전시·셋탑 이름·종류가 모두 일치하는 행 중 `start_at`이 지난 가장 최근 행(`pickLatestRow`)의 `commission_amount`.
- 비어 있으면 셋탑 수수료는 0원("–" 표시). `fee_rates`와 별개이며 **fee_rates를 갱신해도 바뀌지 않습니다**.

### 6.4 고정(하드코딩) 수수료 — DB 아님
- **LG헬로비전**: `computeHelloCommission(speed, tvTier, variant)`(CALC 185). 2026-10-22 정책표 기준. `lookupCommission`을 감싸는 `helloWrappers`(HTML 2595)가 통신사 `hello`일 때 이 함수를 대신 호출. 화면에 "2026-10-22 표 기준 · 서브TV 인센·결합 수수료 미반영" 안내.
- **유심 수수료**: `USIM_COMMISSION_BANDS`(CALC 526)의 요금제 구간표와 `getUsimCommission`(CALC 559). 주석상 원래는 `carrier_commissions`(product_type=USIM_MOBILE)의 `dongpan_fee`를 반영한 값. 에이전시별 구간표를 쓰려면 `USIM_COMMISSION_BY_AGENCY`(SVC 155)에 넣으면 되며 지금은 null(단일 표).

### 6.5 `install_fees`, `install_fee_options` — 설치비(출동비) 안내
- 로그인 없이 조회. `loadInstallFees`(HTML 1313)가 두 표를 `select('*')`로 읽고 메모리에 보관.
- `install_fees` 칼럼(코드 확인): `carrier_id`(KT/SKB/SKT/SKY/LGsoho/LG홈), `cond_key`(`internet_only`/`tv1`/`tv2`), `phone_type`(`'none'` 사용), `weekday_fee`(평일), `offday_fee`(주말·야간), `start_at`, `end_at`(유효기간)
- `install_fee_options` 칼럼(코드 확인): `carrier_id`, `option_code`(`'iptv_add'`), `weekday_fee`, `offday_fee`, `start_at`, `end_at`
- 규칙(`lookupInstallFee`, HTML 1337): TV 3대 이상 = TV 2대 값 + `iptv_add` × (대수−2). 값이 없으면 추측하지 않고 해당 줄을 숨김. 전화·LG헬로비전 값은 DB에만 두고 화면에서는 쓰지 않음.
- `carriers` 표를 FK로 참조(`carrier_id`)하므로 `carriers`는 삭제 금지.

---

## 7. 상품·요금 마스터 테이블

앱이 시작할 때 `loadData()`(SVC 57)가 3개 표를 한꺼번에 읽어 `DATA` 객체를 만듭니다. 통신사 이름은 `carrierKeyOf()`로 내부 키(kt/lg/skb/skt/sky…)로 바꿉니다.

| 테이블 | 읽는 칼럼 | 용도 |
|---|---|---|
| `internet_plans` | `carrier`, `speed`, `monthly_fee`, `router_fee` | 인터넷 속도별 월요금, 공유기 요금 |
| `tv_plans` | `carrier`, `plan_name`, `monthly_fee`, `channel_count` | TV 요금제. 이름 문자열로 저가형/기본형/고급형에 매핑(통신사별 규칙: KT 베이직/에센스/모든G, LG 실속형/기본형/프리미엄, SKB·SKT 이코노미/스탠다드/All, SKY 베이직/플러스) |
| `settop_boxes` | `carrier`, `model_name`, `monthly_fee` | 셋탑 모델과 월요금 |
| `usim_plans` | `carrier`(망: SKT/KT/LG), `plan_name`, `monthly_fee`, `data_allowance`, `is_active` | 추천상품 유심 요금제 목록(`fetchRecoUsimPlans`, HTML 3234). `is_active=true`만, 월요금 구간 필터 |
| `carrier_promotions` | `carrier`, `speed`, `tv_tier`, `gift_card`, `cash_amount`, `max_promo_limit` | 사은품 기본값(상품권·현금·최대). `loadFinanceData`(SVC 322~365). 행이 없으면 코드 기본값(상품권 60,000 / 현금 380,000 / 한도 440,000) |

- 이 5개 표는 읽기 전용입니다(앱에서 수정하지 않음).
- (참고) `loadFinanceData` 안의 `COMMISSION_DATA`/`RAW_COMMISSION_DATA`는 예전 수수료 표를 읽던 흔적으로, 현재는 비어 있는 값으로 초기화될 뿐 수수료 계산에 쓰이지 않습니다.

## 8. 설정 테이블

- `crm_settings`(`key`, `value`): 상태 규칙의 설정값. `stLoadCfg`(SVC 2302)가 읽는 키 — `segment_months`(고객 구분 기준 개월 수, 기본 3), `proposal_stale_days`(제안 후 방치 일수, 기본 7). 못 읽으면 기본값 사용(`absenceLimit` 3은 코드 고정).

---

## 9. 뷰와 RPC

| 이름 | 읽는 칼럼 | 용도 / 사용처 |
|---|---|---|
| `v_customer_overview` | `customer_id`, `is_acquired`(유치 여부), `open_payout_count`, `unpaid_contract_count`, `open_clawback_count` (+ 고객 칼럼) | 고객별 계약 집계. 고객 목록 병합(SVC 553~574), 구 대시보드(HTML 5521), 실적(SVC 1799) |
| `v_contract_overview` | `contract_id, customer_id, seq, contract_type, label, linked_contract_id, contract_status, effective_status, status_reason, received_at, received_at_source, install_scheduled_at, external_ref, gift_total/card/cash/extra, commission_total, payout_status, payout_at, clawback_status/amount/reason, item_count, canceled_item_count, is_acquired, source, created_at, updated_at` (`S2_CONTRACT_LIST_COLUMNS`) | 계약 목록. `loadContractOverviewList`, 구 대시보드(HTML 5522), `loadCustomerBundle`(SVC 482). `consult_snapshot`은 목록에서 제외 |
| `v_contract_state_v2` | `contract_id`, `contract_state` | 체계 B 계약 상태 계산값. 새 대시보드(HTML 2207, 2433) |
| `v_gift_guideline` | `select('*')`(칼럼 코드 미확인) | 경품고시 가이드(21행 안팎, 상품·상황별 최소·최대). `loadGiftGuidelines`(SVC 2609). 원본은 `gift_guidelines`(추정) |
| `v_metric_acquisition` | `select('*')`(코드 미확인) | 새 대시보드 유치 지표(HTML 2098) |
| `v_metric_settlement_items` | `item_id, contract_id, customer_id, agency, received_date, fee_total, gift_total, expected_amt, profit, invoice_state, is_cancelled` | 유치·정산 지표와 목록(HTML 2141, 2193) |
| RPC `search_customers_by_family_contact` | (인자·반환 코드 미확인) | 가족 연락처로 고객 검색(고객 조회·상담 화면) |

- 뷰는 `security_invoker`로 만들어 RLS를 따릅니다(설계 방침, 코드 미확인).

---

## 10. 화면별 DB 접근 요약

| 화면 | 읽는 것 | 쓰는 것 |
|---|---|---|
| 대시보드 | customers, contract_items, v_metric_acquisition, v_metric_settlement_items, v_contract_state_v2, v_customer_overview, v_contract_overview | — |
| 고객조회 | customers, v_customer_overview, v_contract_overview, contracts, contract_items, contract_proposals, (구) customer_products, customer_contacts, RPC | customers(수정·삭제), contracts·status_history(삭제 시) |
| 고객상담 | customers, contracts, contract_items, contract_proposals, contract_gift_lines, status_history, fee_rates, fee_settop, install_fees, install_fee_options, internet_plans, tv_plans, settop_boxes, usim_plans, carrier_promotions, crm_settings, v_gift_guideline | customers, contracts, contract_items, contract_proposals, contract_gift_lines, status_history, customer_contacts |
| 수수료 탭 | fee_rates | fee_rates (upsert) |
| 정산 | contract_items, contracts, contract_fee_lines, contract_gift_lines, customers, settlement_invoices, agencies | contract_items(정산 칼럼), settlement_invoices, agencies |
| 필수안내 | 없음 | 없음 |

### 상담 저장 경로 요약 (`saveConsultation`, HTML 5206~)
1. `customers` 생성/수정(`buildCustomerPayload`)
2. 기존 고객이면 `s7LoadConsultTargets`로 계약·상품 찾기
3. `contracts` 생성/갱신(`createContract`, `consult_snapshot` 저장) → `contract_items` 교체(`s7SaveContractItems`; 접수 이후 계약은 바뀐 값을 `status_history` 메모로 남김) → `contract_proposals` 교체(`s7ReplaceProposals`) → 사은품은 `saveContractGift`
4. 상품이 새로 생기면 `statusAfterProductAdded`로 고객 상담 상태를 자동 조정(상담대기→상담중)
- 새 상품 수수료는 `homeCommissionOf(item)`→`lookupCommission`(`fee_rates` 백메가 기준)으로 계산해 `commission`에 저장합니다. 로그인 전에는 null.

---

## 11. DB에 있지만 이 3개 파일이 쓰지 않는 테이블

외래키 조회 등으로 DB에 있는 것이 확인됐으나 코드에서 읽거나 쓰지 않는 것들입니다(**삭제 전 다른 파일·뷰·외부 도구 의존성 확인 필요**).

| 이름 | 상태 |
|---|---|
| `fee_internet`, `fee_tv`, `fee_usim`, `fee_extra`, `plans_internet`, `plans_tv`, `plans_usim` | 새 수수료 구조를 시도하며 만든 표. 현재 `fee_rates`로 대체. 2026-11-02에 `zz_old_20261102_` 접두사로 이름을 바꿔 보관 중(삭제 대기) |
| `carrier_commissions` | 옛 수수료 표. 코드에는 주석으로만 등장 |
| `rental_models`, `rental_plans`, `rental_plan_prices`, `rental_commissions`, `rental_gifts`, `rental_compensations`, `rental_combo_discounts` | 렌탈 상담 화면(현재 빈 MVP)용으로 보이는 표. 렌탈을 만들 계획이면 유지 |
| `gift_guidelines` | `contract_gift_lines`가 참조. `v_gift_guideline`의 원본으로 추정 |
| `carriers` | `install_fees`, `install_fee_options`가 참조. 유지 |
| `profiles`, `login_logs` | Supabase Auth(`auth.users`)를 참조하는 사용자·로그인 기록용(코드 미확인) |
| `pm_progress_status` | 코드 미참조(다른 프로젝트용으로 추정) |

---

## 12. 확정 스키마 확보용 쿼리 (Supabase SQL Editor)

```sql
-- 모든 테이블·뷰의 칼럼, 자료형, NULL 허용, 기본값
select table_name, ordinal_position as 순서, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 기본키·유일키·외래키·CHECK 제약
select conrelid::regclass as 테이블, contype as 종류, conname, pg_get_constraintdef(oid) as 정의
from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2;
```
이 결과를 이 문서의 3~8장 칼럼 표에 합치면 자료형·제약까지 완전한 문서가 됩니다.

---

## 13. 자주 나오는 질문과 답 (규칙 요약)

- **Q. 추천상품의 수수료는 어디서 오나?** `fee_rates`의 `agency='백메가'` 행(`internet_fee`, `tv_fee`) + `fee_settop`의 셋탑 수수료. LG헬로비전·유심은 코드 고정표.
- **Q. 정책표가 바뀌면?** `fee_rates` 값을 고친다(수수료 탭에서 입력하거나 SQL upsert). `total_fee`는 넣지 않는다. 표에 없는 칸은 NULL. 새로고침 후 모든 화면에 반영.
- **Q. 화면의 "저가형/기본형/고급형"은 어떤 요금제인가?** `FEE_TIER_PLAN`(SVC 193) 참조.
- **Q. 새 통신사나 새 요금제를 추가하려면?** `fee_rates`에 행을 넣고, HTML의 `FEE_CARRIERS`(통신사·요금제 목록), SVC의 `FEE_TIER_PLAN`, `feeRatesCarrierKey`를 함께 고쳐야 한다. `internet_plans`, `tv_plans`에도 요금제를 추가.
- **Q. 계약 상태를 직접 UPDATE해도 되나?** 안 된다. 반드시 `changeStatus`/`statusApply`를 거쳐 `status_history`에 이력을 남긴다.
- **Q. 접수된 계약의 상품을 바꾸면?** `s7SaveContractItems`가 바뀐 값을 `status_history` 메모로 먼저 남기고 수정한다. 접수 이후에는 상품을 삭제하지 않고 취소 처리한다.
- **Q. 고객을 삭제하면?** `deleteCustomer`(HTML 8448)가 `customer_products`, `customer_contacts`, 새 구조 데이터(`status_history`, `contracts` 등)를 먼저 지운다. 접수·지급 상태가 있는 계약이 있으면 삭제를 막는다(`checkCustomerDeletable`, SVC 1097).
- **Q. 정산 수수료는 어떻게 계산되나?** 상품별로 `contract_fee_lines` 합계가 있으면 그 값, 없으면 `contract_items.commission`. `settle_fee_override`가 있으면 그 값이 최종. 청구서는 공급가 합계 × 10% 부가세.
- **Q. 로그인하지 않으면?** 계약·상품·수수료 데이터는 읽을 수 없고 화면에서 수수료·마진이 숨겨진다. 설치비 표만 예외.
- **Q. 연락처는 어떤 형식으로 저장하나?** 코드는 숫자만 저장하도록 정규화하지만 예전 데이터는 하이픈 포함. 조회는 두 형식 모두 찾는다.
