-- Add soft-delete flag for sessions
alter table public.sessions
  add column if not exists is_archived boolean not null default false;

-- Helpful index for archived filtering
create index if not exists idx_sessions_is_archived on public.sessions(is_archived);
