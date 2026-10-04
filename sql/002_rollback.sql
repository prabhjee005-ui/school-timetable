-- Restore the grants observed before 002_enable_rls_existing_tables.sql and
-- disable RLS on the older application tables.

ALTER TABLE public.teachers DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.teachers TO anon, authenticated;

ALTER TABLE public.periods DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.periods TO anon, authenticated;

ALTER TABLE public.timetable DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.timetable TO anon, authenticated;

ALTER TABLE public.absences DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.absences TO anon, authenticated;

ALTER TABLE public.adjustments DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.adjustments TO anon, authenticated;

ALTER TABLE public.notification_log DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.notification_log TO anon, authenticated;

ALTER TABLE public.extra_period_tracker DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.extra_period_tracker TO anon, authenticated;

ALTER TABLE public.leave_requests DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.leave_requests TO anon, authenticated;

ALTER TABLE public.swap_requests DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.swap_requests TO anon, authenticated;

ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.settings TO anon, authenticated;

ALTER TABLE public.ai_settings DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.ai_settings TO anon, authenticated;

ALTER TABLE public.bell_schedule_slots DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.bell_schedule_slots TO anon, authenticated;
