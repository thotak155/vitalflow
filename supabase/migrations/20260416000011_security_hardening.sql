-- =============================================================================
-- 0011 — Security hardening (applied after advisor pass)
-- =============================================================================

-- Recreate usage_monthly view with SECURITY INVOKER so RLS on usage_events
-- is enforced against the querying user, not the view creator.
drop view if exists public.usage_monthly;
create view public.usage_monthly
with (security_invoker = true) as
select
  tenant_id,
  meter,
  date_trunc('month', occurred_at) as period_start,
  sum(quantity) as total_quantity,
  count(*) as event_count
from public.usage_events
group by 1,2,3;

-- Lock down mutable search_path on helper functions.
alter function public.set_updated_at() set search_path = pg_catalog, public;
alter function public.apply_inventory_transaction() set search_path = pg_catalog, public;
