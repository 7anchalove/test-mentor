-- Allow students to delete only their own old booking requests.
-- Keep select/update policies unchanged.

drop policy if exists "Students can delete own old bookings" on public.bookings;

create policy "Students can delete own old bookings"
  on public.bookings
  for delete
  using (
    auth.uid() = student_id
    and status in ('declined', 'cancelled')
  );
