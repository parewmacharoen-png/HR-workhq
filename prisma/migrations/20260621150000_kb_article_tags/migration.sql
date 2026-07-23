-- KB article tags for policy classification and filtering

ALTER TABLE knowledge.kb_articles
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS ix_kb_articles_tags
  ON knowledge.kb_articles USING GIN (tags);
