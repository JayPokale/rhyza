function expiryScore(expiresAt: string): number {
  const deadline = Date.parse(expiresAt);
  return Number.isFinite(deadline) ? deadline : Date.now() + 30_000;
}

function ttlMs(expiresAt: string): number {
  return Math.max(expiryScore(expiresAt) - Date.now(), 1);
}

export { expiryScore, ttlMs };
