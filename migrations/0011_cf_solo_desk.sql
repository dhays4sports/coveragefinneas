-- CF-SOLO-DESK-1.0: additive. No legacy record, token or outcome is rewritten.
CREATE TABLE IF NOT EXISTS cf_solo_opportunities (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, owner_id TEXT NOT NULL,
  contact_json TEXT NOT NULL, source TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
  products TEXT NOT NULL DEFAULT '', deadline TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'inquiry', status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','deferred','closed')),
  close_reason TEXT NOT NULL DEFAULT '', edit_version INTEGER NOT NULL DEFAULT 1,
  last_mutation_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cf_solo_opportunities_workspace ON cf_solo_opportunities(workspace_id,status,updated_at,id);
CREATE TABLE IF NOT EXISTS cf_solo_sources (
  workspace_id TEXT NOT NULL, kind TEXT NOT NULL, source_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES cf_solo_opportunities(id),
  summary_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,kind,source_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_solo_sources_opportunity ON cf_solo_sources(opportunity_id,kind);
CREATE TABLE IF NOT EXISTS cf_solo_tasks (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES cf_solo_opportunities(id),
  assignee_id TEXT NOT NULL, work_type TEXT NOT NULL
    CHECK(work_type IN ('outreach','quoting_service','advice_closing')),
  title TEXT NOT NULL, due_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','in_progress','waiting','completed','cancelled')),
  blocker TEXT NOT NULL DEFAULT '', priority INTEGER NOT NULL DEFAULT 0,
  source_key TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT,
  UNIQUE(workspace_id,source_key)
);
CREATE INDEX IF NOT EXISTS idx_cf_solo_tasks_due ON cf_solo_tasks(workspace_id,state,work_type,due_at,id);
CREATE INDEX IF NOT EXISTS idx_cf_solo_tasks_opportunity ON cf_solo_tasks(opportunity_id,state);
CREATE TABLE IF NOT EXISTS cf_solo_activity (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES cf_solo_opportunities(id),
  actor_id TEXT NOT NULL, kind TEXT NOT NULL, request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(workspace_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_solo_activity_opportunity ON cf_solo_activity(opportunity_id,created_at,id);
CREATE TABLE IF NOT EXISTS cf_solo_sync (
  workspace_id TEXT NOT NULL, stream TEXT NOT NULL, cursor_json TEXT NOT NULL,
  PRIMARY KEY(workspace_id,stream)
);
PRAGMA optimize;
