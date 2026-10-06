# 상품·수수료·에이전시 DB 개편 — 진행 로그 (누적)

- 이 파일은 **누적 기록**입니다. 이력(4장)은 위에서 아래로 **추가만** 하고 지우지 않습니다. 단계가 끝날 때마다 2장 체크 표시와 4장 이력을 갱신합니다.
- 기준 문서: 계획서 `db-redesign-plan_1002_P1.md`(결정 D1~D12), 인수인계서 2026-10-06, 구조 확정안 `db-structure-v2.md`
- 방침(2026-10-06 사용자): **기존 테이블·칼럼은 유지하고 신규 테이블·칼럼만 추가**한다. 구조 확정 → 데이터 넣기 → 화면 계산식 수정 순서로 간다.
- 우선순위(2026-10-06 사용자): **테이블·칼럼 구조가 먼저, 권한 설정은 그 다음.** 단, 새 테이블은 만들 때 `enable row level security` 한 줄만 함께 넣어 기본 잠금 상태로 둔다(규칙은 나중에).
- 규칙: SQL은 작성만 하고 실행은 사용자가 Supabase SQL Editor에서 한다 · 한 번에 한 단계 · 합격 기준을 확인한 뒤 다음 단계 · 테스트 데이터는 `(인생비서)테스트`만

## 1. 전체 순서

```
① 구조   확인 → 구조 확정 → 백업 → 새 테이블·칼럼 추가(작게 쪼갬)
② 데이터 에이전시·통신사 정리 → 상품 → 수수료 적재 (테이블 하나씩)
③ 제약   필수값·외래키·기간 겹침 방지 (데이터가 깨끗해진 뒤)
④ 대조   구 금액 vs 신 금액 일치 확인 (불일치 0건)
⑤ 함수   에이전시별 수수료 조회 함수 추가 (구 함수는 그대로)
⑥ 화면   Supabaseservice.js → Calculator.js → CS_new.html → 확인표
```

- ④⑤는 사용자가 말한 "구조 → 데이터 → 화면" 사이에 들어가는 단계입니다. 금액이 맞는지 보고, 화면이 읽을 통로(함수)가 있어야 계산식을 안전하게 바꿀 수 있습니다.
- 구 테이블 삭제(P8)는 화면 전환 후 안정화가 끝난 다음입니다.

## 2. 단계 체크표 (작은 단위)

표기: `[x]` 완료 · `[~]` 진행 중 · `[ ]` 예정 · `[!]` 사용자 확인 대기

### ① 구조
| # | 단계 | 산출물 | 합격 기준 | 상태 |
|---|---|---|---|---|
| 1-1 | 현재 구조 조회 | `01a_inspect_schema.sql` | 결과 JSON 수신 | [x] |
| 1-2 | RLS·권한·규칙 확인 | `01a2`, `01a3` | 결과 수신 | [x] 현재 안전, 권한 설정은 구조 이후 |
| 1-3 | 구조 확정 | `db-structure-v2.md` | 사용자 확정 | [x] 2026-10-06 |
| 1-4 | 백업 복사 | `01b_backup.sql` | 백업 행 수 = 원본 | [x] 2026-10-06 15개 테이블 모두 일치 |
| 1-5 | `carriers` 테이블 | `01c_1_carriers.sql` | 6칼럼, RLS 켜짐, 0행 | [x] 2026-10-06 |
| 1-6 | `plans_settop` 테이블 | `01c_2_plans_settop.sql` | 8칼럼, RLS 켜짐, 0행 | [x] 2026-10-06 |
| 1-7 | `plans_internet`(`speed_num`·`legacy_id`)·`plans_tv`(`legacy_id`) 칼럼 추가 | `01c_3_plans_cols.sql` | 칼럼 3개 존재, 행 수(3·4) 그대로, 새 칼럼 값 비어 있음 | [x] 2026-10-06 |
| 1-8 | `agencies` 칼럼 추가(`is_active`·`sort_order`) | `01c_4_agencies_cols.sql` | 칼럼 2개 존재, 3행 그대로, `is_active` 3행 true | [x] 2026-10-06 |
| 1-9 | `fee_tv.internet_id` 추가(→`plans_internet`) | `01c_5_fee_tv_col.sql` | 칼럼 존재, 4행 그대로, 값 비어 있음, 외래키 존재 | [!] **지금 단계**(실행 결과 대기) |
| 1-10 | `fee_usim.usim_fee_dongpan` 추가 | `01c_6_fee_usim_col.sql` | 〃 | [ ] |
| 1-11 | `fee_internet`·`fee_tv`·`fee_usim`에 `remarks` 추가 | `01c_7_fee_remarks.sql` | 〃 | [ ] |
| 1-12 | `fee_extra` 테이블 | `01c_8_fee_extra.sql` | 빈 테이블 생성 확인 | [ ] |
| 1-13 | `contracts` 칼럼 추가 | `01c_9_contracts_cols.sql` | 기존 계약 행 변화 없음 | [ ] |
| 1-14 | `contract_fee_lines` 테이블 | `01c_10_contract_fee_lines.sql` | 빈 테이블 생성 확인 | [ ] |

