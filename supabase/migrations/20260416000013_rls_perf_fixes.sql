-- =============================================================================
-- 0013 — RLS performance fixes (post-advisor pass)
-- =============================================================================
-- Two classes of fix:
--   1. Wrap `auth.uid()` in `(select ...)` so Postgres evaluates it once per
--      statement instead of once per row (auth_rls_initplan warning).
--   2. Split `FOR ALL` write policies into explicit INSERT/UPDATE/DELETE so
--      they don't overlap the `FOR SELECT` policy on the same table
--      (multiple_permissive_policies warning).
-- =============================================================================

-- ---- auth.uid() wrap fixes -------------------------------------------------

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select tm.user_id from public.tenant_members tm
      where tm.tenant_id in (select public.current_user_tenant_ids())
        and tm.deleted_at is null
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists audit_insert_self on audit.audit_events;
create policy audit_insert_self on audit.audit_events
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and tenant_id in (select public.current_user_tenant_ids())
  );

drop policy if exists signatures_insert on public.signatures;
create policy signatures_insert on public.signatures
  for insert to authenticated
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and signer_id = (select auth.uid())
    and (select public.has_permission('clinical:sign', tenant_id))
  );

drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments
  for insert to authenticated
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and author_id = (select auth.uid())
  );

drop policy if exists task_comments_update on public.task_comments;
create policy task_comments_update on public.task_comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists ai_requests_select on public.ai_requests;
create policy ai_requests_select on public.ai_requests
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and (user_id = (select auth.uid()) or (select public.has_permission('admin:tenant', tenant_id)))
  );

drop policy if exists ai_requests_insert on public.ai_requests;
create policy ai_requests_insert on public.ai_requests
  for insert to authenticated
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and user_id = (select auth.uid())
    and (select public.has_permission('ai:invoke', tenant_id))
  );

drop policy if exists ai_completions_select on public.ai_completions;
create policy ai_completions_select on public.ai_completions
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and (
      request_id in (select id from public.ai_requests where user_id = (select auth.uid()))
      or (select public.has_permission('admin:tenant', tenant_id))
    )
  );

drop policy if exists ai_feedback_insert on public.ai_feedback;
create policy ai_feedback_insert on public.ai_feedback
  for insert to authenticated
  with check (
    tenant_id in (select public.current_user_tenant_ids())
    and user_id = (select auth.uid())
  );

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    tenant_id in (select public.current_user_tenant_ids())
    and (recipient_id = (select auth.uid()) or (select public.has_permission('admin:tenant', tenant_id)))
  );

drop policy if exists notification_prefs_rw on public.notification_preferences;
create policy notification_prefs_rw on public.notification_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists feature_flag_overrides_select on public.feature_flag_overrides;
create policy feature_flag_overrides_select on public.feature_flag_overrides
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (tenant_id is not null and tenant_id in (select public.current_user_tenant_ids()))
  );

-- ---- Split FOR ALL → FOR INSERT/UPDATE/DELETE -----------------------------

-- tenant_members
drop policy if exists tenant_members_select on public.tenant_members;
create policy tenant_members_select on public.tenant_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or tenant_id in (select public.current_user_tenant_ids())
  );
drop policy if exists tenant_members_write on public.tenant_members;
create policy tenant_members_insert on public.tenant_members
  for insert to authenticated
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:users', tenant_id)));
create policy tenant_members_update on public.tenant_members
  for update to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:users', tenant_id)))
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:users', tenant_id)));
create policy tenant_members_delete on public.tenant_members
  for delete to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:users', tenant_id)));

-- patients
drop policy if exists patients_write on public.patients;
create policy patients_insert on public.patients
  for insert to authenticated
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('patient:write', tenant_id)));
create policy patients_update on public.patients
  for update to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('patient:write', tenant_id)))
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('patient:write', tenant_id)));
create policy patients_delete on public.patients
  for delete to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('patient:write', tenant_id)));

-- encounters
drop policy if exists encounters_write on public.encounters;
create policy encounters_insert on public.encounters
  for insert to authenticated
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)));
create policy encounters_update on public.encounters
  for update to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)))
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)));
create policy encounters_delete on public.encounters
  for delete to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)));

-- orders
drop policy if exists orders_write on public.orders;
create policy orders_insert on public.orders
  for insert to authenticated
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)));
create policy orders_update on public.orders
  for update to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)))
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)));
create policy orders_delete on public.orders
  for delete to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)));

-- encounter_notes
drop policy if exists encounter_notes_write on public.encounter_notes;
create policy encounter_notes_insert on public.encounter_notes
  for insert to authenticated
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)));
create policy encounter_notes_update on public.encounter_notes
  for update to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)))
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)));
create policy encounter_notes_delete on public.encounter_notes
  for delete to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('clinical:write', tenant_id)));

-- payers
drop policy if exists payers_write on public.payers;
create policy payers_insert on public.payers
  for insert to authenticated
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('billing:write', tenant_id)));
create policy payers_update on public.payers
  for update to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('billing:write', tenant_id)))
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('billing:write', tenant_id)));
create policy payers_delete on public.payers
  for delete to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('billing:write', tenant_id)));

-- locations
drop policy if exists locations_write on public.locations;
create policy locations_insert on public.locations
  for insert to authenticated
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)));
create policy locations_update on public.locations
  for update to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)))
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)));
create policy locations_delete on public.locations
  for delete to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)));

-- tasks
drop policy if exists tasks_write on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (tenant_id in (select public.current_user_tenant_ids()));
create policy tasks_update on public.tasks
  for update to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()))
  with check (tenant_id in (select public.current_user_tenant_ids()));
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

-- workflow_definitions
drop policy if exists workflow_definitions_write on public.workflow_definitions;
create policy workflow_definitions_insert on public.workflow_definitions
  for insert to authenticated
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)));
create policy workflow_definitions_update on public.workflow_definitions
  for update to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)))
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)));
create policy workflow_definitions_delete on public.workflow_definitions
  for delete to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)));

-- integration_connections
drop policy if exists integration_connections_write on public.integration_connections;
create policy integration_connections_insert on public.integration_connections
  for insert to authenticated
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)));
create policy integration_connections_update on public.integration_connections
  for update to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)))
  with check (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)));
create policy integration_connections_delete on public.integration_connections
  for delete to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()) and (select public.has_permission('admin:tenant', tenant_id)));
