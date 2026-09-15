-- CF-UCP-NBA-1.0: additive identity/profile layer above Solo Desk opportunities.
-- Existing opportunities, source links, recommendations, appointments and outcomes remain authoritative.
-- No opportunities are merged by matching phone, email, name, address or other inferred identity.
CREATE TABLE IF NOT EXISTS cf_ucp_customers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  primary_email TEXT NOT NULL DEFAULT '',
  primary_mobile TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','merged','inactive')),
  merged_into_customer_id TEXT,
  edit_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cf_ucp_customers_workspace ON cf_ucp_customers(workspace_id,status,updated_at,id);

CREATE TABLE IF NOT EXISTS cf_ucp_households (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  edit_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cf_ucp_households_workspace ON cf_ucp_households(workspace_id,status,updated_at,id);

CREATE TABLE IF NOT EXISTS cf_ucp_household_members (
  workspace_id TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES cf_ucp_households(id),
  customer_id TEXT NOT NULL REFERENCES cf_ucp_customers(id),
  relationship TEXT NOT NULL DEFAULT 'primary',
  is_primary INTEGER NOT NULL DEFAULT 1 CHECK(is_primary IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,household_id,customer_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_ucp_members_customer ON cf_ucp_household_members(workspace_id,customer_id,household_id);

CREATE TABLE IF NOT EXISTS cf_ucp_opportunity_links (
  workspace_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES cf_solo_opportunities(id),
  customer_id TEXT NOT NULL REFERENCES cf_ucp_customers(id),
  household_id TEXT NOT NULL REFERENCES cf_ucp_households(id),
  link_basis TEXT NOT NULL CHECK(link_basis IN ('seeded_from_opportunity','explicit_profile_link','explicit_profile_split')),
  linked_by TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,opportunity_id)
);
CREATE INDEX IF NOT EXISTS idx_cf_ucp_links_customer ON cf_ucp_opportunity_links(workspace_id,customer_id,updated_at,opportunity_id);
CREATE INDEX IF NOT EXISTS idx_cf_ucp_links_household ON cf_ucp_opportunity_links(workspace_id,household_id,updated_at,opportunity_id);

-- Every existing opportunity receives its own customer and household initially.
-- This is deliberately conservative: identity is unified only by an explicit producer action.
INSERT OR IGNORE INTO cf_ucp_customers(id,workspace_id,display_name,primary_email,primary_mobile,created_at,updated_at)
SELECT 'cust_' || id, workspace_id,
       COALESCE(NULLIF(json_extract(contact_json,'$.name'),''),'Name not recorded'),
       COALESCE(json_extract(contact_json,'$.email'),''),
       COALESCE(json_extract(contact_json,'$.mobile'),''),
       created_at, updated_at
FROM cf_solo_opportunities;

INSERT OR IGNORE INTO cf_ucp_households(id,workspace_id,label,created_at,updated_at)
SELECT 'hh_' || id, workspace_id,
       COALESCE(NULLIF(json_extract(contact_json,'$.name'),''),'Household') || ' household',
       created_at, updated_at
FROM cf_solo_opportunities;

INSERT OR IGNORE INTO cf_ucp_household_members(workspace_id,household_id,customer_id,relationship,is_primary,created_at)
SELECT workspace_id,'hh_' || id,'cust_' || id,'primary',1,created_at
FROM cf_solo_opportunities;

INSERT OR IGNORE INTO cf_ucp_opportunity_links(workspace_id,opportunity_id,customer_id,household_id,link_basis,linked_by,request_id,created_at,updated_at)
SELECT workspace_id,id,'cust_' || id,'hh_' || id,'seeded_from_opportunity','migration','migration:0012:' || id,created_at,updated_at
FROM cf_solo_opportunities;

PRAGMA optimize;
