-- Email subscribers for future notifications
CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read on subscribers" ON subscribers FOR SELECT USING (true);
CREATE POLICY "Anon insert on subscribers" ON subscribers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert on subscribers" ON subscribers FOR INSERT TO authenticated WITH CHECK (true);
