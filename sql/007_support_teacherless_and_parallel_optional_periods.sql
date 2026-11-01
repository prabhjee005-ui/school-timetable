-- Permit class-level OPT/RECESS markers without inventing a teacher, and
-- distinguish concurrent groups that share a subject (for example two Maths
-- groups in OPT12).
BEGIN;

ALTER TABLE public.timetable
    ADD COLUMN IF NOT EXISTS group_key text NOT NULL DEFAULT '';

ALTER TABLE public.timetable
    ALTER COLUMN teacher_id DROP NOT NULL;

ALTER TABLE public.timetable
    DROP CONSTRAINT IF EXISTS timetable_day_period_class_subject_key;

ALTER TABLE public.timetable
    DROP CONSTRAINT IF EXISTS timetable_day_period_class_subject_group_key;

ALTER TABLE public.timetable
    ADD CONSTRAINT timetable_day_period_class_subject_group_key
    UNIQUE (day, period_number, class_name, subject, group_key);

ALTER TABLE public.timetable
    DROP CONSTRAINT IF EXISTS timetable_marker_teacher_check;

ALTER TABLE public.timetable
    ADD CONSTRAINT timetable_marker_teacher_check
    CHECK (
        (upper(btrim(subject)) IN ('OPT', 'RECESS') AND teacher_id IS NULL)
        OR (upper(btrim(subject)) NOT IN ('OPT', 'RECESS') AND teacher_id IS NOT NULL)
    );

NOTIFY pgrst, 'reload schema';
COMMIT;
