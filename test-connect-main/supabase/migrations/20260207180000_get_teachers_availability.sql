-- get_teachers_availability: compute availability for all active teachers at a given UTC datetime.
-- Uses timezone 'Africa/Tunis' for converting to local day-of-week and time (per rule defaults).
-- Returns (teacher_id, is_available). Available = inside an enabled weekly rule AND not in an unavailable range.

CREATE OR REPLACE FUNCTION public.get_teachers_availability(p_datetime_utc timestamptz)
RETURNS TABLE(teacher_id uuid, is_available boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_ts timestamp;
  v_day_of_week int;
  v_local_time time;
BEGIN
  -- Convert selected UTC moment to Africa/Tunis for rule matching
  v_local_ts := p_datetime_utc AT TIME ZONE 'Africa/Tunis';
  -- DOW: 0=Sunday, 1=Monday, ... 6=Saturday (matches JS getDay() and teacher_availability_rules)
  v_day_of_week := EXTRACT(DOW FROM v_local_ts)::int;
  v_local_time := (v_local_ts::time);

  RETURN QUERY
  SELECT tp.user_id AS teacher_id,
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
    ) AS is_available
  FROM public.teacher_profiles tp
  WHERE tp.is_active = true;
END;
$$;

COMMENT ON FUNCTION public.get_teachers_availability(timestamptz) IS
  'Returns (teacher_id, is_available) for all active teachers at p_datetime_utc. Uses Africa/Tunis for weekly rule day/time.';
