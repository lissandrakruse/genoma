import fs from "fs";
import path from "path";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      continue;
    }
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    out[key] = val;
  }
  return out;
}

function asDate(value) {
  if (!value) {
    return null;
  }
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

function pct(num, den) {
  if (!den) {
    return 0;
  }
  return (num / den) * 100;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function ensureBucket(obj, key) {
  if (!obj[key]) {
    obj[key] = {
      attempts: 0,
      blocked: 0,
      overrides: 0,
      applied: 0,
      rolledBack: 0,
      validated: 0,
      validatedOk: 0,
    };
  }
  return obj[key];
}

function formatDelta(n) {
  const v = round1(n);
  if (v > 0) return `+${v}`;
  return `${v}`;
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  console.log("domain        attempts  block%  override%  apply  rollback%  validate%");
  console.log("------------  --------  ------  ---------  -----  ---------  ---------");
  for (const r of rows) {
    const pad = (s, n) => String(s).padEnd(n, " ");
    console.log(
      [
        pad(r.domain, 12),
        pad(r.attempts, 8),
        pad(round1(r.blockRate), 6),
        pad(round1(r.overrideRate), 9),
        pad(r.applied, 5),
        pad(round1(r.rollbackRate), 9),
        pad(round1(r.validationSuccessRate), 9),
      ].join("  ")
    );
  }
}

function matchesWindow(ts, from, to) {
  if (!(ts instanceof Date) || !Number.isFinite(ts.getTime())) {
    return false;
  }
  if (from && ts < from) return false;
  if (to && ts >= to) return false;
  return true;
}

function buildRows(bucketByDomain) {
  return Object.entries(bucketByDomain)
    .map(([domain, b]) => {
      const blockRate = pct(b.blocked, b.attempts);
      const overrideRate = pct(b.overrides, b.attempts);
      const rollbackRate = pct(b.rolledBack, b.applied);
      const validationSuccessRate = pct(b.validatedOk, b.validated);
      return {
        domain,
        attempts: b.attempts,
        applied: b.applied,
        blocked: b.blocked,
        overrides: b.overrides,
        rolledBack: b.rolledBack,
        validated: b.validated,
        validatedOk: b.validatedOk,
        blockRate,
        overrideRate,
        rollbackRate,
        validationSuccessRate,
      };
    })
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

function aggregate(entries, from, to) {
  const chains = new Map();

  for (const e of entries) {
    const ts = asDate(e.ts);
    if (!matchesWindow(ts, from, to)) {
      continue;
    }
    const chainId = String(e.chainId || "");
    if (!chainId) {
      continue;
    }
    if (!chains.has(chainId)) {
      chains.set(chainId, {
        domains: new Set(),
        attempts: [],
        applied: false,
        rolledBack: false,
        validated: [],
      });
    }
    const row = chains.get(chainId);
    const domains = Array.isArray(e.domains) ? e.domains.map((d) => String(d || "").trim()).filter(Boolean) : [];
    for (const d of domains) {
      row.domains.add(d);
    }
    const type = String(e.type || "");
    if (type === "policy_verdict") {
      row.attempts.push({
        blocked: Boolean(e.blocked),
        overrideUsed: Boolean(e.overrideUsed),
      });
    } else if (type === "apply_result" && Number(e.appliedFiles || 0) > 0) {
      row.applied = true;
    } else if (type === "rollback_result" && Number(e.rolledBackFiles || 0) > 0) {
      row.rolledBack = true;
    } else if (type === "validate_result") {
      row.validated.push(Boolean(e.ok));
    }
  }

  const byDomain = {};
  for (const [, c] of chains) {
    const domains = Array.from(c.domains);
    if (!domains.length) {
      continue;
    }
    for (const d of domains) {
      const b = ensureBucket(byDomain, d);
      for (const a of c.attempts) {
        b.attempts += 1;
        if (a.blocked) b.blocked += 1;
        if (a.overrideUsed) b.overrides += 1;
      }
      if (c.applied) b.applied += 1;
      if (c.rolledBack) b.rolledBack += 1;
      if (c.validated.length) {
        b.validated += 1;
        if (c.validated.some((ok) => ok)) b.validatedOk += 1;
      }
    }
  }

  return buildRows(byDomain);
}

function rowsToMap(rows) {
  const m = new Map();
  for (const r of rows) {
    m.set(r.domain, r);
  }
  return m;
}

function compareRows(baseRows, govRows) {
  const base = rowsToMap(baseRows);
  const gov = rowsToMap(govRows);
  const domains = new Set([...base.keys(), ...gov.keys()]);
  const out = [];
  for (const d of domains) {
    const b = base.get(d) || {
      rollbackRate: 0,
      validationSuccessRate: 0,
      blockRate: 0,
      overrideRate: 0,
      attempts: 0,
      applied: 0,
    };
    const g = gov.get(d) || {
      rollbackRate: 0,
      validationSuccessRate: 0,
      blockRate: 0,
      overrideRate: 0,
      attempts: 0,
      applied: 0,
    };
    out.push({
      domain: d,
      baseline: b,
      governed: g,
      deltaRollbackRate: round1(g.rollbackRate - b.rollbackRate),
      deltaValidationSuccessRate: round1(g.validationSuccessRate - b.validationSuccessRate),
      deltaBlockRate: round1(g.blockRate - b.blockRate),
      deltaOverrideRate: round1(g.overrideRate - b.overrideRate),
    });
  }
  return out.sort((a, b) => a.domain.localeCompare(b.domain));
}

function printComparison(rows) {
  console.log("\nComparison (governed - baseline)");
  console.log("domain        dRollback%  dValidate%  dBlock%  dOverride%");
  console.log("------------  ----------  ----------  -------  ----------");
  for (const r of rows) {
    const pad = (s, n) => String(s).padEnd(n, " ");
    console.log(
      [
        pad(r.domain, 12),
        pad(formatDelta(r.deltaRollbackRate), 10),
        pad(formatDelta(r.deltaValidationSuccessRate), 10),
        pad(formatDelta(r.deltaBlockRate), 7),
        pad(formatDelta(r.deltaOverrideRate), 10),
      ].join("  ")
    );
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help === "true" || args.h === "true") {
    console.log(
      [
        "Governance eval usage:",
        "  node tools/eval-governance.mjs [--chainFile <path>] [--splitDate <ISO>] [--out <file>]",
        "  node tools/eval-governance.mjs --fromBaseline <ISO> --toBaseline <ISO> --fromGoverned <ISO> --toGoverned <ISO> [--out <file>]",
      ].join("\n")
    );
    return;
  }
  const root = process.cwd();
  const chainFile = path.resolve(root, String(args.chainFile || ".ollama_copilot_apply_chain.jsonl"));
  const outFile = args.out ? path.resolve(root, String(args.out)) : null;

  if (!fs.existsSync(chainFile)) {
    console.error(`Chain file not found: ${chainFile}`);
    process.exit(1);
  }

  const splitDate = asDate(args.splitDate);
  const fromBaseline = asDate(args.fromBaseline);
  const toBaseline = asDate(args.toBaseline);
  const fromGoverned = asDate(args.fromGoverned);
  const toGoverned = asDate(args.toGoverned);

  const text = fs.readFileSync(chainFile, "utf8");
  const entries = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  let baselineRows = [];
  let governedRows = [];

  if (splitDate) {
    baselineRows = aggregate(entries, null, splitDate);
    governedRows = aggregate(entries, splitDate, null);
  } else if (fromBaseline || toBaseline || fromGoverned || toGoverned) {
    baselineRows = aggregate(entries, fromBaseline, toBaseline);
    governedRows = aggregate(entries, fromGoverned, toGoverned);
  } else {
    governedRows = aggregate(entries, null, null);
  }

  if (baselineRows.length) {
    printTable("Baseline", baselineRows);
  }
  printTable("Governed", governedRows);

  let comparison = [];
  if (baselineRows.length) {
    comparison = compareRows(baselineRows, governedRows);
    printComparison(comparison);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    chainFile,
    params: {
      splitDate: splitDate ? splitDate.toISOString() : null,
      fromBaseline: fromBaseline ? fromBaseline.toISOString() : null,
      toBaseline: toBaseline ? toBaseline.toISOString() : null,
      fromGoverned: fromGoverned ? fromGoverned.toISOString() : null,
      toGoverned: toGoverned ? toGoverned.toISOString() : null,
    },
    baseline: baselineRows,
    governed: governedRows,
    comparison,
  };

  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(`\nGovernance report written: ${outFile}`);
  }
}

main();
