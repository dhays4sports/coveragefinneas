-- CF-FIV-1.0: additive, nonnumeric possession-quality projection.
-- Stores only derived sales-priority state and reason-coded evidence from existing opportunity/source data.
-- It is not an underwriting, eligibility, pricing or protected-class decision.
CREATE TABLE IF NOT EXISTS cf_fiv_projections (
  workspace_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES cf_solo_opportunities(id),
  fit TEXT NOT NULL DEFAULT 'unknown' CHECK(fit IN ('unknown','low','medium','high')),
  intent TEXT NOT NULL DEFAULT 'unknown' CHECK(intent IN ('unknown','low','medium','high')),
  value TEXT NOT NULL DEFAULT 'unknown' CHECK(value IN ('unknown','low','medium','high')),
  queue TEXT NOT NULL DEFAULT 'unclassified' CHECK(queue IN ('unclassified','shoot_now','quick_play','develop','nurture','low_priority')),
  projection_json TEXT NOT NULL DEFAULT '{}',
  engine TEXT NOT NULL DEFAULT 'CF-FIV-1.0',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,opportunity_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_fiv_queue ON cf_fiv_projections(workspace_id,queue,updated_at,opportunity_id);
PRAGMA optimize;
