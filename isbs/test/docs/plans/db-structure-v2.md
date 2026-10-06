# 상품·수수료·에이전시 DB 구조 확정안 v2 (추가만 · 기존 유지)

> **상태: 확정 (2026-10-06)** — 2장 목록 + 3장 a~g + 4장 답변 반영. 확정 후 변경 사항은 `db-redesign-log.md` 이력에 남깁니다.

- 작성: 2026-10-06 · 근거: 실제 DB 조회 결과(`01a_inspect_schema` 실행 결과) + 계획서 결정 D1~D12
- 확정되었으므로 `db-redesign-log.md`의 단계 순서대로 SQL을 하나씩 드립니다.
- 원칙: 기존 테이블·칼럼은 이름·타입을 바꾸지 않습니다. 새 테이블과 새 칼럼(비워둘 수 있음)만 추가합니다.

## 1. 조회로 새로 알게 된 사실

| # | 사실 | 영향 |
|---|---|---|
| 1 | 구 수수료 `carrier_commissions`(246행)는 **한 행에** 통신사·속도·TV등급·인터넷/TV/추가TV/기타 수수료·에이전시(`agency_name`, 기본값 'A')가 함께 있음 | 새 구조에서 인터넷·TV로 나눌 때 속도×TV등급 조합을 풀어야 함 |
| 2 | 화면이 부르는 `get_admin_commissions`는 **에이전시·인터넷수수료·TV수수료를 돌려주지 않음**(13개 칼럼만) | 지금 화면은 에이전시를 알 수 없음 → **새 조회 함수가 꼭 필요** (구 함수는 그대로 둠) |
| 3 | `fee_internet`·`fee_tv`·`fee_usim`의 에이전시 연결에 **이름 변경 연쇄(ON UPDATE CASCADE)가 없음** | `티코드→티코디`는 값만 바꾸면 오류 → "새 행 추가 → 수수료 옮기기 → 옛 행 삭제" 순서로 |
| 4 | `fee_*`의 `agency_id`는 비워둘 수 있고, 통신사 일치·기간 겹침을 막는 제약이 없음 | 데이터 정리 후 제약 강화 단계에서 처리 |
| 5 | `fee_internet`은 이미 `internet_id`(→`plans_internet`)가 있고, `fee_tv`에는 `tv_id`만 있어 **속도 정보가 없음** | `fee_tv`에 기준 인터넷 상품 칼럼 추가(D2) |
| 6 | `fee_tv`에 `tv_fee`·`add_tv_fee`·`bundle_fee`가 이미 있음 | 결합·추가TV 수수료는 **새 칼럼 없이** 이걸 사용 |
| 7 | `fee_usim`은 0행, `plans_usim`은 구 `usim_plans`와 같은 76행. 구 수수료의 `standalone_fee`=유심 단독 가입, `dongpan_fee`=인터넷+유심 같이 가입 기준(사용자 확인) | 유심 수수료는 요금제 단위로, **단독·동판 두 금액**을 담아야 함. 현재 앱 구간표(`USIM_COMMISSION_BANDS`)는 동판 금액을 사용 중 |
| 8 | `plans_internet.speed`는 문자('100','500','1g'), `plans_tv.tv_tier`는 필수 칼럼 | 속도는 옆에 숫자 칼럼 추가, TV 등급은 값만 정리 |
| 9 | 조회 결과의 `policies`가 비어 있음 | RLS(행 보안) 켜짐 여부는 `01a2_check_rls.sql`로 별도 확인 |
| 10 | `contracts`에는 `commission_total`(합계 하나)만 있고 에이전시 칼럼 없음. `UNIQUE(contract_id, customer_id)`가 이미 있어 새 테이블이 참조하기 좋음 | `contracts` 보강 |

## 2. 추가할 것 (이 목록을 확정해 주세요)

### 2.1 새 테이블 4개

**`carriers`** — 표준 통신사 6개
| 칼럼 | 타입 | 설명 |
|---|---|---|
| `carrier_id` (PK) | varchar | KT · LG홈 · LGbiz · SKB · SKT · SKY |
| `carrier_name` | varchar | 화면 표시명 |
| `aliases` | text[] | 옛 표기(`LG`·`LGBIZ`·`SKYLIFE`·`skylife`…) — 데이터 정리 때 변환표로 사용 |
| `sort_order` | int | 화면 순서 |
| `is_active` | boolean(기본 true) | |
| `created_at` | timestamptz(기본 now()) | |

**`plans_settop`** — 셋톱박스(구 `settop_boxes` 24행 이관용)
| 칼럼 | 타입 | 설명 |
|---|---|---|
| `id` (PK) | varchar | 예: `stb_kt_01` (다른 `plans_*`와 같은 문자 id 방식) |
| `carrier` | varchar, 필수 | |
| `model_name` | varchar, 필수 | |
| `monthly_fee` | int(기본 0) | |
| `is_active` | boolean(기본 true) | |
| `legacy_id` | int | 구 `settop_boxes.id` (대조용) |
| `created_at`·`updated_at` | timestamptz | |

**`fee_extra`** — 기타 수수료(가전렌탈 등)
| 칼럼 | 타입 | 설명 |
|---|---|---|
| `id` (PK) | bigint 자동증가 | |
| `agency_id` | varchar, 필수 | → `agencies` |
| `carrier` | varchar, 필수 | |
| `target_type` / `target_id` | varchar | 적용 대상(internet·tv·usim·전체 / 상품 id) |
| `fee_name` | varchar, 필수 | 항목명 |
| `condition_text` | text | 지급 조건 |
| `amount` | numeric(기본 0) | |
| `start_at`·`end_at` | timestamptz | 적용 기간 |
| `created_at`·`updated_at` | timestamptz | |

