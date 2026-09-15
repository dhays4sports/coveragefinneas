-- Private, versioned extraction configuration. No customer samples are shipped in source.
CREATE TABLE IF NOT EXISTS cf_quote_templates(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,head INTEGER NOT NULL DEFAULT 1,active_version INTEGER,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cf_quote_template_versions(template_id TEXT NOT NULL REFERENCES cf_quote_templates(id),version INTEGER NOT NULL,config_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(template_id,version));
CREATE TABLE IF NOT EXISTS cf_quote_template_samples(id TEXT PRIMARY KEY,template_id TEXT NOT NULL REFERENCES cf_quote_templates(id),files_json TEXT NOT NULL,expected_json TEXT,expected_version INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cf_quote_template_runs(id TEXT PRIMARY KEY,sample_id TEXT NOT NULL REFERENCES cf_quote_template_samples(id),template_version INTEGER NOT NULL,expected_version INTEGER NOT NULL,result_json TEXT NOT NULL,differences_json TEXT NOT NULL,passed INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cf_quote_template_activations(id TEXT PRIMARY KEY,template_id TEXT NOT NULL,version INTEGER,action TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cf_quote_workflows(owner_id TEXT PRIMARY KEY,version INTEGER NOT NULL DEFAULT 1,settings_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS cf_quote_runs_sample ON cf_quote_template_runs(sample_id,created_at);
