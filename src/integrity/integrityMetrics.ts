import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

export type IntegrityDomainMetric = {
  domain: string;
  chains: number;
  applyRate: number;
  rollbackRate: number;
  validationSuccessRate: number;
  blockRate: number;
};

export type IntegrityEvidenceMetric = {
  source: string;
  count: number;
  pct: number;
};

export type IntegritySnapshot = {
  generatedAt: string;
  window: { from: string; to: string };
  compliance: { domains: IntegrityDomainMetric[] };
  evidenceSources: IntegrityEvidenceMetric[];
  reproducibility: {
    overallScore: number;
    components: {
      sealIntegrity: number;
      evidenceDiversity: number;
      validationQuality: number;
      rollbackStability: number;
    };
  };
  sealHealth: {
    latestSealFile: string | null;
    algorithm: string | null;
    strictVerified: boolean | null;
    digest: string | null;
    sealedAt: string | null;
    sealAgeHours: number | null;
    stale: boolean | null;
    expectedLineCount: number | null;
    computedLineCount: number | null;
  };
  identity: {
    actorId: string | null;
    orcidId: string | null;
  };
  diagnostics: {
    hasApplyChain: boolean;
    hasInferenceCustody: boolean;
  };
  pgpHealth: {
    status: "ok" | "missing" | "ambiguous" | "gpg_unavailable" | "not_configured";
    keyId: string | null;
    fingerprint: string | null;
    canSign: boolean | null;
    secretKeyPresent: boolean | null;
    publicKeyPresent: boolean | null;
    createdAt: string | null;
    expiresAt: string | null;
    checkedAt: string | null;
    detail: string | null;
  };
  evidencePackageVerification: {
    file: string | null;
    packageFile: string | null;
    signatureValid: boolean | null;
    manifestFileCount: number | null;
    allFilesValid: boolean | null;
    signerFingerprint: string | null;
    verifiedAt: string | null;
  };
};

type ApplyChainEvent = {
  ts: Date | null;
  chainId: string;
  domains: string[];
  type: string;
  blocked: boolean;
  appliedFiles: number;
  rolledBackFiles: number;
  validateOk: boolean | null;
  actorId: string | null;
};

const KNOWN_EVIDENCE_SOURCES = ["pubmed", "ensembl", "crossref", "clinvar", "gnomad", "uniprot", "opentargets"] as const;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function pct(part: number, total: number): number {
  if (!total) {return 0;}
  return round1((part / total) * 100);
}

