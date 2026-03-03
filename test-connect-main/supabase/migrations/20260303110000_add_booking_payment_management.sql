-- Offline payment tracking for teacher-managed payments.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'payment_status'
      and n.nspname = 'public'
  ) then
    create type public.payment_status as enum ('waiting', 'paid', 'not_paid');
  end if;
end
$$;

alter table public.bookings
  add column if not exists payment_status public.payment_status not null default 'waiting',
  add column if not exists paid_at timestamptz null,
  add column if not exists payment_note text null;

create or replace function public.sync_booking_paid_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.payment_status = 'paid'::public.payment_status then
    if old.payment_status is distinct from 'paid'::public.payment_status or old.paid_at is null then
      new.paid_at = coalesce(new.paid_at, now());
    end if;
  else
    new.paid_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_booking_paid_at on public.bookings;
create trigger trg_sync_booking_paid_at
before update on public.bookings
for each row
execute function public.sync_booking_paid_at();

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
  if (
    new.payment_status is distinct from old.payment_status
    or new.payment_note is distinct from old.payment_note
    or new.paid_at is distinct from old.paid_at
  ) and actor is distinct from old.teacher_id then
    raise exception using
      message = 'BOOKING_PAYMENT_UPDATE_NOT_ALLOWED',
      detail = 'Only the booking teacher can update payment_status, paid_at, or payment_note.';
  end if;

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