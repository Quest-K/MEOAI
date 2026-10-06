# 인생비서 CS 시스템 통합 인수인계서 · 진행 계획

- 작성일: 2026-10-06 (이 문서의 기준 시점)
- 대상 독자: **이 프로젝트를 처음 보는 사람 또는 AI** — 이 문서 하나로 현재 상황, 앞으로의 순서, 최종 완성 상태를 파악할 수 있게 쓴 문서입니다.
- 표기: **[확정]** 사용자가 결정함 / **[제안]** AI가 제안했고 아직 사용자 승인 전 / **[미정]** 결정 필요 / **[추정]** 파일 내용으로 추정한 것(확인 필요)
- 이 문서는 요약본입니다. 세부 기준은 아래 2장의 "기준 문서"가 우선합니다. 둘이 다르면 기준 문서를 따르고, 이 문서를 고치세요.

---

## 0. AI가 이 프로젝트에서 지켜야 할 작업 규칙

1. **운영 중인 앱을 깨지 않는다.** 구 테이블·구 RPC·구 화면 파일은 계획서가 허용한 단계(P8·S11) 전까지 수정·삭제하지 않습니다. 변경은 **"추가만"** 하는 방식으로 먼저 합니다.
2. **한 번에 하나씩, 소단위로 진행한다.** 단계 계획을 먼저 알려 준 뒤 해당 계획서(MD)에 진행 내용을 반영하면서 진행합니다.
3. **SQL은 작성만 한다.** 실행은 사용자가 Supabase SQL Editor에서 하고 결과를 알려 주면 완료 처리합니다. 실행 전 파일 머리말의 주의 사항을 먼저 읽습니다.
4. **코드는 업로드된 실제 파일 기준으로 고친다.** 추측으로 칼럼·함수명을 만들지 않습니다. 모르면 파일을 요청합니다.
5. **화면 파일을 바꾸면 `?v=` 캐시 값을 갱신한다.** (`config.js`, `Calculator.js`, `Supabaseservice.js`, `Styles.css`)
6. **테스트는 `(인생비서)테스트` 이름의 고객만 쓴다.** 실제 고객 데이터를 건드리지 않습니다.
7. **파일 이름 규칙**: 날짜·단계가 바뀌어 저장할 때는 새 이름으로 저장하고 이전 파일은 `history/`로 보관합니다. 같은 문서의 여러 버전이 섞이지 않게 합니다(현재 문제였음).
8. **응답은 한국어, 비전문가도 따라 할 수 있는 순서와 합격 기준과 함께** 안내합니다.

---

## 1. 프로젝트 개요

- 회사/서비스: 인생비서 — 인터넷·TV·유심 판매 전화 상담 CRM (Supabase + 정적 HTML/JS, git 배포)
- 핵심 화면: `CS.html` (탭: 대시보드 · 고객상담 · 고객조회 · 고객상세 · 실적조회)
- 진행 중인 큰 작업 **두 갈래(트랙)**

| 트랙 | 내용 | 기준 문서 | 상태 |
|---|---|---|---|
| **트랙 1 · 고객·계약 구조 전환 (S1~S11)** | 구 `customer_products` 중심 구조 → 고객ID·계약ID·상품ID 구조. 개발은 `CS_new.html`에서, S9에서 `CS.html`로 교체 | `cs-migration-plan` (최신 v23) | S1~S8 완료, **S9 컷오버 전 확인표 진행 중**, S9b·S9c·S10·S11 남음 |
| **트랙 2 · 상품·수수료·에이전시 DB 개편 (P0~P8)** | 상품(`plans_*`)·수수료(`fee_*`) 분리, **에이전시 2곳 이상 수수료 비교**, 통신사 표준 6개로 변경 | `db-redesign-plan` (`_1002_P1` 이후 갱신 필요) | P1(설계 확정) 진행 중. 신규 테이블은 일부 KT 시험 데이터만 있음 |

두 트랙은 모두 `CS_new.html`·`Supabaseservice.js`를 건드립니다. **순서는 5장**에 정했습니다.

---

## 2. 파일 인벤토리 (2026-10-06 업로드 기준)

### 2.1 현재 기준 파일 (이것을 쓴다)