function parseDate(value: unknown): Date | null {
  if (!value) {return null;}
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function readJsonl(filePath: string): Record<string, unknown>[] {
  if (!fs.existsSync(filePath)) {return [];}
  const raw = fs.readFileSync(filePath, "utf8");
  const out: Record<string, unknown>[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {continue;}
    try {
      const row = JSON.parse(trimmed) as unknown;
      if (row && typeof row === "object" && !Array.isArray(row)) {
        out.push(row as Record<string, unknown>);
      }
    } catch {
      // Keep dashboard resilient to malformed telemetry lines.
    }
  }
  return out;
}

function normalizeApplyEvent(row: Record<string, unknown>, idx: number): ApplyChainEvent {
  const domains = Array.isArray(row.domains)
    ? row.domains.map((d) => String(d || "").trim()).filter(Boolean)
    : row.domain
      ? [String(row.domain).trim()]
      : [];
  return {
    ts: parseDate(row.ts),
    chainId: String(row.chainId || row.federationEventId || `line-${idx + 1}`),
    domains,
    type: String(row.type || "unknown"),
    blocked: Boolean(row.blocked),
    appliedFiles: toNum(row.appliedFiles),
    rolledBackFiles: toNum(row.rolledBackFiles),
    validateOk: String(row.type) === "validate_result" ? Boolean(row.ok) : null,
    actorId: row.actorId ? String(row.actorId) : null,
  };
}

function getWindowRange(windowDays: number): { from: Date; to: Date } {
  const to = new Date();
  const safeDays = Math.max(1, Math.min(3650, windowDays || 30));
  const from = new Date(to.getTime() - safeDays * 24 * 60 * 60 * 1000);
  return { from, to };
}

function withinWindow(date: Date | null, from: Date, to: Date): boolean {
  if (!date) {return false;}
  const t = date.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function deriveDomainMetrics(events: ApplyChainEvent[]): IntegrityDomainMetric[] {
  const chains = new Map<
    string,
    {
      domains: Set<string>;
      applied: boolean;
      rollback: boolean;
      validated: boolean;
      validatedOk: boolean;
      blocked: boolean;
    }
  >();

  for (const e of events) {
    if (!chains.has(e.chainId)) {
      chains.set(e.chainId, {
        domains: new Set<string>(),
        applied: false,
        rollback: false,
        validated: false,
        validatedOk: false,
        blocked: false,
      });
    }
    const c = chains.get(e.chainId);
    if (!c) {continue;}
    for (const d of e.domains) {c.domains.add(d);}
    if (e.type === "apply_result" && e.appliedFiles > 0) {c.applied = true;}
    if (e.type === "rollback_result" && e.rolledBackFiles > 0) {c.rollback = true;}
    if (e.type === "validate_result") {
      c.validated = true;
      c.validatedOk = c.validatedOk || Boolean(e.validateOk);
    }
    if (e.type === "policy_verdict" && e.blocked) {c.blocked = true;}
  }

  const buckets = new Map<string, { chains: number; applied: number; rollback: number; validated: number; validatedOk: number; blocked: number }>();
  for (const [, c] of chains) {
    const domains = c.domains.size > 0 ? [...c.domains] : ["unclassified"];
    for (const domain of domains) {
      if (!buckets.has(domain)) {
        buckets.set(domain, { chains: 0, applied: 0, rollback: 0, validated: 0, validatedOk: 0, blocked: 0 });
      }
      const b = buckets.get(domain);
      if (!b) {continue;}
      b.chains += 1;
      if (c.applied) {b.applied += 1;}
      if (c.rollback) {b.rollback += 1;}
      if (c.validated) {b.validated += 1;}
      if (c.validatedOk) {b.validatedOk += 1;}
      if (c.blocked) {b.blocked += 1;}
    }
  }

  return [...buckets.entries()]
    .map(([domain, b]) => ({
      domain,
      chains: b.chains,
      applyRate: pct(b.applied, b.chains),
      rollbackRate: pct(b.rollback, b.applied),
      validationSuccessRate: pct(b.validatedOk, b.validated),
      blockRate: pct(b.blocked, b.chains),
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

function scanEvidenceSources(rows: Record<string, unknown>[], from: Date, to: Date): IntegrityEvidenceMetric[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const ts = parseDate(row.ts) || parseDate(row.timestamp) || parseDate(row.generatedAt);
    if (ts && !withinWindow(ts, from, to)) {continue;}

    const rowText = JSON.stringify(row).toLowerCase();
    const detected = new Set<string>();

    for (const key of ["source", "provider", "origin", "database", "channel"]) {
      const v = row[key];
      if (typeof v === "string") {
        const norm = v.trim().toLowerCase();
        if (KNOWN_EVIDENCE_SOURCES.includes(norm as (typeof KNOWN_EVIDENCE_SOURCES)[number])) {
          detected.add(norm);
        }
      }
    }

    for (const src of KNOWN_EVIDENCE_SOURCES) {
      if (rowText.includes(src)) {
        detected.add(src);
      }
    }

    for (const src of detected) {
      counts.set(src, (counts.get(src) || 0) + 1);
    }
  }

  const total = [...counts.values()].reduce((acc, n) => acc + n, 0);
  return [...counts.entries()]
    .map(([source, count]) => ({
      source,
      count,
      pct: pct(count, total),
    }))
    .sort((a, b) => b.count - a.count);
}

function findLatestSealFile(rootPath: string): string | null {
  const reportsDir = path.join(rootPath, "reports");
  if (!fs.existsSync(reportsDir)) {return null;}
  const files = fs
    .readdirSync(reportsDir)
    .filter((name) => /^audit-seal-\d{8}-\d{6}\.json$/i.test(name))
    .sort();
  if (!files.length) {return null;}
  return path.join(reportsDir, files[files.length - 1]);
}

function findLatestEvidenceVerificationFile(rootPath: string): string | null {
  const reportsDir = path.join(rootPath, "reports");
  if (!fs.existsSync(reportsDir)) {return null;}
  const files = fs
    .readdirSync(reportsDir)
    .filter((name) => /^evidence-package-verify-\d{8}-\d{6}\.json$/i.test(name))
    .sort();
  if (!files.length) {return null;}
  return path.join(reportsDir, files[files.length - 1]);
}

function sha256Hex(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function loadSealHealth(rootPath: string, staleHours: number): IntegritySnapshot["sealHealth"] {
  const sealPath = findLatestSealFile(rootPath);
  if (!sealPath) {
    return {
      latestSealFile: null,
      algorithm: null,
      strictVerified: null,
      digest: null,
      sealedAt: null,
      sealAgeHours: null,
      stale: null,
      expectedLineCount: null,
      computedLineCount: null,
    };
  }

  try {
    const sealRaw = JSON.parse(fs.readFileSync(sealPath, "utf8")) as Record<string, unknown>;
    const inputRel = String(sealRaw.inputFile || ".ollama_copilot_apply_chain.jsonl");
    const inputPath = path.resolve(rootPath, inputRel);
    const expectedDigest = String(sealRaw.digestHex || "").toLowerCase();
    const expectedSize = Number(sealRaw.inputFileSizeBytes);
    const expectedLines = Number(sealRaw.inputLineCount);
    const algorithm = String(sealRaw.algorithm || "SHA-256");

    if (!fs.existsSync(inputPath)) {
      const sealedAt = String(sealRaw.generatedAt || "");
      const sealedAtDate = parseDate(sealedAt);
      const ageHours = sealedAtDate ? round1((Date.now() - sealedAtDate.getTime()) / (60 * 60 * 1000)) : null;
      return {
        latestSealFile: path.relative(rootPath, sealPath),
        algorithm,
        strictVerified: false,
        digest: expectedDigest || null,
        sealedAt,
        sealAgeHours: ageHours,
        stale: ageHours !== null ? ageHours > staleHours : null,
        expectedLineCount: Number.isFinite(expectedLines) ? expectedLines : null,
        computedLineCount: null,
      };
    }

    const buf = fs.readFileSync(inputPath);
    const computedDigest = sha256Hex(buf);
    const computedLines = buf.toString("utf8").split(/\r?\n/).filter(Boolean).length;
    const computedSize = buf.byteLength;
    const strictVerified =
      Boolean(expectedDigest) &&
      computedDigest === expectedDigest &&
      (Number.isFinite(expectedSize) ? expectedSize === computedSize : true) &&
      (Number.isFinite(expectedLines) ? expectedLines === computedLines : true);
    const sealedAt = String(sealRaw.generatedAt || "");
    const sealedAtDate = parseDate(sealedAt);
    const ageHours = sealedAtDate ? round1((Date.now() - sealedAtDate.getTime()) / (60 * 60 * 1000)) : null;

    return {
      latestSealFile: path.relative(rootPath, sealPath),
      algorithm,
      strictVerified,
      digest: expectedDigest || computedDigest,
      sealedAt,
      sealAgeHours: ageHours,
      stale: ageHours !== null ? ageHours > staleHours : null,
      expectedLineCount: Number.isFinite(expectedLines) ? expectedLines : null,
      computedLineCount: computedLines,
    };
  } catch {
    return {
      latestSealFile: path.relative(rootPath, sealPath),
      algorithm: "SHA-256",
      strictVerified: false,
      digest: null,
      sealedAt: null,
      sealAgeHours: null,
      stale: null,
      expectedLineCount: null,
      computedLineCount: null,
    };
  }
}

function loadEvidencePackageVerification(rootPath: string): IntegritySnapshot["evidencePackageVerification"] {
  const verifyPath = findLatestEvidenceVerificationFile(rootPath);
  if (!verifyPath) {
    return {
      file: null,
      packageFile: null,
      signatureValid: null,
      manifestFileCount: null,
      allFilesValid: null,
      signerFingerprint: null,
      verifiedAt: null,
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(verifyPath, "utf8")) as Record<string, unknown>;
    const fileChecks = Array.isArray(raw.files)
      ? raw.files.filter((f) => f && typeof f === "object" && !Array.isArray(f)) as Array<Record<string, unknown>>
      : [];
    const allFilesValid = fileChecks.length > 0
      ? fileChecks.every((f) => String(f.status || "") === "ok")
      : null;
    return {
      file: path.relative(rootPath, verifyPath),
      packageFile: raw.packageFile ? String(raw.packageFile) : null,
      signatureValid: typeof raw.signatureValid === "boolean" ? raw.signatureValid : null,
      manifestFileCount: fileChecks.length,
      allFilesValid,
      signerFingerprint: raw.signerFingerprint ? String(raw.signerFingerprint) : null,
      verifiedAt: raw.verifiedAt ? String(raw.verifiedAt) : null,
    };
  } catch {
    return {
      file: path.relative(rootPath, verifyPath),
      packageFile: null,
      signatureValid: false,
      manifestFileCount: null,
      allFilesValid: false,
      signerFingerprint: null,
      verifiedAt: null,
    };
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, round1(value)));
}

function computeReproducibility(
  domains: IntegrityDomainMetric[],
  evidenceSources: IntegrityEvidenceMetric[],
  sealHealth: IntegritySnapshot["sealHealth"]
): IntegritySnapshot["reproducibility"] {
  const avgValidation =
    domains.length > 0
      ? domains.reduce((acc, d) => acc + (Number.isFinite(d.validationSuccessRate) ? d.validationSuccessRate : 0), 0) / domains.length
      : 0;
  const avgRollback =
    domains.length > 0
      ? domains.reduce((acc, d) => acc + (Number.isFinite(d.rollbackRate) ? d.rollbackRate : 0), 0) / domains.length
      : 0;

  const sealIntegrity = sealHealth.strictVerified === true ? 100 : sealHealth.strictVerified === false ? 0 : 40;
  const evidenceDiversity = clampScore((Math.min(evidenceSources.length, 5) / 5) * 100);
  const validationQuality = clampScore(avgValidation);
  const rollbackStability = clampScore(100 - avgRollback);

  const overallScore = clampScore(
    sealIntegrity * 0.35 + evidenceDiversity * 0.2 + validationQuality * 0.25 + rollbackStability * 0.2
  );

  return {
    overallScore,
    components: {
      sealIntegrity: clampScore(sealIntegrity),
      evidenceDiversity,
      validationQuality,
      rollbackStability,
    },
  };
}

export function buildIntegritySnapshot(
  rootPath: string,
  windowDays: number,
  staleHours: number,
  orcidId?: string,
  pgpHealth?: IntegritySnapshot["pgpHealth"]
): IntegritySnapshot {
  const { from, to } = getWindowRange(windowDays);
  const applyChainPath = path.join(rootPath, ".ollama_copilot_apply_chain.jsonl");
  const inferencePath = path.join(rootPath, ".genoma_inference_custody.jsonl");

  const applyRows = readJsonl(applyChainPath);
  const applyEvents = applyRows
    .map((row, idx) => normalizeApplyEvent(row, idx))
    .filter((event) => withinWindow(event.ts, from, to));

  let lastActorId: string | null = null;
  for (let i = applyRows.length - 1; i >= 0; i -= 1) {
    const actor = applyRows[i].actorId;
    if (actor && String(actor).trim()) {
      lastActorId = String(actor).trim();
      break;
    }
  }

  const inferenceRows = readJsonl(inferencePath);

  const complianceDomains = deriveDomainMetrics(applyEvents);
  const evidenceSources = scanEvidenceSources(inferenceRows, from, to);
  const sealHealth = loadSealHealth(rootPath, staleHours);
  const evidencePackageVerification = loadEvidencePackageVerification(rootPath);
  const reproducibility = computeReproducibility(complianceDomains, evidenceSources, sealHealth);

  return {
    generatedAt: new Date().toISOString(),
    window: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    compliance: {
      domains: complianceDomains,
    },
    evidenceSources,
    reproducibility,
    sealHealth,
    identity: {
      actorId: lastActorId,
      orcidId: orcidId && orcidId.trim() ? orcidId.trim() : null,
    },
    diagnostics: {
      hasApplyChain: fs.existsSync(applyChainPath),
      hasInferenceCustody: fs.existsSync(inferencePath),
    },
    pgpHealth: pgpHealth || {
      status: "not_configured",
      keyId: null,
      fingerprint: null,
      canSign: null,
      secretKeyPresent: null,
      publicKeyPresent: null,
      createdAt: null,
      expiresAt: null,
      checkedAt: null,
      detail: null,
    },
    evidencePackageVerification,
  };
}
