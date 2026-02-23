-- Update booking update guard rules:
-- 1) Students may cancel their own bookings from active states.
-- 2) Students may only change `status` (no teacher/date/receipt/other field edits while cancelling).
-- 3) Keep receipt-presence requirement when moving into `pending_review`.
-- 4) When a booking is cancelled, cancel linked session as well.

create or replace function public.enforce_booking_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  old_status text := old.status::text;
  new_status text := new.status::text;
  old_payload jsonb := to_jsonb(old) - array['status', 'updated_at'];
  new_payload jsonb := to_jsonb(new) - array['status', 'updated_at'];
  receipt_path text := nullif(coalesce(to_jsonb(new)->>'receipt_path', ''), '');
  receipt_mime text := nullif(coalesce(to_jsonb(new)->>'receipt_mime', ''), '');
  receipt_name text := nullif(coalesce(to_jsonb(new)->>'receipt_original_name', ''), '');
begin
  -- Preserve receipt presence behavior for submission into review.
  if new_status = 'pending_review' then
    if receipt_path is null or receipt_mime is null or receipt_name is null then
      raise exception using
        message = 'RECEIPT_REQUIRED',
        detail = 'Receipt fields must be present before status can become pending_review.';
    end if;
  end if;

  -- Student-specific cancel rule:
  -- allow only status->cancelled from active states and no other field changes.
  if actor = old.student_id then
    if not (
      old_status in ('awaiting_receipt', 'pending_review', 'pending', 'confirmed')
      and new_status = 'cancelled'
    ) then
      raise exception using
        message = 'BOOKING_UPDATE_NOT_ALLOWED',
        detail = 'Students can only cancel bookings from awaiting_receipt, pending_review, pending, or confirmed.';
    end if;

    if new_payload is distinct from old_payload then
      raise exception using
        message = 'BOOKING_CANCEL_MUTATION_NOT_ALLOWED',
        detail = 'Students cannot change booking fields other than status when cancelling.';
    end if;
  end if;

  -- Keep teacher behavior unchanged by not adding teacher-specific transition restrictions here.

  -- Sync linked session on cancellation (recommended).
  if old_status is distinct from 'cancelled' and new_status = 'cancelled' then
    update public.sessions
       set status = 'cancelled'::public.session_status,
           updated_at = now()
     where booking_id = old.id
       and status is distinct from 'cancelled'::public.session_status;
  end if;

  return new;
end;
$$;

-- Keep trigger attached to bookings updates.
drop trigger if exists trg_enforce_booking_update_rules on public.bookings;
create trigger trg_enforce_booking_update_rules
before update on public.bookings
for each row
execute function public.enforce_booking_update_rules();
