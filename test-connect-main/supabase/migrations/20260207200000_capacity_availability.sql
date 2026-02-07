-- Capacity-based availability: extend get_teachers_availability and enforce capacity on booking insert.
-- Slot = exact start_date_time. TOLC => 1 booking/teacher/slot; ITA_L2, CENTS, CLA => 4.

-- ============================================
-- 1) Replace get_teachers_availability: add p_test_category, return capacity fields
-- ============================================
CREATE OR REPLACE FUNCTION public.get_teachers_availability(
  p_datetime_utc timestamptz,
  p_test_category public.test_category DEFAULT NULL
)
RETURNS TABLE(
  teacher_id uuid,
  is_available boolean,
  booking_count_at_slot bigint,
  computed_capacity int,
  spots_left int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_ts timestamp;
  v_day_of_week int;
  v_local_time time;
  v_capacity int;
BEGIN
  -- Capacity: TOLC = 1, else 4
  v_capacity := CASE WHEN p_test_category = 'TOLC' THEN 1 ELSE 4 END;

  v_local_ts := p_datetime_utc AT TIME ZONE 'Africa/Tunis';
  v_day_of_week := EXTRACT(DOW FROM v_local_ts)::int;
  v_local_time := (v_local_ts::time);

  RETURN QUERY
  WITH rule_available AS (
    SELECT tp.user_id AS uid,
      (
        EXISTS (
          SELECT 1 FROM public.teacher_availability_rules r
          WHERE r.teacher_id = tp.user_id
            AND r.enabled = true
            AND r.day_of_week = v_day_of_week
            AND v_local_time >= r.start_time
            AND v_local_time < r.end_time
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.teacher_unavailable_dates u
          WHERE u.teacher_id = tp.user_id
            AND p_datetime_utc >= u.start_date_time
            AND p_datetime_utc <= u.end_date_time
        )
      ) AS rule_ok
    FROM public.teacher_profiles tp
    WHERE tp.is_active = true
  ),
  slot_counts AS (
    SELECT b.teacher_id AS uid, count(*)::bigint AS cnt
    FROM public.bookings b
    WHERE b.start_date_time = p_datetime_utc
      AND b.status IN ('pending', 'confirmed')
    GROUP BY b.teacher_id
  )
  SELECT
    ra.uid AS teacher_id,
    (ra.rule_ok AND (COALESCE(sc.cnt, 0) < v_capacity)) AS is_available,
    COALESCE(sc.cnt, 0) AS booking_count_at_slot,
    v_capacity AS computed_capacity,
    GREATEST(0, v_capacity - COALESCE(sc.cnt, 0)::int) AS spots_left
  FROM rule_available ra
  LEFT JOIN slot_counts sc ON sc.uid = ra.uid;
END;
$$;

COMMENT ON FUNCTION public.get_teachers_availability(timestamptz, public.test_category) IS
  'Returns teacher_id, is_available (rules + capacity), booking_count_at_slot, computed_capacity, spots_left. TOLC=1 else 4.';

-- Keep legacy single-arg overload returning only (teacher_id, is_available) for backward compatibility
CREATE OR REPLACE FUNCTION public.get_teachers_availability(p_datetime_utc timestamptz)
RETURNS TABLE(teacher_id uuid, is_available boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.teacher_id, g.is_available
  FROM public.get_teachers_availability(p_datetime_utc, NULL::public.test_category) g;
$$;

-- ============================================
-- 2) Trigger: enforce capacity on booking INSERT
-- ============================================
CREATE OR REPLACE FUNCTION public.check_booking_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test_category public.test_category;
  v_capacity int;
  v_count bigint;
BEGIN
  SELECT test_category INTO v_test_category
  FROM public.student_test_selections
  WHERE id = NEW.student_test_selection_id;

  v_capacity := CASE WHEN v_test_category = 'TOLC' THEN 1 ELSE 4 END;

  SELECT count(*) INTO v_count
  FROM public.bookings
  WHERE teacher_id = NEW.teacher_id
    AND start_date_time = NEW.start_date_time
    AND status IN ('pending', 'confirmed');

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'CAPACITY_FULL: This time slot is full for this teacher (max % for this test type).', v_capacity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_booking_capacity_trigger ON public.bookings;
CREATE TRIGGER check_booking_capacity_trigger
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_booking_capacity();