| 파일 | 역할 |
|---|---|
| `CS_new.html` | 새 구조 화면(개발본). 참조: `config.js?v=20261002b` · `Calculator.js?v=20260930h` · `Supabaseservice.js?v=20261006a` · `Styles.css?v=20261002a` |
| `Supabaseservice.js` (업로드명 `Supabaseservice__1_.js`) | DB 접근 함수. 에이전시 표시용 코드와 `?commMock=1`(가짜 에이전시 화면 확인 모드) 포함 |
| `config.js` | 통신사·상태값·상수. 통신사 키 `kt, lg, skb, skt` 사용(변경 대상) |
| `Calculator.js` | 요금·수수료·사은품 계산. 유심 수수료는 하드코딩 구간표(`USIM_COMMISSION_BANDS`) |
| `Styles.css` | 스타일 (`skt` 관련 8곳) |
| `cs-migration-plan-1.md` | 트랙 1 계획서 **v23 (2026-10-04)** — 최신본 |
| `cutover-checklist.md` | 컷오버 전 확인표(A~E, **A-3 포함**) — 최신본 |
| `cutover-runbook.md` | 컷오버 실행 순서·롤백(S9c). 계획서 v24 기준이라고 적혀 있음 |
| `테이블_구조변경1002_P1.md` | 트랙 2 계획서(현재 파일명 규칙상 `db-redesign-plan_1002_P1`) |

### 2.2 옛 버전 → `history/` 보관 (현재 기준 아님)

| 파일 | 설명 |
|---|---|
| `cs-migration-plan__2_.md` | 트랙 1 계획서 v18 |
| `상태값_구조변경_1002_14_10.md` | 트랙 1 계획서 v14 (파일명이 트랙 2처럼 보이지만 내용은 트랙 1 v14) |
| `cutover-checklist__1_.md` | 확인표 구판(A-3 없음, `Supabaseservice.js?v=20261003a`) |

### 2.3 삭제된 파일 (2026-10-06 정리 완료)

| 파일 | 설명 |
|---|---|
| `CS1.html` | `CS_new.html`의 옛 중간본(S6 반영). 운영 파일이 아니었음 → **삭제 완료** [확정] |
| `contracts.html` | 예시 데이터만 있던 DB 연결 없는 목업. 고객상세 탭이 대체 → **삭제 완료** [확정] |

### 2.3-1 저장소 폴더 구조 (2026-10-06 확인, 개발 환경 Codespaces, 정리 브랜치 `chore/repo-cleanup`)

| 위치 | 내용 | 상태 |
|---|---|---|
| `isbs/test/` | **운영 + 개발 폴더.** 직원이 쓰는 `CS.html`(구)와 개발본 `CS_new.html`, `config.js`·`Calculator.js`·`Styles.css`·`Supabaseservice.js`, `docs/` | [확정] 운영은 `isbs/test/` |
| `isbs/` (test 밖) | `CS.html`, `config.js`, `Calculator.js`, `CA.html`, `CS12.html`, `edu.html`, `flow.html` 등 별도 복사본 | [미정] 용도 불명, **확인 전 이동·삭제 금지** |
| `isbs/work/` | `main.html`, `home.html`, `crmtest.html` | [미정] 구 상품·수수료 테이블 사용 여부 점검 필요(A3) |
| `isbs/test/docs/` | `cutover/`, `handoff/`, `history/`, `plans/` | 정리 완료 |

**컷오버 = `isbs/test/` 안에서 `CS_new.html`을 `CS.html`로 교체**하는 작업입니다(런북과 동일). 백업 폴더는 `isbs/test/old/`에 만듭니다.

### 2.4 데이터 파일(CSV, Supabase 내보내기)

파일명의 `_rows`는 내보내기 접미사이며 **Supabase 실제 테이블명에는 없습니다.**

| 파일 | 행 수 | 설명 |
|---|---|---|
| `internet_plans` / `tv_plans` / `usim_plans` | 25 / 40 / 76 | **구 상품 테이블(운영 앱이 읽음)** |
| `plans_internet` / `plans_tv` / `plans_usim` | 3 / 4 / 76 | 신규 상품 테이블. internet·tv는 KT 시험값뿐, usim은 구 테이블과 동일 복사본 |
| `carrier_commissions` (`..._rows (1)`) | 246 | 구 수수료 원본 |
| `carrier_commissions_new` | 246 | 새 수수료 체계용 작업본, `bundle_fee` 칼럼 추가됨. 구 원본과 38행 값이 다름 |
| `fee_internet` / `fee_tv` | 6 / 4 | 신규 수수료 테이블, KT·티코드(→티코디로 수정 예정) 시험값 |
| `agencies` | 3 | 백메가, 티인포, 티코드(**→ 티코디로 수정**) |

