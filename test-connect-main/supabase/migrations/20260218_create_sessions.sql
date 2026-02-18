-- Test Mentor / Test Connect
-- Adds a first-class "sessions" table so bookings become real appointments.
-- Run this in Supabase SQL editor (or via migrations if you use supabase CLI).

-- 1) Enum for session status
do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type public.session_status as enum ('scheduled', 'completed', 'cancelled');
  end if;
end$$;

-- 2) Sessions table
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  conversation_id uuid unique references public.conversations(id) on delete set null,
  student_id uuid not null references auth.users(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  start_date_time timestamptz not null,
  end_date_time timestamptz not null,
  meeting_link text,
  status public.session_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Ensure only one conversation per booking (so accept can be retried safely)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_booking_id_unique'
  ) then
    alter table public.conversations
      add constraint conversations_booking_id_unique unique (booking_id);
  end if;
end$$;

-- 4) Prevent double-booking the same exact slot for a teacher (active bookings only)
create unique index if not exists bookings_teacher_start_active_unique
on public.bookings(teacher_id, start_date_time)
where status in ('pending', 'confirmed');

-- 5) Keep sessions.updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists set_sessions_updated_at on public.sessions;
create trigger set_sessions_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

-- 6) Minimal RLS (adjust for your production policy)
alter table public.sessions enable row level security;

-- Students and teachers can read their own sessions
drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own"
on public.sessions for select
using (auth.uid() = student_id or auth.uid() = teacher_id);

-- Teachers can update meeting link / status on their own sessions
drop policy if exists "sessions_update_teacher" on public.sessions;
create policy "sessions_update_teacher"
on public.sessions for update
using (auth.uid() = teacher_id)
with check (auth.uid() = teacher_id);
