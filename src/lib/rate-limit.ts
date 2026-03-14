/** Simple in-memory sliding-window rate limiter for serverless routes.
 *  Keyed by an arbitrary string (e.g. token, IP). */

const windows = new Map<string, number[]>();

/** Returns true if the request should be allowed, false if rate-limited. */
export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = windows.get(key) || [];

  // Evict expired entries
  const valid = timestamps.filter((t) => now - t < windowMs);

  if (valid.length >= maxRequests) {
    windows.set(key, valid);
    return false;
  }

  valid.push(now);
  windows.set(key, valid);
  return true;
}
