-- =============================================================================
-- 0015 — Impersonation RPCs (start + end)
-- =============================================================================
-- Server-side API called by the TS `@vitalflow/auth/impersonation` module.
-- All policy enforcement lives here; the TS wrapper is convenience only.
-- =============================================================================

create or replace function public.impersonate_start(
  p_tenant_id        uuid,
  p_target_user_id   uuid,
  p_reason           text,
  p_approved_by      uuid default null,
  p_duration_minutes integer default 60
)
returns table (
  session_id       uuid,
  impersonator_id  uuid,
  target_user_id   uuid,
  tenant_id        uuid,
  started_at       timestamptz,
  expires_at       timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_target_kind public.user_kind;
  v_approver_is_admin boolean;
  v_expires_at timestamptz;
  v_session_id uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Only platform admins can impersonate.
  if not exists (
    select 1 from public.platform_admins
    where user_id = v_caller and revoked_at is null
  ) then
    raise exception 'Only super_admin may start impersonation' using errcode = '42501';
  end if;

  -- Target must be staff. No patient impersonation — HIPAA exposure risk.
  select user_kind into v_target_kind from public.profiles where id = p_target_user_id;
  if v_target_kind is distinct from 'staff' then
    raise exception 'Impersonation target must be a staff user (got %)', coalesce(v_target_kind::text, 'missing')
      using errcode = '42501';
  end if;

  if p_duration_minutes < 5 or p_duration_minutes > 240 then
    raise exception 'Duration must be between 5 and 240 minutes' using errcode = '22023';
  end if;
  if char_length(coalesce(p_reason, '')) < 20 then
    raise exception 'Reason must be at least 20 characters' using errcode = '22023';
  end if;

  -- Four-eyes in production: require a second platform admin approver.
  -- Identified via current_setting('vitalflow.env') which should be set by app.
  if coalesce(current_setting('vitalflow.env', true), 'dev') = 'production' then
    if p_approved_by is null then
      raise exception 'Production impersonation requires a second super_admin approver'
        using errcode = '42501';
    end if;
    if p_approved_by = v_caller then
      raise exception 'Approver must be a different super_admin' using errcode = '42501';
    end if;
    select exists (
      select 1 from public.platform_admins
      where user_id = p_approved_by and revoked_at is null
    ) into v_approver_is_admin;
    if not v_approver_is_admin then
      raise exception 'Approver is not an active super_admin' using errcode = '42501';
    end if;
  end if;

  v_expires_at := now() + make_interval(mins => p_duration_minutes);

  insert into public.impersonation_sessions (
    impersonator_id, target_user_id, tenant_id, reason, approved_by, expires_at
  )
  values (v_caller, p_target_user_id, p_tenant_id, p_reason, p_approved_by, v_expires_at)
  returning id into v_session_id;

  return query
    select
      v_session_id,
      v_caller,
      p_target_user_id,
      p_tenant_id,
      now(),
      v_expires_at;
end;
$$;

-- Callable only through the RPC gate; no direct invocation from anon.
revoke all on function public.impersonate_start(uuid, uuid, text, uuid, integer) from public;
grant execute on function public.impersonate_start(uuid, uuid, text, uuid, integer) to authenticated;

create or replace function public.impersonate_end(
  p_session_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_impersonator uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select impersonator_id into v_impersonator
  from public.impersonation_sessions
  where id = p_session_id;

  if v_impersonator is null then
    raise exception 'Impersonation session % not found', p_session_id using errcode = '02000';
  end if;

  -- The impersonator OR a fellow platform admin can end the session.
  if v_impersonator <> v_caller and not exists (
    select 1 from public.platform_admins
    where user_id = v_caller and revoked_at is null
  ) then
    raise exception 'Only the impersonator or a super_admin can end this session'
      using errcode = '42501';
  end if;

  update public.impersonation_sessions
     set revoked_at = now(),
         revoked_reason = p_reason
   where id = p_session_id and revoked_at is null;
end;
$$;

revoke all on function public.impersonate_end(uuid, text) from public;
grant execute on function public.impersonate_end(uuid, text) to authenticated;
