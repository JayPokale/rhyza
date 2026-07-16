function expiryScore(expiresAt: string): number {
  const deadline = Date.parse(expiresAt);
  return Number.isFinite(deadline) ? deadline : Date.now() + 30_000;
}

function ttlMs(expiresAt: string): number {
  return Math.max(expiryScore(expiresAt) - Date.now(), 1);
}

// Outbound keys must outlive the ZSET expiry trigger so the worker can still
// takeOutboundCorrelation after claimExpiredOutbound fires at expiresAt.
const OUTBOUND_CORRELATION_TTL_GRACE_MS = 60_000;

function outboundCorrelationTtlMs(expiresAt: string): number {
  return ttlMs(expiresAt) + OUTBOUND_CORRELATION_TTL_GRACE_MS;
}

export {
  expiryScore,
  ttlMs,
  outboundCorrelationTtlMs,
  OUTBOUND_CORRELATION_TTL_GRACE_MS
};
