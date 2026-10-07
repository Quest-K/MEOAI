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
| 1-9 | `fee_tv.internet_id` 추가(→`plans_internet`) | `01c_5_fee_tv_col.sql` | 칼럼 존재, 4행 그대로, 값 비어 있음, 외래키 존재 | [x] 2026-10-06 |
| 1-10 | `fee_usim.usim_fee_dongpan` 추가 | `01c_6_fee_usim_col.sql` | 칼럼 존재, 기본값 0, 0행 | [x] 2026-10-06 |
| 1-11 | `fee_internet`·`fee_tv`·`fee_usim`에 `remarks` 추가 | `01c_7_fee_remarks.sql` | 3행, 행 수(6·4·0) 그대로, 값 비어 있음 | [x] 2026-10-06 |
| 1-12 | `fee_extra` 테이블 | `01c_8_fee_extra.sql` | 12칼럼, RLS 켜짐, 0행 | [x] 2026-10-06 |
| 1-13 | `contracts` 칼럼 추가(`agency_id`·`agency_pick_type`) | `01c_9_contracts_cols.sql` | 칼럼 2개, 연결·검사 제약 존재, 기존 계약 값 비어 있음 | [x] 2026-10-06 (계약 행 32, 새 칼럼 모두 비어 있음) |
| 1-14 | `contract_fee_lines` 테이블 | `01c_10_contract_fee_lines.sql` | 11칼럼, RLS 켜짐, 0행, 외래키 2개 | [x] 2026-10-07 사용자 실행 완료 보고(결과 화면은 미수신) |
| 1-15 | `fee_tv` 에 `bundle_internet_fee`(결합 시 인터넷분)·`family_yn`(가족결합 Y/N) 추가 `01c_11_fee_tv_cols.sql` | 2칼럼 존재, 4행 그대로, family_yn 4행 모두 N | [x] 2026-10-07 (2칼럼·4행 그대로·family_yn 4행 N) |

- 새 테이블(1-5, 1-6, 1-12, 1-14)은 만들 때 `enable row level security` 한 줄을 함께 넣어 기본 잠금으로 둡니다(읽기 규칙은 나중).

