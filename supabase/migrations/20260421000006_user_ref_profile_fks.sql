-- PostgREST-discoverable relationships from user-reference columns to
-- public.profiles.
--
-- Every `*_by` / `*_provider_id` / `user_id` column in our clinical + billing
-- tables already has a FK into auth.users (for referential integrity). But
-- PostgREST can't embed the auth schema, and auth.users doesn't carry display
-- fields anyway — full_name lives on public.profiles. Without a FK that
-- PostgREST can see, queries like `provider:profiles(full_name, email)` fail
-- with "Could not find a relationship between X and Y in the schema cache".
--
-- Fix: add a parallel FK from each user-reference column to public.profiles(id).
-- Dual FKs on the same column are legal — each constraint validates
-- independently. Since every auth.users row has a matching profiles row
-- (enforced by the signup flow), both FKs accept the same values.
--
-- After this migration, app code embeds with the explicit FK name:
--     .select("..., provider:profiles!encounters_provider_profile_fkey(full_name, email)")

do $$
declare
  rec record;
begin
  for rec in
    select table_name, column_name, fkey_name
    from (values
      ('encounters',                 'provider_id',             'encounters_provider_profile_fkey'),
      ('encounter_notes',            'author_id',               'encounter_notes_author_profile_fkey'),
      ('encounter_notes',            'signed_by',               'encounter_notes_signed_profile_fkey'),
      ('appointments',               'provider_id',             'appointments_provider_profile_fkey'),
      ('appointments',               'booked_by',               'appointments_booked_profile_fkey'),
      ('charges',                    'posted_by',               'charges_posted_profile_fkey'),
      ('claims',                     'billing_provider_id',     'claims_billing_provider_profile_fkey'),
      ('claims',                     'rendering_provider_id',   'claims_rendering_provider_profile_fkey'),
      ('claim_status_history',       'actor_id',                'claim_status_history_actor_profile_fkey'),
      ('denials',                    'assigned_to',             'denials_assigned_profile_fkey'),
      ('diagnosis_assignments',      'assigned_by',             'diagnosis_assignments_assigned_profile_fkey'),
      ('allergies',                  'recorded_by',             'allergies_recorded_profile_fkey'),
      ('medications',                'prescribing_provider_id', 'medications_prescribing_provider_profile_fkey'),
      ('ai_scribe_sessions',         'created_by',              'ai_scribe_sessions_created_profile_fkey'),
      ('ai_scribe_code_suggestions', 'accepted_by',             'ai_scribe_code_suggestions_accepted_profile_fkey'),
      ('ai_requests',                'user_id',                 'ai_requests_user_profile_fkey'),
      ('tenant_members',             'user_id',                 'tenant_members_user_profile_fkey')
    ) as t(table_name, column_name, fkey_name)
  loop
    if not exists (
      select 1 from pg_constraint c
      where c.conname = rec.fkey_name
        and c.conrelid = ('public.'||rec.table_name)::regclass
    ) then
      execute format(
        'alter table public.%I
           add constraint %I foreign key (%I) references public.profiles(id) on delete set null not valid',
        rec.table_name, rec.fkey_name, rec.column_name
      );
      execute format(
        'alter table public.%I validate constraint %I',
        rec.table_name, rec.fkey_name
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