### 2.5 이 업로드에 없는 파일 (필요 시 요청할 것)

- SQL: `01_structure`, `02_migration.sql`, `03a`, `03b_cutover_finalize.sql`, `03c_reopen_for_remigration.sql`, `rls_hardening`, `d1b_followup_check.sql`
- 인수인계 이전 문서: `insaeng-project-handoff-2026-10-01.md`
- 계획서 **v24**(런북이 가리킴), `db-redesign-plan`의 P1 이후 파일
- 다른 화면: `main.html` 등 (구 상품·수수료 테이블 사용 여부 점검 필요)

### 2.6 알려진 불일치 (먼저 정리할 것)

1. 런북은 "계획서 v24 기준"인데 업로드된 계획서는 v23입니다.
2. 수수료 작업본이 계획서에는 `carrier_commissions_v2`, 실제 파일은 `carrier_commissions_new`입니다. 같은 것인지 확인이 필요합니다.
3. 트랙 1 계획서 v14가 `상태값_구조변경_…`이라는 이름으로 저장되어 있어 트랙 2 문서로 오해하기 쉽습니다.

---

## 3. 현재 상태 스냅샷 (2026-10-06)

### 3.1 DB (Supabase)

- **고객·계약 새 구조**: `customers`, `contracts`, `contract_proposals`, `contract_items`, `status_history`, 뷰 `v_customer_overview`·`v_contract_overview`. 연락처는 숫자만 저장, 1연락처 1고객.
- 실행 완료(2026-10-01 기준 기록): `01_structure` · `02_migration` · `03a`(백업 스키마 `backup`, 연락처 숫자화·CHECK) · `rls_hardening`
- **`03b`(확정) 미실행**. 이전된 계약은 모두 `source = legacy`. 실제 상태는 런북 0-3으로 다시 확인합니다.
- 구 구조 `customer_products`·`customer_status_logs`·`funnel_status`는 아직 존재하며 `CS_new.html`도 일부 읽음(정리는 S11).
- **상품·수수료**: 구 7개 테이블(`internet_plans`, `tv_plans`, `settop_boxes`, `usim_plans`, `carrier_commissions`, `carrier_commissions_v2`, `carrier_promotions`)을 **운영 앱이 읽는 중**. 신규 7개(`plans_internet/tv/usim`, `agencies`, `fee_internet/tv/usim`)는 생성됐지만 데이터 일부만 있음.
- 수수료 RPC: `get_admin_commissions` (운영 앱이 호출, 정의 미확인·`carrier_commissions`를 읽는 것으로 추정)

### 3.2 앱 (git)

- 운영: `isbs/test/CS.html`(구 화면, 직원이 현재 사용 중, `Styles.css?v=20260930j`) [확정]
- 개발: `isbs/test/CS_new.html`(운영 화면과 같은 폴더) — 5개 탭 구현, 컷오버 확인표 **A1~A10(A-2까지) 완료**, **A-3(수수료 에이전시 표시, `?commMock=1`) 진행 필요**, B·C·D·E 미진행
- 에이전시 화면 코드는 있으나 **DB 연결 전**(가짜 데이터로만 확인 가능)

### 3.3 컷오버 확인표 진행도

| 구간 | 상태 |
|---|---|
| A (화면 열림) · A-2 (고객상세) | 완료 |
| A-3 (에이전시 표시, A11~A16) | **다음에 할 일** |
| B (신규 상담 저장) · C (접수 이후 계약) · D (실적조회) · E (이전 데이터 고객) | 미진행 |

---

## 4. 확정된 결정 (결정 로그)

### 4.1 고객·계약 구조 (트랙 1)

- 고객 상태 5개: 상담대기 / 상담중 / 상담완료(화면 표시 `유치`) / 이탈 / 제외 [확정]
- 계약 = 설치 건 (인터넷+TV 1계약, 유심은 별도 계약이며 인터넷 계약에 연결). 접수·지급·환수는 계약 단위. 상품 행 상태는 설치대기 / 설치완료 / 접수취소만 [확정]
- 기존 6그룹 퍼널(상담/계약/지급/환수/종결/이탈)은 새 구조의 표시용 상태 사전으로 매핑 [확정]
- 부재 3회는 자동 종결 없이 "이탈 · 고객부재로 직접 변경" 안내만 [확정]
- 적정사은품: 기본 60% + 속도(500M +5%, 1기가 +10%) + TV(기본형 +5%, 고급형 +10%), 10,000원 단위 내림 [확정]
- `03b`는 실사용 1~3영업일 후 실행 권장 (런북 4장) [제안]

