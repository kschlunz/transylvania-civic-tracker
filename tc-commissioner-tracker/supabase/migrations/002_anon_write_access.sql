-- Allow anon role to write data (no auth system yet)
-- This should be replaced with proper auth policies when user authentication is added.

CREATE POLICY "Anon write access on meetings"
  ON meetings FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon update access on meetings"
  ON meetings FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon write access on follow_ups"
  ON follow_ups FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon update access on follow_ups"
  ON follow_ups FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon write access on public_statements"
  ON public_statements FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon update access on public_statements"
  ON public_statements FOR UPDATE TO anon USING (true) WITH CHECK (true);
