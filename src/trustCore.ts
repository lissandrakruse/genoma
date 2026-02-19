export type DomainGovernanceStats = {
  samples: number;
  rollbackRatePct: number;
  validateSuccessRatePct: number;
};

export function computeDomainTrustScore(stats: DomainGovernanceStats): number {
  const samples = Math.max(0, Number(stats.samples || 0));
  const rollback = Math.max(0, Math.min(100, Number(stats.rollbackRatePct || 0)));
  const validate = Math.max(0, Math.min(100, Number(stats.validateSuccessRatePct || 0)));
  const sampleBonus = Math.min(20, samples * 2);
  const score = 50 + (validate * 0.3) + ((100 - rollback) * 0.4) + sampleBonus - 40;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeTrustByDomain(
  metrics: Record<string, DomainGovernanceStats>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [domain, stats] of Object.entries(metrics || {})) {
    out[domain] = computeDomainTrustScore(stats);
  }
  return out;
}

export function minTrustForDomains(
  domains: string[],
  trustByDomain: Record<string, number>
): number {
  const vals = domains
    .map((d) => Number(trustByDomain[d]))
    .filter((n) => Number.isFinite(n));
  if (!vals.length) {
    return 50;
  }
  return Math.min(...vals);
}