### 4.2 상품·수수료·에이전시 (트랙 2)

| # | 결정 | 상태 |
|---|---|---|
| 1 | 테이블 이름은 **"용도_상세"** 순서 (`usim_plans` → `plans_usim`). 기존 테이블은 두고 신규 생성 → 앱 연결 → 기존 삭제 | [확정] |
| 2 | 에이전시명은 **`티코디`** 가 맞음 (`agencies`의 `티코드` 수정) | [확정] |
| 3 | **통신사 표준값 6개**: `KT`, `LG홈`, `LGbiz`, `SKB`, `SKT`, `SKY`(스카이라이프) | [확정] |
| 4 | **TV 등급**: `none`(TV 없음) / `low` / `basic` (기존 동일) / 기존 `premium` → **`high`** / 기존 `premium+` → **`premium`** | [확정] |
| 5 | **수수료 체계**: 기존 "인터넷수수료, TV수수료(결합 포함)" → **인터넷 · TV · 결합 · 추가TV · 기타** 분리. 이를 위해 `carrier_commissions_new` 작업본 생성 중 | [확정] |
| 6 | **속도 표기는 숫자**(100·200·500·1000…). `'1g'` → 1000 | [확정] |
| 7 | 앱은 에이전시를 각각 호출해 **나란히 표시**하고 더 유리한 곳으로 접수 | [확정] |
| 8 | `fee_*`의 `agency_id` 필수, `fee_*` id는 자동 증가 숫자 | [확정] |
| 9 | 총수수료는 저장하지 않고 조회 함수에서 계산 | [확정] |
| 10 | 계약의 접수 에이전시는 `contracts.agency_id`, 수수료 내역은 줄 단위 `contract_fee_lines` | [확정] |
| 11 | 한 계약 = 한 에이전시 전제 | [미정] 계획서 T9에서 확인 |

---

## 5. 진행 방식과 순서 [제안]

### 5.1 원칙: Supabase는 "추가만" 먼저, git은 `CS_new.html`에서 한 번에

- 2안(git 먼저)은 앱이 없는 테이블을 호출해 **운영이 깨지므로 불가**.
- 3안(왕복)은 단계마다 앱이 바뀌어 운영 위험·체크리스트 재수행이 늘어 비추천.
- 따라서 **1안 변형**: Supabase는 구 테이블·구 RPC를 건드리지 않고 **신규만 추가** → git은 마지막에 한 번에 전환.
- 신규 수수료 테이블이 채워진 뒤 전환 전까지는 **단가 수정을 구 테이블에서만** 하고, 전환 직전에 대조합니다(이중 입력 방지).

### 5.2 전체 순서

```
[지금]  A-3 확인(가짜 데이터)  ──┐
        A  사전 보존            │
        B  Supabase 추가(상품·수수료)   ← 운영 앱 영향 0
        C  Supabase 추가(계약 쪽)       ← 운영 앱 영향 0
                                 ▼
        S9 컷오버 (구 상품 테이블 그대로 사용)
                                 ▼
        1~2주 안정화 → S9 후 03b 확정
                                 ▼
        D  git 전환(상품·수수료 신규 테이블 사용, CS_new 계열)
                                 ▼
        E  구 테이블·구 코드 정리 (P8, S11)
```

**왜 컷오버를 먼저 하나**: 상품 전환(D)을 컷오버 전에 하면 `Supabaseservice.js`·`config.js`가 바뀌어 확인표 A~E를 다시 해야 하고, 롤백 경우의 수가 두 배가 됩니다.

---

## 6. 작업 목록 (소단위)

> 완료되면 `[ ]` → `[x]`로 바꾸고, 7장 변경 이력에 한 줄 추가하세요.

