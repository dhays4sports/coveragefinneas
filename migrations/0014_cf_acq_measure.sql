-- CF-ACQ-MEASURE-1.0: additive acquisition attribution, spend, and evidence-gated funnel measurement.
-- No existing opportunity, policy, recommendation, identity, consent, or carrier outcome is rewritten.

CREATE TABLE IF NOT EXISTS cf_acq_campaigns (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_family TEXT NOT NULL CHECK(source_family IN (
    'district_lead','purchased_lead','paid_search','paid_social','direct_mail',
    'referral_partner','local_partner','organic_web','outbound','existing_relationship',
    'event_or_affinity','other'
  )),
  source_key TEXT NOT NULL DEFAULT '',
  campaign_variant TEXT NOT NULL DEFAULT '',
  partner_id TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,id)
);
CREATE INDEX IF NOT EXISTS idx_cf_acq_campaigns_source ON cf_acq_campaigns(workspace_id,source_family,source_key,status,id);

CREATE TABLE IF NOT EXISTS cf_acq_spend (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL DEFAULT '',
  source_family TEXT NOT NULL CHECK(source_family IN (
    'district_lead','purchased_lead','paid_search','paid_social','direct_mail',
    'referral_partner','local_partner','organic_web','outbound','existing_relationship',
    'event_or_affinity','other'
  )),
  source_key TEXT NOT NULL DEFAULT '',
  partner_id TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'media' CHECK(category IN ('media','data','mail','event','partner','other')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
  incurred_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  evidence_ref TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_acq_spend_period ON cf_acq_spend(workspace_id,incurred_on,campaign_id,source_family);

CREATE TABLE IF NOT EXISTS cf_acq_opportunity_attribution (
  workspace_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES cf_solo_opportunities(id),
  source_family TEXT NOT NULL CHECK(source_family IN (
    'district_lead','purchased_lead','paid_search','paid_social','direct_mail',
    'referral_partner','local_partner','organic_web','outbound','existing_relationship',
    'event_or_affinity','other'
  )),
  source_key TEXT NOT NULL DEFAULT '',
  campaign_id TEXT NOT NULL DEFAULT '',
  campaign_variant TEXT NOT NULL DEFAULT '',
  partner_id TEXT NOT NULL DEFAULT '',
  batch_id TEXT NOT NULL DEFAULT '',
  first_touch_json TEXT NOT NULL DEFAULT '{}',
  latest_touch_json TEXT NOT NULL DEFAULT '{}',
  attribution_basis TEXT NOT NULL DEFAULT 'derived',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,opportunity_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_acq_attribution_rollup ON cf_acq_opportunity_attribution(workspace_id,source_family,campaign_id,source_key,opportunity_id);

CREATE TABLE IF NOT EXISTS cf_acq_opportunity_measurements (
  workspace_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES cf_solo_opportunities(id),
  opportunity_created_at TEXT NOT NULL,
  qualified_possession_at TEXT,
  contact_made_at TEXT,
  meaningful_conversation_at TEXT,
  quoteable_at TEXT,
  quote_prepared_at TEXT,
  recommendation_delivered_at TEXT,
  close_asked_at TEXT,
  bound_at TEXT,
  written_premium_recorded_at TEXT,
  written_premium_cents INTEGER CHECK(written_premium_cents IS NULL OR written_premium_cents>=0),
  premium_evidence_json TEXT NOT NULL DEFAULT '[]',
  producer_minutes INTEGER CHECK(producer_minutes IS NULL OR producer_minutes>=0),
  producer_minutes_basis TEXT NOT NULL DEFAULT 'not_captured',
  measurement_json TEXT NOT NULL DEFAULT '{}',
  engine TEXT NOT NULL DEFAULT 'CF-ACQ-MEASURE-1.0',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,opportunity_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_acq_measure_created ON cf_acq_opportunity_measurements(workspace_id,opportunity_created_at,opportunity_id);
CREATE INDEX IF NOT EXISTS idx_cf_acq_measure_bound ON cf_acq_opportunity_measurements(workspace_id,bound_at,opportunity_id);

PRAGMA optimize;
