export type PolicyRule = {
  pattern: string;
  action: "block" | "warn";
  reason?: string;
  risk?: number;
};

export type DomainPolicy = {
  pathPatterns: string[];
  overrideAllowed?: boolean;
  requiredTestPatterns?: string[];
  maxPatchLines?: number;
  riskMultiplier?: number;
};

export type PolicyConfig = {
  forbiddenPatterns: string[];
  requiredTestPatterns: string[];
  riskThreshold: number;
  largePatchFiles: number;
  largePatchRisk: number;
  rules: PolicyRule[];
  domains: Record<string, DomainPolicy>;
};

export type ExtendedPolicyFile = Partial<PolicyConfig> & {
  extends?: string[] | string;
  imports?: string[] | string;
  profiles?: Record<string, Partial<PolicyConfig>>;
};

export type DomainHistoryMetrics = {
  rollbackRatePct: number;
  validateSuccessRatePct: number;
  samples: number;
};

export type PolicyEvaluationContext = {
  patchLinesByPath?: Record<string, number>;
  domainMetrics?: Record<string, DomainHistoryMetrics>;
};

export type PolicyVerdict = {
  blocked: boolean;
  riskScore: number;
  threshold: number;
  reasons: string[];
  matchedForbidden: string[];
  missingRequiredTests: string[];
  warnMatches: Array<{ pattern: string; reason: string; risk: number }>;
  blockedBy: string[];
  matchedDomains: string[];
  overrideAllowed: boolean;
};

const DEFAULT_CONFIG: PolicyConfig = {
  forbiddenPatterns: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".env", ".env.*", "*.pem", "*.key"],
  requiredTestPatterns: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
  riskThreshold: 70,
  largePatchFiles: 8,
  largePatchRisk: 20,
  rules: [
    { pattern: ".github/workflows/**", action: "warn", reason: "CI workflow touched", risk: 15 },
    { pattern: "package.json", action: "warn", reason: "Dependencies/runtime config changed", risk: 10 },
  ],
  domains: {
    auth: {
      pathPatterns: ["auth/**", "src/auth/**"],
      overrideAllowed: false,
      requiredTestPatterns: ["**/auth/**/*.test.ts", "**/auth/**/*.spec.ts"],
      riskMultiplier: 1.3,
    },
    infra: {
      pathPatterns: ["infra/**", ".github/workflows/**"],
      overrideAllowed: true,
      requiredTestPatterns: ["**/*.test.ts", "**/*.spec.ts"],
      riskMultiplier: 1.2,
    },
    migrations: {
      pathPatterns: ["migrations/**", "db/migrations/**"],
      overrideAllowed: false,
      maxPatchLines: 20,
      riskMultiplier: 1.4,
    },
    ui: {
      pathPatterns: ["ui/**", "src/ui/**", "web/**"],
      overrideAllowed: true,
      riskMultiplier: 0.9,
    },
  },
};