### A. 사전 보존
| # | 곳 | 대상 | 작업 | 합격 기준 |
|---|---|---|---|---|
| [x] A0 | git | 문서 구조 | `isbs/test/docs/` 정리, `CS1.html`·`contracts.html` 삭제, 체크리스트·런북 반영 (2026-10-06 커밋) | 완료 |
| [ ] A1 | git | `isbs/test/`의 운영 파일 5개 | 태그 `prod-before-p6` 생성, `isbs/test/old/`에 날짜 붙여 보관(런북 0-2) | 5개 파일 보관됨 |
| [ ] A2 | Supabase | `backup` 스키마 | 구 상품·수수료 7개 테이블 스냅샷 복사(읽기만) | 행 수가 원본과 같음 |
| [ ] A3 | git | `isbs/work/main.html` 등 다른 화면, `isbs/` 바깥 복사본 | `carrier_commissions`·`*_plans`·`settop_boxes`·`carrier_promotions` 사용처 검색 | 사용처 목록 작성(삭제 전 판단용) |

### B. Supabase 추가 — 상품·수수료 (기존 앱 영향 0)
| # | 대상 | 작업 |
|---|---|---|
| [ ] B1 | `agencies` | `티코드` → `티코디` 수정. `fee_internet` 6행·`fee_tv` 4행은 `on update cascade` 확인 후 함께 수정 |
| [ ] B2 | `carriers`(신설) | 표준값 6개(KT, LG홈, LGbiz, SKB, SKT, SKY) 참조 테이블, `plans_*`·`fee_*`가 이를 참조 |
| [ ] B3 | `plans_internet` | `speed` 정수화(`'1g'`→1000), 구 `internet_plans`에서 이관, `monthly_fee` 0 값 채움 |
| [ ] B4 | `plans_tv` | 등급 `none/low/basic/high/premium` 제약, 구 `tv_plans`에서 이관 |
| [ ] B5 | `plans_usim` | 통신사 값(현재 `KT`·`LG`·`SK`) 표기를 표준 6개에 맞출지 결정 후 반영 |
| [ ] B6 | `plans_settop`(신설) | `settop_boxes`에서 이관 |
| [ ] B7 | `fee_*` | 새 수수료 체계(인터넷·TV·결합·추가TV·기타) 구조 확정 → SQL 작성 |
| [ ] B8 | 이관 SQL | `carrier_commissions_new` 정리 후 `fee_*`로 이관 (아래 변환 규칙) |
| [ ] B9 | 함수 | 신규 `get_agency_fee(...)` 추가. **구 `get_admin_commissions`는 수정 금지** |
| [ ] B10 | 권한(RLS) | `fee_*` 로그인 전용, `plans_*`는 현재 앱과 같은 읽기 권한 |
| [ ] B11 | 대조 | 구 금액 vs 신규 금액 대조 쿼리(통신사·속도·등급별 불일치 0건) |

**B8 변환 규칙**
- 통신사: `SKYLIFE`·`SKY` → `SKY`, `LGbiz`·`LGBIZ` → `LGbiz`, `LG` → `LG홈`, `SK`(10행)는 상품 종류 확인 후 판단
- TV 등급: **`premium` → `high`를 먼저, 그다음 `premium+` → `premium`** (순서를 바꾸면 값이 충돌)
- 에이전시: `티코디`(74행) 유지, `A`(10행)는 확인 후 정정/제외
- `실속형`(4행)·`tv_tier` 빈값(7행)은 별도 판단

### C. Supabase 추가 — 계약 쪽 (P2)
| # | 대상 | 작업 |
|---|---|---|
| [ ] C1 | `contracts` | `agency_id` 칼럼 추가(NULL 허용, 기존 행 영향 없음) |
| [ ] C2 | `contract_fee_lines`(신설) | 수수료 종류별 줄 단위 저장 테이블 |

### S9. 컷오버 (트랙 1)
| # | 작업 |
|---|---|
| [ ] S9-1 | 확인표 **A-3**(`CS_new.html?commMock=1`, A11~A16) |
| [ ] S9-2 | 확인표 B → C → D → E |
| [ ] S9-3 | S9b: `?v=` 갱신, `CS.html` 교체용 최종 파일 생성 |
| [ ] S9-4 | 런북 0~3단계 실행(백업 확인 → `02` 재이전 → 새 화면 배포 → 배포 직후 확인) |
| [ ] S9-5 | 1~3영업일 사용 후 `03b_cutover_finalize.sql` |

