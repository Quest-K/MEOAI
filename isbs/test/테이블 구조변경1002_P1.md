# 통신사 상품·수수료 DB 개편 계획서

> 인생비서 CRM(Supabase) — 상품(plans_*)·수수료(fee_*)·에이전시 구조 개편 진행 문서
> 작성: 2026-10-02 / 이 문서는 **단계가 끝날 때마다 갱신**합니다.
> 파일명: `db-redesign-plan_1002_P1.md` (날짜 + 저장 시점의 진행 단계 — 규칙은 0장)

---

## 0. 문서 사용법 · 갱신 규칙

### 파일 이름 규칙

`db-redesign-plan_{MMDD}_{P단계}.md` — 예: `db-redesign-plan_1002_P1.md`

| 부분 | 의미 |
|---|---|
| `db-redesign-plan` | 기존 문서 이름(고정) |
| `{MMDD}` | 저장한 날짜(월일). 10월 2일 → `1002` |
| `{P단계}` | 저장 시점에 **진행 중이거나 방금 끝난 가장 마지막 단계**. 6장 진행 현황의 맨 아래 `[~]`·`[x]` 단계 기준 |

- 날짜나 단계가 바뀌어 저장할 때마다 **새 이름으로 저장**하고, 이전 파일은 지우지 않고 이력으로 보관합니다. (예: `_1002_P1` → `_1003_P2`)
- 같은 날 같은 단계에서 다시 저장하면 뒤에 `-2`, `-3`을 붙입니다. (예: `_1002_P1-2`)
- 파일명은 6장 진행 현황의 요약일 뿐이며, 내용의 기준은 문서 안의 6장입니다.
- 현재 파일: **`db-redesign-plan_1002_P1.md`** (P0 자료 대기, P1 설계 확정 진행 중)

### 갱신 규칙

- 단계가 하나 끝나면 아래 4곳을 갱신합니다.
  1. **6장 진행 현황** 체크 표시
  2. 해당 단계(5장)의 **결과** 기록
  3. **7장 변경 이력**에 한 줄 추가
  4. **8장 확인 대기(TODO)** 정리
- 상태 표기: `[ ]` 예정 / `[~]` 진행 중 / `[x]` 완료 / `[!]` 사용자 확인 대기
- **SQL 실행**: 이 문서의 SQL은 작성만 하고, 실제 실행은 Supabase SQL Editor에서 하며 결과를 확인한 뒤 완료 처리합니다. (작성 환경에서는 DB에 접속하지 않으므로 SQL 문법은 실행 전에 한 번 더 점검합니다.)
- **기존 테이블 보존**: 구 상품·수수료 테이블 7개(8장 부록 B)는 **P8(삭제 단계) 전까지 변경·삭제하지 않습니다.** 화면(CS.html)이 아직 이 테이블을 읽습니다.
- 고객·계약 구조 전환(S1~S11)은 별도 문서 `cs-migration-plan.md`에서 관리합니다. 두 작업은 `CS_new.html`을 함께 건드리므로 **P6(화면 연결)과 S9(컷오버)의 순서는 그때 조율**합니다.

---

## 1. 배경과 목표

- 대상 통신사: KT, SKB, LGU+, SKT, LG 소호(Biz), Skylife. 기존에는 통신사마다 에이전시가 1개('티코드')였으나 **2개 이상**으로 늘어남.
- 목표
  1. 상품 기본정보(`plans_*`)와 수수료(`fee_*`)를 분리한 새 구조로 전환
  2. **동일 통신사·동일 상품 조건에서 2개 이상 에이전시의 수수료를 비교**하고, 수수료 효율이 더 좋은 에이전시로 접수
  3. 접수한 계약에 **접수 에이전시와 수수료 내역을 기록**(정산·환수 기준)
- 진행 방식(확정): ① 기존 테이블은 두고 신규 테이블 생성 → ② CS.html을 신규 테이블에 연결 → ③ 기존 테이블 삭제
- 수수료 항목: 인터넷 수수료(인터넷 기준) / TV 수수료(TV 요금제 기준, **같은 등급이라도 인터넷 속도에 따라 다름**) / 결합수수료(인터넷+TV 동시 가입) / 추가TV 수수료 / 유심수수료 / 기타 수수료 / 총수수료

