-- create_booking_with_capacity_check: atomic capacity check + insert under advisory lock to prevent race conditions.
-- Call from booking creation flow instead of direct INSERT. Keeps existing trigger as backup.

CREATE OR REPLACE FUNCTION public.create_booking_with_capacity_check(
  p_student_id uuid,
  p_teacher_id uuid,
  p_student_test_selection_id uuid,
  p_start_date_time timestamptz
)
RETURNS SETOF public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test_category public.test_category;
  v_capacity int;
  v_count bigint;
  v_lock_key1 bigint;
  v_lock_key2 bigint;
BEGIN
  -- Caller can only create a booking for themselves
  IF auth.uid() IS DISTINCT FROM p_student_id THEN
    RAISE EXCEPTION 'Unauthorized: can only create booking for yourself'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT test_category INTO v_test_category
  FROM public.student_test_selections
  WHERE id = p_student_test_selection_id AND student_id = p_student_id;

  IF v_test_category IS NULL THEN
    RAISE EXCEPTION 'Selection not found or access denied'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_capacity := CASE WHEN v_test_category = 'TOLC' THEN 1 ELSE 4 END;

  -- Lock by (teacher, slot) so concurrent requests for same slot serialize
  v_lock_key1 := hashtext(p_teacher_id::text)::bigint;
  v_lock_key2 := (extract(epoch from p_start_date_time))::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key1, v_lock_key2);

  SELECT count(*) INTO v_count
  FROM public.bookings
  WHERE teacher_id = p_teacher_id
    AND start_date_time = p_start_date_time
    AND status IN ('pending', 'confirmed');

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'CAPACITY_FULL: This time slot is full for this teacher (max % for this test type).', v_capacity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  INSERT INTO public.bookings (student_id, teacher_id, student_test_selection_id, start_date_time, status)
  VALUES (p_student_id, p_teacher_id, p_student_test_selection_id, p_start_date_time, 'confirmed')
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.create_booking_with_capacity_check(uuid, uuid, uuid, timestamptz) IS
  'Atomically checks slot capacity under advisory lock and inserts one booking. Use instead of direct bookings insert to avoid race conditions.';

-- RLS: function runs as definer; grant EXECUTE to authenticated users (they pass auth.uid() as p_student_id and we enforce inside).
GRANT EXECUTE ON FUNCTION public.create_booking_with_capacity_check(uuid, uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_with_capacity_check(uuid, uuid, uuid, timestamptz) TO service_role;
