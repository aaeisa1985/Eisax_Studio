/**
 * Minimal in-process sliding-window rate limiter.
 * Per-process only (documented limitation; a shared store is needed for multi-instance deploys).
 */
const buckets = new Map<string, number[]>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retryAfterMs = windowMs - (now - hits[0]!);
    return { ok: false, retryAfterMs };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    // crude cleanup to bound memory
    for (const [k, v] of buckets) {
      if (v.length === 0 || now - v[v.length - 1]! > windowMs) buckets.delete(k);
    }
  }
  return { ok: true, retryAfterMs: 0 };
}