---

## 2. 현재 DB 현황 (2026-10-02 스키마 CSV 기준 · 26개 테이블)

| 구분 | 테이블 | 비고 |
|---|---|---|
| 고객·계약 (8) | `customers`, `customer_products`, `customer_contacts`, `customer_status_logs`, `contracts`, `contract_proposals`, `contract_items`, `status_history` | CS 전환 작업(`cs-migration-plan.md`) 대상. 이번 개편에서는 `contracts` 보강과 신규 `contract_fee_lines`만 관련 |
| 신규 상품·수수료 (7) | `plans_internet`, `plans_tv`, `plans_usim`, `agencies`, `fee_internet`, `fee_tv`, `fee_usim` | 이미 생성됨. KT 일부 데이터만 있는 것으로 보임(**행 수 미확인**) |
| 구 상품·수수료 (7) | `internet_plans`, `tv_plans`, `settop_boxes`, `usim_plans`, `carrier_commissions`, `carrier_commissions_v2`, `carrier_promotions` | **화면이 지금 읽는 테이블**. `carrier_commissions_v2`는 수정용 임시 복사본 |
| 기타 (4) | `login_logs`, `profiles`, `pm_progress_status`, `isbs_progress` | 이번 개편과 무관 |

**화면 코드가 읽는 곳** (코드 확인 결과)
- 상품: `internet_plans`, `tv_plans`, `settop_boxes`, `usim_plans` (`Supabaseservice.js loadData`, `CS_new.html`)
- 사은품: `carrier_promotions`
- 수수료: RPC `get_admin_commissions` — 정의는 미확인이나 필드(`carrier`, `speed`, `tv_tier`, `commission_amount`, `start_at`)로 보아 `carrier_commissions`를 읽는 것으로 **추정**
- 유심 수수료: DB가 아니라 `Calculator.js`의 하드코딩 구간표(`USIM_COMMISSION_BANDS`, 요금 구간별 금액)

**현재 구조에서 확인된 문제점**

1. `fee_tv`에 인터넷 속도 정보가 없음 → 속도별 TV 수수료 표현 불가
2. TV 등급: 앱은 low/basic/premium 3등급(요금제 이름으로 매핑), 새 `plans_tv`는 low/basic/high/premium 4등급
3. 속도 표기: 구 `internet_plans.speed`는 정수(100/500/1000), `plans_internet.speed`는 문자('100','500','1g')
4. 셋톱박스(`settop_boxes`)에 대응하는 신규 테이블 없음
5. `fee_*`의 `agency_id`가 NULL 허용, `carrier`를 `plans_*`와 이중 저장, `id`가 문자열인데 기본값은 숫자 시퀀스
6. 기간 관리: 앱은 "시작일이 가장 최근인 행"만 사용하고 `end_at`은 보지 않음
7. `contracts`에 접수 에이전시·수수료 내역 칼럼이 없음(수수료는 합계 하나뿐)
8. 예시 데이터 의심: KT TV 수수료가 4개 등급 모두 170,000/100,000/170,000, `bundle_fee`가 `tv_fee`와 동일 → 8장 T1

---

## 3. 확정 사항 (결정 로그)