function normalizePath(p: string): string {
  return String(p || "").replace(/\\/g, "/").trim();
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(pattern: string): RegExp {
  const norm = normalizePath(pattern);
  const protectedGlobStar = "__GLOBSTAR__";
  const marked = norm.replace(/\*\*/g, protectedGlobStar);
  const escaped = escapeRegExp(marked);
  const withSingles = escaped.replace(/\*/g, "[^/]*");
  const withDoubles = withSingles.replace(new RegExp(protectedGlobStar, "g"), ".*");
  return new RegExp(`^${withDoubles}$`, "i");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function toSafeNumber(n: unknown, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export function defaultPolicyConfig(): PolicyConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as PolicyConfig;
}

export function defaultPolicyTemplateJson(): string {
  const template: ExtendedPolicyFile = {
    extends: [],
    imports: [],
    profiles: {
      strict: {
        riskThreshold: 60,
      },
      balanced: {
        riskThreshold: 70,
      },
      experimental: {
        riskThreshold: 85,
      },
    },
    ...defaultPolicyConfig(),
  };
  return JSON.stringify(template, null, 2) + "\n";
}

export function parsePolicyConfig(raw: string | undefined): PolicyConfig {
  const base = defaultPolicyConfig();
  if (!raw || !raw.trim()) {
    return base;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PolicyConfig>;
    if (Array.isArray(parsed.forbiddenPatterns)) {
      base.forbiddenPatterns = parsed.forbiddenPatterns.map((x) => String(x || "").trim()).filter(Boolean);
    }
    if (Array.isArray(parsed.requiredTestPatterns)) {
      base.requiredTestPatterns = parsed.requiredTestPatterns.map((x) => String(x || "").trim()).filter(Boolean);
    }
    if (Array.isArray(parsed.rules)) {
      base.rules = parsed.rules
        .map((r) => {
          const rule = r as Partial<PolicyRule>;
          const action = rule.action === "block" ? "block" : "warn";
          const pattern = String(rule.pattern || "").trim();
          if (!pattern) {
            return null;
          }
          return {
            pattern,
            action,
            reason: String(rule.reason || "").trim() || undefined,
            risk: Number.isFinite(Number(rule.risk)) ? Number(rule.risk) : undefined,
          } as PolicyRule;
        })
        .filter((r): r is PolicyRule => Boolean(r));
    }
    if (parsed.domains && typeof parsed.domains === "object") {
      const nextDomains: Record<string, DomainPolicy> = {};
      for (const [name, val] of Object.entries(parsed.domains as Record<string, unknown>)) {
        const d = val as Partial<DomainPolicy>;
        const patterns = Array.isArray(d.pathPatterns) ? d.pathPatterns.map((x) => String(x || "").trim()).filter(Boolean) : [];
        if (!patterns.length) {
          continue;
        }
        nextDomains[name] = {
          pathPatterns: patterns,
          overrideAllowed: d.overrideAllowed === undefined ? true : Boolean(d.overrideAllowed),
          requiredTestPatterns: Array.isArray(d.requiredTestPatterns)
            ? d.requiredTestPatterns.map((x) => String(x || "").trim()).filter(Boolean)
            : undefined,
          maxPatchLines: Number.isFinite(Number(d.maxPatchLines)) ? Math.max(1, Number(d.maxPatchLines)) : undefined,
          riskMultiplier: Number.isFinite(Number(d.riskMultiplier)) ? Math.max(0, Number(d.riskMultiplier)) : undefined,
        };
      }
      if (Object.keys(nextDomains).length) {
        base.domains = nextDomains;
      }
    }
    if (Number.isFinite(Number(parsed.riskThreshold))) {
      base.riskThreshold = Math.max(0, Number(parsed.riskThreshold));
    }
    if (Number.isFinite(Number(parsed.largePatchFiles))) {
      base.largePatchFiles = Math.max(1, Number(parsed.largePatchFiles));
    }
    if (Number.isFinite(Number(parsed.largePatchRisk))) {
      base.largePatchRisk = Math.max(0, Number(parsed.largePatchRisk));
    }
    return base;
  } catch {
    return base;
  }
}

export function parseExtendedPolicyFile(raw: string | undefined): ExtendedPolicyFile {
  if (!raw || !raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as ExtendedPolicyFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function mergeDomain(base: DomainPolicy, next: Partial<DomainPolicy>): DomainPolicy {
  return {
    pathPatterns:
      Array.isArray(next.pathPatterns) && next.pathPatterns.length
        ? next.pathPatterns.map((x) => String(x || "").trim()).filter(Boolean)
        : base.pathPatterns,
    overrideAllowed: next.overrideAllowed === undefined ? base.overrideAllowed : Boolean(next.overrideAllowed),
    requiredTestPatterns:
      Array.isArray(next.requiredTestPatterns) && next.requiredTestPatterns.length
        ? next.requiredTestPatterns.map((x) => String(x || "").trim()).filter(Boolean)
        : base.requiredTestPatterns,
    maxPatchLines:
      Number.isFinite(Number(next.maxPatchLines)) && Number(next.maxPatchLines) > 0
        ? Number(next.maxPatchLines)
        : base.maxPatchLines,
    riskMultiplier:
      Number.isFinite(Number(next.riskMultiplier)) && Number(next.riskMultiplier) >= 0
        ? Number(next.riskMultiplier)
        : base.riskMultiplier,
  };
}

export function mergePolicyConfigs(base: PolicyConfig, incoming: Partial<PolicyConfig>): PolicyConfig {
  const out: PolicyConfig = JSON.parse(JSON.stringify(base));
  if (Array.isArray(incoming.forbiddenPatterns) && incoming.forbiddenPatterns.length) {
    out.forbiddenPatterns = incoming.forbiddenPatterns.map((x) => String(x || "").trim()).filter(Boolean);
  }
  if (Array.isArray(incoming.requiredTestPatterns) && incoming.requiredTestPatterns.length) {
    out.requiredTestPatterns = incoming.requiredTestPatterns.map((x) => String(x || "").trim()).filter(Boolean);
  }
  if (Array.isArray(incoming.rules) && incoming.rules.length) {
    out.rules = incoming.rules.map((r) => ({
      pattern: String(r.pattern || "").trim(),
      action: r.action === "block" ? "block" : "warn",
      reason: r.reason ? String(r.reason) : undefined,
      risk: Number.isFinite(Number(r.risk)) ? Number(r.risk) : undefined,
    }));
  }
  if (incoming.domains && typeof incoming.domains === "object") {
    for (const [name, domain] of Object.entries(incoming.domains)) {
      if (!domain || typeof domain !== "object") {
        continue;
      }
      const baseDomain = out.domains[name] ?? { pathPatterns: [] };
      out.domains[name] = mergeDomain(baseDomain, domain);
    }
  }
  if (Number.isFinite(Number(incoming.riskThreshold))) {
    out.riskThreshold = Math.max(0, Number(incoming.riskThreshold));
  }
  if (Number.isFinite(Number(incoming.largePatchFiles))) {
    out.largePatchFiles = Math.max(1, Number(incoming.largePatchFiles));
  }
  if (Number.isFinite(Number(incoming.largePatchRisk))) {
    out.largePatchRisk = Math.max(0, Number(incoming.largePatchRisk));
  }
  return out;
}

function hasAnyMatch(paths: string[], patterns: string[]): boolean {
  if (!patterns.length) {
    return true;
  }
  const regexes = patterns.map(globToRegExp);
  return paths.some((p) => regexes.some((re) => re.test(p)));
}

export function matchDomains(paths: string[], cfg: PolicyConfig): string[] {
  const normalized = unique(paths.map(normalizePath).filter(Boolean));
  const out: string[] = [];
  for (const [name, domain] of Object.entries(cfg.domains || {})) {
    const regexes = (domain.pathPatterns || []).map(globToRegExp);
    if (!regexes.length) {
      continue;
    }
    if (normalized.some((p) => regexes.some((re) => re.test(p)))) {
      out.push(name);
    }
  }
  return out;
}

function sumPatchLinesForDomain(
  paths: string[],
  domain: DomainPolicy,
  patchLinesByPath: Record<string, number>
): number {
  const regexes = (domain.pathPatterns || []).map(globToRegExp);
  if (!regexes.length) {
    return 0;
  }
  let sum = 0;
  for (const p of paths) {
    if (regexes.some((re) => re.test(p))) {
      sum += Math.max(0, toSafeNumber(patchLinesByPath[p], 0));
    }
  }
  return sum;
}

export function evaluatePolicy(paths: string[], cfg: PolicyConfig, ctx?: PolicyEvaluationContext): PolicyVerdict {
  const normalized = unique(paths.map(normalizePath).filter(Boolean));
  const patchLinesByPath = ctx?.patchLinesByPath || {};
  const domainMetrics = ctx?.domainMetrics || {};
  const reasons: string[] = [];
  const matchedForbidden: string[] = [];
  const missingRequiredTests: string[] = [];
  const warnMatches: Array<{ pattern: string; reason: string; risk: number }> = [];
  const blockedBy: string[] = [];
  let riskScore = 0;
  let blocked = false;
  let overrideAllowed = true;

  const matchedDomains = matchDomains(normalized, cfg);

  for (const p of normalized) {
    for (const pat of cfg.forbiddenPatterns) {
      if (globToRegExp(pat).test(p)) {
        matchedForbidden.push(p);
        reasons.push(`Forbidden path matched: ${p}`);
        blockedBy.push(`forbidden_path:${p}`);
        blocked = true;
      }
    }
  }

  for (const rule of cfg.rules) {
    const regex = globToRegExp(rule.pattern);
    const hit = normalized.some((p) => regex.test(p));
    if (!hit) {
      continue;
    }
    if (rule.action === "block") {
      blocked = true;
      reasons.push(`Blocked by policy rule: ${rule.pattern}`);
      blockedBy.push(`rule:${rule.pattern}`);
      continue;
    }
    const extraRisk = Number.isFinite(Number(rule.risk)) ? Math.max(0, Number(rule.risk)) : 10;
    riskScore += extraRisk;
    warnMatches.push({
      pattern: rule.pattern,
      reason: rule.reason || "Policy warning rule matched",
      risk: extraRisk,
    });
    reasons.push(`Warning rule matched: ${rule.pattern} (+${extraRisk})`);
  }

  if (normalized.length >= cfg.largePatchFiles) {
    riskScore += cfg.largePatchRisk;
    reasons.push(`Large patch touched ${normalized.length} files (+${cfg.largePatchRisk})`);
  }

  if (!hasAnyMatch(normalized, cfg.requiredTestPatterns)) {
    missingRequiredTests.push(...cfg.requiredTestPatterns);
    riskScore += 30;
    reasons.push("No required test pattern matched (+30)");
  }

  for (const domainName of matchedDomains) {
    const domain = cfg.domains[domainName];
    if (!domain) {
      continue;
    }
    if (domain.overrideAllowed === false) {
      overrideAllowed = false;
      reasons.push(`Domain ${domainName} forbids override`);
    }
    if (domain.requiredTestPatterns?.length && !hasAnyMatch(normalized, domain.requiredTestPatterns)) {
      const reason = `Domain ${domainName} missing required tests (+25)`;
      reasons.push(reason);
      missingRequiredTests.push(...domain.requiredTestPatterns);
      riskScore += 25;
    }
    const patchLines = sumPatchLinesForDomain(normalized, domain, patchLinesByPath);
    if (domain.maxPatchLines && patchLines > domain.maxPatchLines) {
      blocked = true;
      blockedBy.push(`domain:${domainName}:maxPatchLines`);
      reasons.push(`Domain ${domainName} patch lines ${patchLines} > ${domain.maxPatchLines}`);
    }
    if (domain.riskMultiplier && domain.riskMultiplier > 0 && domain.riskMultiplier !== 1) {
      const boosted = Math.round(riskScore * domain.riskMultiplier);
      if (boosted > riskScore) {
        reasons.push(`Domain ${domainName} risk multiplier x${domain.riskMultiplier.toFixed(2)} (${riskScore} -> ${boosted})`);
        riskScore = boosted;
      }
    }
    const dm = domainMetrics[domainName];
    if (dm && dm.samples >= 3) {
      if (dm.samples >= 5 && dm.rollbackRatePct > 30 && dm.validateSuccessRatePct < 60) {
        blocked = true;
        blockedBy.push(`domain:${domainName}:auto_suspend`);
        reasons.push(
          `Domain ${domainName} auto-suspended (rollback ${Math.round(dm.rollbackRatePct)}%, validate ${Math.round(dm.validateSuccessRatePct)}%)`
        );
      }
      if (dm.rollbackRatePct >= 30) {
        const add = Math.round((dm.rollbackRatePct - 30) * 0.6);
        if (add > 0) {
          riskScore += add;
          reasons.push(`Domain ${domainName} rollback rate ${Math.round(dm.rollbackRatePct)}% (+${add})`);
        }
      }
      if (dm.validateSuccessRatePct <= 60) {
        const add = Math.round((60 - dm.validateSuccessRatePct) * 0.5);
        if (add > 0) {
          riskScore += add;
          reasons.push(`Domain ${domainName} validation success ${Math.round(dm.validateSuccessRatePct)}% (+${add})`);
        }
      }
    }
  }

  return {
    blocked,
    riskScore,
    threshold: cfg.riskThreshold,
    reasons,
    matchedForbidden: unique(matchedForbidden),
    missingRequiredTests: unique(missingRequiredTests),
    warnMatches,
    blockedBy: unique(blockedBy),
    matchedDomains,
    overrideAllowed,
  };
}
