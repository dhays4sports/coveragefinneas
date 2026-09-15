export default {
  async scheduled(_event, env, context) {
    const endpoint = String(env.RINGCENTRAL_MAINTENANCE_URL || '').trim();
    const secret = String(env.RINGCENTRAL_MAINTENANCE_SECRET || '').trim();
    if (!endpoint || !secret) throw new Error('RingCentral maintenance configuration is incomplete.');
    const task = fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(`RingCentral maintenance returned HTTP ${response.status}.`);
      console.log('RingCentral subscription maintenance completed.', JSON.stringify({ action: payload.action || 'checked' }));
      return payload;
    });
    context.waitUntil(task);
  }
};