| # | 날짜 | 결정 | 영향 |
|---|---|---|---|
| D1 | 2026-10-02 | 진행 순서: 신규 테이블 생성 → CS.html 연결 → 기존 테이블 삭제 | 구 테이블은 P8 전까지 유지 |
| D2 | 2026-10-02 | `fee_tv`에 **인터넷 속도 정보 추가** | `fee_tv.internet_id`(기준 인터넷 상품) 추가, 속도는 그 상품에서 따라옴 |
| D3 | 2026-10-02 | TV 등급은 **새 체계(4등급)** | 앱 TV 3등급 전제 코드 수정(P6), 구 데이터 등급 대응표 필요(P3) |
| D4 | 2026-10-02 | 속도 표기는 **숫자 100/500/1000** | `plans_internet.speed` 정수화, `'1g'` → 1000 데이터 수정(P3) |
| D5 | 2026-10-02 | **셋톱박스 신규 테이블** 생성 | `plans_settop` (P2) |
| D6 | 2026-10-02 | `fee_*`의 **agency_id 필수** | NOT NULL + `agencies` 참조 |
| D7 | 2026-10-02 | 앱은 **에이전시를 각각 호출해 나란히 표시** | 에이전시 1곳 기준 수수료 조회 함수를 에이전시 수만큼 호출 |
| D8 | 2026-10-02 | `carrier_commissions_v2`는 **임시 복사본** | P8에서 구 테이블과 함께 삭제, P0에서 읽는 곳 없는지 확인 |
| D9 | 2026-10-02 | **carrier는 유지하되 DB 제약으로 일치 보장**(복합 외래키) | `plans_*`에 `unique(id, carrier)`, `fee_*`는 `(상품id, carrier)` 짝으로 참조 |
| D10 | 2026-10-02 | `fee_*`의 id는 **자동 증가 숫자**, 중복 방지는 별도 유일 제약. `plans_*`의 문자 id(`int_kt_500`)는 유지 | 입력 방식 통일 |
| D11 | 2026-10-02 | `agency_id`는 **한글 사용**(앱 오류가 없다면). 안전장치 적용 | NFC 정규화·공백 제거 제약, 이름 변경 시 연쇄 갱신, CSV는 UTF-8 (아래 4장 참고) |
| D12 | 2026-10-02 | 계약의 접수 에이전시·수수료 내역은 **줄 단위 테이블(`contract_fee_lines`)** 로 저장 | 수수료 종류별 정산·환수 가능, 확장 쉬움 |

---

## 4. 목표 구조 (초안 — P1에서 확정, P2에서 SQL로 작성)

### 4.1 상품 테이블

- **`agencies`** : `agency_id`(PK, 짧은 한글 이름) / `agency_name`(정식 명칭) / `description` / `is_active` / `sort_order` / `created_at`
  - `agency_id` 제약: `agency_id is nfc normalized` and `agency_id = btrim(agency_id)` — 한글 조합 방식 차이(NFC/NFD)로 눈에 같아 보이는데 값이 다른 문제 방지. 다른 테이블의 `agency_id` 참조는 `on update cascade`
  - 근거(2026-10-02 확인): '티코드'는 NFC 3글자, NFD 6글자이며 서로 **같지 않음**. Mac에서 복사하거나 일부 엑셀·CSV에서 NFD가 섞일 수 있음
- **`plans_internet`** : `id`(문자, `int_kt_500`) / `carrier` / `speed`(정수 100·500·1000) / `internet_tier` / `monthly_fee` / `router_fee` / … + `unique(id, carrier)`
- **`plans_tv`** : `id` / `carrier` / `plan_name` / `channel` / `monthly_fee` / `tv_tier`(low·basic·high·premium 제약) / `bundle_discount` / … + `unique(id, carrier)`
- **`plans_usim`** : `id` / `carrier` / `plan_name` / `monthly_fee` / `data_allowance` / `tethering` / `voice_call` / `sms` / `is_active` / … + `unique(id, carrier)`
- **`plans_settop`**(신규) : `id` / `carrier` / `model_name` / `monthly_fee` / `is_active`

### 4.2 수수료 테이블 (모두 로그인한 관리자만 읽기·쓰기, anon 없음)

공통 칼럼: `fee_id`(자동 증가 PK) / `agency_id`(필수, `agencies` 참조) / `carrier` / `start_at` / `end_at` / `created_at` / `updated_at`
공통 제약: `end_at > start_at`, 같은 키에서 **유효 기간이 겹치지 않게**(겹침 방지 제약)

| 테이블 | 키(같은 조합 중복 금지) | 금액 칼럼 | 비고 |
|---|---|---|---|
| `fee_internet` | 에이전시 + 인터넷 상품 + 패밀리 여부 + 시작일 | `internet_fee` | `family_yn`('Y'/'N'), 상품 짝은 `(internet_id, carrier)` |
| `fee_tv` | 에이전시 + TV 상품 + **기준 인터넷 상품** + 시작일 | `tv_fee`, `add_tv_fee`, `bundle_fee` | 결합수수료를 이 테이블에 둘지 분리할지는 8장 T3 결과로 확정 |
| `fee_usim` | 에이전시 + 유심 상품(또는 요금 구간) + 시작일 | `usim_fee` | 요금제 단위/구간 단위는 8장 T7로 확정 |
| `fee_extra` (신규) | 에이전시 + 적용 대상 + 항목명 + 시작일 | `amount` | `target_type`/`target_id`/`fee_name`/`condition_text` — 가전렌탈 등 기타 수수료 |

