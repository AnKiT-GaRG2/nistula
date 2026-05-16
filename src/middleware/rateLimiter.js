import CircuitBreaker from 'opossum';

/**
 * Per-IP circuit-breaker-backed limiter.
 *
 * Behavior:
 * - allow up to `maxRequestsPerSecond` requests in a 1-second rolling window
 * - on the first excess request, trip the breaker
 * - keep the IP blocked for `cooldownSeconds`
 * - after cooldown, let the breaker half-open and recover on the next success
 *
 * This is intentionally in-memory; use a shared store if you run multiple
 * Node processes or pods behind a load balancer.
 */
const states = new Map();

function getIp(req) {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

function sendRateLimitResponse(req, res, retryAfterSeconds) {
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfterSeconds,
    requestId: req.requestId,
  });
}

function getState(ip, { maxRequestsPerSecond, cooldownMs }) {
  let state = states.get(ip);
  if (state) {
    state.lastSeenAt = Date.now();
    return state;
  }

  const timestamps = [];

  const allowRequest = async () => {
    const now = Date.now();
    const windowStart = now - 1000;

    while (timestamps.length && timestamps[0] <= windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= maxRequestsPerSecond) {
      const err = new Error('Per-second rate limit exceeded');
      err.code = 'RATE_LIMIT_EXCEEDED';
      err.retryAfterSeconds = Math.ceil(cooldownMs / 1000);
      throw err;
    }

    timestamps.push(now);
    return true;
  };

  const breaker = new CircuitBreaker(allowRequest, {
    errorThresholdPercentage: 1,
    resetTimeout: cooldownMs,
    rollingCountTimeout: 1000,
    rollingCountBuckets: 10,
    volumeThreshold: 1,
    capacity: 1,
  });

  state = {
    breaker,
    lastSeenAt: Date.now(),
  };

  states.set(ip, state);
  return state;
}

function cleanupStates(now) {
  const staleBefore = now - 15 * 60 * 1000;
  for (const [ip, state] of states.entries()) {
    if (!state.breaker.opened && state.lastSeenAt < staleBefore) {
      states.delete(ip);
    }
  }
}

export function createRateLimiter({ maxRequestsPerSecond = 5, cooldownSeconds = 10 } = {}) {
  const cooldownMs = cooldownSeconds * 1000;

  return function rateLimiter(req, res, next) {
    const ip = getIp(req);
    const state = getState(ip, { maxRequestsPerSecond, cooldownMs });

    state.breaker
      .fire()
      .then(() => {
        if (Math.random() < 0.005) {
          cleanupStates(Date.now());
        }
        next();
      })
      .catch((err) => {
        if (err?.code === 'RATE_LIMIT_EXCEEDED' || err?.code === 'EOPENBREAKER') {
          return sendRateLimitResponse(req, res, Math.ceil(cooldownMs / 1000));
        }

        return next(err);
      });
  };
}