### ② 데이터 (1-12 완료 후, 한 테이블씩)
| # | 단계 | 합격 기준 | 상태 |
|---|---|---|---|
| 2-1 | 에이전시 정비(`티코드`→`티코디`: 새 행 추가→`fee_*` 옮기기→옛 행 삭제) `02_1_agency_rename.sql` | `티코드` 행 없음, `티코디` chars 3·bytes 9, 수수료 행 수 유지 | [x] 2026-10-07 (티코디: fee_internet 6·fee_tv 4 이동 확인) |
| 2-1b | 구 데이터 현황 조회(통신사·속도·등급·에이전시 값 분포) `02_2_profile_old_data.sql` | 결과 표 수신 → 이관 규칙 확정 | [x] 2026-10-07 결과 수신(이력 #21) |
| 2-1c | 정체 불명 값 확인(에이전시 `A`·TV등급 `실속형`·TV등급 비어있음) `02_3_check_details.sql` | 약 21행 수신 + 사용자 결정 D1·D3 | [~] 2-7a 로 흡수(별도 실행 안 함) |
| 2-2 | `carriers` 6행 입력 `02_4_carriers_data.sql` | 6행, `LG홈` chars 3·bytes 5 | [x] 2026-10-07 |
| 2-3a | `plans_internet` 이관 전 미리보기(시험 행 3·참조 행·이관 후보 17) `02_5_preview_plans_internet.sql` | 결과 표 수신 → id·등급·시험 행 처리 규칙 확정 | [x] 2026-10-07 |
| 2-3b | `plans_internet` 이관·속도 숫자화(`speed_num`·`legacy_id` 채움) `02_6_plans_internet_data.sql` | 17행 모두 구 `internet_plans`와 속도·요금 일치, `fee_internet` 6행이 새 상품 id 를 가리킴 | [x] 2026-10-07 (17행·6행 모두 ok) |
| 2-4a | TV 요금제↔신 등급 대응표용 자료 조회 `02_7_preview_plans_tv.sql` | 결과 수신 → 대응표 초안 → 사용자 확정 | [x] 2026-10-07 (대응표 사용자 확정) |
| 2-4b | `plans_tv` 이관·TV 등급 정리(이관 대상 30행) `02_8_plans_tv_data.sql` (시험 행 4개는 fee_tv 적재 단계에서 정리) | 신규 30행(legacy_id 있음)·요금/채널 구 `tv_plans`와 일치·통신사×등급 표가 대응표와 같음 | [x] 2026-10-07 (30행·불일치 0·통신사×등급 대응표 일치, plans_tv 총 34행=시험 4 포함) |
| 2-5 | `plans_settop` 이관 `02_9_plans_settop_data.sql` (dlive·hellovision 3행 제외, 21행) | 21행·월요금/모델명 구 `settop_boxes`와 일치 | [x] 2026-10-07 (21행·불일치 0·KT5/LG홈5/SKB5/SKT5/SKY1) |
| 2-6 | `plans_usim` 통신사 값 표준화(KT→KT·LG→LG홈·SK→SKT) `02_10_plans_usim_carrier.sql` | 76행 유지·KT 17·LG홈 19·SKT 40 | [x] 2026-10-07 (KT 17·LG홈 19·SKT 40·요금 차이 0) |
| 2-7a | 수수료 작업본 246행 전체 조회 `02_11_export_commissions.sql` (2-1c 의 A·실속형·빈 TV등급 확인 흡수 → `02_3` 실행 불필요) | CSV 수신 → 이관 규칙표 작성 → 사용자 확정 | [x] 2026-10-07 (CSV 246행 수신·분석) |
| 2-7a2 | 이관 규칙표 사용자 확정 | 질문 답변 | [x] 2026-10-07 (C안·LGBIZ·가족결합 KT만) |
| 2-7a3 | `carriers` 표준 코드 `LGbiz`→`LGBIZ` `02_12_carrier_lgbiz.sql` | 6행, LGBIZ 1행·LGbiz 0행 | [x] 2026-10-07 (6행·LGBIZ 1행·LGbiz 0행) |
| 2-7b | `fee_internet` 재입력(시험 6행 삭제 → 인터넷 단독 N 금액 19행) `02_13_fee_internet_data.sql` | 19행·구 금액과 일치·기대 행 수 | [x] 2026-10-07 (19행·구 금액과 일치) |
| 2-7c | KT 가족결합(Y) 6행 입력 — 사용자 금액 CSV(`family_template_KT_internet.csv`) | 6행 추가, 총 25행 | [ ] 사용자 CSV 대기 |
| 2-8a | `fee_tv` 입력 전 확인표 `fee_tv_review.csv`(74행: 통신사×에이전시×신 등급×속도, 인터넷분·TV분 자동 계산) | 사용자 확인·수정 | [x] 2026-10-07 (사용자 '그대로 진행') |
| 2-8b | `fee_tv` 적재(같은 등급 요금제 전부에 같은 금액 복사 → 115행, 시험 4행·`plans_tv` 시험 4행 삭제) | 총액=인터넷분+TV분 재현  `02_14_fee_tv_data.sql` | 115행·plans_tv 30행·총액 대조 통과 | [x] 2026-10-07 (fee_tv 115행·plans_tv 30행·통신사/에이전시/등급별 행 수 기대와 일치) |
| 2-9a | 유심 자료 조회 `02_15_preview_usim.sql`(plans_usim 76행+앱 구간표 금액, 구 원본의 KT·LG 유심 수수료 존재 여부) | CSV 수신 → 규칙 확인 | [x] 2026-10-07 (CSV 수신) |
| 2-9b | `fee_usim` SKT 40행(단독→`usim_fee`, 동판→`usim_fee_dongpan`, 에이전시 `A`→티인포) `02_16_fee_usim_skt.sql` | 40행·5구간 금액이 앱 구간표와 같음 | [!] **지금 단계**(실행 결과 대기) |
| 2-9c | `fee_usim` KT 17·LG홈 19행(앱 코드 동판 구간표, 에이전시·단독 금액 답변 필요) | 앱 구간표와 일치 | [ ] 사용자 답변 대기 |
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
| 14 | 2026-10-06 | **1-9 완료**: `fee_tv.internet_id`(→`plans_internet(id)`, 삭제 시 함께 삭제) 추가, 4행 그대로·값 비어 있음·외래키 확인. 다음 1-10 `fee_usim.usim_fee_dongpan` 추가 SQL 작성 |
| 15 | 2026-10-06 | **1-10 완료**: `fee_usim.usim_fee_dongpan`(numeric, 기본 0) 추가, 0행 확인. 이로써 기존 `usim_fee`=단독, `usim_fee_dongpan`=동판. 다음 1-11 `remarks` 추가 SQL 작성 |
| 16 | 2026-10-06 | **1-11 완료**: `fee_internet`·`fee_tv`·`fee_usim`에 `remarks`(text) 추가, 행 수 6·4·0 그대로·값 비어 있음. 다음 1-12 `fee_extra` 테이블 SQL 작성(에이전시 참조에 이름 변경 연쇄 포함, 기간 검사 제약 포함) |
| 17 | 2026-10-06 | **1-12 `fee_extra` 완료**: 12칼럼, RLS 켜짐, 0행 확인. 다음 1-13 `contracts`에 `agency_id`(→`agencies`, 이름 변경 연쇄)·`agency_pick_type`(`auto`/`manual`만 허용) 추가 SQL 작성. 과거 계약은 에이전시 정보 없이 비워 둠 |
| 18 | 2026-10-06 | **1-13 완료**: `contracts`에 `agency_id`(→`agencies`, 이름 변경 연쇄)·`agency_pick_type`(`auto`/`manual`) 추가, 두 칼럼 모두 비어 있고 연결·검사 제약 확인(계약 행 수는 백업 때 31 → 현재 32: 테스트 입력으로 늘어난 것으로 보며 새 칼럼과는 무관). 다음 1-14 `contract_fee_lines` 테이블 SQL 작성(구조 단계의 마지막) |
| 19 | 2026-10-07 | **① 구조 단계(1-1~1-14) 완료**: 새 테이블 4개(`carriers`·`plans_settop`·`fee_extra`·`contract_fee_lines`), 기존 테이블 새 칼럼(`plans_internet` 2·`plans_tv` 1·`agencies` 2·`fee_tv` 1·`fee_usim` 1·`fee_*` `remarks` 3·`contracts` 2). 기존 칼럼·값은 변경 없음. 1-14는 사용자가 실행 완료로 보고(결과 화면 미수신). **② 데이터 단계 시작**: 2-1 에이전시 이름 정비 SQL 작성(`티코드`→`티코디`: 새 행 추가→`fee_*`·`contracts` 옮기기→옛 행 삭제, 한 덩어리로 실행). 다음 단계들(2-3~2-9)에는 결정 D1(`hello`·`dlive`)·D3(유심 통신사 값)·D5(`A`·`SK`·`실속형`) 필요 |
| 20 | 2026-10-07 | **2-1 완료**: `티코드`→`티코디` 정비 — `agencies`에 `티코디`(chars 3·bytes 9, 사용 중), `fee_internet` 6행·`fee_tv` 4행이 새 이름을 가리킴, `백메가`·`티인포`는 수수료 행 없음, `contracts` 에이전시 값 0건. 다음 2-1b: 구 상품·수수료 테이블의 값 분포(통신사 표기·속도·TV 등급·에이전시 이름·TV 요금제 이름) 조회 SQL 작성 — 결과로 이관 규칙(결정 D1·D3·D5)을 추측 없이 정함 |
| 21 | 2026-10-07 | **2-1b 결과 분석**(구 데이터 값 분포). ① 구 상품 테이블(`internet_plans`·`tv_plans`·`settop_boxes`·`carrier_promotions`)은 소문자 키(`kt`·`lg`·`skb`·`skt`·`skylife`)에 `hello`·`hellovision`·`dlive`가 섞여 있고, 수수료 작업본은 `KT`·`LG`·`LGbiz`/`LGBIZ`·`SKB`·`SKT`·`SKY`/`SKYLIFE`·`SK`(유심) 표기. ② `hello`·`dlive`: 인터넷 8행(dlive 5·hello 3)·TV 10행·셋탑 3행(dlive 1·hellovision 2)·사은품 6행(hellovision), **수수료 행은 없음** → 이관 시 제외 제안(이관 대상: 인터넷 17·TV 30·셋탑 21). ③ 수수료 작업본 246행: 에이전시 티인포 139·티코디 74·백메가 23·`A` 10 / 상품 종류 INTERNET_TV 129·TV 50·INTERNET 27·PHONE 18·USIM_MOBILE 10·SECURITY 8·cctv 4. ④ `SK` 10행 전부 USIM_MOBILE(SKT 유심 수수료), `A` 10행도 같은 10행일 가능성(추정, 2-1c에서 확인). ⑤ `LGbiz` 전화·보안·CCTV 30행은 인터넷·TV·유심에 속하지 않아 `fee_extra` 후보. ⑥ 속도 표기 `100M`·`200M`·`500M`·`1G`·`none` → 숫자 100·200·500·1000, 상품 테이블에는 160·320도 있음(hello·dlive 속도로 추정). ⑦ TV 등급 `premium`(36)·`premium+`(28)·`실속형`(4)·비어있음(7) — 결정대로 `premium→high` 먼저, `premium+→premium`. ⑧ `SKY`(20)와 `SKYLIFE`(31) 중복 → 결정 15대로 `SKY` 우선. ⑨ 앱의 TV 등급 연결 규칙(`Supabaseservice.js` 71~81행): KT 베이직·에센스·모든G/키즈랜드, LG 실속형·기본형·프리미엄, SKB/SKT 이코노미·스탠다드·All → low·basic·premium(구 3등급). 신 5등급 대응표는 2-4에서 제안 |
| 22 | 2026-10-07 | **사용자 결정 3건**: ① D1 `hello`·`hellovision`·`dlive`는 **제외**(이관하지 않고 구 테이블에 그대로 둠 → 이관 대상: 인터넷 17·TV 30·셋탑 21행) ② D3 유심 통신사 `KT`→KT·`LG`→LG홈·`SK`→SKT ③ 구 상품 테이블 소문자 키 `kt`→KT·`lg`→LG홈·`skb`→SKB·`skt`→SKT·`skylife`→SKY(제안대로). 2-1c(`A`·`실속형`·비어있는 TV등급 확인) 결과는 아직 미수신이며 2-2~2-5(상품 이관)는 이 결과와 무관하게 진행 가능. 다음 2-2 `carriers` 6행 입력 SQL 작성(`aliases`에 옛 표기를 담아 이관 변환표로 사용) |
| 23 | 2026-10-07 | **2-2 완료**: `carriers` 6행 입력(KT·LG홈·LGbiz·SKB·SKT·SKY, `LG홈` chars 3·bytes 5 확인, `aliases`에 옛 표기 저장). 다음 2-3a: `plans_internet`에는 이미 시험 행 3개가 있고 `fee_internet`(6행)·`fee_tv`(4행)가 상품 id 를 참조하며 그 연결에는 이름 변경 연쇄가 없어, id 규칙을 바꾸려면 에이전시 때처럼 "새 행 추가→참조 옮기기→옛 행 삭제"가 필요 → 입력 전에 현재 상태 미리보기 SQL 작성 |
| 24 | 2026-10-07 | **2-3a 결과 분석**: 새 `plans_internet` 시험 행 3개(`int_kt_100`·`int_kt_500`·`int_kt_1g`, 요금 0원, 등급 low·basic·high), `fee_internet` 6행(티코디, 일반 N·패밀리 Y × 100·500·1G)·`fee_tv` 4행이 있음. 구 `internet_plans` 이관 대상 17행(kt 3·lg 4·skb 3·skt 3·skylife 4; LG·스카이라이프에는 200M 있음). 관찰: ① 수수료 행 id 에 옛 이름이 박혀 있음(`int_kt_100_티코드`) → 이관 때 함께 정리 ② 새 `plans_tv` 시험 행의 KT 등급 배정(라이트=basic·에센스=high·모든G=premium)이 앱의 구 규칙(에센스=basic·모든G=premium)·확정 규칙(`premium→high`)과 달라 2-4 에서 다시 정해야 함. **2-3b 규칙(내가 정한 것, 이의 있으면 알려 주세요)**: id=`int_{kt|lg|skb|skt|sky}_{속도}`, `1g`→`1000`(결정 T11), `internet_tier` 200 이하 low·500 basic·1000 high, 시험 행 2개는 갱신·`int_kt_1g`는 `int_kt_1000`으로 교체(수수료 참조 이동 후 삭제), `hello`·`dlive`는 `carriers.aliases`에 없어 자동 제외 |
| 25 | 2026-10-07 | **2-3b 완료**: `plans_internet` 17행 이관(kt 3·lg 4·skb 3·skt 3·sky 4, 속도·월요금·공유기 요금이 구 `internet_plans`와 모두 일치), 시험 행 `int_kt_1g`→`int_kt_1000` 교체, `fee_internet` 6행이 새 상품 id 를 가리키고 행 id 도 `티코디`·`1000`으로 정리됨. 다음 2-4a: TV 등급 대응표가 필요한 이유 — 새 `plans_tv` 시험 행(KT 베이직 low·라이트 basic·에센스 high·모든G premium, 요금 오름차순 4등급)·앱 구 규칙(베이직 low·에센스 basic·모든G premium, 라이트 없음)·확정 규칙(`premium→high`, `premium+→premium`)이 서로 다름 → 요금제명·채널·월요금과 수수료 작업본의 통신사별 TV 등급 분포를 먼저 조회 |
| 26 | 2026-10-07 | **2-4a 결과 수신**: 구 `tv_plans` 30행(KT 5·LG홈 5·SKB 9·SKT 9·SKY 2; 등급 null 6행=KT 라이트·LG홈 고급형·SKB/SKT 올 넷플릭스 프리미엄·SKY 2), 수수료 TV 등급은 통신사별 low·basic·premium·premium+(SKY만 none 추가, LGbiz는 `실속형` 4행 포함). 구 `premium→high`, `premium+→premium` 규칙을 요금제에 적용하면 '프리미엄 이상' 요금제를 high/premium으로 나눌 기준이 필요 → 대응표 초안을 사용자에게 제시, 확정 후 2-4b 작성. 부가 확인: LGbiz는 TV 요금제 자체가 없음, 수수료는 등급 단위인데 `fee_tv`는 요금제 단위(`tv_id`) |
| 27 | 2026-10-07 | **TV 대응표 확정**(사용자): KT 베이직 low·라이트 basic·에센스 basic·모든G high·디즈니+모든G premium / LG홈 실속형 low·기본형 basic·고급형 basic·프리미엄 high·프리미엄 VOD premium / SKB·SKT 이코노미 low·스탠다드 4종 basic·Btv All·All 플러스 high·All 넷플릭스·올 넷플릭스 프리미엄 premium / SKY ipit 베이직 basic·ipit 플러스 high(SKY low 등급 없음 → 수수료 SKY `low` 10행은 이관 보류, 구 `premium` 12행은 high 로 연결). 수수료 구 premium+→premium. **같은 등급 TV 는 같은 수수료**로 진행(2-8 에서 등급 내 모든 요금제에 복사). LGbiz TV 는 요금제 없음(수수료 행은 보류/fee_extra 후보, 2-8 에서 다시 확인). 2-4b SQL `02_8_plans_tv_data.sql` 작성(DO 블록, 30행 아니면 중단, 시험 행 4개는 그대로 둠) |
| 28 | 2026-10-07 | **2-4b 완료**: `plans_tv` 에 구 30행 이관(legacy_id 30개, 요금·채널 불일치 0), 통신사×등급이 확정 대응표와 일치(KT basic2·high1·low1·premium1 / LG홈 basic2·high1·low1·premium1 / SKB·SKT 각 low1·basic4·high2·premium2 / SKY basic1·high1). `plans_tv` 총 34행(시험 4행 유지, fee_tv 적재 단계에서 정리). 다음 2-5: `02_9_plans_settop_data.sql` (셋탑 21행) |
| 29 | 2026-10-07 | **2-5 완료**: `plans_settop` 21행(KT 5·LG홈 5·SKB 5·SKT 5·SKY 1), 월요금·모델명 구 `settop_boxes`와 불일치 0. 다음 2-6: `plans_usim`(76행, id 정수 유지) 통신사 값을 KT→KT·LG→LG홈·SK→SKT 로 변경 `02_10_plans_usim_carrier.sql`(통신사 값 외 변경 없음, 예상 밖 값이 있으면 중단) |
| 30 | 2026-10-07 | **2-6 완료**: `plans_usim` 76행 통신사 KT 17·LG홈 19·SKT 40, 요금 차이 0. 수수료 적재(2-7~)는 구 작업본 한 행에 인터넷·TV·추가TV·번들·유심(단독/동판)·비고·기간이 섞여 있어 규칙을 추측으로 정하지 않기로 함 → 2-1c(`02_3`)를 대체해 작업본 246행 전체를 CSV 로 받는 `02_11_export_commissions.sql` 작성. 받으면 ① 에이전시 `A`·`실속형`·빈 TV등급 정체 ② 가족(family_yn) 구분이 어디에 있는지 ③ INTERNET_TV 한 행→fee_internet+fee_tv 분리 ④ SKY/SKYLIFE·LGbiz/LGBIZ 중복 처리 ⑤ 기간(start/end) 겹침을 분석해 이관 규칙표를 제시 |
| 31 | 2026-10-07 | **2-7a 분석**(수수료 246행). ① 사용자 결정: 에이전시 `A`(SK 유심 10행)는 임의 등록값 → 통신사에 맞춰 티인포(SKB·SKT·LG 수수료가 전부 티인포)로 수정, 유심 10행은 5구간 × 2벌 중복. ② `commission_amount`가 모든 통신사에서 '해당 조합의 총액'(KT·SKB·SKT·SKY 모두 같은 의미), `internet_fee`·`tv_fee`·`bundle_fee`·`standalone/dongpan`은 통신사마다 뜻이 달라 합산이 총액과 안 맞음(예: KT 백메가 internet_fee 280000 은 인터넷단독 값 그대로, SKB 총액=tv_fee+bundle_fee). → 분리 규칙은 '총액 재현'을 기준으로 제안. ③ KT 라이트는 데이터상 low 등급 행이나 베이직·에센스와 금액이 모두 동일 → 라이트=basic 으로 해도 금액 변화 없음. ④ SKY: 데이터 등급은 이름 기준(베이직=low 220000·플러스=basic 250000·초이스=premium 250000) → 사용자 확정(ipit 베이직=basic, 플러스=high)에 맞추면 basic=220000(베이직 행)·high=250000(플러스 행). 이전 설명 '구 premium→high' 연결은 SKY 에서는 틀렸으므로 정정. ⑤ SKY 행은 SKY·SKYLIFE 모두 동일 행이 2벌씩 중복, SKYLIFE(09-09)는 대부분 0원 → SKY(09-30) 사용. ⑥ LGbiz 는 상품(인터넷·TV) 행이 없고 수수료만 3벌(09-22 2벌·10-01 `LGbiz`/`LGBIZ`) → 상품 없이 연결 불가. ⑦ LG·SKB·SKT TV단독 행은 전부 0원('미지원') → 적재 제외 제안. ⑧ 유심 구간(SKT 5개)은 DB에, KT·LG 구간은 앱 코드(`USIM_COMMISSION_BANDS`)에만 있음 → 2-9 에서 별도 조회. ⑨ `fee_internet` 시험 행의 가족(Y) 3행 금액(250·320·340천원)은 구 데이터에 출처 없음 |
| 32 | 2026-10-07 | **사용자 답변(규칙표 질문)**: ④ 중복·무효 행 기본값 OK(SKY>SKYLIFE, 완전 동일 행 1건, LG·SKB·SKT TV단독 0원 제외, KT TV단독은 인터넷 연결 없이 fee_tv). 중복은 **새 테이블에 넣지 않는 방식**으로 제외(구 테이블은 건드리지 않음). 신규 `fee_*` 시험 데이터는 지우고 다시 넣어도 됨. 가족결합: **가족 Y/N 에 따라 금액이 달라져야 함**(가족결합 시 사은품이 줄어드는 구조) → 구 데이터에는 가족 금액이 없어 사용자 입력 필요. 합산 검증(구 컬럼): KT 티코디는 internet_fee+tv_fee=총액, KT 백메가·LG·LGBIZ는 tv_fee+bundle_fee=총액, SKB·SKT 일부는 other_bonus_fee 포함 여부가 행마다 다름, SKY 는 총액 외 구성 금액이 0 → 총액은 믿을 수 있으나 상세는 통신사별 3가지 공식. 분리 방식(A 총액재현/B 구 컬럼/C 결합 시 인터넷분 칼럼 추가)·LGbiz 표기(LGBIZ 대문자 id 제안)·가족결합 적용 범위 답변 대기 |
| 33 | 2026-10-07 | **규칙 확정(사용자)**: ① 인터넷+TV 분리는 **C안** — `fee_tv`에 `bundle_internet_fee`(결합 시 인터넷분) 추가, 총액 = 인터넷분 + TV분(+ add_tv_fee). 첫 입력은 자동 계산(KT 티코디는 구 internet_fee 그대로, 나머지는 인터넷분=인터넷 단독 금액·TV분=총액−인터넷분), 사용자가 아는 행만 CSV 로 수정 ② 통신사 코드 **LGBIZ 대문자**(표시명 LG 소호(Biz)·aliases 유지) ③ **가족결합은 KT 만**. 인터넷+TV 묶음에도 적용되는지는 명시 답변이 없어 **적용으로 가정**(`fee_tv.family_yn` 추가, 기본 N — 불필요하면 N 으로 두면 됨). 구조 단계 1-15 `01c_11_fee_tv_cols.sql`, 데이터 단계 2-7a3 `02_12_carrier_lgbiz.sql` 작성. 이후: 2-7b `fee_internet`(시험 6행 삭제 후 재입력, KT 가족 Y 금액은 사용자 CSV) |
| 34 | 2026-10-07 | **1-15·2-7a3 완료**: `fee_tv` 에 `bundle_internet_fee`(기본 0)·`family_yn`(기본 N) 추가(4행 모두 N), `carriers` 6행 중 `LGBIZ` 1행(aliases lgbiz·LGbiz·LGBIZ 유지, 표시명 LG 소호(Biz)). 다음 2-7b: `02_13_fee_internet_data.sql` — 시험 6행 삭제 후 인터넷 단독 N 금액 19행(KT 백메가 3·티코디 3·LG홈 3·SKB 3·SKT 3·SKY 4, SKYLIFE·LGBIZ 제외, 최신 시작일 1건) 입력. KT 가족(Y) 6행은 `family_template_KT_internet.csv`(티코디 3행은 기존 시험값 미리 채움)에 사용자가 금액을 채워 보내면 2-7c |
| 35 | 2026-10-07 | **2-7b 완료**: `fee_internet` 19행(KT 백메가 280·380·400 / 티코디 290·390·410 / LG홈 350·440·490 / SKB 340·430·430 / SKT 310·420·470 / SKY 360·380·430·430, 단위 천원), 모두 N·구 금액과 일치. 2-7c(KT 가족 Y 6행)는 사용자 CSV 대기. **2-8a 준비**: 구 수수료를 신 등급으로 바꾼 확인표 74행(KT 라이트는 베이직과 금액 동일 검증 후 제외, SKY 초이스는 플러스와 금액 같고 요금제 없어 보류, LG·SKB·SKT TV단독 0원 제외). 자동 분리 규칙: KT 티코디=구 인터넷분+TV분, KT 백메가=구 tv_fee가 TV분·(총액−tv_fee)가 인터넷분, 그 외=인터넷분은 인터넷 단독 금액·TV분=총액−인터넷분. 결과 TV분이 음수인 행 36/74(결합 시 총액이 인터넷 단독보다 작은 구조라 불가피) |
| 36 | 2026-10-07 | **2-8a 확정('그대로 진행') 및 정정**: 확인표 생성 중 코드 오류로 KT 티코디 TV 묶음 12행의 '인터넷분(자동)'에 글자가 들어가고 'TV분'에 인터넷분 값이 들어가 있었음 → 확인표(`fee_tv_review.csv`)를 정정본으로 교체(나머지 62행은 동일, 음수 TV분 36행 그대로). 정정값: KT 티코디 100M low/basic 인터넷 170000·TV 160000, high/premium 280000·170000, 500M·1G low/basic 170000·170000, high/premium 280000·180000(구 데이터 internet_fee·tv_fee 그대로). 2-8b `02_14_fee_tv_data.sql`: 확인표 74행을 SQL 안에 담고, 구 총액(commission_amount)과 대조해 하나라도 다르면 중단, 같은 등급 요금제에 복사해 115행 입력, 시험 fee_tv 4행·plans_tv 4행 삭제 |
| 37 | 2026-10-07 | **2-8b 완료**: `fee_tv` 115행 입력(KT 백메가 basic 8·high 4·low 4·premium 4 / KT 티코디 동일 / LG홈 basic 6·high 3·low 3·premium 3 / SKB basic 12·high 6·low 3·premium 6 / SKT basic 12·high 6·low 3·premium 6 / SKY basic 3·high 3), `plans_tv` 시험 4행·`fee_tv` 시험 4행 삭제로 `plans_tv` 30행. 총액 대조는 입력 전 SQL 안에서 통과. 남은 것: 가족 Y(KT) 금액. **2-9a**: 유심 — 앱 구간표(`USIM_COMMISSION_BANDS`)는 동판 금액이고 SK 5구간(320·370·410·460·530천)만 DB(작업본)에 있으며 KT 9구간·LG 10구간(동판)은 앱 코드에만 있음, 단독 금액은 SK 만(150·200·260·300·300천). 구 원본(`carrier_commissions`)에 KT·LG 유심 행이 있는지 `02_15_preview_usim.sql` 로 확인 |
| 38 | 2026-10-07 | **2-9a 결과**: 구 원본(`carrier_commissions`)에도 유심 행은 SK 10행(5구간×2벌, 에이전시 A, 동판 320·370·410·460·530천, 단독 150·200·260·300·300천)뿐 → KT·LG 유심 수수료는 **DB 어디에도 없고 앱 코드에만(동판 금액만)** 있음. `plans_usim` 76행 = KT 17·LG홈 19·SKT 40, SKT 40행은 앱 구간표로 5구간에 모두 배정(≤38,999 구간에는 요금제 없음, 라이트 39·45→370천 등). `02_16_fee_usim_skt.sql`: SKT 40행 입력(에이전시 티인포, 구 유지기간은 가져오지 않음). KT·LG 는 에이전시(KT 백메가/티코디 중?)·단독 금액(구 자료 없음) 사용자 답변 필요 |