- **총수수료는 저장하지 않고** 조회 함수에서 계산합니다. (항목별 값과 어긋나는 것을 방지)
- **에이전시 1곳 조회 함수** `get_agency_fee(...)`: 에이전시와 조건(인터넷·TV·패밀리 여부·추가TV 수 등)을 받아 **항목별 수수료 + 총수수료**를 돌려줌. 앱은 이 함수를 에이전시 수만큼 호출해 나란히 표시(D7).
- **유효 행 규칙**: `start_at <= now()` 이고 `end_at`이 없거나 `end_at > now()` 인 행 중, 같은 키에서 시작일이 가장 최근인 행

### 4.3 계약 쪽

- `contracts` 추가 칼럼: `agency_id`(접수 에이전시, `agencies` 참조). **추천 포함(확정 전)**: `agency_pick_type`('auto'=자동 추천 / 'manual'=직접 선택)
- **`contract_fee_lines`**(신규, D12): `line_id`(자동 증가 PK) / `contract_id` + `customer_id`(계약 참조, 계약 삭제 시 함께 삭제) / `item_id`(선택, 상품 단위일 때) / `fee_type`(internet·tv·bundle·add_tv·usim·other) / `amount` / `source_table` + `source_id`(어느 수수료 행에서 가져왔는지) / `calculated_at` / `is_manual`(직접 수정 여부) / `memo`
  - 에이전시는 줄마다 저장하지 않고 `contracts.agency_id`를 따릅니다(같은 정보를 두 곳에 두면 어긋나므로). **한 계약 = 한 에이전시**라는 전제는 8장 T9에서 확인.
  - 기존 `contracts.commission_total`은 호환을 위해 유지하되 줄 합계와 일치하도록 관리(P2에서 방식 확정).
- 접수 후 환수·정산은 `contracts.agency_id` + `contract_fee_lines`를 기준으로 합니다.

---

## 5. 단계별 계획

### P0. 자료 수집 · 현황 확정
- **목표**: 제약·인덱스·권한·함수·뷰·행 수와 `plans_*` 데이터를 확인해 현황표를 확정
- **할 일**
  1. 부록 A의 쿼리 3개 실행 후 결과(CSV) 전달
  2. RPC `get_admin_commissions` 정의 확인(어느 테이블을 읽는지, 권한)
  3. `carrier_commissions_v2`를 읽는 함수·뷰·화면이 없는지 확인(D8)
  4. `fee_*`·`agencies`에 이미 들어 있는 행 수 확인 → P2에서 **재생성 방식**(비어 있거나 임시 데이터면 권장)과 **변환 방식**(데이터가 있으면 백업 후) 중 결정
- **결과**: (미기록)

### P1. 설계 확정
- **목표**: 4장 초안과 8장 TODO를 확정해 설계서 1부 완성
- **확정할 것**: 결합수수료 위치(T3), 유심 단위(T7), 에이전시 목록과 `agency_id`(T6), 단독/동판 수수료 의미(T4), TV 4등급 매핑(T5), 한 계약=한 에이전시(T9), 에이전시 선택 기준(T10), 상품 id 변경(T11)
- **결과**: (미기록)

### P2. 구조 SQL 작성 · 실행 (`01_fee_structure.sql`)
- **변경**: `plans_internet.speed` 정수화 / `plans_tv.tv_tier` 4등급 제약 / `plans_settop` 신규 / `agencies` 보강 / `fee_*` 보강(`agency_id` 필수·참조, id 방식, 복합 외래키, 유일·겹침 방지 제약, `fee_tv.internet_id`) / `fee_extra` 신규 / `contracts` 칼럼 추가 / `contract_fee_lines` 신규 / 권한 / `get_agency_fee` 함수
- **확인**: 실행 후 테이블·제약이 의도대로 생겼는지 점검 쿼리, 잘못된 입력(같은 조건 중복, 기간 겹침, 통신사 불일치)이 DB에서 막히는지 확인
- **결과**: (미기록)

