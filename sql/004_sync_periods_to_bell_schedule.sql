-- Keep the legacy period lookup used by timetable screens and APIs aligned
-- with the authoritative bell_schedule_slots rows for 2026-27.
DO $$
DECLARE
    teaching_slots integer;
BEGIN
    SELECT count(*) INTO teaching_slots
      FROM public.bell_schedule_slots
     WHERE school_year = '2026-27' AND slot_type = 'TEACHING';
    IF teaching_slots <> 9 THEN
        RAISE EXCEPTION 'Expected 9 teaching slots for 2026-27, found %', teaching_slots;
    END IF;
END $$;

INSERT INTO public.periods (period_number, start_time, end_time)
SELECT teaching_period_number::integer, start_time, end_time
  FROM public.bell_schedule_slots
 WHERE school_year = '2026-27'
   AND slot_type = 'TEACHING'
ON CONFLICT (period_number) DO UPDATE
   SET start_time = EXCLUDED.start_time,
       end_time = EXCLUDED.end_time;
