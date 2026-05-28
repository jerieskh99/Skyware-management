-- =============================================================================
-- Knowledge V1 invariants (follow-up to 20260527203406_knowledge_v1_apply).
--
-- Raw-SQL-only migration. Adds:
--   1. pg_trgm extension (guarded).
--   2. Trigram GIN indexes on `summary` and `external_source` for fast
--      ILIKE/contains search.
--   3. CHECK constraint asserting that external_reference rows carry both
--      external_url and external_url_hash.
--   4. CHECK constraint clamping confidence_score to 0..100 (nullable).
--   5. Partial UNIQUE index on external_url_hash WHERE NOT NULL so two
--      external_reference rows cannot share the same canonical URL hash.
--   6. Self-reference CHECK on knowledge_article_references.
--   7. Composite/partial indexes that cover the hot list + reviewer queue
--      query patterns (kind+status, status+last_reviewed_at, kind+
--      published_at WHERE status='published').
--
-- Every statement is idempotent. CHECK constraints and indexes ride
-- `IF NOT EXISTS` where Postgres supports it; CHECK constraints are
-- guarded with a DO block that catches `duplicate_object`.
-- =============================================================================

-- 1. pg_trgm extension --------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Trigram GIN indexes -------------------------------------------------------
CREATE INDEX IF NOT EXISTS knowledge_articles_summary_trgm_idx
  ON knowledge_articles USING gin (summary gin_trgm_ops);

CREATE INDEX IF NOT EXISTS knowledge_articles_external_source_trgm_idx
  ON knowledge_articles USING gin (external_source gin_trgm_ops);

-- 3. CHECK: external_reference rows must carry url + hash ----------------------
DO $$
BEGIN
  ALTER TABLE knowledge_articles
    ADD CONSTRAINT knowledge_articles_external_consistency_chk
    CHECK ((kind <> 'external_reference') OR (external_url IS NOT NULL AND external_url_hash IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

-- 4. CHECK: confidence_score range 0..100 (nullable) ---------------------------
DO $$
BEGIN
  ALTER TABLE knowledge_articles
    ADD CONSTRAINT knowledge_articles_confidence_score_range_chk
    CHECK (confidence_score IS NULL OR (confidence_score BETWEEN 0 AND 100));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

-- 5. Partial UNIQUE on external_url_hash WHERE NOT NULL ------------------------
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_articles_external_url_hash_unique
  ON knowledge_articles (external_url_hash)
  WHERE external_url_hash IS NOT NULL;

-- 6. Self-reference CHECK on knowledge_article_references ----------------------
DO $$
BEGIN
  ALTER TABLE knowledge_article_references
    ADD CONSTRAINT knowledge_article_references_no_self_ref_chk
    CHECK (article_id <> referenced_article_id);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

-- 7. Hot-path partial / composite indexes --------------------------------------
CREATE INDEX IF NOT EXISTS knowledge_articles_kind_status_idx
  ON knowledge_articles (kind, status);

CREATE INDEX IF NOT EXISTS knowledge_articles_status_last_reviewed_idx
  ON knowledge_articles (status, last_reviewed_at);

CREATE INDEX IF NOT EXISTS knowledge_articles_kind_published_idx
  ON knowledge_articles (kind, published_at DESC)
  WHERE status = 'published';
