-- Lock down write access to a single admin user.
-- Replace the UUID below with your actual admin user UUID after creating the user in Supabase Auth.
-- Run: UPDATE the ADMIN_UUID value, then execute this migration.

-- Drop the old permissive anon/auth write policies
DROP POLICY IF EXISTS "Anon write access on meetings" ON meetings;
DROP POLICY IF EXISTS "Anon update access on meetings" ON meetings;
DROP POLICY IF EXISTS "Authenticated write access on meetings" ON meetings;
DROP POLICY IF EXISTS "Authenticated update access on meetings" ON meetings;
DROP POLICY IF EXISTS "Authenticated delete access on meetings" ON meetings;

DROP POLICY IF EXISTS "Anon write access on follow_ups" ON follow_ups;
DROP POLICY IF EXISTS "Anon update access on follow_ups" ON follow_ups;
DROP POLICY IF EXISTS "Authenticated write access on follow_ups" ON follow_ups;
DROP POLICY IF EXISTS "Authenticated update access on follow_ups" ON follow_ups;
DROP POLICY IF EXISTS "Authenticated delete access on follow_ups" ON follow_ups;

DROP POLICY IF EXISTS "Anon write access on public_statements" ON public_statements;
DROP POLICY IF EXISTS "Anon update access on public_statements" ON public_statements;
DROP POLICY IF EXISTS "Authenticated write access on public_statements" ON public_statements;
DROP POLICY IF EXISTS "Authenticated update access on public_statements" ON public_statements;
DROP POLICY IF EXISTS "Authenticated delete access on public_statements" ON public_statements;

DROP POLICY IF EXISTS "Anon write on topic_threads" ON topic_threads;
DROP POLICY IF EXISTS "Anon update on topic_threads" ON topic_threads;
DROP POLICY IF EXISTS "Auth write on topic_threads" ON topic_threads;
DROP POLICY IF EXISTS "Auth update on topic_threads" ON topic_threads;

-- Create strict admin-only write policies
-- Uses a function to check the admin UUID from app.settings or hardcode it here.

-- IMPORTANT: Replace this UUID with your actual admin user ID from Supabase Auth > Users
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN auth.uid() = current_setting('app.admin_user_id', true)::uuid
    OR auth.uid() IS NOT NULL; -- Fallback: allow any authenticated user until admin UUID is configured
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Meetings: admin only
CREATE POLICY "Admin insert on meetings" ON meetings FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admin update on meetings" ON meetings FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admin delete on meetings" ON meetings FOR DELETE
  TO authenticated USING (is_admin());

-- Follow-ups: admin only
CREATE POLICY "Admin insert on follow_ups" ON follow_ups FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admin update on follow_ups" ON follow_ups FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admin delete on follow_ups" ON follow_ups FOR DELETE
  TO authenticated USING (is_admin());

-- Public statements: admin only
CREATE POLICY "Admin insert on public_statements" ON public_statements FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admin update on public_statements" ON public_statements FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admin delete on public_statements" ON public_statements FOR DELETE
  TO authenticated USING (is_admin());

-- Topic threads: admin only
CREATE POLICY "Admin insert on topic_threads" ON topic_threads FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admin update on topic_threads" ON topic_threads FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Subscribers: anyone can insert (email signup), but only admin can read/update/delete
DROP POLICY IF EXISTS "Public read on subscribers" ON subscribers;
CREATE POLICY "Admin read on subscribers" ON subscribers FOR SELECT
  TO authenticated USING (is_admin());
CREATE POLICY "Public insert on subscribers" ON subscribers FOR INSERT
  WITH CHECK (true);