**`contract_fee_lines`** — 계약별 수수료 줄 내역(정산·환수 기준)
| 칼럼 | 타입 | 설명 |
|---|---|---|
| `line_id` (PK) | bigint 자동증가 | |
| `contract_id` + `customer_id` | bigint, 필수 | → `contracts(contract_id, customer_id)`, 계약 삭제 시 함께 삭제 |
| `item_id` | bigint | → `contract_items`, 상품 단위일 때만 |
| `fee_type` | text, 필수 | internet · tv · bundle · add_tv · usim_dongpan · usim_standalone · other (유심은 인터넷과 같이 가입하면 `usim_dongpan`, 유심만 가입하면 `usim_standalone`) |
| `amount` | int, 필수 | |
| `source_table` / `source_id` | text | 어느 수수료 행에서 가져왔는지 |
| `calculated_at` | timestamptz | |
| `is_manual` | boolean(기본 false) | 직접 수정 여부 |
| `memo` | text | |

### 2.2 기존 테이블에 칼럼 추가 (모두 비워둘 수 있음 · 기존 행 영향 없음)

| 테이블 | 새 칼럼 | 설명 |
|---|---|---|
| `contracts` | `agency_id` varchar → `agencies` (이름 변경 연쇄) | 접수 에이전시(한 계약 = 한 에이전시) |
| `contracts` | `agency_pick_type` text (`auto`·`manual`만 허용) | 자동 추천인지 직접 선택인지 |
| `fee_tv` | `internet_id` varchar → `plans_internet` | TV 수수료의 기준 인터넷 상품(속도에 따라 달라지므로) |
| `plans_internet` | `speed_num` int, `legacy_id` int | 숫자 속도(100·500·1000), 구 `internet_plans.id`(대조용) |
| `plans_tv` | `legacy_id` int | 구 `tv_plans.id`(대조용) |
| `agencies` | `is_active` boolean(기본 true), `sort_order` int | 사용 여부·표시 순서 |
| `fee_usim` | `usim_fee_dongpan` numeric(기본 0) | **동판**(인터넷+유심 같이 가입) 기준 유심 수수료. 기존 `usim_fee`는 **단독**(유심만 가입) 수수료로 사용 |
| `fee_internet`·`fee_tv`·`fee_usim` | `remarks` text | 구 `carrier_commissions.remarks`(비고)를 옮길 자리 |

### 2.3 이번에 바꾸지 않는 것
- 구 상품·수수료 7개 테이블과 `get_admin_commissions`
- `fee_*`·`plans_*`의 기존 칼럼 이름·타입, `carrier_promotions`(사은품: 통신사 기준 유지)
- `NOT NULL`·외래키·유일/겹침 방지 제약 강화 → **데이터를 넣고 정리한 뒤** 별도 단계(3단계)에서

## 3. 제가 정한 것 (다르게 하고 싶으면 알려 주세요)

| # | 내용 | 이유 |
|---|---|---|
| a | 속도는 기존 `speed`(문자)를 두고 옆에 `speed_num`(숫자)을 추가 | 기존 칼럼 유지 원칙. 앱 전환 후 옛 칼럼 정리 |
| b | TV 등급은 새 칼럼 없이 `tv_tier` **값**만 정리(`none/low/basic/high/premium`, 옛 `premium→high` 먼저, 그다음 `premium+→premium`) | `plans_tv`가 4행뿐이고 칼럼 변경이 아니라 값 정리라서 |
| c | `legacy_id` 추가 | 구 테이블과 신규 테이블의 금액을 행 단위로 대조하기 위해 |
| d | 결합·추가TV 수수료는 `fee_tv`의 기존 칼럼 사용 | 확인된 사실 6 |
| e | 유심 수수료는 요금제 단위(`fee_usim`). **단독 = `usim_fee`, 동판 = `usim_fee_dongpan`**. 어느 쪽을 쓸지는 계약 구조로 판단(`contracts.linked_contract_id`가 있으면 인터넷과 같이 가입 = 동판, 없으면 단독) → 새 칼럼 필요 없음 | 확인된 사실 7 |
| f | 한 계약 = 한 에이전시, 자동 선택은 총수수료 최대 | 계획서 기본값 |
| g | 통신사 일치(`carriers` 참조)·`agency_id` 필수는 데이터 정리 후 제약으로 | 지금 걸면 기존 시험 데이터가 걸림 |

## 4. 답변 기록 (2026-10-06)

| # | 질문 | 답 | 반영 |
|---|---|---|---|
| Q1 | `standalone_fee`·`dongpan_fee`의 의미 | 단독 = **유심 단독 가입**, 동판 = **인터넷과 유심 같이 가입** 기준 | `fee_usim`에 `usim_fee_dongpan` 추가(2.2), `contract_fee_lines.fee_type`에 `usim_standalone`·`usim_dongpan` 구분(2.1) |
| Q2 | `remarks` 새 테이블에 둘지, 유지기간 | 제안대로: `remarks`만 `fee_internet`·`fee_tv`·`fee_usim`에 추가, `min_retention_period`(유지기간)는 가져오지 않음 | 2.2 `remarks` 행 |
| Q3 | 2장 목록·3장 a~g 이의 | 이의 없음으로 보고 확정(사용자가 "제안대로 진행"이라고 답함) | 문서 상태 = 확정 |
