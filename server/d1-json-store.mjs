const ALLOWED_TABLES = new Set(['consultation_records', 'prospect_reports', 'referral_links', 'referral_events', 'sms_conversations', 'sms_handoffs', 'pvx_records']);

function assertDatabase(db) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('A Cloudflare D1 database binding is required.');
}

function tableName(value) {
  const name = String(value || '');
  if (!ALLOWED_TABLES.has(name)) throw new TypeError('Unsupported CoverageFit D1 table.');
  return name;
}

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch (_) { return fallback; }
}

function sqlLikePrefix(prefix) {
  return `${String(prefix || '').replace(/[\\%_]/g, value => `\\${value}`)}%`;
}

export function createD1JsonStore(db, requestedTable) {
  assertDatabase(db);
  const table = tableName(requestedTable);

  return Object.freeze({
    async get(key) {
      const row = await db.prepare(`SELECT data_json FROM ${table} WHERE record_key = ?1 LIMIT 1`).bind(String(key)).first();
      return row ? parseJson(row.data_json) : null;
    },

    async setJSON(key, value, options = {}) {
      const metadata = options.metadata && typeof options.metadata === 'object' ? options.metadata : {};
      const now = new Date().toISOString();
      const createdAt = text(metadata.createdAt, now);
      const updatedAt = text(metadata.updatedAt, now);
      const expiresAt = text(metadata.expiresAt);
      const dataJson = JSON.stringify(value);
      const metadataJson = JSON.stringify(metadata);

      if (options.onlyIfNew) {
        await db.prepare(
          `INSERT INTO ${table} (record_key, data_json, metadata_json, created_at, updated_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, NULLIF(?6, ''))`
        ).bind(String(key), dataJson, metadataJson, createdAt, updatedAt, expiresAt).run();
        return;
      }

      await db.prepare(
        `INSERT INTO ${table} (record_key, data_json, metadata_json, created_at, updated_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, NULLIF(?6, ''))
         ON CONFLICT(record_key) DO UPDATE SET
           data_json = excluded.data_json,
           metadata_json = excluded.metadata_json,
           updated_at = excluded.updated_at,
           expires_at = excluded.expires_at`
      ).bind(String(key), dataJson, metadataJson, createdAt, updatedAt, expiresAt).run();
    },

    async list(options = {}) {
      const prefix = String(options.prefix || '');
      const limit = Math.max(1, Math.min(1000, Number(options.limit) || 500));
      const result = await db.prepare(
        `SELECT record_key, metadata_json, created_at, updated_at, expires_at
         FROM ${table}
         WHERE record_key LIKE ?1 ESCAPE '\\'
         ORDER BY updated_at DESC
         LIMIT ?2`
      ).bind(sqlLikePrefix(prefix), limit).all();
      const rows = Array.isArray(result?.results) ? result.results : [];
      return {
        blobs: rows.map(row => ({
          key: row.record_key,
          metadata: parseJson(row.metadata_json, {}),
          uploadedAt: row.updated_at || row.created_at || '',
          expiresAt: row.expires_at || ''
        }))
      };
    },

    async delete(key) {
      await db.prepare(`DELETE FROM ${table} WHERE record_key = ?1`).bind(String(key)).run();
    }
  });
}

export function createConsultationStore(db) {
  return createD1JsonStore(db, 'consultation_records');
}

export function createProspectReportStore(db) {
  return createD1JsonStore(db, 'prospect_reports');
}

export function createReferralLinkStore(db) {
  return createD1JsonStore(db, 'referral_links');
}


export function createReferralEventStore(db) {
  return createD1JsonStore(db, 'referral_events');
}


export function createSmsConversationStore(db) {
  return createD1JsonStore(db, 'sms_conversations');
}

export function createSmsHandoffStore(db) {
  return createD1JsonStore(db, 'sms_handoffs');
}

export function createPVXRecordStore(db) {
  return createD1JsonStore(db, 'pvx_records');
}