### P3. 상품(plans) 데이터 정비
- **변경**: 속도 숫자화(`'1g'`→1000, 상품 id `int_kt_1g`→`int_kt_1000` 포함, T11) / 구 `internet_plans`·`tv_plans`·`settop_boxes`·`usim_plans` → `plans_*` 이전 / **구 TV 등급(3등급) → 새 등급(4등급) 대응표** 작성(구 고객 데이터의 등급값 해석용)
- **확인**: 구 테이블과 신규 테이블 건수·요금 대조 쿼리
- **결과**: (미기록)

### P4. 에이전시 등록 · 수수료 적재
- **변경**: 에이전시 등록 / 수수료 입력용 CSV 양식(인터넷·TV(기준 인터넷 포함)·유심·기타) 확정 / 적재 SQL / **누락 조합 점검 쿼리**(에이전시 × 상품 조합에서 빈 칸 찾기)
- **주의**: CSV는 **UTF-8**로 저장(엑셀 기본 저장은 한글이 깨질 수 있음). 적재 후 `agency_id`가 NFC인지 점검
- **결과**: (미기록)

### P5. 계산 검증
- **변경**: `get_agency_fee` 결과를 구 `carrier_commissions` 값과 대조(같은 조건에서 같은 금액인지)
- **확인**: 신구 일치 리포트, 불일치 항목 원인 정리
- **결과**: (미기록)

### P6. 앱 연결 (`CS_new.html`에서 개발)
- **변경**
  1. 상품·셋톱 로드를 신규 테이블로(속도 숫자, TV 4등급 확장 — 이름 매핑 코드·UI·결합할인 로직 점검)
  2. 에이전시별 수수료 호출·**나란히 표시**·선택 UI(기본 선택은 T10 기준)
  3. 유심 수수료 하드코딩 제거
  4. 접수 시 `contracts.agency_id`와 `contract_fee_lines` 저장
  5. `carrier_promotions`(사은품) 처리(T8)
- **확인**: 같은 상담 조건에서 에이전시별 표시가 맞는지, 접수 후 수수료 줄이 저장되는지
- **결과**: (미기록)

### P7. 병행 검증
- **확인**: 같은 조건에서 신구 수수료 일치, 에이전시 비교 결과, 접수·환수 흐름
- **결과**: (미기록)

### P8. 구 테이블 삭제
- **변경**: 백업 → RPC·권한 정리 → 구 테이블 7개(`internet_plans`, `tv_plans`, `settop_boxes`, `usim_plans`, `carrier_commissions`, `carrier_commissions_v2`, `carrier_promotions`(T8 결정에 따름)) 삭제
- **확인**: 삭제 후 화면 정상 동작
- **결과**: (미기록)

---

## 6. 진행 현황

- [~] P0. 자료 수집 · 현황 확정 — 스키마 CSV 수신 및 현황 정리 완료, **상세 쿼리 결과 대기**
- [~] P1. 설계 확정 — 결정 D1~D12 확정, **8장 TODO 대기**
- [ ] P2. 구조 SQL 작성 · 실행
- [ ] P3. 상품(plans) 데이터 정비
- [ ] P4. 에이전시 등록 · 수수료 적재
- [ ] P5. 계산 검증
- [ ] P6. 앱 연결
- [ ] P7. 병행 검증
- [ ] P8. 구 테이블 삭제

---

## 7. 변경 이력

- 2026-10-02(1): 스키마 CSV(26개 테이블)와 수수료 설계 가이드를 바탕으로 현황 정리, 문제점 9건 식별, 단계 P0~P8 초안
- 2026-10-02(2): 사용자 결정 반영(D2~D8) — 인터넷 속도 추가, TV 4등급, 속도 숫자, 셋톱 신규, `agency_id` 필수, 에이전시별 호출, v2는 임시 복사본. 예시 데이터 확인(T1)은 보류
- 2026-10-02(3): 사용자 결정 반영(D9~D12) — carrier 복합 외래키, `fee_*` 숫자 id, `agency_id` 한글(안전장치 포함), 계약 수수료 줄 단위 테이블. 계획서 파일(`db-redesign-plan.md`) 작성
- 2026-10-02(4): 파일 이름 규칙 추가(`db-redesign-plan_{MMDD}_{P단계}.md`), 현재 파일을 `db-redesign-plan_1002_P1.md`로 저장. 다음 작업은 P0 쿼리 결과 수신

