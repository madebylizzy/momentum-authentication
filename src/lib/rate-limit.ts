// In-memory rate limiter store
// AGENTS.md §9a:
// - Sign-up: 10 requests per hour (3600s), keyed on IP
// - Sign-in: 5 attempts per 15 minutes (900s), keyed on email + IP
// - Password reset request: 5 requests per hour (3600s), keyed on email
// - Verification resend: 60s cooldown + 5 per hour cap

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000); // Clean every 60s
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    // New or expired window
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });

    return {
      allowed: true,
      remaining: options.limit - 1,
      retryAfterSeconds: 0,
      limit: options.limit,
    };
  }

  // Existing window
  if (entry.count < options.limit) {
    entry.count += 1;
    return {
      allowed: true,
      remaining: options.limit - entry.count,
      retryAfterSeconds: 0,
      limit: options.limit,
    };
  }

  // Exceeded
  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds,
    limit: options.limit,
  };
}

/**
 * Extracts client IP from request headers
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}
