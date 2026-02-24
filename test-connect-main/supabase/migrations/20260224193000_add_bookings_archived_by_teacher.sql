alter table public.bookings
  add column if not exists archived_by_teacher boolean not null default false;

create index if not exists idx_bookings_teacher_unarchived
  on public.bookings (teacher_id, start_date_time, status)
  where archived_by_teacher = false;
