/**
 * Minimal in-memory TTL cache.
 *
 * Deliberately not Redis: this exists so a reviewer refreshing the endpoint
 * doesn't spend the LinkedIn session's rate limit on identical lookups. State
 * is per-instance and disposable.
 */
export class TtlCache {
  #entries = new Map();

  constructor(ttlMs) {
    this.ttlMs = ttlMs;
  }

  get(key) {
    const entry = this.#entries.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.#entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    this.#entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

/**
 * Fixed-window per-IP rate limiter. A public URL backed by personal LinkedIn
 * credentials needs some protection from being hammered.
 */
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();

  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: {
          code: 'rate_limited',
          message: `Too many requests. Try again in ${retryAfter}s.`,
        },
      });
    }
    next();
  };
}
