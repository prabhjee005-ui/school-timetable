-- staff stores the teacher directory, including staff identifiers and contact
-- details. Row Level Security is enabled without policies so access remains
-- blocked until explicit policies are added.
-- assignments stores the subjects and section/group allocations for each staff
-- member. Row Level Security is enabled without policies for the same reason.

CREATE TABLE public.staff (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_code text UNIQUE NOT NULL,
    full_name text NOT NULL,
    department text,
    roles text[] NOT NULL DEFAULT '{}',
    email text,
    notes text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    subject text,
    target_type text NOT NULL CHECK (target_type IN ('section', 'combined_group', 'optional_group', 'unparsed')),
    sections text[] NOT NULL DEFAULT '{}',
    periods_per_week int CHECK (periods_per_week >= 0),
    raw_text text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assignments_staff_id_idx ON public.assignments (staff_id);
CREATE INDEX staff_department_idx ON public.staff (department);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.staff FROM anon, authenticated;
REVOKE ALL ON TABLE public.assignments FROM anon, authenticated;
