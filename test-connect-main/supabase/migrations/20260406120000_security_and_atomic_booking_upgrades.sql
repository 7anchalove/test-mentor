-- Security and consistency upgrades:
-- 1) Move teacher invite validation to server-side DB logic.
-- 2) Add/normalize admin helper objects used by admin pages.
-- 3) Add atomic booking+selection RPC to avoid partial writes.

create extension if not exists pgcrypto;

-- Ensure enum supports admin role in environments created from older migrations.
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role'
  ) then
    begin
      alter type public.app_role add value if not exists 'admin';
    exception
      when duplicate_object then null;
    end;
  end if;
end
$$;

-- Canonical admin check used by admin-only RPCs.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = uid and p.role = 'admin'::public.app_role
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to service_role;

-- Teacher invite codes (hashed, server-side only).
create table if not exists public.teacher_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.teacher_invite_codes enable row level security;

revoke all on table public.teacher_invite_codes from anon;
revoke all on table public.teacher_invite_codes from authenticated;

create or replace function public.set_teacher_invite_code(p_plain_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  normalized text := nullif(trim(p_plain_code), '');
begin
  if actor is null or not public.is_admin(actor) then
    raise exception using
      message = 'FORBIDDEN',
      detail = 'Only admins can rotate teacher invite codes.';
  end if;

  if normalized is null then
    raise exception using
      message = 'INVALID_TEACHER_INVITE_CODE',
      detail = 'Teacher invite code cannot be empty.';
  end if;

  update public.teacher_invite_codes set is_active = false where is_active = true;

  insert into public.teacher_invite_codes (code_hash, is_active)
  values (crypt(normalized, gen_salt('bf')), true);
end;
$$;

grant execute on function public.set_teacher_invite_code(text) to authenticated;

drop function if exists public.validate_teacher_invite_code(text);
create or replace function public.validate_teacher_invite_code(p_plain_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_invite_codes c
    where c.is_active = true
      and c.code_hash = crypt(coalesce(trim(p_plain_code), ''), c.code_hash)
  );
$$;

revoke all on function public.validate_teacher_invite_code(text) from public;

-- Upgrade signup trigger: teacher signups are accepted only with a valid DB-side invite code.
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
as $$
declare
  v_role public.app_role := 'student';
  v_teacher_invite_code text := nullif(trim(coalesce(NEW.raw_user_meta_data->>'teacher_invite_code', '')), '');
begin
  begin
    v_role := coalesce((NEW.raw_user_meta_data->>'role')::public.app_role, 'student');
  exception
    when invalid_text_representation then
      v_role := 'student';
  end;

  if v_role = 'teacher' and not public.validate_teacher_invite_code(v_teacher_invite_code) then
    raise exception using
      message = 'INVALID_TEACHER_INVITE_CODE',
      detail = 'Teacher signup requires a valid invite code.';
  end if;

  insert into public.profiles (user_id, name, email, role)
  values (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    v_role
  );

  insert into public.user_roles (user_id, role)
  values (NEW.id, v_role)
  on conflict (user_id, role) do nothing;

  if v_role = 'teacher' then
    insert into public.teacher_profiles (user_id, headline, subjects)
    values (
      NEW.id,
      NEW.raw_user_meta_data->>'headline',
      case when NEW.raw_user_meta_data->>'subjects' is not null
        then array(select jsonb_array_elements_text((NEW.raw_user_meta_data->>'subjects')::jsonb))
        else array[]::text[]
      end
    )
    on conflict (user_id) do nothing;
  end if;

  return NEW;
end;
$$ language plpgsql;

-- Profiles suspension metadata required by admin tools.
alter table public.profiles
  add column if not exists is_suspended boolean default false,
  add column if not exists suspended_at timestamptz;

-- Admin audit log normalization to support both legacy and newer UI payloads.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_user_id uuid not null references auth.users(id),
  action text not null,
  entity text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  before jsonb,
  after jsonb
);

create index if not exists idx_admin_audit_log_created_at on public.admin_audit_log(created_at desc);
create index if not exists idx_admin_audit_log_action on public.admin_audit_log(action);