- 새 테이블(1-5, 1-6, 1-12, 1-14)은 만들 때 `enable row level security` 한 줄을 함께 넣어 기본 잠금으로 둡니다(읽기 규칙은 나중).

### ② 데이터 (1-12 완료 후, 한 테이블씩)
| # | 단계 | 합격 기준 | 상태 |
|---|---|---|---|
| 2-1 | 에이전시 정비(`티코드`→`티코디`: 새 행 추가→`fee_*` 옮기기→옛 행 삭제) | `agencies`에 `티코디`, `fee_*` 에이전시 값 일치 | [ ] |
| 2-2 | `carriers` 6행 입력 | 6행 | [ ] |
| 2-3 | `plans_internet` 이관·속도 숫자화 | 구 `internet_plans` 25행과 개수·요금 대조 | [ ] |
| 2-4 | `plans_tv` 이관·TV 등급 정리 | 구 `tv_plans` 40행과 대조 | [ ] |
| 2-5 | `plans_settop` 이관 | 24행 대조 | [ ] |
| 2-6 | `plans_usim` 통신사 값 정리(결정 필요) | 76행 유지 | [ ] |
| 2-7 | `fee_internet` 적재 | 대조 쿼리 | [ ] |
| 2-8 | `fee_tv` 적재(기준 인터넷 포함, 결합·추가TV) | 〃 | [ ] |
| 2-9 | `fee_usim` 적재(구 `standalone_fee`→`usim_fee`, `dongpan_fee`→`usim_fee_dongpan`) | 〃 | [ ] |
| 2-10 | `fee_extra` 적재(해당 시) | 〃 | [ ] |

### ③~⑥
| # | 단계 | 상태 |
|---|---|---|
| 3 | 제약 강화(`agency_id` 필수, `carriers` 참조, 기간 겹침 방지) | [ ] |
| 4 | 구·신 금액 대조(통신사·속도·등급·에이전시별 불일치 0건) | [ ] |
| 5 | 조회 함수 `get_agency_fee` 추가 | [ ] |
| 6-1 | `Supabaseservice.js` — 신규 테이블·함수 호출, 구 모양 변환부 한 곳 | [ ] |
| 6-2 | `Calculator.js` — 속도·TV 등급·유심 구간표 | [ ] |
| 6-3 | `CS_new.html` — 에이전시 표시를 실데이터로(A12는 "인터넷·TV 수수료 + [에이전시] 금액" 4줄 배치) | [ ] |
| 6-4 | 확인표 A11~A16 실데이터 기준 개정·재확인 | [ ] |

