-- POLICYBOX-CF-1.0
-- Additive producer-only evidence extraction for current policy documents.
-- Extracted facts remain unverified until producer review and never authorize coverage, eligibility, underwriting, pricing or binding conclusions.
CREATE TABLE IF NOT EXISTS cf_policybox_analyses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('unverified','producer_reviewed')),
  document_refs_json TEXT NOT NULL,
  extraction_json TEXT NOT NULL,
  brief_json TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, request_id),
  UNIQUE(workspace_id, opportunity_id, source_fingerprint)
);
CREATE INDEX IF NOT EXISTS cf_policybox_opportunity_idx ON cf_policybox_analyses(workspace_id, opportunity_id, created_at DESC);
