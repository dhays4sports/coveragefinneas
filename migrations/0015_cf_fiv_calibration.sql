-- CF-FIV-1.1: observational calibration + governed producer-effort evidence.
-- Additive only. Does not alter underwriting, eligibility, pricing, identity, consent,
-- current FIV queue rules, recommendation outcomes, or acquisition attribution.

CREATE TABLE IF NOT EXISTS cf_fiv_calibration_baselines (
  workspace_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES cf_solo_opportunities(id),
  fit TEXT NOT NULL CHECK(fit IN ('unknown','low','medium','high')),
  intent TEXT NOT NULL CHECK(intent IN ('unknown','low','medium','high')),
  value TEXT NOT NULL CHECK(value IN ('unknown','low','medium','high')),
  queue TEXT NOT NULL CHECK(queue IN ('unclassified','shoot_now','quick_play','develop','nurture','low_priority')),
  projection_json TEXT NOT NULL DEFAULT '{}',
  engine TEXT NOT NULL,
  basis TEXT NOT NULL DEFAULT 'first_ready',
  captured_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,opportunity_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_fiv_calibration_queue
  ON cf_fiv_calibration_baselines(workspace_id,queue,captured_at,opportunity_id);

CREATE TABLE IF NOT EXISTS cf_opportunity_effort (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES cf_solo_opportunities(id),
  actor_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'outreach','discovery','quote_preparation','recommendation','closing','other_sales'
  )),
  minutes INTEGER NOT NULL CHECK(minutes>=1 AND minutes<=480),
  note TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_effort_opportunity
  ON cf_opportunity_effort(workspace_id,opportunity_id,occurred_at,id);
CREATE INDEX IF NOT EXISTS idx_cf_effort_period
  ON cf_opportunity_effort(workspace_id,occurred_at,category,opportunity_id);

PRAGMA optimize;
