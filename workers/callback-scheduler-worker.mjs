export default {
  async scheduled(_event, env, context) {
    const endpoint = String(env.CALLBACK_SCHEDULER_URL || '').trim();
    const secret = String(env.CALLBACK_CRON_SECRET || '').trim();
    if (!endpoint || !secret) throw new Error('Callback scheduler configuration is incomplete.');
    const task = fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(async response => {
      if (!response.ok) throw new Error(`Callback scheduler returned HTTP ${response.status}.`);
      return response.json();
    });
    context.waitUntil(task);
  }
};