## 3. 현재 DB 스냅샷 (2026-10-06 조회 기준)

| 구분 | 테이블(행 수) |
|---|---|
| 신규 상품 | `plans_internet`(3·KT 시험값), `plans_tv`(4), `plans_usim`(76·구 테이블 복사본) |
| 신규 수수료 | `agencies`(3), `fee_internet`(6), `fee_tv`(4), `fee_usim`(0) |
| 구 상품·수수료 | `internet_plans`(25), `tv_plans`(40), `settop_boxes`(24), `usim_plans`(76), `carrier_commissions`(246), `carrier_commissions_new`(246·`bundle_fee` 추가본), `carrier_promotions`(42) |
| 고객·계약 | `customers`(50), `contracts`(30), `contract_items`(24), `contract_proposals`(40) 등 |

핵심 사실: ① 구 수수료는 한 행에 인터넷·TV·추가TV·기타 수수료와 에이전시가 함께 있음 ② `get_admin_commissions`는 에이전시·인터넷/TV 수수료를 돌려주지 않음 ③ `fee_*`→`agencies` 연결에 이름 변경 연쇄가 없음 ④ `fee_tv`에는 기준 인터넷 상품 칼럼이 없음 (자세한 내용은 `db-structure-v2.md` 1장)

## 4. 이력 (추가만)

