const clean = value => typeof value === 'string' ? value.trim().slice(0, 600) : '';
export function preparationQuestions(conversation = {}) {
  const a = conversation.answers || {};
  const saved = conversation.callbackPreparation?.answers || {};
  const buyer = conversation.intent === 'buyer' || conversation.callbackScheduling?.productType === 'buyer';
  return [
    {key: 'reason', known: a.reviewReason || a.lifeGoal || a.businessNeed, prompt: 'What prompted you to look at your insurance?'},
    {key: 'timing', known: a.closingDateDisplay || a.closingDateRaw || a.closingDate || a.desiredEffectiveDate, prompt: buyer ? 'What is your expected closing date?' : 'When do you need the new coverage to start?'},
    {key: 'improvement', known: a.coverageImprovement, prompt: 'Besides price, is there anything you would like to improve?'}
  ].filter(q => !clean(q.known) && !clean(saved[q.key]) && !conversation.callbackPreparation?.skipped?.includes(q.key));
}
export function preparationInvitation(conversation) {
  if (!preparationQuestions(conversation).length || conversation.callbackPreparation?.invitedAt) return '';
  return `Want to help me prepare before our call? I can ask up to three quick questions here by text. Otherwise, you’re all set for ${conversation.callbackScheduling.proposedDisplay}. Reply READY to start.`;
}
export function handlePreparation(conversation, body, at) {
  if (conversation.callbackScheduling?.status !== 'scheduled') return null;
  const raw = clean(body);
  const command = raw.toLowerCase().replace(/[.!?]+$/, '');
  const prep = {...conversation.callbackPreparation, answers: {...conversation.callbackPreparation?.answers}, skipped: [...(conversation.callbackPreparation?.skipped || [])]};
  if (command !== 'ready' && prep.status !== 'active') return null;
  if (['stop', 'start', 'help', 'agent', 'human', 'dylan'].includes(command)) return null;
  if (['later', 'done', 'no thanks', 'skip all'].includes(command)) {
    prep.status = 'paused'; prep.updatedAt = at;
    return {handled: true, conversation: {...conversation, callbackPreparation: prep}, reply: 'No problem—your appointment is still booked. We can cover the rest on the call.'};
  }
  if (command !== 'ready' && prep.currentKey) {
    if (command === 'skip') prep.skipped.push(prep.currentKey);
    else if (raw) prep.answers[prep.currentKey] = raw;
  }
  prep.startedAt ||= at; prep.updatedAt = at;
  const updated = {...conversation, callbackPreparation: prep};
  const next = preparationQuestions(updated)[0];
  prep.currentKey = next?.key || ''; prep.status = next ? 'active' : 'completed';
  return {handled: true, conversation: updated, reply: next ? `${next.prompt}${command === 'ready' ? ' Reply SKIP for any question or LATER to leave the rest for our call.' : ''}` : 'Thanks—that gives Dylan a helpful starting point. Your appointment is still booked, and we’ll cover the details on the call.'};
}