alter table public.admin_audit_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_audit_log'
      and policyname = 'Admins can view audit log'
  ) then
    create policy "Admins can view audit log"
      on public.admin_audit_log
      for select
      using (public.is_admin(auth.uid()));
  end if;
end
$$;

-- Notifications table bootstrap for environments missing it.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  action_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  booking_id uuid,
  type text,
  kind text,
  data jsonb,
  payload jsonb
);

create index if not exists idx_notifications_user_created_at
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Users can view own notifications'
  ) then
    create policy "Users can view own notifications"
      on public.notifications
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'Users can update own notifications'
  ) then
    create policy "Users can update own notifications"
      on public.notifications
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

-- Keep admin override metadata columns present.
alter table public.bookings
  add column if not exists admin_override_reason text,
  add column if not exists admin_override_at timestamptz,
  add column if not exists admin_override_by uuid references auth.users(id);

-- Teacher suspension admin RPC used by AdminTeachers page.
create or replace function public.admin_set_teacher_suspended(
  teacher_user_id uuid,
  suspended boolean,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  normalized_reason text := nullif(trim(reason), '');
  v_before record;
  v_after record;
begin
  if actor_id is null or not public.is_admin(actor_id) then
    raise exception using
      message = 'FORBIDDEN',
      detail = 'Only admins can suspend/unsuspend teachers.';
  end if;

  select user_id, is_suspended, suspended_at
    into v_before
  from public.profiles
  where user_id = teacher_user_id
    and role = 'teacher'::public.app_role
  for update;

  if not found then
    raise exception using
      message = 'TEACHER_NOT_FOUND',
      detail = format('Teacher %s does not exist.', teacher_user_id);
  end if;

  update public.profiles
     set is_suspended = suspended,
         suspended_at = case when suspended then now() else null end,
         updated_at = now()
   where user_id = teacher_user_id
     and role = 'teacher'::public.app_role
   returning user_id, is_suspended, suspended_at into v_after;

  insert into public.admin_audit_log (
    admin_user_id,
    action,
    entity,
    entity_type,
    entity_id,
    details,
    before,
    after
  )
  values (
    actor_id,
    case when suspended then 'suspend_teacher' else 'unsuspend_teacher' end,
    'teacher',
    'teacher',
    teacher_user_id,
    jsonb_build_object(
      'reason', normalized_reason,
      'teacher_user_id', teacher_user_id,
      'from_is_suspended', v_before.is_suspended,
      'to_is_suspended', v_after.is_suspended
    ),
    jsonb_build_object(
      'teacher_user_id', teacher_user_id,
      'is_suspended', v_before.is_suspended,
      'suspended_at', v_before.suspended_at,
      'reason', normalized_reason
    ),
    jsonb_build_object(
      'teacher_user_id', teacher_user_id,
      'is_suspended', v_after.is_suspended,
      'suspended_at', v_after.suspended_at,
      'reason', normalized_reason
    )
  );
end;
$$;

grant execute on function public.admin_set_teacher_suspended(uuid, boolean, text) to authenticated;

-- Enhanced admin override with richer audit payload.
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
  v_before public.bookings;
  v_after public.bookings;
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

  select *
    into v_before
  from public.bookings
  where id = booking_id
  for update;

  if not found then
    raise exception using
      message = 'BOOKING_NOT_FOUND',
      detail = format('Booking %s does not exist.', booking_id);
  end if;

  update public.bookings
     set status = new_status::public.booking_status,
         admin_override_reason = normalized_reason,
         admin_override_at = now(),
         admin_override_by = actor_id,
         updated_at = now()
   where id = booking_id
   returning * into v_after;

  insert into public.admin_audit_log (
    admin_user_id,
    action,
    entity,
    entity_type,
    entity_id,
    details,
    before,
    after
  )
  values (
    actor_id,
    'override_booking_status',
    'booking',
    'booking',
    booking_id,
    jsonb_build_object(
      'from_status', v_before.status,
      'to_status', v_after.status,
      'reason', normalized_reason,
      'booking_id', booking_id,
      'start_date_time', v_after.start_date_time,
      'payment_status', v_after.payment_status
    ),
    to_jsonb(v_before),
    to_jsonb(v_after) || jsonb_build_object('reason', normalized_reason)
  );
end;
$$;

grant execute on function public.admin_override_booking_status(uuid, text, text) to authenticated;

-- Atomic booking request creation:
-- Inserts student_test_selections + bookings in one transaction and applies duplicate/capacity checks.
create or replace function public.create_booking_request_with_selection(
  p_student_id uuid,
  p_teacher_id uuid,
  p_test_category public.test_category,
  p_test_subtype text,
  p_start_date_time timestamptz,
  p_receipt_path text,
  p_receipt_mime text,
  p_receipt_original_name text,
  p_status text default 'pending'
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  normalized_receipt_path text := nullif(trim(coalesce(p_receipt_path, '')), '');
  normalized_receipt_mime text := nullif(trim(coalesce(p_receipt_mime, '')), '');
  normalized_receipt_name text := nullif(trim(coalesce(p_receipt_original_name, '')), '');
  lock_key1 bigint;
  lock_key2 bigint;
  selected_status public.booking_status;
  selection_id uuid;
  booking_row public.bookings;
  active_booking_exists boolean;
  teacher_slot_availability boolean;
begin
  if actor is null then
    raise exception using
      message = 'UNAUTHORIZED',
      detail = 'Authentication is required.';
  end if;

  if actor is distinct from p_student_id then
    raise exception using
      message = 'UNAUTHORIZED',
      detail = 'You can only create bookings for your own account.';
  end if;

  selected_status := coalesce(nullif(trim(p_status), '')::public.booking_status, 'pending'::public.booking_status);

  if selected_status <> 'pending'::public.booking_status then
    raise exception using
      message = 'INVALID_BOOKING_STATUS',
      detail = 'Only pending booking requests are allowed from this RPC.';
  end if;

  if normalized_receipt_path is null or normalized_receipt_mime is null or normalized_receipt_name is null then
    raise exception using
      message = 'RECEIPT_REQUIRED',
      detail = 'Receipt path/mime/original name are required.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id = p_teacher_id
      and role = 'teacher'::public.app_role
  ) then
    raise exception using
      message = 'TEACHER_NOT_FOUND',
      detail = 'Teacher profile was not found.';
  end if;

  lock_key1 := hashtext(p_teacher_id::text)::bigint;
  lock_key2 := extract(epoch from p_start_date_time)::bigint;
  perform pg_advisory_xact_lock(lock_key1, lock_key2);

  select exists (
    select 1
    from public.bookings b
    where b.student_id = p_student_id
      and b.start_date_time = p_start_date_time
      and b.status in ('pending', 'confirmed')
  )
  into active_booking_exists;

  if active_booking_exists then
    raise exception using
      message = 'uniq_booking_student_time_active',
      detail = 'An active booking already exists for this student at this slot.',
      errcode = '23505';
  end if;

  select g.is_available
    into teacher_slot_availability
  from public.get_teachers_availability(p_start_date_time, p_test_category) g
  where g.teacher_id = p_teacher_id;

  if coalesce(teacher_slot_availability, false) = false then
    raise exception using
      message = 'CAPACITY_FULL',
      detail = 'Teacher is not available for this slot.';
  end if;

  insert into public.student_test_selections (
    student_id,
    test_category,
    test_subtype,
    test_date_time
  )
  values (
    p_student_id,
    p_test_category,
    nullif(trim(coalesce(p_test_subtype, '')), ''),
    p_start_date_time
  )
  returning id into selection_id;

  insert into public.bookings (
    student_id,
    teacher_id,
    student_test_selection_id,
    start_date_time,
    status,
    receipt_path,
    receipt_mime,
    receipt_original_name
  )
  values (
    p_student_id,
    p_teacher_id,
    selection_id,
    p_start_date_time,
    selected_status,
    normalized_receipt_path,
    normalized_receipt_mime,
    normalized_receipt_name
  )
  returning * into booking_row;

  return booking_row;
end;
$$;

grant execute on function public.create_booking_request_with_selection(uuid, uuid, public.test_category, text, timestamptz, text, text, text, text) to authenticated;
grant execute on function public.create_booking_request_with_selection(uuid, uuid, public.test_category, text, timestamptz, text, text, text, text) to service_role;
