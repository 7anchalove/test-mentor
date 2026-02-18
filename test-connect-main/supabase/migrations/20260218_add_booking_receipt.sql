-- Add receipt fields to bookings
alter table public.bookings
  add column if not exists receipt_path text,
  add column if not exists receipt_mime text,
  add column if not exists receipt_original_name text;

-- Create a private bucket for booking receipts (if it doesn't exist)
insert into storage.buckets (id, name, public)
values ('booking-receipts', 'booking-receipts', false)
on conflict (id) do nothing;

-- Storage policies: receipts are uploaded by the student, and readable by the student/teacher of that booking
-- NOTE: storage.objects has RLS enabled by default on Supabase.

-- Allow authenticated users to upload files under their own folder: <user_id>/...
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='booking_receipts_insert_own_folder'
  ) then
    create policy booking_receipts_insert_own_folder
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'booking-receipts'
      and split_part(name, '/', 1) = auth.uid()::text
    );
  end if;
end$$;

-- Allow authenticated users to read receipts only if they are the student or teacher on the booking that references the path
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='booking_receipts_select_participants'
  ) then
    create policy booking_receipts_select_participants
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'booking-receipts'
      and exists (
        select 1
        from public.bookings b
        where b.receipt_path = storage.objects.name
          and (b.student_id = auth.uid()::text or b.teacher_id = auth.uid()::text)
      )
    );
  end if;
end$$;
