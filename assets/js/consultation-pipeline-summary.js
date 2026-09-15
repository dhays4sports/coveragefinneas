(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CoverageFitConsultationPipelineSummary = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.2.0';
  const MAX_CUSTOM_RANGE_DAYS = 366;
  const STAGES = Object.freeze([
    Object.freeze({ key: 'review_received', label: 'Review received' }),
    Object.freeze({ key: 'contact_attempted', label: 'Contact attempted' }),
    Object.freeze({ key: 'consultation_scheduled', label: 'Consultation scheduled' }),
    Object.freeze({ key: 'consultation_completed', label: 'Consultation completed' }),
    Object.freeze({ key: 'proposal_prepared', label: 'Proposal prepared' }),
    Object.freeze({ key: 'decision_pending', label: 'Decision pending' }),
    Object.freeze({ key: 'closed', label: 'Closed' })
  ]);
  const OUTCOMES = Object.freeze([
    Object.freeze({ key: 'policy_bound', label: 'Policy bound' }),
    Object.freeze({ key: 'current_carrier_retained', label: 'Stayed with current carrier' }),
    Object.freeze({ key: 'declined_price', label: 'Declined — price' }),
    Object.freeze({ key: 'declined_coverage', label: 'Declined — coverage' }),
    Object.freeze({ key: 'unable_to_reach', label: 'Unable to reach' }),
    Object.freeze({ key: 'not_eligible', label: 'Not eligible / not a fit' }),
    Object.freeze({ key: 'deferred', label: 'Deferred / future review' })
  ]);
  const DATE_RANGES = Object.freeze([
    Object.freeze({ key: 'all', label: 'All time' }),
    Object.freeze({ key: '7d', label: 'Last 7 days', days: 7 }),
    Object.freeze({ key: '30d', label: 'Last 30 days', days: 30 }),
    Object.freeze({ key: '90d', label: 'Last 90 days', days: 90 }),
    Object.freeze({ key: 'custom', label: 'Custom range' })
  ]);
  const TREND_GRANULARITIES = Object.freeze([
    Object.freeze({ key: 'day', label: 'Daily' }),
    Object.freeze({ key: 'week', label: 'Weekly' }),
    Object.freeze({ key: 'month', label: 'Monthly' }),
    Object.freeze({ key: 'quarter', label: 'Quarterly' }),
    Object.freeze({ key: 'year', label: 'Yearly' })
  ]);
  const CSV_COLUMNS = Object.freeze([
    Object.freeze({ key: 'consultationId', label: 'Consultation ID' }),
    Object.freeze({ key: 'receivedAt', label: 'Received at' }),
    Object.freeze({ key: 'recordType', label: 'Record type' }),
    Object.freeze({ key: 'deliveryStatus', label: 'Delivery status' }),
    Object.freeze({ key: 'customerName', label: 'Customer name' }),
    Object.freeze({ key: 'email', label: 'Email' }),
    Object.freeze({ key: 'phone', label: 'Phone' }),
    Object.freeze({ key: 'propertyAddress', label: 'Property address' }),
    Object.freeze({ key: 'reviewReason', label: 'Review reason' }),
    Object.freeze({ key: 'stage', label: 'Consultation stage' }),
    Object.freeze({ key: 'outcome', label: 'Final outcome' }),
    Object.freeze({ key: 'dispositionNote', label: 'Disposition note' }),
    Object.freeze({ key: 'followUpState', label: 'Follow-up state' }),
    Object.freeze({ key: 'followUpDate', label: 'Follow-up date' }),
    Object.freeze({ key: 'followUpNote', label: 'Follow-up note' }),
    Object.freeze({ key: 'campaign', label: 'Campaign' }),
    Object.freeze({ key: 'referralSource', label: 'Referral source' }),
    Object.freeze({ key: 'entrySource', label: 'Entry source' }),
    Object.freeze({ key: 'source', label: 'Source' }),
    Object.freeze({ key: 'protectionScore', label: 'Protection score' }),
    Object.freeze({ key: 'createdAt', label: 'Created at' }),
    Object.freeze({ key: 'deliveredAt', label: 'Delivered at' }),
    Object.freeze({ key: 'openedAt', label: 'Opened at' }),
    Object.freeze({ key: 'acknowledgedAt', label: 'Acknowledged at' }),
    Object.freeze({ key: 'closedAt', label: 'Closed at' })
  ]);
  const STAGE_KEYS = new Set(STAGES.map(item => item.key));
  const OUTCOME_KEYS = new Set(OUTCOMES.map(item => item.key));
  const DATE_RANGE_KEYS = new Set(DATE_RANGES.map(item => item.key));

  function string(value) {
    if (value === 0) return '0';
    return typeof value === 'string' ? value.trim() : '';
  }

  function text(value) {
    return string(value).toLowerCase();
  }

  function disposition(record) {
    const source = record?.remote?.disposition || record?.disposition || {};
    const stageValue = text(source.stage);
    const stage = STAGE_KEYS.has(stageValue) ? stageValue : 'review_received';
    const outcomeValue = text(source.outcome);
    return {
      stage,
      outcome: stage === 'closed' && OUTCOME_KEYS.has(outcomeValue) ? outcomeValue : 'none',
      note: string(source.note),
      closedAt: string(source.closedAt)
    };
  }

  function percentage(count, total) {
    return total > 0 ? Math.round((count / total) * 100) : 0;
  }

  function dateValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function startOfLocalDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function endOfLocalDay(value) {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  }

  function dateOnlyValue(value, endOfDay) {
    const source = string(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return NaN;
    const [year, month, day] = source.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return NaN;
    parsed.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return parsed.getTime();
  }

  function localDateKey(value) {
    const timestamp = dateValue(value);
    if (!Number.isFinite(timestamp)) return '';
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDate(value) {
    if (!Number.isFinite(value)) return '';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  }

  function formatShortDate(value) {
    if (!Number.isFinite(value)) return '';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
  }

  function resolveDateRange(options) {
    const settings = options && typeof options === 'object' ? options : {};
    const requested = text(settings.range || settings.dateRange || 'all');
    const key = DATE_RANGE_KEYS.has(requested) ? requested : 'all';
    const now = dateValue(settings.now || new Date());
    const todayEnd = endOfLocalDay(Number.isFinite(now) ? now : Date.now());
    if (key === 'all') {
      return Object.freeze({ key, label: 'All time', valid: true, start: null, end: null, error: '' });
    }
    if (key === 'custom') {
      const start = dateOnlyValue(settings.startDate, false);
      const end = dateOnlyValue(settings.endDate, true);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return Object.freeze({ key, label: 'Custom range', valid: false, start: null, end: null, error: 'Choose both a start and end date.' });
      }
      if (start > end) {
        return Object.freeze({ key, label: 'Custom range', valid: false, start, end, error: 'Start date must be on or before the end date.' });
      }
      const days = Math.floor((end - start) / 86400000) + 1;
      if (days > MAX_CUSTOM_RANGE_DAYS) {
        return Object.freeze({ key, label: 'Custom range', valid: false, start, end, error: `Custom ranges are limited to ${MAX_CUSTOM_RANGE_DAYS} days.` });
      }
      return Object.freeze({ key, label: `${formatDate(start)} – ${formatDate(end)}`, valid: true, start, end, error: '', days });
    }
    const preset = DATE_RANGES.find(item => item.key === key);
    const days = Number(preset?.days) || 30;
    const startDate = new Date(startOfLocalDay(todayEnd));
    startDate.setDate(startDate.getDate() - (days - 1));
    const start = startDate.getTime();
    return Object.freeze({ key, label: preset?.label || 'Date range', valid: true, start, end: todayEnd, error: '', days });
  }

  function recordTimestamp(record) {
    return string(record?.remote?.deliveredAt || record?.remote?.delivery?.deliveredAt || record?.createdAt || record?.assessment?.createdAt);
  }

  function filterRecords(records, options) {
    const safeRecords = Array.isArray(records) ? records.filter(record => record && typeof record === 'object') : [];
    const range = resolveDateRange(options);
    if (!range.valid) return Object.freeze({ records: Object.freeze([]), range, availableTotal: safeRecords.length });
    if (range.key === 'all') return Object.freeze({ records: Object.freeze(safeRecords.slice()), range, availableTotal: safeRecords.length });
    const filtered = safeRecords.filter(record => {
      const timestamp = dateValue(recordTimestamp(record));
      return Number.isFinite(timestamp) && timestamp >= range.start && timestamp <= range.end;
    });
    return Object.freeze({ records: Object.freeze(filtered), range, availableTotal: safeRecords.length });
  }

  function humanize(value) {
    const source = string(value);
    if (!source) return 'Unattributed';
    if (/[A-Z]/.test(source)) return source;
    return source.replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  function integration(record) {
    const local = record?.integration && typeof record.integration === 'object' ? record.integration : {};
    const remote = record?.remote?.integration && typeof record.remote.integration === 'object' ? record.remote.integration : {};
    return {
      source: string(local.source || remote.source),
      campaign: string(local.campaign || remote.campaign),
      referralSource: string(local.referralSource || remote.referralSource),
      entry: string(local.entry || remote.entry)
    };
  }

  function segment(records, resolver) {
    const counts = new Map();
    records.forEach(record => {
      const raw = string(resolver(integration(record))) || 'Unattributed';
      const key = raw.toLowerCase();
      const current = counts.get(key) || { key, label: raw === 'Unattributed' ? raw : humanize(raw), count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
    const total = records.length;
    return Object.freeze(Array.from(counts.values())
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .map(item => Object.freeze({ ...item, percentage: percentage(item.count, total) })));
  }

  function trendGranularity(start, end) {
    const spanDays = Math.max(1, Math.floor((end - start) / 86400000) + 1);
    if (spanDays <= 14) return 'day';
    if (spanDays <= 336) return 'week';
    if (spanDays <= 1460) return 'month';
    if (spanDays <= 4380) return 'quarter';
    return 'year';
  }

  function bucketStart(value, granularity) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    if (granularity === 'week') {
      const weekday = date.getDay();
      date.setDate(date.getDate() - ((weekday + 6) % 7));
    } else if (granularity === 'month') {
      date.setDate(1);
    } else if (granularity === 'quarter') {
      date.setMonth(Math.floor(date.getMonth() / 3) * 3, 1);
    } else if (granularity === 'year') {
      date.setMonth(0, 1);
    }
    return date.getTime();
  }

  function nextBucket(value, granularity) {
    const date = new Date(value);
    if (granularity === 'day') date.setDate(date.getDate() + 1);
    else if (granularity === 'week') date.setDate(date.getDate() + 7);
    else if (granularity === 'month') date.setMonth(date.getMonth() + 1, 1);
    else if (granularity === 'quarter') date.setMonth(date.getMonth() + 3, 1);
    else date.setFullYear(date.getFullYear() + 1, 0, 1);
    return date.getTime();
  }

  function bucketLabel(start, end, granularity) {
    const startDate = new Date(start);
    if (granularity === 'day') return formatShortDate(start);
    if (granularity === 'week') return `${formatShortDate(start)}–${formatShortDate(end)}`;
    if (granularity === 'month') return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(startDate);
    if (granularity === 'quarter') return `Q${Math.floor(startDate.getMonth() / 3) + 1} ${startDate.getFullYear()}`;
    return String(startDate.getFullYear());
  }

  function trendBounds(selection) {
    if (!selection.range?.valid || !selection.records.length) return null;
    const timestamps = selection.records.map(record => dateValue(recordTimestamp(record))).filter(Number.isFinite);
    if (!timestamps.length) return null;
    if (Number.isFinite(selection.range.start) && Number.isFinite(selection.range.end)) {
      return { start: selection.range.start, end: selection.range.end, datedTotal: timestamps.length };
    }
    return { start: Math.min(...timestamps), end: Math.max(...timestamps), datedTotal: timestamps.length };
  }

  function buildTrend(records, options) {
    const selection = filterRecords(records, options);
    const bounds = trendBounds(selection);
    if (!bounds) {
      return Object.freeze({
        version: VERSION,
        granularity: 'month',
        label: 'Monthly',
        range: selection.range,
        selectedTotal: selection.records.length,
        datedTotal: 0,
        undatedTotal: selection.records.length,
        buckets: Object.freeze([])
      });
    }
    const granularity = trendGranularity(bounds.start, bounds.end);
    const granularityLabel = TREND_GRANULARITIES.find(item => item.key === granularity)?.label || 'Monthly';
    const first = bucketStart(bounds.start, granularity);
    const last = bucketStart(bounds.end, granularity);
    const buckets = [];
    const lookup = new Map();
    for (let cursor = first; cursor <= last; cursor = nextBucket(cursor, granularity)) {
      const next = nextBucket(cursor, granularity);
      const bucket = {
        key: `${granularity}-${localDateKey(cursor)}`,
        label: bucketLabel(cursor, next - 1, granularity),
        start: cursor,
        end: next - 1,
        consultations: 0,
        closed: 0,
        bound: 0
      };
      buckets.push(bucket);
      lookup.set(cursor, bucket);
    }
    selection.records.forEach(record => {
      const timestamp = dateValue(recordTimestamp(record));
      if (!Number.isFinite(timestamp)) return;
      const bucket = lookup.get(bucketStart(timestamp, granularity));
      if (!bucket) return;
      const current = disposition(record);
      bucket.consultations += 1;
      if (current.stage === 'closed') bucket.closed += 1;
      if (current.outcome === 'policy_bound') bucket.bound += 1;
    });
    const finalized = buckets.map(bucket => Object.freeze({
      ...bucket,
      closeRate: percentage(bucket.closed, bucket.consultations),
      conversionRate: percentage(bucket.bound, bucket.consultations)
    }));
    return Object.freeze({
      version: VERSION,
      granularity,
      label: granularityLabel,
      range: selection.range,
      selectedTotal: selection.records.length,
      datedTotal: bounds.datedTotal,
      undatedTotal: Math.max(0, selection.records.length - bounds.datedTotal),
      buckets: Object.freeze(finalized)
    });
  }

  function customer(record) {
    const current = record?.customer && typeof record.customer === 'object' ? record.customer : {};
    const contact = record?.report?.contact && typeof record.report.contact === 'object' ? record.report.contact : {};
    return {
      name: string(current.name || contact.name),
      email: string(current.email || contact.email),
      phone: string(current.phone || contact.phone),
      propertyAddress: string(current.propertyAddress || record?.report?.propertyAddress || record?.report?.property?.address),
      reviewReason: string(current.reviewContext || record?.report?.reviewContext || record?.report?.reviewReason)
    };
  }

  function followUp(record) {
    const current = record?.remote?.followUp || record?.followUp || {};
    return {
      state: string(current.state || 'none').toLowerCase(),
      scheduledAt: string(current.scheduledAt),
      note: string(current.note)
    };
  }

  function iso(value) {
    const timestamp = dateValue(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
  }

  function csvRecord(record) {
    const person = customer(record);
    const current = disposition(record);
    const next = followUp(record);
    const source = integration(record);
    return Object.freeze({
      consultationId: string(record?.id),
      receivedAt: iso(recordTimestamp(record)),
      recordType: record?.remote?.serverBacked ? 'Server-backed' : 'Browser-local',
      deliveryStatus: humanize(record?.remote?.status || record?.status || 'saved_local'),
      customerName: person.name,
      email: person.email,
      phone: person.phone,
      propertyAddress: person.propertyAddress,
      reviewReason: person.reviewReason,
      stage: STAGES.find(item => item.key === current.stage)?.label || humanize(current.stage),
      outcome: current.outcome === 'none' ? '' : OUTCOMES.find(item => item.key === current.outcome)?.label || humanize(current.outcome),
      dispositionNote: current.note,
      followUpState: humanize(next.state),
      followUpDate: iso(next.scheduledAt),
      followUpNote: next.note,
      campaign: source.campaign || 'Unattributed',
      referralSource: source.referralSource || 'Unattributed',
      entrySource: source.entry || source.source || 'Unattributed',
      source: source.source || 'Unattributed',
      protectionScore: Number.isFinite(Number(record?.assessment?.score)) ? String(Number(record.assessment.score)) : '',
      createdAt: iso(record?.createdAt),
      deliveredAt: iso(record?.remote?.deliveredAt || record?.remote?.delivery?.deliveredAt),
      openedAt: iso(record?.remote?.openedAt || record?.remote?.delivery?.openedAt),
      acknowledgedAt: iso(record?.remote?.acknowledgedAt || record?.remote?.delivery?.acknowledgedAt),
      closedAt: iso(current.closedAt)
    });
  }

  function csvCell(value) {
    let source = String(value ?? '').replace(/\u0000/g, '');
    if (/^[\s]*[=+\-@]/.test(source)) source = `'${source}`;
    return `"${source.replace(/"/g, '""')}"`;
  }

  function csvFilename(range, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const generatedAt = dateValue(settings.now || new Date());
    const generatedKey = localDateKey(Number.isFinite(generatedAt) ? generatedAt : Date.now());
    const scope = range?.key === 'all' || !Number.isFinite(range?.start) || !Number.isFinite(range?.end)
      ? 'all-time'
      : `${localDateKey(range.start)}_to_${localDateKey(range.end)}`;
    return `coveragefit-consultation-pipeline_${scope}_exported-${generatedKey}.csv`;
  }

  function buildCsv(records, options) {
    const selection = filterRecords(records, options);
    if (!selection.range.valid) {
      return Object.freeze({ valid: false, error: selection.range.error, rowCount: 0, filename: '', csv: '', range: selection.range, rows: Object.freeze([]) });
    }
    const rows = selection.records.slice()
      .sort((left, right) => dateValue(recordTimestamp(right)) - dateValue(recordTimestamp(left)))
      .map(csvRecord);
    const header = CSV_COLUMNS.map(column => csvCell(column.label)).join(',');
    const body = rows.map(row => CSV_COLUMNS.map(column => csvCell(row[column.key])).join(','));
    const csv = `\uFEFF${[header, ...body].join('\r\n')}`;
    return Object.freeze({
      valid: true,
      error: '',
      rowCount: rows.length,
      filename: csvFilename(selection.range, options),
      csv,
      range: selection.range,
      rows: Object.freeze(rows)
    });
  }

  function summarize(records, options) {
    const selection = filterRecords(records, options);
    const safeRecords = selection.records;
    const stageCounts = Object.fromEntries(STAGES.map(item => [item.key, 0]));
    const outcomeCounts = Object.fromEntries(OUTCOMES.map(item => [item.key, 0]));

    safeRecords.forEach(record => {
      const current = disposition(record);
      stageCounts[current.stage] += 1;
      if (current.stage === 'closed' && current.outcome !== 'none') outcomeCounts[current.outcome] += 1;
    });

    const total = safeRecords.length;
    const closed = stageCounts.closed;
    const open = Math.max(0, total - closed);
    const stages = STAGES.map(item => Object.freeze({
      key: item.key,
      label: item.label,
      count: stageCounts[item.key],
      percentage: percentage(stageCounts[item.key], total)
    }));
    const outcomes = OUTCOMES.map(item => Object.freeze({
      key: item.key,
      label: item.label,
      count: outcomeCounts[item.key],
      percentage: percentage(outcomeCounts[item.key], closed)
    }));
    const campaigns = segment(safeRecords, value => value.campaign);
    const referrals = segment(safeRecords, value => value.referralSource);
    const entries = segment(safeRecords, value => value.entry || value.source);

    return Object.freeze({
      version: VERSION,
      total,
      availableTotal: selection.availableTotal,
      open,
      closed,
      bound: outcomeCounts.policy_bound,
      closeRate: percentage(closed, total),
      boundRate: percentage(outcomeCounts.policy_bound, closed),
      conversionRate: percentage(outcomeCounts.policy_bound, total),
      range: selection.range,
      stages: Object.freeze(stages),
      outcomes: Object.freeze(outcomes),
      sources: Object.freeze({ campaigns, referrals, entries }),
      trend: buildTrend(records, options)
    });
  }

  return Object.freeze({
    VERSION,
    MAX_CUSTOM_RANGE_DAYS,
    STAGES,
    OUTCOMES,
    DATE_RANGES,
    TREND_GRANULARITIES,
    CSV_COLUMNS,
    disposition,
    resolveDateRange,
    recordTimestamp,
    filterRecords,
    integration,
    buildTrend,
    buildCsv,
    summarize
  });
});
