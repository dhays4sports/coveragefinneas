import {
  handleConsultationActivity,
  handleConsultationChecklist,
  handleConsultationCompletion,
  handleConsultationDisposition,
  handleConsultationFollowUp,
  handleConsultationInbox,
  handleConsultationRecommendations,
  handleConsultationStatus,
  handleConsultationSubmission
} from './consultation-inbox-core.mjs';
import { handleProspectReportCreate, handleProspectReportRead } from './prospect-report-core.mjs';
import { handleReferralLinkCreate, handleReferralLinkRead } from './referral-link-core.mjs';
import { handleReferralEvent } from './referral-event-core.mjs';
import { handleSmsSimulator } from './sms-conversation-core.mjs';
import { handleSmsHandoffRead } from './sms-handoff-core.mjs';
import { handlePvxSmsJourney } from './pvx-sms-journey-core.mjs';
import { handleRingCentralMaintenance, handleRingCentralRecovery, handleRingCentralStatus, handleRingCentralSubscription, handleRingCentralWebhook } from './ringcentral-sms-connection-core.mjs';
import { handleSmsProducerHandoff } from './sms-producer-handoff-core.mjs';
import { handleSmsOperations } from './sms-operations-core.mjs';
import { handleSmsOutboundRegister, handleSmsSend } from './sms-outbound-gateway.mjs';
import { handleSmsConsent } from './sms-consent-api-core.mjs';
import { handleCallbackCalendarRead, handleSmsCallbackAdmin, handleSmsCallbackCron } from './sms-callback-scheduling-core.mjs';
import { createConsultationStore, createProspectReportStore, createReferralLinkStore, createReferralEventStore, createSmsConversationStore, createSmsHandoffStore, createPVXRecordStore } from './d1-json-store.mjs';
import { withD1RateLimit } from './cloudflare-rate-limit.mjs';

export async function resolveProducerEnvironment(sourceEnv = {}) {
  const binding = sourceEnv?.COVERAGEFIT_PRODUCER_ACCESS_TOKEN;
  if (typeof binding === 'string') return sourceEnv;
  if (!binding || typeof binding.get !== 'function') return sourceEnv;

  let token = '';
  try {
    token = await binding.get();
  } catch (_) {
    return sourceEnv;
  }
  if (typeof token !== 'string') return sourceEnv;

  return new Proxy(sourceEnv, {
    get(target, property, receiver) {
      if (property === 'COVERAGEFIT_PRODUCER_ACCESS_TOKEN') return token;
      return Reflect.get(target, property, receiver);
    }
  });
}

function withProducerEnvironment(context, callback) {
  return resolveProducerEnvironment(context.env || {}).then(callback);
}

function consultationOptions(context, resolvedEnv = context.env || {}) {
  return {
    store: resolvedEnv.COVERAGEFIT_DB ? createConsultationStore(resolvedEnv.COVERAGEFIT_DB) : null,
    env: resolvedEnv,
    waitUntil: typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null
  };
}

function reportOptions(context) {
  return {
    store: context.env?.COVERAGEFIT_DB ? createProspectReportStore(context.env.COVERAGEFIT_DB) : null,
    operationsStore: context.env?.COVERAGEFIT_DB ? createSmsConversationStore(context.env.COVERAGEFIT_DB) : null,
    env: context.env || {}
  };
}


function smsOptions(context, resolvedEnv = context.env || {}) {
  return {
    store: resolvedEnv.COVERAGEFIT_DB ? createSmsConversationStore(resolvedEnv.COVERAGEFIT_DB) : null,
    handoffStore: resolvedEnv.COVERAGEFIT_DB ? createSmsHandoffStore(resolvedEnv.COVERAGEFIT_DB) : null,
    leadStore: resolvedEnv.COVERAGEFIT_DB ? createPVXRecordStore(resolvedEnv.COVERAGEFIT_DB) : null,
    db: resolvedEnv.COVERAGEFIT_DB || null,
    env: resolvedEnv,
    waitUntil: typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null
  };
}

function referralOptions(context) {
  const db = context.env?.COVERAGEFIT_DB;
  return {
    referralStore: db ? createReferralLinkStore(db) : null,
    eventStore: db ? createReferralEventStore(db) : null,
    reportStore: db ? createProspectReportStore(db) : null,
    env: context.env || {}
  };
}

export function consultationSubmit(context) {
  return withD1RateLimit(context, { route: 'consultation-submit', limit: 12, windowSeconds: 60 }, () =>
    handleConsultationSubmission(context.request, consultationOptions(context))
  );
}

export function consultationInbox(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'consultation-inbox', limit: 60, windowSeconds: 60 }, () =>
      handleConsultationInbox(context.request, consultationOptions(context, env))
    )
  );
}

export function consultationStatus(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'consultation-status', limit: 120, windowSeconds: 60 }, () =>
      handleConsultationStatus(context.request, consultationOptions(context, env))
    )
  );
}

export function consultationFollowUp(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'consultation-follow-up', limit: 120, windowSeconds: 60 }, () =>
      handleConsultationFollowUp(context.request, consultationOptions(context, env))
    )
  );
}

export function consultationActivity(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'consultation-activity', limit: 180, windowSeconds: 60 }, () =>
      handleConsultationActivity(context.request, consultationOptions(context, env))
    )
  );
}

export function consultationDisposition(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'consultation-disposition', limit: 120, windowSeconds: 60 }, () =>
      handleConsultationDisposition(context.request, consultationOptions(context, env))
    )
  );
}

export function consultationRecommendations(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'consultation-recommendations', limit: 120, windowSeconds: 60 }, () =>
      handleConsultationRecommendations(context.request, consultationOptions(context, env))
    )
  );
}