---

## 8. 사용자 확인 대기 (TODO)

**필요 시점**과 **답이 없을 때의 기본값**을 함께 적었습니다. 기본값이 있는 항목은 답이 없으면 그대로 진행합니다.

| # | 항목 | 왜 필요한가 | 필요 시점 | 기본값 / 상태 |
|---|---|---|---|---|
| T1 | 예시 데이터 확인: KT TV 수수료 4개 등급 동일값, `bundle_fee`=`tv_fee`가 임시값인지 | 실제 값을 적재 전에 구분 | P4 전 | `[!]` 사용자 확인 대기(추후 전달) |
| T2 | P0 쿼리 결과 업로드(부록 A) | 제약·권한·함수·행 수 파악 | P0 | `[!]` 대기 |
| T3 | 에이전시 수수료 공지 양식: ① 결합수수료가 TV 행과 같은 기준(속도×TV 등급)인지 ② TV 수수료가 패밀리 여부에도 따라 달라지는지 | 결합수수료를 `fee_tv` 칼럼으로 둘지 분리할지 결정 | P1 | `[!]` 기본값: `fee_tv`의 `bundle_fee` 칼럼 |
| T4 | 구 `carrier_commissions`의 `standalone_fee`(단독), `dongpan_fee` 의미 | 새 구조에 필요한 구분(칼럼)인지 판단 | P1 | `[!]` 대기 |
| T5 | TV 4등급 매핑: 통신사별 요금제명 ↔ low/basic/high/premium | 앱 매핑·구 데이터 대응표의 기준 | P3 | `[!]` `plans_tv` 조회 결과로 초안 작성 가능 |
| T6 | 에이전시 목록: `agency_id`(짧은 한글 이름) · 정식 명칭 · 취급 통신사 | 에이전시 등록, 수수료 적재 | P1~P4 | `[!]` 대기 |
| T7 | 유심 수수료 기준: 요금제 단위인지 요금 구간 단위인지 | `fee_usim` 구조 결정 | P1 | `[!]` 기본값: 요금제 단위 |
| T8 | `carrier_promotions`(사은품 한도) 범위: 통신사 기준 유지 / 에이전시별로 변경 | 구 테이블 삭제 대상 여부 | P6 전 | `[!]` 기본값: 통신사 기준 유지(개편 제외) |
| T9 | **한 계약 = 한 에이전시**가 맞는지(인터넷과 TV를 서로 다른 에이전시로 접수하는 경우가 없는지) | `contracts.agency_id` 1칸으로 충분한지 | P1 | `[!]` 기본값: 한 계약 = 한 에이전시 |
| T10 | "수수료 효율" 기준: 자동 추천을 **총수수료 최대**로 할지(환수 조건·유지기간 등을 반영할지) | 에이전시 기본 선택·정렬 | P6 전 | `[!]` 기본값: 총수수료 최대 |
| T11 | 상품 id `int_kt_1g` → `int_kt_1000` 변경 승인 | 속도 숫자 표기와 id 일관성 | P3 | `[!]` 기본값: 변경(수수료 데이터가 적을 때) |

**사용자가 직접 정할 필요가 없는 것**(제가 정하고 문서에 기록): 제약 이름·인덱스, 함수 입출력 형태, 점검 쿼리, 앱 코드 구조 등 기술 세부.

---

## 부록 A. P0 추가 자료 쿼리 (Supabase SQL Editor에서 실행 후 CSV 전달)

**쿼리 1 — 제약·인덱스·권한·뷰·함수·행 수**

