-- Inbox semantics need per-recipient read/unread state. The existing
-- notifications.status column tracks delivery (queued / sending / sent /
-- delivered / bounced / failed / suppressed), not acknowledgement by the
-- recipient. Add read_at + a covering index so the /inbox page can count
-- unread and filter cheaply.

alter table public.notifications
  add column if not exists read_at timestamptz;

create index if not exists notifications_inbox_idx
  on public.notifications (tenant_id, recipient_id, read_at, created_at desc)
  where channel = 'in_app';

notify pgrst, 'reload schema';
