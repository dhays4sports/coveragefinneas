-- CF-AGENT-CAPABILITY-1.0 — agent-native capability ingress and Mesh service-auth replay protection.
CREATE TABLE IF NOT EXISTS cf_mesh_service_auth_nonces (
  nonce TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cf_mesh_service_auth_nonces_expiry ON cf_mesh_service_auth_nonces(expires_at);

CREATE TABLE IF NOT EXISTS cf_agent_capability_invocations (
  invocation_id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  capability_id TEXT NOT NULL CHECK(capability_id IN (
    'insurance.coverage_review.request',
    'insurance.callback.schedule',
    'insurance.agent.connect'
  )),
  contact_ref TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  request_json TEXT NOT NULL DEFAULT '{}',
  authority_ref TEXT NOT NULL,
  source_platform TEXT NOT NULL DEFAULT '',
  adapter_ref TEXT NOT NULL DEFAULT '',
  experience_ref TEXT NOT NULL DEFAULT '',
  source_surface TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  result_ref TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cf_agent_capability_invocations_contact ON cf_agent_capability_invocations(contact_ref,created_at);
CREATE INDEX IF NOT EXISTS idx_cf_agent_capability_invocations_platform ON cf_agent_capability_invocations(source_platform,created_at);
CREATE INDEX IF NOT EXISTS idx_cf_agent_capability_invocations_capability ON cf_agent_capability_invocations(capability_id,created_at);