```sql
select jsonb_build_object(
 'constraints', (select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'def',pg_get_constraintdef(oid))) from pg_constraint where connamespace='public'::regnamespace),
 'indexes',     (select jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'def',indexdef)) from pg_indexes where schemaname='public'),
 'policies',    (select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'cmd',cmd,'roles',roles,'using',qual,'check',with_check)) from pg_policies where schemaname='public'),
 'views',       (select jsonb_agg(jsonb_build_object('name',viewname,'def',definition)) from pg_views where schemaname='public'),
 'functions',   (select jsonb_agg(jsonb_build_object('name',proname,'def',pg_get_functiondef(oid))) from pg_proc where pronamespace='public'::regnamespace and prokind='f'),
 'row_counts',  (select jsonb_agg(jsonb_build_object('table',relname,'rows',n_live_tup)) from pg_stat_user_tables where schemaname='public')
) as db_detail_json;
```

**쿼리 2 — 에이전시·수수료 현황(에이전시별 건수)**

```sql
select 'agencies' as src, to_jsonb(a) as val from public.agencies a
union all select 'old_commissions', jsonb_build_object('agency',agency_name,'carrier',carrier,'type',product_type,'rows',count(*)) from public.carrier_commissions group by agency_name,carrier,product_type
union all select 'fee_internet', jsonb_build_object('agency',agency_id,'carrier',carrier,'rows',count(*)) from public.fee_internet group by agency_id,carrier
union all select 'fee_tv', jsonb_build_object('agency',agency_id,'carrier',carrier,'rows',count(*)) from public.fee_tv group by agency_id,carrier
union all select 'fee_usim', jsonb_build_object('agency',agency_id,'carrier',carrier,'rows',count(*)) from public.fee_usim group by agency_id,carrier;
```

**쿼리 3 — 상품(plans) 데이터** (유심 요금제 수가 많으면 `plans_usim` 줄은 `select count(*)`로 바꿔도 됩니다)

```sql
select 'plans_internet' as src, to_jsonb(p) as val from public.plans_internet p
union all select 'plans_tv', to_jsonb(p) from public.plans_tv p
union all select 'plans_usim', to_jsonb(p) from public.plans_usim p;
```

---

## 부록 B. 구 상품·수수료 테이블 (P8에서 삭제 예정)

| 테이블 | 칼럼 요약 | 신규 대응 |
|---|---|---|
| `internet_plans` | id(serial), carrier, speed(int), monthly_fee, router_fee | `plans_internet` |
| `tv_plans` | id(serial), carrier, plan_name, channel_count, monthly_fee | `plans_tv` |
| `settop_boxes` | id(serial), carrier, model_name, monthly_fee | `plans_settop`(신규) |
| `usim_plans` | id(serial), carrier, plan_name, monthly_fee, data_allowance, tethering, voice_call, sms, is_active, tethering_allowance | `plans_usim` |
| `carrier_commissions` | carrier, product_type, speed, tv_tier, plan_name, commission_amount, standalone_fee, dongpan_fee, min_retention_period, remarks, start_at, end_at, agency_name(기본 'A'), internet_fee, tv_fee, bundle_bonus_fee, add_tv_fee, other_bonus_fee | `fee_internet` / `fee_tv` / `fee_usim` / `fee_extra` |
| `carrier_commissions_v2` | `carrier_commissions`와 같은 칼럼, NOT NULL·기본값 없음 (임시 복사본) | 삭제 |
| `carrier_promotions` | carrier, speed, tv_tier, gift_card, cash_amount, max_promo_limit, start_at, end_at | T8 결정에 따름 |

## 부록 C. 참고 — 수수료 설계 가이드의 예시 구조 (원본 요약)

- `plans_internet`: id(`int_kt_100`·`int_kt_500`·`int_kt_1g`), carrier, speed, internet_tier(low/basic/high), monthly_fee, router_fee
- `fee_internet`: id, internet_id, carrier, agency_id('티코드'), internet_fee, family_yn(Y/N), start_at/end_at
- `plans_tv`: id(`tv-kt-basic`·`high`·`low`·`premium`), carrier, plan_name(라이트·에센스·베이직·모든G 등), channel, monthly_fee, tv_tier, bundle_discount
- `fee_tv`: id, tv_id, carrier, agency_id, tv_fee, add_tv_fee, bundle_fee, start_at/end_at
- 적재 SQL의 시작일은 `2026-10-02 10:00:00+00`, KT 인터넷 수수료는 일반(N) 290,000/390,000/410,000, 패밀리(Y) 250,000/320,000/340,000 (100/500/1G)
