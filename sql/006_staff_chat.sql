-- Staff-only chat. Authentication is through Supabase Auth; chat_profiles
-- links each Auth user to exactly one public.staff row. Apply only after review.

CREATE TABLE IF NOT EXISTS public.chat_profiles (
    auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    staff_id uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
    is_admin boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('direct', 'group')),
    name text,
    direct_key text UNIQUE,
    created_by uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz NOT NULL DEFAULT now(),
    last_message_preview text,
    last_message_sender_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    CHECK (
        (kind = 'direct' AND direct_key IS NOT NULL AND name IS NULL)
        OR (kind = 'group' AND direct_key IS NULL AND name IS NOT NULL AND length(trim(name)) > 0)
    )
);

CREATE TABLE IF NOT EXISTS public.chat_conversation_members (
    conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    member_role text NOT NULL DEFAULT 'member' CHECK (member_role IN ('owner', 'member')),
    joined_at timestamptz NOT NULL DEFAULT now(),
    last_read_at timestamptz NOT NULL DEFAULT now(),
    unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
    PRIMARY KEY (conversation_id, staff_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    sender_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    body text NOT NULL DEFAULT '',
    attachment_path text,
    attachment_name text,
    attachment_content_type text,
    attachment_size bigint,
    created_at timestamptz NOT NULL DEFAULT now(),
    edited_at timestamptz,
    deleted_at timestamptz,
    CHECK (length(body) <= 5000),
    CHECK (length(body) > 0 OR attachment_path IS NOT NULL),
    CHECK (
        (attachment_path IS NULL AND attachment_name IS NULL AND attachment_content_type IS NULL AND attachment_size IS NULL)
        OR (attachment_path IS NOT NULL AND attachment_name IS NOT NULL AND attachment_content_type IS NOT NULL AND attachment_size > 0)
    )
);

CREATE OR REPLACE FUNCTION public.sync_chat_profile_active()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE public.chat_profiles
    SET is_active = NEW.is_active
    WHERE staff_id = NEW.id;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_chat_profile_active() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS staff_sync_chat_profile_active ON public.staff;
CREATE TRIGGER staff_sync_chat_profile_active
    AFTER UPDATE OF is_active ON public.staff
    FOR EACH ROW
    WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
    EXECUTE FUNCTION public.sync_chat_profile_active();

-- Policies use this narrow SECURITY DEFINER helper because public.staff is
-- intentionally inaccessible to browser roles. It returns only the caller's
-- own linked staff ID and also checks that the staff row is still active.
CREATE OR REPLACE FUNCTION public.chat_current_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT cp.staff_id
    FROM public.chat_profiles AS cp
    JOIN public.staff AS s ON s.id = cp.staff_id
    WHERE cp.auth_user_id = auth.uid()
      AND cp.is_active
      AND s.is_active
    LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.chat_current_staff_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_current_staff_id() TO authenticated;

CREATE INDEX IF NOT EXISTS chat_members_by_staff
    ON public.chat_conversation_members (staff_id, conversation_id);
CREATE INDEX IF NOT EXISTS chat_messages_by_conversation_time
    ON public.chat_messages (conversation_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.update_chat_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    UPDATE public.chat_conversations
    SET last_message_at = NEW.created_at,
        last_message_preview = CASE
            WHEN length(trim(NEW.body)) > 0 THEN left(NEW.body, 160)
            ELSE NEW.attachment_name
        END,
        last_message_sender_staff_id = NEW.sender_staff_id
    WHERE id = NEW.conversation_id;

    UPDATE public.chat_conversation_members
    SET unread_count = unread_count + 1
    WHERE conversation_id = NEW.conversation_id
      AND staff_id <> NEW.sender_staff_id;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.update_chat_conversation_last_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_message_updates_conversation ON public.chat_messages;
CREATE TRIGGER chat_message_updates_conversation
    AFTER INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.update_chat_conversation_last_message();

ALTER TABLE public.chat_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chat_profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.chat_conversations FROM anon, authenticated;
REVOKE ALL ON TABLE public.chat_conversation_members FROM anon, authenticated;
REVOKE ALL ON TABLE public.chat_messages FROM anon, authenticated;

-- Authenticated clients get only the reads needed to authorize private realtime
-- subscriptions. All chat writes and attachment signing pass through the API,
-- which validates the Supabase Auth token and checks conversation membership.
GRANT SELECT ON TABLE public.chat_profiles TO authenticated;
GRANT SELECT ON TABLE public.chat_conversation_members TO authenticated;
GRANT SELECT ON TABLE public.chat_messages TO authenticated;

CREATE POLICY chat_profiles_self_read
    ON public.chat_profiles FOR SELECT TO authenticated
    USING (
        auth_user_id = (SELECT auth.uid())
        AND is_active
        AND staff_id = (SELECT public.chat_current_staff_id())
    );

CREATE POLICY chat_members_self_read
    ON public.chat_conversation_members FOR SELECT TO authenticated
    USING (staff_id = (SELECT public.chat_current_staff_id()));

CREATE POLICY chat_messages_member_read
    ON public.chat_messages FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.chat_conversation_members AS cm
            WHERE cm.conversation_id = chat_messages.conversation_id
              AND cm.staff_id = (SELECT public.chat_current_staff_id())
        )
    );

CREATE POLICY chat_realtime_member_channel_read
    ON realtime.messages FOR SELECT TO authenticated
    USING (
        (SELECT realtime.topic()) = 'chat-inbox:' || (SELECT public.chat_current_staff_id())::text
    );

-- Realtime only notifies members that a row changed; the message itself remains
-- in public.chat_messages and is read under its membership RLS policy.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'chat_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    END IF;
END
$$;

-- Attachments are stored privately. The API verifies membership before upload
-- and creates short-lived signed download URLs after verifying membership.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'chat-attachments',
    'chat-attachments',
    false,
    20971520,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf', 'text/plain']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY chat_member_read_attachments
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'chat-attachments'
        AND EXISTS (
            SELECT 1
            FROM public.chat_conversation_members AS cm
            WHERE cm.staff_id = (SELECT public.chat_current_staff_id())
              AND cm.conversation_id::text = (storage.foldername(name))[1]
        )
    );

-- No direct client upload policy is granted: uploads go through the API so the
-- file size, media type, message membership, and metadata are checked together.