export function consultationCompletion(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'consultation-completion', limit: 120, windowSeconds: 60 }, () =>
      handleConsultationCompletion(context.request, consultationOptions(context, env))
    )
  );
}

export function consultationChecklist(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'consultation-checklist', limit: 180, windowSeconds: 60 }, () =>
      handleConsultationChecklist(context.request, consultationOptions(context, env))
    )
  );
}

export function prospectReportCreate(context) {
  return withD1RateLimit(context, { route: 'prospect-report-create', limit: 12, windowSeconds: 60 }, () =>
    handleProspectReportCreate(context.request, reportOptions(context))
  );
}

export function prospectReportRead(context) {
  return withD1RateLimit(context, { route: 'prospect-report-read', limit: 120, windowSeconds: 60 }, () =>
    handleProspectReportRead(context.request, reportOptions(context))
  );
}


export function referralLinkCreate(context) {
  return withD1RateLimit(context, { route: 'referral-link-create', limit: 30, windowSeconds: 60 }, () =>
    handleReferralLinkCreate(context.request, referralOptions(context))
  );
}

export function referralLinkRead(context) {
  return withD1RateLimit(context, { route: 'referral-link-read', limit: 120, windowSeconds: 60 }, () =>
    handleReferralLinkRead(context.request, referralOptions(context))
  );
}


export function referralEvent(context) {
  return withD1RateLimit(context, { route: 'referral-event', limit: 240, windowSeconds: 60 }, () =>
    handleReferralEvent(context.request, referralOptions(context))
  );
}


export function smsSimulator(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'sms-simulator', limit: 180, windowSeconds: 60 }, () =>
      handleSmsSimulator(context.request, smsOptions(context, env))
    )
  );
}


export function smsHandoffRead(context) {
  return withD1RateLimit(context, { route: 'sms-handoff-read', limit: 120, windowSeconds: 60 }, () =>
    handleSmsHandoffRead(context.request, {
      store: context.env?.COVERAGEFIT_DB ? createSmsHandoffStore(context.env.COVERAGEFIT_DB) : null,
      operationsStore: context.env?.COVERAGEFIT_DB ? createSmsConversationStore(context.env.COVERAGEFIT_DB) : null,
      journeyStore: context.env?.COVERAGEFIT_DB ? createPVXRecordStore(context.env.COVERAGEFIT_DB) : null,
      env: context.env || {}
    })
  );
}

export function pvxSmsJourney(context) {
  return withD1RateLimit(context, { route: 'pvx-sms-journey', limit: 180, windowSeconds: 60 }, () =>
    handlePvxSmsJourney(context.request, {
      store: context.env?.COVERAGEFIT_DB ? createPVXRecordStore(context.env.COVERAGEFIT_DB) : null,
      operationsStore: context.env?.COVERAGEFIT_DB ? createSmsConversationStore(context.env.COVERAGEFIT_DB) : null,
      env: context.env || {}
    })
  );
}


export function smsProducerHandoff(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'sms-producer-handoff', limit: 120, windowSeconds: 60 }, () =>
      handleSmsProducerHandoff(context.request, smsOptions(context, env))
    )
  );
}


export function smsOperations(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'sms-operations', limit: 120, windowSeconds: 60 }, () =>
      handleSmsOperations(context.request, smsOptions(context, env))
    )
  );
}


export function smsSend(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'sms-send', limit: 60, windowSeconds: 60 }, () =>
      handleSmsSend(context.request, smsOptions(context, env))
    )
  );
}

export function smsOutboundRegister(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'sms-outbound-register', limit: 120, windowSeconds: 60 }, () =>
      handleSmsOutboundRegister(context.request, smsOptions(context, env))
    )
  );
}

export function smsConsent(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'sms-consent', limit: 120, windowSeconds: 60 }, () =>
      handleSmsConsent(context.request, smsOptions(context, env))
    )
  );
}

export function smsCallbackAdmin(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'sms-callback-admin', limit: 30, windowSeconds: 60 }, () =>
      handleSmsCallbackAdmin(context.request, smsOptions(context, env))
    )
  );
}

export function smsCallbackCron(context) {
  return handleSmsCallbackCron(context.request, smsOptions(context));
}

export function smsCallbackCalendar(context) {
  return withD1RateLimit(context, { route: 'sms-callback-calendar', limit: 60, windowSeconds: 60 }, () =>
    handleCallbackCalendarRead(context.request, smsOptions(context))
  );
}

export function ringCentralSmsWebhook(context) {
  return handleRingCentralWebhook(context.request, smsOptions(context));
}

export function ringCentralSmsStatus(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'ringcentral-sms-status', limit: 30, windowSeconds: 60 }, () =>
      handleRingCentralStatus(context.request, smsOptions(context, env))
    )
  );
}

export function ringCentralSmsSubscription(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'ringcentral-sms-subscription', limit: 10, windowSeconds: 60 }, () =>
      handleRingCentralSubscription(context.request, smsOptions(context, env))
    )
  );
}

export function ringCentralSmsRecovery(context) {
  return withProducerEnvironment(context, env =>
    withD1RateLimit(context, { route: 'ringcentral-sms-recovery', limit: 4, windowSeconds: 60 }, () =>
      handleRingCentralRecovery(context.request, smsOptions(context, env))
    )
  );
}

export function ringCentralSmsMaintenance(context) {
  return withD1RateLimit(context, { route: 'ringcentral-sms-maintenance', limit: 6, windowSeconds: 60 }, () =>
    handleRingCentralMaintenance(context.request, smsOptions(context))
  );
}
