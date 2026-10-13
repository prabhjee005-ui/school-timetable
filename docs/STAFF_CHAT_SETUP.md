# Staff Chat setup

Staff Chat is staff-only. The web client signs in through Supabase Auth, while
the API validates every access token and maps it to an active `public.staff`
row. The service-role key stays on the backend. Do not put it in a `VITE_`
variable or browser code.

## Required setup before use

1. Review `sql/006_staff_chat.sql`. It creates the chat tables, row policies,
   private attachment bucket, and Realtime publication entry. The migration has
   not been applied by this code change.
2. Configure the frontend build with `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`. The latter must be the project's publishable/anon
   key; it is not the service-role key.
3. Create staff accounts through Supabase Auth with email confirmation enabled.
   There is intentionally no public sign-up screen.
4. Link each Auth user to the matching staff record by inserting one row into
   `public.chat_profiles` with `auth_user_id`, `staff_id`, and `is_active = true`.
   Set `is_admin = true` only for a trusted administrator. Use the Auth user UUID
   and the existing staff UUID; keep those values out of committed fixtures.
5. Confirm the Supabase Realtime service is enabled for `public.chat_messages`.
   The migration adds that table to the `supabase_realtime` publication.
6. Start the backend and frontend, sign in with a linked staff account, and
   verify conversations, messages, realtime delivery, and private attachment
   downloads with two separate staff accounts before a wider pilot.

## Initial limits

- A message has up to 5,000 characters and can include one attachment up to
  20 MB. Accepted attachments are JPG, PNG, WebP, MP4, MOV, PDF, and plain text.
- The attachment bucket is private. The API checks conversation membership
  before upload or creating a 60-second download URL.
- Any active staff member can start a direct conversation or group with up to
  50 total members. Group membership management, account invitations, message
  editing/deletion, moderation, voice notes, and browser push notifications are
  not included yet.
- Admin status is metadata only; it does not grant access to private message
  contents.

## Operational notes

This is a first implementation, not a production launch checklist. Set a school
retention and reporting policy, confirm database and Storage backups, and test
account deactivation and membership removal before staff rely on chat for urgent
communications. The current app backend uses a service-role client, so chat API
routes must keep their bearer-token and membership checks in place.
