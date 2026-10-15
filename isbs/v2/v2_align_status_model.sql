-- =====================================================================
-- V2 상태 모델 보정 (4-3b) — 2026-10-16
--  운영 DB에 적용된 정의서 v1.4 칼럼을, 확정된 상태 사전 v2 에 맞춥니다.
--  * 한 번에 실행하세요 (begin ~ commit). 중간에 오류가 나면 아무것도 바뀌지 않습니다. 여러 번 실행해도 안전합니다.
--  * 먼저 백업 스키마(backup)에 4개 테이블을 복사합니다.
--  * 바꾸는 것
--    1) 상품 상태: 변경요청·변경완료 제거 (기존 값은 상품제안·접수완료로 옮김)
--    2) 접수보류 사유 3개 추가 (서류 대기 / 고객 확인 대기 / 일정 조율)
--    3) 수수료 정산 값 변경: 발행예정 / 발행완료 / 수금완료 (+ 발행·수금 일자·금액 칼럼)
--    4) 새 칼럼: first_received_at, proposed_at, refund_done_at
--    5) 중복 칼럼 정리: customers.reserve_at(→next_contact_at), contract_items.opened_at(→installed_at),
--       is_pay_exempt(→pay_status='지급제외'), 빈 crm_status_logs 삭제
--    6) 뷰 v_contract_state_v2 / v_customer_overview_v2 를 새 규칙으로 교체
--    7) 설정값 proposal_stale_days = 7
--  * 고객 구분 값은 그대로 가망고객/잠재고객/제외고객 을 씁니다 (앱에서 가망/잠재/제외와 변환).
-- =====================================================================
begin;

-- 0. 백업 ---------------------------------------------------------------
create schema if not exists backup;
create table if not exists backup.customers_20261016      as table public.customers;
create table if not exists backup.contracts_20261016      as table public.contracts;
create table if not exists backup.contract_items_20261016 as table public.contract_items;
create table if not exists backup.status_history_20261016 as table public.status_history;

-- 1. 제약 교체 (값을 옮기기 전에 먼저 풉니다) -----------------------------------
alter table public.contract_items drop constraint if exists chk_items_item_status;
alter table public.contract_items drop constraint if exists chk_items_pay_invoice_status;
alter table public.contract_items drop constraint if exists chk_items_status_reason;

-- 2. 값 이동 -------------------------------------------------------------
update public.contract_items set item_status = '접수완료' where item_status = '변경완료';
update public.contract_items set item_status = '상품제안' where item_status = '변경요청';
update public.contract_items set pay_invoice_status = '발행완료' where pay_invoice_status in ('계산서발행완료','수금예정');
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='contract_items' and column_name='is_pay_exempt') then
    execute 'update public.contract_items set pay_status = ''지급제외'' where is_pay_exempt is true and pay_status is null';
  end if;
end $$;

alter table public.contract_items add constraint chk_items_item_status
  check (item_status is null or item_status in
    ('상품제안','접수대기','접수보류','접수완료','개통완료','접수불가','접수취소'));
alter table public.contract_items add constraint chk_items_pay_invoice_status
  check (pay_invoice_status is null or pay_invoice_status in ('발행예정','발행완료','수금완료'));
alter table public.contract_items add constraint chk_items_status_reason
  check (item_status_reason is null or item_status_reason in
    ('신용불량','설치불가','고객변심','상품변경','서류 대기','고객 확인 대기','일정 조율','기타'));

-- 3. 새 칼럼 -------------------------------------------------------------
alter table public.contract_items add column if not exists pay_invoice_date   date;         -- 세금계산서 발행일
alter table public.contract_items add column if not exists pay_invoice_amount numeric;      -- 발행 금액
alter table public.contract_items add column if not exists pay_collect_date   date;         -- 수금일
alter table public.contract_items add column if not exists pay_collect_amount numeric;      -- 수금 금액
alter table public.contract_items add column if not exists first_received_at  timestamptz;  -- 접수완료 최초 시각(유치 지표)
alter table public.contract_items add column if not exists proposed_at        timestamptz;  -- 상품제안 시각(제안 방치 판단)
alter table public.contract_items alter column proposed_at set default now();
alter table public.contract_items add column if not exists refund_done_at     date;         -- 환수완료일