### D. git 전환 (컷오버 후, `CS_new.html` 계열만 수정)
| # | 파일 | 작업 |
|---|---|---|
| [ ] D1 | `config.js` | `CARRIERS`·`CARRIER_LABEL`·`BRAND_LABEL`·`MOBILE_GROUP_MAP`·`ISP_HOME_CARRIER_MAP`을 6개 통신사로. TV 등급 상수를 5값(none 포함)으로(`premium` 8곳 점검) |
| [ ] D2 | `Calculator.js` | `premium` 2곳·속도 표기 확인, 유심 수수료 구간표를 `fee_usim`으로 이동 |
| [ ] D3 | `Supabaseservice.js` | 테이블명 교체(`internet_plans`→`plans_internet` 등), 신규 함수를 에이전시 수만큼 호출, **결과를 구 모양으로 바꾸는 변환부를 한 곳**에 두어 나머지 변경 최소화 |
| [ ] D4 | `CS_new.html` | `usim_plans`→`plans_usim`, `tvTier` 27곳 등급 체계 적용, 에이전시 표시를 실데이터로 |
| [ ] D5 | `Styles.css` | `skt` 관련 8곳에 SKY·LG홈·LGbiz 색상·클래스 추가 |
| [ ] D6 | 확인표 | A11~A16을 실데이터 기준으로 개정, `?v=` 갱신 |

### E. 정리
| # | 곳 | 작업 |
|---|---|---|
| [ ] E1 | Supabase | 1~2주 안정화 후 구 상품·수수료 테이블 7개와 `carrier_commissions_new` 삭제 (A3 점검 통과 후) — P8 |
| [ ] E2 | Supabase·git | 구 구조(`funnel_status`·`customer_products`·`customer_status_logs`) 코드·칼럼 정리 — S11 |
| [ ] E3 | git | `commMock`(가짜 에이전시 모드) 제거, `contracts.html` 폐기 |

---

## 7. 최종 완성 상태 (목표 모습)

### 7.1 운영 파일 구성

```
/ (운영 루트)
├─ (실제 위치: isbs/test/)
├─ CS.html                  ← CS_new.html에서 ?v= 만 바꿔 교체한 최종본
├─ config.js · Calculator.js · Supabaseservice.js · Styles.css
├─ main.html 등 기타 화면    (구 테이블 의존 제거 확인 후)
├─ old/                     ← 컷오버 전 운영 파일 5개 (날짜 붙은 이름)
└─ docs/                    ← 현재 isbs/test/docs/ (웹 노출 여부 확인 필요, 8장 #9)
   ├─ handoff/   insaeng-project-handoff-YYYY-MM-DD.md   (최신 1개만 루트에, 이전은 history)
   ├─ plans/     cs-migration-plan.md · db-redesign-plan_MMDD_P#.md
   ├─ cutover/   cutover-checklist.md · cutover-runbook.md
   └─ history/   옛 버전 전부 (v18, v14, 구 확인표 등)
```

### 7.2 최종 DB 구조

| 구분 | 테이블 | 비고 |
|---|---|---|
| 고객·계약 | `customers`, `contracts`, `contract_proposals`, `contract_items`, `status_history`, `contract_fee_lines`(신설), 뷰 `v_customer_overview`·`v_contract_overview` | `customer_contacts` 유지 여부는 [미정] (`CS_new.html`이 사용 중) |
| 상품 | `carriers`(신설), `plans_internet`, `plans_tv`, `plans_usim`, `plans_settop` | 통신사 6개, TV 등급 5값, 속도 숫자 |
| 수수료 | `agencies`(백메가·티인포·티코디), `fee_internet`, `fee_tv`, 결합·추가TV(구조 [미정]), `fee_usim`, `fee_extra` | 모든 행에 `agency_id` 필수, 로그인 전용 |
| 사은품 | `carrier_promotions` | 새 이름 [미정] |
| 삭제됨 | `internet_plans`, `tv_plans`, `settop_boxes`, `usim_plans`, `carrier_commissions`(+`_v2`/`_new`), `customer_products`, `customer_status_logs`, `funnel_status` 칼럼 | |

### 7.3 최종 동작 기준 (완료 판정)

