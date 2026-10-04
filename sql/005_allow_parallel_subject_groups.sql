-- Allow different subject groups in one class to have simultaneous lessons.
-- Existing timetable rows are preserved; subject becomes part of the slot key.
DO $$
DECLARE
    old_constraint record;
BEGIN
    FOR old_constraint IN
        SELECT con.conname
        FROM pg_constraint AS con
        WHERE con.conrelid = 'public.timetable'::regclass
          AND con.contype = 'u'
          AND ARRAY(
              SELECT att.attname::text
              FROM unnest(con.conkey) AS key_column(attnum)
              JOIN pg_attribute AS att
                ON att.attrelid = con.conrelid
               AND att.attnum = key_column.attnum
              ORDER BY att.attname
          ) = ARRAY['class_name', 'day', 'period_number']::text[]
    LOOP
        EXECUTE format('ALTER TABLE public.timetable DROP CONSTRAINT %I', old_constraint.conname);
    END LOOP;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS con
        WHERE con.conrelid = 'public.timetable'::regclass
          AND con.contype = 'u'
          AND ARRAY(
              SELECT att.attname::text
              FROM unnest(con.conkey) AS key_column(attnum)
              JOIN pg_attribute AS att
                ON att.attrelid = con.conrelid
               AND att.attnum = key_column.attnum
              ORDER BY att.attname
          ) = ARRAY['class_name', 'day', 'period_number', 'subject']::text[]
    ) THEN
        ALTER TABLE public.timetable
            ADD CONSTRAINT timetable_day_period_class_subject_key
            UNIQUE (day, period_number, class_name, subject);
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
