-- =============================================================================
-- 0021 — Add charges:capture permission to has_permission()
-- =============================================================================
-- Adds the `charges:capture` permission to the 5 roles that get it
-- (practice_owner, office_admin, physician, nurse_ma, biller). Mirrors the
-- change made to ROLE_PERMISSIONS in packages/auth/src/rbac.ts.
--
-- Distinct from billing:write — scoped to charge-line entry and self-authored
-- posting, not void/refund/write-off. See docs/charge-capture.md §5.
-- =============================================================================

create or replace function public.has_permission(
  p_permission text,
  p_tenant_id uuid default null
) returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_roles public.staff_role[];
  v_perms text[] := array[]::text[];
  v_imp record;
begin
  select coalesce(array_agg(role), array[]::public.staff_role[])
    into v_roles
    from public.current_user_roles(p_tenant_id);

  if v_roles is null or array_length(v_roles, 1) is null then
    return false;
  end if;

  if 'practice_owner' = any (v_roles) then
    v_perms := v_perms || array[
      'clinical:read','clinical:write','clinical:sign','clinical:amend',
      'patient:read','patient:write',
      'rx:create','rx:sign','rx:refill',
      'order:create','order:resolve',
      'schedule:read','schedule:write',
      'billing:read','billing:write','billing:collect','billing:adjust','billing:write_off',
      'charges:capture',
      'admin:tenant','admin:users','admin:billing_config','admin:integrations',
      'audit:read','ai:invoke'
    ];
  end if;
  if 'office_admin' = any (v_roles) then
    v_perms := v_perms || array[
      'admin:tenant','admin:users','admin:billing_config','admin:integrations',
      'billing:read','billing:write','billing:collect','billing:adjust','billing:write_off',
      'charges:capture',
      'schedule:read','schedule:write',
      'patient:read','patient:write',
      'audit:read'
    ];
  end if;
  if 'physician' = any (v_roles) then
    v_perms := v_perms || array[
      'clinical:read','clinical:write','clinical:sign','clinical:amend',
      'patient:read','patient:write',
      'rx:create','rx:sign','rx:refill',
      'order:create','order:resolve',
      'schedule:read',
      'charges:capture',
      'ai:invoke'
    ];
  end if;
  if 'nurse_ma' = any (v_roles) then
    v_perms := v_perms || array[
      'clinical:read','clinical:write',
      'patient:read','patient:write',
      'order:create',
      'schedule:read',
      'charges:capture',
      'ai:invoke'
    ];
  end if;
  if 'scheduler' = any (v_roles) then
    v_perms := v_perms || array[
      'schedule:read','schedule:write',
      'patient:read','patient:demographics_only'
    ];
  end if;
  if 'biller' = any (v_roles) then
    v_perms := v_perms || array[
      'billing:read','billing:write','billing:collect','billing:adjust','billing:write_off',
      'charges:capture',
      'clinical:read',
      'patient:read'
    ];
  end if;

  -- Strip high-risk permissions while impersonating.
  select * into v_imp from public.current_impersonation();
  if v_imp.session_id is not null then
    v_perms := array(
      select p from unnest(v_perms) as p
      where p not in (
        'clinical:sign','rx:sign','billing:adjust','billing:write_off','admin:users'
      )
    );
  end if;

  return p_permission = any (v_perms);
end;
$$;
