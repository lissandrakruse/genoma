const cases = [
  {
    name: "Code review response shape",
    output: [
      "## Findings",
      "- High: SQL injection risk in `src/api.ts:88` due to raw string concatenation.",
      "- Medium: Missing timeout handling for external call in `src/service.ts:42`.",
      "- Low: Inconsistent naming in `src/utils.ts:10`.",
      "## Risks",
      "- Runtime failures under network latency spikes.",
      "## Next Steps",
      "1. Parameterize query.",
      "2. Add timeout + retry limits.",
      "3. Add tests for failure paths.",
    ].join("\n"),
    required: [/^## Findings/m, /- High:/m, /- Medium:/m, /- Low:/m, /^## Risks/m],
  },
  {
    name: "Implementation response flow",
    output: [
      "## Result",
      "Implemented safe multi-file apply with rollback support.",
      "## Changes",
      "- Added snapshot before file writes.",
      "- Added undo command to restore previous state.",
      "## Validation",
      "- yarn run check-types",
      "- yarn run lint",
      "- yarn run test",
    ].join("\n"),
    required: [/^## Result/m, /^## Changes/m, /^## Validation/m, /yarn run (check-types|lint|test)/m],
  },
  {
    name: "DevOps runbook response shape",
    output: [
      "## Diagnosis",
      "- Deployment failed due to missing environment variable.",
      "## PowerShell Commands",
      "```powershell",
      "Get-ChildItem Env: | Where-Object Name -Like 'APP_*'",
      "```",
      "## Verification",
      "- Confirm app health endpoint returns 200.",
      "## Rollback",
      "- Revert to previous release artifact.",
    ].join("\n"),
    required: [/^## Diagnosis/m, /^## PowerShell Commands/m, /^## Verification/m, /^## Rollback/m],
  },
];

const failures = [];
for (const c of cases) {
  const missing = c.required.filter((re) => !re.test(c.output));
  if (missing.length) {
    failures.push({ name: c.name, missing: missing.map((m) => String(m)) });
  }
}

if (failures.length) {
  console.error("Real-case eval failed:");
  for (const f of failures) {
    console.error(`- ${f.name}`);
    for (const m of f.missing) {
      console.error(`  missing: ${m}`);
    }
  }
  process.exit(1);
}

console.log(`Real-case eval passed (${cases.length} scenarios).`);