| # | 날짜 | 내용 |
|---|---|---|
| 1 | 2026-10-02 | 현황 정리, 문제점 식별, 결정 D1~D12, 단계 P0~P8 초안(`db-redesign-plan_1002_P1.md`) |
| 2 | 2026-10-06 | 인수인계서 작성: 통신사 표준 6개(KT·LG홈·LGbiz·SKB·SKT·SKY), 에이전시 `티코디`, TV 등급 5값(옛 `premium→high` 먼저, `premium+→premium`), 속도 숫자, 수수료 분리(인터넷·TV·결합·추가TV·기타), SKY 5번째 통신사 우선 반영 |
| 3 | 2026-10-06 | 사용자 방침: 앱보다 DB 구조를 먼저, 기존 테이블·칼럼 유지·신규만 추가. 구조 조회 SQL(`01a`)을 실행해 결과 수신 |
| 4 | 2026-10-06 | 조회 결과 분석(`db-structure-v2.md` 1장): RPC가 에이전시를 안 돌려줌, 에이전시 이름 변경 연쇄 없음, `fee_tv` 기준 인터넷 없음 등. 작업을 구조 단계 + 10개 데이터 단계로 쪼갬. 순서는 구조→데이터→제약→대조→함수→화면. RLS 확인(`01a2`)과 구조 확정(v2) 요청 |
| 5 | 2026-10-06 | `01a2` 결과 2 수신: 로그인 안 한 사용자(`anon`)에게 `agencies`·`fee_*`·`plans_*`·`carrier_commissions(_new)`·`carrier_promotions`의 읽기뿐 아니라 **수정·삭제·전체삭제(TRUNCATE) 권한까지 열려 있음**(`contracts`·`contract_items`는 목록에 없음 = 이미 회수됨). RLS가 켜져 있으면 권한만으로는 뚫리지 않으므로 결과 1(RLS 켜짐 여부) 확인 필요. 앱 코드 확인: 수수료 테이블은 앱이 직접 읽지 않고(구 `get_admin_commissions`만 사용), 로그인 전에 읽는 것은 `internet_plans`·`tv_plans`·`settop_boxes`·`carrier_promotions`(+`usim_plans`) → 보안 조치 단계 1-2b 추가 |
| 6 | 2026-10-06 | `01a2` 결과 1 수신: 14개 테이블 **모두 RLS 켜짐** → anon에게 열린 쓰기 권한은 기본값이며 규칙(policy)이 없으면 막힘. 이전 조회에서 `agencies`·`plans_*`·`fee_*`는 규칙이 없음(= 로그인 사용자도 직접 읽기 불가). 따라서 **새 테이블을 화면이 읽게 만들 때 규칙(읽기 정책)을 반드시 추가**해야 함(상품은 공개 읽기, 수수료는 로그인 전용). 구 테이블(`internet_plans` 등)의 규칙은 아직 미확인 → `01a3_check_policies.sql` 요청 |
| 7 | 2026-10-06 | `01a3` 결과 수신: 구 테이블(`internet_plans`·`tv_plans`·`settop_boxes`·`carrier_promotions`·`usim_plans`)은 읽기 전용 규칙(로그인 전 공개), `carrier_commissions`는 로그인 사용자 읽기, 그 외 `carrier_commissions_new`·`agencies`·`plans_*`·`fee_*`는 규칙 없음(직접 접근 불가). **쓰기를 허용하는 규칙은 없어 현재 안전** → 보안 조치 불필요, 권한 설정은 구조 확정 이후로 보류. 다음은 구조 확정(1-3) 대기 |
| 8 | 2026-10-06 | **구조 확정(1-3 완료).** 사용자 답변 반영: Q1 `standalone_fee`=유심 단독 가입, `dongpan_fee`=인터넷+유심 같이 가입 기준 → `fee_usim`에 `usim_fee_dongpan` 추가(기존 `usim_fee`=단독), `contract_fee_lines.fee_type`에 `usim_standalone`·`usim_dongpan` 구분, 단독/동판 판단은 `contracts.linked_contract_id`로(새 칼럼 없음). Q2 제안대로: `remarks`만 `fee_internet`·`fee_tv`·`fee_usim`에 추가, 유지기간(`min_retention_period`)은 가져오지 않음. 확인 사항: 현재 앱 유심 구간표(`USIM_COMMISSION_BANDS`)는 동판 금액(`dongpan_fee`)을 쓰고 있음. 구조 단계가 12개→14개로 늘어남(칼럼 추가를 한 단계씩 분리). 다음: 1-4 백업 |
| 9 | 2026-10-06 | **1-4 백업 완료**: `backup` 스키마에 15개 테이블을 `_20261006`로 복사, 행 수 모두 일치(agencies 3, carrier_commissions 246, carrier_commissions_new 246, carrier_promotions 42, contracts 31, fee_internet 6, fee_tv 4, fee_usim 0, internet_plans 25, plans_internet 3, plans_tv 4, plans_usim 76, settop_boxes 24, tv_plans 40, usim_plans 76). 다음 1-5 `carriers` 테이블 SQL 작성 |
| 10 | 2026-10-06 | **1-5 `carriers` 완료**: 6칼럼(`carrier_id` PK·`carrier_name`·`aliases`·`sort_order`·`is_active`·`created_at`), RLS 켜짐, 0행 확인. 다음 1-6 `plans_settop` SQL 작성 |
| 11 | 2026-10-06 | **1-6 `plans_settop` 완료**: 8칼럼(`id` PK·`carrier`·`model_name`·`monthly_fee`·`is_active`·`legacy_id`·`created_at`·`updated_at`), RLS 켜짐, 0행 확인. 다음 1-7 `plans_internet`·`plans_tv` 칼럼 추가 SQL 작성 |
| 12 | 2026-10-06 | **1-7 완료**: `plans_internet`에 `speed_num`·`legacy_id`, `plans_tv`에 `legacy_id` 추가(모두 비어 있음, 행 수 3·4 그대로). 다음 1-8 `agencies` 칼럼 추가 SQL 작성 |
| 13 | 2026-10-06 | **1-8 완료**: `agencies`에 `is_active`(기존 3행 모두 true)·`sort_order`(비어 있음) 추가. 다음 1-9 `fee_tv.internet_id` 추가 SQL 작성(`plans_internet(id)` 참조, 삭제 시 함께 삭제 — 기존 `fee_internet.internet_id`와 같은 방식) |
