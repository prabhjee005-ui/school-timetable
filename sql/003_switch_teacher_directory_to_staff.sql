-- Switch operational teacher IDs to public.staff.staff_code.
-- The old operational rows were test fixtures. Preserve periods/settings and
-- the imported staff/assignment tables, while clearing only the confirmed
-- fixture timetable and derived leave/cover records before rebuilding teachers.

DO $$
DECLARE
    actual_counts jsonb;
BEGIN
    SELECT jsonb_object_agg(table_name, row_count)
      INTO actual_counts
      FROM (
        SELECT 'teachers' AS table_name, count(*) AS row_count FROM public.teachers
        UNION ALL SELECT 'timetable', count(*) FROM public.timetable
        UNION ALL SELECT 'absences', count(*) FROM public.absences
        UNION ALL SELECT 'adjustments', count(*) FROM public.adjustments
        UNION ALL SELECT 'extra_period_tracker', count(*) FROM public.extra_period_tracker
        UNION ALL SELECT 'leave_requests', count(*) FROM public.leave_requests
        UNION ALL SELECT 'swap_requests', count(*) FROM public.swap_requests
        UNION ALL SELECT 'notification_log', count(*) FROM public.notification_log
        UNION ALL SELECT 'staff', count(*) FROM public.staff
        UNION ALL SELECT 'assignments', count(*) FROM public.assignments
      ) counts;

    IF actual_counts <> '{"teachers":13,"timetable":240,"absences":58,"adjustments":40,"extra_period_tracker":22,"leave_requests":0,"swap_requests":0,"notification_log":0,"staff":100,"assignments":601}'::jsonb THEN
        RAISE EXCEPTION 'Teacher directory cutover stopped: table counts changed; observed %', actual_counts;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_legacy_teacher_cache(p_staff_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code text;
    v_name text;
    v_email text;
    v_active boolean;
    v_subjects text[];
BEGIN
    SELECT staff_code, full_name, email, is_active
      INTO v_code, v_name, v_email, v_active
      FROM public.staff
     WHERE id = p_staff_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT coalesce(array_agg(DISTINCT subject ORDER BY subject)
                    FILTER (WHERE subject IS NOT NULL AND btrim(subject) <> ''), ARRAY[]::text[])
      INTO v_subjects
      FROM public.assignments
     WHERE staff_id = p_staff_id;

    INSERT INTO public.teachers (id, name, subjects, email, role, max_extra, password_hash)
    VALUES (v_code, v_name, v_subjects, v_email,
            CASE WHEN v_active THEN 'teacher' ELSE 'inactive' END, 3, NULL)
    ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           subjects = EXCLUDED.subjects,
           email = EXCLUDED.email,
           role = EXCLUDED.role,
           max_extra = EXCLUDED.max_extra,
           password_hash = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_teacher_cache_from_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.teachers WHERE id = OLD.staff_code;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.staff_code IS DISTINCT FROM NEW.staff_code THEN
        DELETE FROM public.teachers WHERE id = OLD.staff_code;
    END IF;

    PERFORM public.sync_legacy_teacher_cache(NEW.id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_teacher_cache_from_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM public.sync_legacy_teacher_cache(OLD.staff_id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND
       (TG_OP = 'INSERT' OR OLD.staff_id IS DISTINCT FROM NEW.staff_id) THEN
        PERFORM public.sync_legacy_teacher_cache(NEW.staff_id);
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM public.sync_legacy_teacher_cache(NEW.staff_id);
    END IF;
    RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS staff_teacher_cache_sync ON public.staff;
CREATE TRIGGER staff_teacher_cache_sync
AFTER INSERT OR UPDATE OR DELETE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.sync_teacher_cache_from_staff();

DROP TRIGGER IF EXISTS assignments_teacher_cache_sync ON public.assignments;
CREATE TRIGGER assignments_teacher_cache_sync
AFTER INSERT OR UPDATE OR DELETE ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.sync_teacher_cache_from_assignment();

REVOKE ALL ON FUNCTION public.sync_legacy_teacher_cache(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_teacher_cache_from_staff() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_teacher_cache_from_assignment() FROM PUBLIC, anon, authenticated;

-- The existing timetable and derived attendance/cover rows reference fixture IDs
-- that cannot be mapped reliably to allocation staff codes. All are test data.
TRUNCATE TABLE public.notification_log, public.absences, public.adjustments,
               public.extra_period_tracker, public.leave_requests,
               public.swap_requests, public.timetable
RESTART IDENTITY CASCADE;

DELETE FROM public.teachers;

DO $$
DECLARE
    staff_row record;
BEGIN
    FOR staff_row IN SELECT id FROM public.staff LOOP
        PERFORM public.sync_legacy_teacher_cache(staff_row.id);
    END LOOP;
END $$;

-- Cutover verification: all 100 active allocation staff codes have an API
-- compatibility row; passwords remain unset. No old IDs remain.
DO $$
DECLARE
    v_expected bigint;
    v_actual bigint;
BEGIN
    SELECT count(*) INTO v_expected FROM public.staff WHERE is_active;
    SELECT count(*) INTO v_actual FROM public.teachers WHERE role = 'teacher';
    IF v_expected <> 100 OR v_actual <> v_expected THEN
        RAISE EXCEPTION 'Teacher directory cutover verification failed: active staff %, teacher cache %', v_expected, v_actual;
    END IF;
    IF EXISTS (SELECT 1 FROM public.teachers WHERE password_hash IS NOT NULL) THEN
        RAISE EXCEPTION 'Teacher directory cutover found a non-null password hash';
    END IF;
END $$;
