/**
 * Sliding-window, in-memory rate limiter keyed by IP.
 * For production at scale, replace the `windows` Map with a Redis ZSET
 * to share state across multiple Node processes / pods.
 */
const windows = new Map();

export function createRateLimiter({ windowMs = 60_000, max = 60 } = {}) {
  return function rateLimiter(req, res, next) {
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    let hits = windows.get(ip) ?? [];
    hits = hits.filter((t) => t > windowStart);

    if (hits.length >= max) {
      const retryAfter = Math.ceil(windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: retryAfter,
        requestId: req.requestId,
      });
    }

    hits.push(now);
    windows.set(ip, hits);

    // Probabilistic cleanup — avoids a tight O(n) sweep every request
    if (Math.random() < 0.005) {
      for (const [key, timestamps] of windows.entries()) {
        if (!timestamps.some((t) => t > windowStart)) {
          windows.delete(key);
        }
      }
    }

    next();
  };
}
