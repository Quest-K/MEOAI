-- 확인용: 결과가 한 줄(JSON)로 나옵니다. v2_align_status_model.sql 실행 후 이 쿼리를 실행해 결과를 알려 주세요.
select jsonb_build_object(
  'constraints', (select jsonb_agg(jsonb_build_object('name', conname, 'def', pg_get_constraintdef(oid)) order by conname)
                  from pg_constraint where conrelid = 'public.contract_items'::regclass and conname like 'chk_items_%'),
  'new_columns', (select jsonb_agg(column_name order by column_name) from information_schema.columns
                  where table_schema='public' and table_name='contract_items'
                    and column_name in ('pay_invoice_date','pay_invoice_amount','pay_collect_date','pay_collect_amount','first_received_at','proposed_at','refund_done_at')),
  'removed_still_exist', (select jsonb_agg(table_name || '.' || column_name) from information_schema.columns
                  where table_schema='public' and ((table_name='customers' and column_name='reserve_at')
                     or (table_name='contract_items' and column_name in ('opened_at','is_pay_exempt')))),
  'crm_status_logs_exists', (to_regclass('public.crm_status_logs') is not null),
  'item_status_counts', (select jsonb_object_agg(coalesce(item_status,'(null)'), n) from (select item_status, count(*) n from public.contract_items group by 1) t),
  'backup_rows', jsonb_build_object(
      'customers', (select count(*) from backup.customers_20261016),
      'contracts', (select count(*) from backup.contracts_20261016),
      'contract_items', (select count(*) from backup.contract_items_20261016),
      'status_history', (select count(*) from backup.status_history_20261016)),
  'stale_days', (select value from public.crm_settings where key = 'proposal_stale_days'),
  'contract_state_sample', (select jsonb_object_agg(coalesce(contract_state,'(없음)'), n) from (select contract_state, count(*) n from public.v_contract_state_v2 group by 1) t)
) as result;
