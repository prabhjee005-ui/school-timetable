-- The backend uses the service-role key, which bypasses RLS.
-- Enabling RLS without policies blocks direct anon/authenticated API access.

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teachers FROM anon, authenticated;

ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.periods FROM anon, authenticated;

ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.timetable FROM anon, authenticated;

ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.absences FROM anon, authenticated;

ALTER TABLE public.adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.adjustments FROM anon, authenticated;

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_log FROM anon, authenticated;

ALTER TABLE public.extra_period_tracker ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.extra_period_tracker FROM anon, authenticated;

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.leave_requests FROM anon, authenticated;

ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.swap_requests FROM anon, authenticated;

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.settings FROM anon, authenticated;

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_settings FROM anon, authenticated;

ALTER TABLE public.bell_schedule_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bell_schedule_slots FROM anon, authenticated;
