export const PVX_CONVERSATIONAL_RETURN_BUILD = '408-CF-PVX-HOOK-1.3';
export const PVX_CONVERSATIONAL_RETURN_CONTRACT = 'coveragefit-conversational-return-hook-v1';
export const AI_CALLER_AUTOMATED_INTENTS = Object.freeze(['buyer', 'home_review', 'bundle']);
export const AI_CALLER_PRODUCER_SAFE_INTENTS = Object.freeze(['', 'ambiguous', 'other', 'dylan', 'agent', 'human', 'person']);

const OPTIONS = Object.freeze({
  shoppingReason: new Set(['renewal_increase','buying_home','service_change','life_change','comparison','something_else']),
  improvementPriorities: new Set(['understanding','claim_support','agent_access','coordination','price_only','not_sure']),
  ownershipDuration: new Set(['buying_now','under_1','1_4','5_9','10_plus','not_sure']),
  stayIntent: new Set(['long_term','few_years','may_move','not_sure']),
  upgradeSummary: new Set(['yes_major','some','none','not_sure']),
  otherProperties: new Set(['rental','second_home','multiple','none','not_sure']),
  claimExperience: new Set(['yes_smooth','yes_difficult','yes_neutral','none','prefer_not','not_sure']),
  permissionToAdvise: new Set(['yes','simple','cost_first','not_sure'])
});
const text=(value,max=800)=>String(value??'').trim().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,max);

function sourceObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { const parsed=JSON.parse(String(value||'')); return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}; } catch (_) { return {}; }
}

export function conversationalInvitation(channel='sms') {
  return {
    channel: channel === 'ai_caller' ? 'ai_caller' : 'sms',
    title: 'Your personal CoverageFit Snapshot is ready to continue.',
    body: 'We’ll reuse what you already shared and begin with the first unanswered question.',
    action: 'See my Snapshot',
    promises: Object.freeze({policyFinding:false,eligibility:false,price:false,responseTime:false})
  };
}

export function normalizeAiCallerSeed(source={}) {
  const intent=text(source.conversationIntent||source.conversation_intent||source.intent,40).toLowerCase();
  const producerSafe=AI_CALLER_PRODUCER_SAFE_INTENTS.includes(intent) || !AI_CALLER_AUTOMATED_INTENTS.includes(intent);
  const raw=sourceObject(source.conversationAnswers||source.conversation_answers);
  const answers={},exactCustomerWords={};
  for (const [field,allowed] of Object.entries(OPTIONS)) {
    const candidate=raw[field];
    if (field === 'improvementPriorities') {
      const values=(Array.isArray(candidate)?candidate:String(candidate||'').split(','))
        .map(value=>text(value,60)).filter(value=>allowed.has(value));
      if (values.length) answers[field]=[...new Set(values)].slice(0,6);
    } else if (allowed.has(text(candidate,60))) answers[field]=text(candidate,60);
    const words=text(sourceObject(source.conversationWords||source.conversation_words)[field],240);
    if (answers[field]!=null && words) exactCustomerWords[field]=words;
  }
  if (intent==='buyer') {
    if (!answers.shoppingReason) answers.shoppingReason='buying_home';
    if (!answers.ownershipDuration) answers.ownershipDuration='buying_now';
  } else if (intent==='bundle' && !answers.shoppingReason) {
    answers.shoppingReason='something_else';
  }
  return {
    intent,
    canEnterPvx:!producerSafe,
    producerSafeFallback:producerSafe,
    fallbackReason:producerSafe?'human_or_ambiguous_conversation':'',
    answers:producerSafe?{}:answers,
    exactCustomerWords:producerSafe?{}:exactCustomerWords,
    conversationId:text(source.conversationId||source.conversation_id,120),
    originalWords:text(source.originalWords||source.original_words||source.customerWords||source.customer_words,800),
    consent:{channel:text(source.channel||'voice',20),sms:false,call:false,email:false,contact:false},
    semantics:{conversationIsDiscoveryAnswer:false,reportedIsVerified:false,channelPermissionEscalated:false}
  };
}

export function validateConversationalSeed(seed={}) {
  const errors=[];
  if (seed.canEnterPvx && !AI_CALLER_AUTOMATED_INTENTS.includes(seed.intent)) errors.push('intent');
  if (seed.producerSafeFallback && Object.keys(seed.answers||{}).length) errors.push('producer_safe_answers');
  if (seed.consent?.sms || seed.consent?.call || seed.consent?.email || seed.consent?.contact) errors.push('consent_escalation');
  for (const [field,value] of Object.entries(seed.answers||{})) {
    if (!OPTIONS[field]) errors.push(`field:${field}`);
    else if (field==='improvementPriorities' ? !Array.isArray(value)||value.some(item=>!OPTIONS[field].has(item)) : !OPTIONS[field].has(value)) errors.push(`value:${field}`);
  }
  return {valid:errors.length===0,errors};
}

export { OPTIONS as AI_CALLER_DISCOVERY_OPTIONS };