1. 모든 상품·수수료 조회가 **신규 `plans_*`·`fee_*`** 에서 나오고, 구 테이블을 읽는 코드가 없다.
2. 통신사는 **KT / LG홈 / LGbiz / SKB / SKT / SKY** 6개만 쓴다. TV 등급은 `none/low/basic/high/premium`, 속도는 숫자.
3. 상담·추천상품 화면에서 **에이전시별 수수료가 나란히** 보이고, 접수한 계약에 **접수 에이전시와 수수료 줄 내역**이 저장된다.
4. 신규 수수료 금액이 구 데이터와 대조해 의도한 값과 일치한다(B11).
5. 컷오버 확인표 A~E 전부 합격, `03b` 실행 후 `legacy` 계약 0건.
6. 가짜 에이전시 모드·목업 파일·옛 버전 문서가 운영 폴더에 남아 있지 않다.

---

## 8. 결정이 필요한 항목 (먼저 풀어야 막히지 않는 것)

| # | 항목 | 영향 단계 |
|---|---|---|
| 1 | `hello`·`dlive`(구 인터넷 7행·TV 10행)가 표준 6개에 없음 → 제외할지, 다른 코드로 옮길지 | B3·B4 |
| 2 | 결합·추가TV 수수료를 `fee_tv` 칼럼으로 둘지 별도 테이블로 둘지 | B7·B8·D3 |
| 3 | 유심 통신사 값(`KT/LG/SK`)을 표준 6개 체계로 맞출지, SKT와 `SK` 묶음 처리 | B5·D1 |
| 4 | `carrier_commissions_new` = 계획서의 `carrier_commissions_v2`인지, 작업본 완료 시점 | B8 |
| 5 | 수수료 원본 `A` 에이전시(10행), `SK`(10행), `실속형`(4행)의 정체 | B8 |
| 6 | 계획서 v24 및 `db-redesign-plan` P1 이후 파일 위치 | 문서 정리 |
| 7 | 사은품 테이블(`carrier_promotions`) 새 이름 | B 단계 이후 |
| 8 | `isbs/work/main.html` 등 다른 화면의 구 테이블 사용 여부 | A3 → E1 |
| 9 | `isbs/test/`가 웹에 서빙된다면 `docs/`(계획서·SQL 구조 정보)가 외부에서 보일 수 있음 → 저장소 공개 여부·배포 방식 확인, 필요 시 `docs/`를 서빙 폴더 밖으로 이동 | 문서 보안 |
| 10 | `isbs/` 바깥의 `CS.html`·`config.js`·`Calculator.js`·`CA.html`·`CS12.html`·`edu.html`·`flow.html` 용도 | 정리 단계 |

---

## 9. 롤백 기준

| 상황 | 방법 |
|---|---|
| 컷오버 직후 문제 | `old/`의 5개 파일로 되돌림(`?v=`가 같으면 Ctrl+Shift+R). 새 화면에서 저장한 데이터는 새 테이블에만 있고 구 화면에 보이지 않음 → 테스트 고객 외 데이터를 저장했다면 되돌리기 전에 확인 |
| 재이전 결과 오류 | `backup` 스키마(03a 생성)로 복구 |
| `03b` 후 `02` 재실행 필요 | `03c_reopen_for_remigration.sql`로 다시 연 뒤 `02` 재실행 |
| 상품 전환(D) 후 문제 | 이전 `Supabaseservice.js`·`config.js`·`Calculator.js`·`CS.html`로 복귀. 구 테이블이 아직 있으므로 즉시 가능 → **E1(삭제)은 안정화 후에만** |

---

## 10. 이 문서 갱신 규칙

- 단계가 끝나면 ① 6장 체크 ② 3장 현황 ③ 8장 결정 항목 ④ 11장 변경 이력을 갱신합니다.
- 날짜가 바뀌어 저장하면 새 이름(`insaeng-project-handoff-YYYY-MM-DD.md`)으로 저장하고 이전 파일은 `docs/history/`로 보냅니다.
- 새 파일을 업로드받으면 2장 인벤토리부터 갱신합니다.

---

## 11. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-06 (개정) | git 정리 반영: `CS1.html`은 `CS_new.html`의 옛 중간본으로 확인되어 삭제, 운영 폴더를 `isbs/test/`로 확정, 저장소 구조(2.3-1)와 미확인 항목(8장 #9·#10) 추가 |
| 2026-10-06 | 최초 통합 작성: 업로드된 파일 14개 + CSV 11개 정리, 트랙 1·2 통합, 통신사 6개·TV 등급·수수료 분리·속도 숫자 결정 반영, 1안 변형 진행 순서 제안 |