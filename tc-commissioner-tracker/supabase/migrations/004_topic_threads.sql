-- Topic threads: track specific items across meetings
CREATE TABLE IF NOT EXISTS topic_threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  categories JSONB DEFAULT '[]',
  first_mentioned_date DATE NOT NULL,
  first_mentioned_meeting_id TEXT REFERENCES meetings(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'recurring')),
  mentions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topic_threads_status ON topic_threads(status);
CREATE INDEX IF NOT EXISTS idx_topic_threads_date ON topic_threads(first_mentioned_date DESC);

ALTER TABLE topic_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read on topic_threads" ON topic_threads FOR SELECT USING (true);
CREATE POLICY "Anon write on topic_threads" ON topic_threads FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update on topic_threads" ON topic_threads FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Auth write on topic_threads" ON topic_threads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update on topic_threads" ON topic_threads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
