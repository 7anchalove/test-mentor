alter table public.bookings
  add column if not exists admin_override_reason text,
  add column if not exists admin_override_at timestamptz,
  add column if not exists admin_override_by uuid references auth.users(id);

create or replace function public.admin_override_booking_status(
  booking_id uuid,
  new_status text,
  reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  normalized_reason text := nullif(trim(reason), '');
begin
  if actor_id is null or not public.is_admin(actor_id) then
    raise exception using
      message = 'FORBIDDEN',
      detail = 'Only admins can override bookings.';
  end if;

  if normalized_reason is null then
    raise exception using
      message = 'REASON_REQUIRED',
      detail = 'A reason is required for admin booking overrides.';
  end if;

  update public.bookings
     set status = new_status::public.booking_status,
         admin_override_reason = normalized_reason,
         admin_override_at = now(),
         admin_override_by = actor_id,
         updated_at = now()
   where id = booking_id;

  if not found then
    raise exception using
      message = 'BOOKING_NOT_FOUND',
      detail = format('Booking %s does not exist.', booking_id);
  end if;

  insert into public.admin_audit_log (
    admin_user_id,
    action,
    entity,
    entity_id,
    details
  )
  values (
    actor_id,
    'override_booking_status',
    'booking',
    booking_id,
    jsonb_build_object(
      'new_status', new_status,
      'reason', normalized_reason,
      'override_at', now()
    )
  );
end;
$$;

grant execute on function public.admin_override_booking_status(uuid, text, text) to authenticated;