-- 4. 중복 칼럼 정리 -------------------------------------------------------
do $$
declare conflict int; n int;
begin
  -- 4-1. customers.reserve_at → 기존 next_contact_at 사용
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='customers' and column_name='reserve_at') then
    execute 'select count(*) from public.customers where reserve_at is not null and next_contact_at is not null and reserve_at::timestamptz <> next_contact_at::timestamptz' into conflict;
    if conflict > 0 then raise exception 'reserve_at 와 next_contact_at 값이 서로 다른 고객이 %명 있습니다. 확인 후 다시 실행하세요.', conflict; end if;
    execute 'update public.customers set next_contact_at = reserve_at where next_contact_at is null and reserve_at is not null';
    execute 'drop index if exists public.idx_customers_reserve_at';
    execute 'alter table public.customers drop column reserve_at';
  end if;

  -- 4-2. contract_items.opened_at → 기존 installed_at 사용
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='contract_items' and column_name='opened_at') then
    execute 'select count(*) from public.contract_items where opened_at is not null and installed_at is not null and opened_at::date <> installed_at::date' into conflict;
    if conflict > 0 then raise exception 'opened_at 와 installed_at 값이 서로 다른 상품이 %건 있습니다. 확인 후 다시 실행하세요.', conflict; end if;
    execute 'update public.contract_items set installed_at = opened_at where installed_at is null and opened_at is not null';
    execute 'alter table public.contract_items drop column opened_at';
  end if;

  -- 4-3. is_pay_exempt → pay_status = ''지급제외'' 로 일원화 (위에서 값 이동 완료)
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='contract_items' and column_name='is_pay_exempt') then
    execute 'alter table public.contract_items drop column is_pay_exempt';
  end if;

  -- 4-4. crm_status_logs : 비어 있을 때만 삭제 (이력은 status_history 를 씁니다)
  if to_regclass('public.crm_status_logs') is not null then
    execute 'select count(*) from public.crm_status_logs' into n;
    if n = 0 then execute 'drop table public.crm_status_logs';
    else raise notice 'crm_status_logs 에 % 행이 있어 삭제하지 않았습니다. status_history 로 옮길지 확인해 주세요.', n; end if;
  end if;
end $$;

-- 5. 설정값 ---------------------------------------------------------------
insert into public.crm_settings (key, value, description)
values ('proposal_stale_days', '7', '상품제안 상태가 이 일수 이상 유지되면 업무 목록에 "제안 후 미진행"으로 표시')
on conflict (key) do nothing;

-- 6. 뷰 재작성 (상태 사전 v2: 지급제외·개통완료 반영, 변경요청·변경완료 제거) -----------------
create or replace view public.v_contract_state_v2 as
select
  c.contract_id,
  case
    when count(i.item_id) filter (where i.item_status is not null) = 0 then null
    when bool_and(i.item_status in ('접수불가','접수취소')) filter (where i.item_status is not null) then '취소'
    when bool_or(i.refund_status is not null) then '환수'
    when bool_or(
           (i.item_status in ('접수대기','접수보류','접수완료','개통완료')
              and coalesce(i.pay_status,'') <> '지급완료'
              and not (coalesce(i.pay_status,'') = '지급제외' and i.item_status = '개통완료'))
           or coalesce(i.pay_status,'') in ('지급요청','지급보류')
         ) filter (where i.item_status not in ('접수불가','접수취소')) then '진행'
    when bool_or(
           coalesce(i.pay_status,'') = '지급완료'
           or (coalesce(i.pay_status,'') = '지급제외' and i.item_status = '개통완료')
         ) filter (where i.item_status not in ('접수불가','접수취소')) then '완료'
    else '제안'
  end as contract_state
from public.contracts c
left join public.contract_items i on i.contract_id = c.contract_id
group by c.contract_id;

create or replace view public.v_customer_overview_v2 as
select
  cu.customer_id,
  coalesce(s.item_count, 0)          as item_count,
  coalesce(s.acquired_item_count, 0) as acquired_item_count,   -- 접수대기 이상(불가·취소·제안 제외)
  coalesce(s.paid_item_count, 0)     as paid_item_count,       -- 지급완료
  coalesce(s.open_pay_count, 0)      as open_pay_count,        -- 지급요청·지급보류
  coalesce(s.open_refund_count, 0)   as open_refund_count,     -- 환수요청
  (coalesce(s.acquired_item_count, 0) > 0) as is_acquired
from public.customers cu
left join lateral (
  select count(*) as item_count,
         count(*) filter (where i.item_status in ('접수대기','접수보류','접수완료','개통완료')) as acquired_item_count,
         count(*) filter (where i.pay_status = '지급완료')               as paid_item_count,
         count(*) filter (where i.pay_status in ('지급요청','지급보류'))  as open_pay_count,
         count(*) filter (where i.refund_status = '환수요청')             as open_refund_count
  from public.contract_items i where i.customer_id = cu.customer_id
) s on true;

commit;

-- =====================================================================
-- 롤백 방법 (문제가 생겼을 때, 필요한 부분만)
--  * 값: backup.contract_items_20261016 / backup.customers_20261016 에서 칼럼 값을 복사
--  * 제약: 옛 제약은 supabase_step1_add_columns.sql 의 chk_items_item_status / chk_items_pay_invoice_status / chk_items_status_reason 정의 참고
--  * 삭제한 칼럼(reserve_at, opened_at, is_pay_exempt): add column 으로 다시 만들고 백업에서 값 복사
-- =====================================================================
