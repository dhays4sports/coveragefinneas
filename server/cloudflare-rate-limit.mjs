function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

function clientAddress(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function withD1RateLimit(context, settings, handler) {
  const db = context?.env?.COVERAGEFIT_DB;
  const limit = Math.max(1, Number(settings?.limit) || 60);
  const windowSeconds = Math.max(1, Number(settings?.windowSeconds) || 60);
  const route = String(settings?.route || new URL(context.request.url).pathname);
  if (!db?.prepare) return settings?.failClosed ? json({ok:false,error:{code:'rate_limit_unavailable',message:'The connection is temporarily unavailable.'}},503) : handler();

  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const resetAt = windowStart + windowSeconds;
  const bucketKey = `${route}:${clientAddress(context.request)}:${windowStart}`;

  try {
    await db.prepare(
      `INSERT INTO api_rate_limits (bucket_key, request_count, reset_at)
       VALUES (?1, 1, ?2)
       ON CONFLICT(bucket_key) DO UPDATE SET request_count = request_count + 1`
    ).bind(bucketKey, resetAt).run();
    const row = await db.prepare('SELECT request_count FROM api_rate_limits WHERE bucket_key = ?1').bind(bucketKey).first();
    const count = Number(row?.request_count) || 0;
    if (count > limit) {
      return json({ ok: false, error: { code: 'rate_limited', message: 'Too many requests. Please try again shortly.' } }, 429, {
        'Retry-After': String(Math.max(1, resetAt - nowSeconds))
      });
    }
    if (Math.random() < 0.02) {
      context.waitUntil?.(db.prepare('DELETE FROM api_rate_limits WHERE reset_at < ?1').bind(nowSeconds - 3600).run());
    }
  } catch (error) {
    if(settings?.failClosed)return json({ok:false,error:{code:'rate_limit_unavailable',message:'The connection is temporarily unavailable.'}},503);
    console.warn('CoverageFit D1 rate limit check failed open', error);
  }

  return handler();
}
