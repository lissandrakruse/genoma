import fs from "fs";
import path from "path";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    out[key] = val;
  }
  return out;
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pct(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 1000) / 10;
}

function tsSlug(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}-${h}${min}${s}`;
}

function pickLatestSealFile(root) {
  const reportsDir = path.resolve(root, "reports");
  if (!fs.existsSync(reportsDir)) return null;
  const candidates = fs
    .readdirSync(reportsDir)
    .filter((name) => /^audit-seal-\d{8}-\d{6}\.json$/i.test(name))
    .map((name) => path.join(reportsDir, name))
    .sort();
  return candidates.length ? candidates[candidates.length - 1] : null;
}

function pickLatestEvidenceVerifyFile(root) {
  const reportsDir = path.resolve(root, "reports");
  if (!fs.existsSync(reportsDir)) return null;
  const candidates = fs
    .readdirSync(reportsDir)
    .filter((name) => /^evidence-package-verify-\d{8}-\d{6}\.json$/i.test(name))
    .map((name) => path.join(reportsDir, name))
    .sort();
  return candidates.length ? candidates[candidates.length - 1] : null;
}

function loadSealInfo(root, sealArg) {
  const sealPath = sealArg ? path.resolve(root, String(sealArg)) : pickLatestSealFile(root);
  if (!sealPath || !fs.existsSync(sealPath)) return null;
  try {
    const seal = JSON.parse(fs.readFileSync(sealPath, "utf8"));
    const digestHex = String(seal.digestHex || "").trim();
    if (!digestHex) return null;
    const algorithm = String(seal.algorithm || "SHA-256").toUpperCase();
    const generatedAt = String(seal.generatedAt || "");
    return {
      digestHex,
      algorithm,
      generatedAt,
      sealFile: path.relative(root, sealPath),
    };
  } catch {
    return null;
  }
}

function loadEvidenceTrustInfo(root) {
  const verifyPath = pickLatestEvidenceVerifyFile(root);
  if (!verifyPath || !fs.existsSync(verifyPath)) return null;
  try {
    const report = JSON.parse(fs.readFileSync(verifyPath, "utf8"));
    const files = Array.isArray(report.files) ? report.files : [];
    const allFilesValid = files.length > 0 && files.every((f) => String(f.status || "") === "ok");
    return {
      verifiedAt: String(report.verifiedAt || ""),
      packageFile: String(report.packageFile || ""),
      signatureValid: Boolean(report.signatureValid),
      allFilesValid,
      signerFingerprint: report.signerFingerprint ? String(report.signerFingerprint) : "",
      verificationFile: path.relative(root, verifyPath),
    };
  } catch {
    return null;
  }
}

function normalizeEvent(row, idx) {
  const ts = parseDate(row.ts) || new Date(0);
  const domains = Array.isArray(row.domains) ? row.domains.map((d) => String(d || "").trim()).filter(Boolean) : [];
  const type = String(row.type || "unknown");
  return {
    idx,
    raw: row,
    ts,
    type,
    chainId: String(row.chainId || row.federationEventId || `line-${idx + 1}`),
    domains,
    risk: toNum(row.risk),
    threshold: toNum(row.threshold),
    blocked: Boolean(row.blocked),
    canceled: Boolean(row.canceled),
    overrideUsed: Boolean(row.overrideUsed),
    appliedFiles: Number(row.appliedFiles || 0),
    rolledBackFiles: Number(row.rolledBackFiles || 0),
    validateOk: row.type === "validate_result" ? Boolean(row.ok) : null,
    hasSignature: Boolean(row.signature && row.entryHash && row.prevHash),
    prevHash: String(row.prevHash || ""),
    entryHash: String(row.entryHash || ""),
  };
}

function summarize(events) {
  const chains = new Map();
  const domainStats = new Map();
  let policyEvents = 0;
  let blocked = 0;
  let canceled = 0;
  let overrides = 0;
  let appliedChains = 0;
  let rollbackChains = 0;
  let validateChains = 0;
  let validateOkChains = 0;
  let signedEntries = 0;
  let unsignedEntries = 0;
  let hashBreaks = 0;
  let riskSum = 0;
  let riskCount = 0;
  let prevSignedHash = "GENESIS";

  for (const e of events) {
    if (e.hasSignature) {
      signedEntries += 1;
      if (e.prevHash !== prevSignedHash) {
        hashBreaks += 1;
      }
      prevSignedHash = e.entryHash || prevSignedHash;
    } else {
      unsignedEntries += 1;
    }

    if (!chains.has(e.chainId)) {
      chains.set(e.chainId, {
        firstTs: e.ts,
        lastTs: e.ts,
        domains: new Set(),
        appliedFiles: 0,
        rolledBackFiles: 0,
        hasValidate: false,
        validateOk: false,
        policyVerdicts: 0,
        blocked: false,
        canceled: false,
        overrideUsed: false,
        risk: null,
        threshold: null,
      });
    }
    const c = chains.get(e.chainId);
    c.firstTs = c.firstTs < e.ts ? c.firstTs : e.ts;
    c.lastTs = c.lastTs > e.ts ? c.lastTs : e.ts;
    for (const d of e.domains) c.domains.add(d);

    if (e.type === "policy_verdict") {
      c.policyVerdicts += 1;
      policyEvents += 1;
      if (e.blocked) {
        c.blocked = true;
        blocked += 1;
      }
      if (e.canceled) {
        c.canceled = true;
        canceled += 1;
      }
      if (e.overrideUsed) {
        c.overrideUsed = true;
        overrides += 1;
      }
      if (e.risk !== null) {
        c.risk = e.risk;
        riskSum += e.risk;
        riskCount += 1;
      }
      if (e.threshold !== null) {
        c.threshold = e.threshold;
      }
    }

    if (e.type === "apply_result" && e.appliedFiles > 0) {
      c.appliedFiles += e.appliedFiles;
    }
    if (e.type === "rollback_result" && e.rolledBackFiles > 0) {
      c.rolledBackFiles += e.rolledBackFiles;
    }
    if (e.type === "validate_result") {
      c.hasValidate = true;
      c.validateOk = c.validateOk || Boolean(e.validateOk);
    }
  }

  for (const [, c] of chains) {
    if (c.appliedFiles > 0) appliedChains += 1;
    if (c.rolledBackFiles > 0) rollbackChains += 1;
    if (c.hasValidate) {
      validateChains += 1;
      if (c.validateOk) validateOkChains += 1;
    }
    const chainDomains = Array.from(c.domains);
    for (const d of chainDomains) {
      if (!domainStats.has(d)) {
        domainStats.set(d, { chains: 0, applied: 0, rollback: 0, validated: 0, validatedOk: 0, blocked: 0 });
      }
      const b = domainStats.get(d);
      b.chains += 1;
      if (c.appliedFiles > 0) b.applied += 1;
      if (c.rolledBackFiles > 0) b.rollback += 1;
      if (c.hasValidate) b.validated += 1;
      if (c.validateOk) b.validatedOk += 1;
      if (c.blocked) b.blocked += 1;
    }
  }

  const domains = Array.from(domainStats.entries())
    .map(([domain, s]) => ({
      domain,
      chains: s.chains,
      appliedRate: pct(s.applied, s.chains),
      rollbackRate: pct(s.rollback, s.applied),
      validationSuccessRate: pct(s.validatedOk, s.validated),
      blockRate: pct(s.blocked, s.chains),
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));

  const timeline = Array.from(chains.entries())
    .map(([chainId, c]) => ({
      chainId,
      firstTs: c.firstTs.toISOString(),
      lastTs: c.lastTs.toISOString(),
      domains: Array.from(c.domains),
      risk: c.risk,
      threshold: c.threshold,
      blocked: c.blocked,
      canceled: c.canceled,
      overrideUsed: c.overrideUsed,
      appliedFiles: c.appliedFiles,
      rolledBackFiles: c.rolledBackFiles,
      validateOk: c.hasValidate ? c.validateOk : null,
    }))
    .sort((a, b) => b.lastTs.localeCompare(a.lastTs));

  return {
    totals: {
      events: events.length,
      chains: chains.size,
      policyEvents,
      blocked,
      canceled,
      overrides,
      appliedChains,
      rollbackChains,
      validateChains,
      validateOkChains,
      avgRisk: riskCount ? Math.round((riskSum / riskCount) * 100) / 100 : null,
    },
    integrity: {
      signedEntries,
      unsignedEntries,
      hashBreaks,
      hashChainOk: signedEntries > 0 ? hashBreaks === 0 : null,
    },
    domains,
    timeline,
  };
}

function buildHtml({ title, inputFile, generatedAt, summary, seal, evidenceTrust }) {
  const t = summary.totals;
  const i = summary.integrity;
  const domainRows =
    summary.domains.length === 0
      ? `<tr><td colspan="6">No domain-level data available.</td></tr>`
      : summary.domains
          .map(
            (d) =>
              `<tr><td>${esc(d.domain)}</td><td>${d.chains}</td><td>${d.appliedRate}%</td><td>${d.rollbackRate}%</td><td>${d.validationSuccessRate}%</td><td>${d.blockRate}%</td></tr>`
          )
          .join("");
  const timelineRows = summary.timeline
    .slice(0, 200)
    .map((c) => {
      const status = c.blocked ? "blocked" : c.canceled ? "canceled" : c.appliedFiles > 0 ? "applied" : "observed";
      return `<tr><td>${esc(c.lastTs)}</td><td>${esc(c.chainId)}</td><td>${esc(c.domains.join(", ") || "-")}</td><td>${esc(status)}</td><td>${c.risk ?? "-"}</td><td>${c.threshold ?? "-"}</td><td>${c.appliedFiles}</td><td>${c.rolledBackFiles}</td><td>${c.validateOk === null ? "-" : c.validateOk ? "ok" : "fail"}</td></tr>`;
    })
    .join("");
  const methodologyText =
    "Evidence scoring follows GENOMA translational priority: human clinical evidence first, then animal models, then in vitro. "
    + "Final ranking also considers source diversity and anti-bias quotas, and policy decisions may add risk penalties or block conditions.";
  const integrityFooter = seal
    ? `Integrity verified via Seal [${esc(seal.algorithm)}: ${esc(seal.digestHex)}]${seal.generatedAt ? ` at ${esc(seal.generatedAt)}` : ""} (${esc(seal.sealFile)}).`
    : "Integrity seal not attached. Generate one with `yarn run genoma:audit:seal` and re-run this report with `--seal`.";
  const trustBadge = evidenceTrust && evidenceTrust.signatureValid && evidenceTrust.allFilesValid
    ? `<div class="trust-badge">Signed Evidence Package (PGP Verified) · signer ${esc((evidenceTrust.signerFingerprint || "").slice(-16) || "-")} · ${esc(evidenceTrust.verifiedAt || "-")}</div>`
    : `<div class="trust-badge trust-badge-muted">Signature not verified for evidence package.</div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root { --bg:#f7f7f3; --ink:#1f2a1f; --muted:#5a6b5a; --card:#ffffff; --line:#d8e0d8; --good:#1f7a3a; --warn:#8b6f00; --bad:#9b1c1c; }
    body { margin:0; font-family: "Segoe UI", Tahoma, sans-serif; background:var(--bg); color:var(--ink); }
    main { max-width: 1200px; margin: 0 auto; padding: 24px; }
    h1,h2 { margin: 0 0 12px; }
    .meta { color: var(--muted); margin-bottom: 16px; }
    .grid { display:grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; margin-bottom: 20px; }
    .card { background:var(--card); border:1px solid var(--line); border-radius: 10px; padding: 12px; }
    .k { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    .v { font-size: 24px; font-weight: 700; margin-top: 4px; }
    .good { color: var(--good); } .warn { color: var(--warn); } .bad { color: var(--bad); }
    table { width: 100%; border-collapse: collapse; background: var(--card); border:1px solid var(--line); margin-bottom: 20px; }
    th,td { border-bottom:1px solid var(--line); padding: 8px 10px; text-align: left; font-size: 13px; vertical-align: top; }
    th { background:#eef3ee; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
    .note { color: var(--muted); font-size: 12px; }
    .trust-badge {
      margin-top: 12px;
      display: inline-block;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid #9ac8aa;
      background: #edf8f1;
      color: #1f7a3a;
      font-size: 12px;
      font-weight: 600;
    }
    .trust-badge-muted {
      border-color: #d8e0d8;
      background: #f8faf8;
      color: #5a6b5a;
      font-weight: 500;
    }
  </style>
</head>
<body>
<main>
  <h1>${esc(title)}</h1>
  <div class="meta">Generated at ${esc(generatedAt)} from <code>${esc(inputFile)}</code></div>

  <h2>Executive Summary</h2>
  <div class="grid">
    <div class="card"><div class="k">Events</div><div class="v">${t.events}</div></div>
    <div class="card"><div class="k">Chains</div><div class="v">${t.chains}</div></div>
    <div class="card"><div class="k">Policy Verdicts</div><div class="v">${t.policyEvents}</div></div>
    <div class="card"><div class="k">Applied Chains</div><div class="v">${t.appliedChains}</div></div>
    <div class="card"><div class="k">Rollback Chains</div><div class="v ${t.rollbackChains > 0 ? "warn" : "good"}">${t.rollbackChains}</div></div>
    <div class="card"><div class="k">Validation Success</div><div class="v">${pct(t.validateOkChains, t.validateChains)}%</div></div>
    <div class="card"><div class="k">Overrides</div><div class="v ${t.overrides > 0 ? "warn" : "good"}">${t.overrides}</div></div>
    <div class="card"><div class="k">Blocked</div><div class="v">${t.blocked}</div></div>
    <div class="card"><div class="k">Avg Risk</div><div class="v">${t.avgRisk ?? "-"}</div></div>
  </div>

  <h2>Integrity</h2>
  <div class="grid">
    <div class="card"><div class="k">Signed Entries</div><div class="v">${i.signedEntries}</div></div>
    <div class="card"><div class="k">Unsigned Entries</div><div class="v">${i.unsignedEntries}</div></div>
    <div class="card"><div class="k">Hash Chain Breaks</div><div class="v ${i.hashBreaks > 0 ? "bad" : "good"}">${i.hashBreaks}</div></div>
    <div class="card"><div class="k">Hash Chain Status</div><div class="v ${i.hashChainOk === false ? "bad" : "good"}">${i.hashChainOk === null ? "n/a" : i.hashChainOk ? "ok" : "broken"}</div></div>
  </div>

  <h2>Domain Metrics</h2>
  <table>
    <thead><tr><th>Domain</th><th>Chains</th><th>Apply Rate</th><th>Rollback Rate</th><th>Validation Success</th><th>Block Rate</th></tr></thead>
    <tbody>${domainRows}</tbody>
  </table>

  <h2>Chain Timeline</h2>
  <table>
    <thead><tr><th>Last Event</th><th>Chain ID</th><th>Domains</th><th>Status</th><th>Risk</th><th>Threshold</th><th>Applied Files</th><th>Rolled Back Files</th><th>Validation</th></tr></thead>
    <tbody>${timelineRows}</tbody>
  </table>
  <div class="note">Showing up to 200 most recent chains.</div>

  <h2>Methodology</h2>
  <div class="card">${esc(methodologyText)}</div>
  ${trustBadge}
  <div class="note" style="margin-top:12px;">${integrityFooter}</div>
</main>
</body>
</html>`;
}

function main() {
  const args = parseArgs(process.argv);
  const root = process.cwd();
  const inputFile = path.resolve(root, String(args.in || ".ollama_copilot_apply_chain.jsonl"));
  const now = new Date();
  const defaultOut = path.join("reports", `audit-report-${tsSlug(now)}.html`);
  const outputFile = path.resolve(root, String(args.out || defaultOut));
  const title = String(args.title || "GENOMA Audit Report");
  const seal = loadSealInfo(root, args.seal);
  const evidenceTrust = loadEvidenceTrustInfo(root);

  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    console.error("Tip: use --in <jsonl> to point to another custody trail.");
    process.exit(1);
  }

  const lines = fs.readFileSync(inputFile, "utf8").split(/\r?\n/).filter(Boolean);
  const events = [];
  for (let i = 0; i < lines.length; i += 1) {
    try {
      const row = JSON.parse(lines[i]);
      if (!row || typeof row !== "object") continue;
      events.push(normalizeEvent(row, i));
    } catch {
      // Ignore malformed lines but keep report generation resilient.
    }
  }
  const summary = summarize(events);
  const html = buildHtml({
    title,
    inputFile: path.relative(root, inputFile),
    generatedAt: now.toISOString(),
    summary,
    seal,
    evidenceTrust,
  });
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, html, "utf8");
  console.log(`Audit report generated: ${outputFile}`);
}

main();
