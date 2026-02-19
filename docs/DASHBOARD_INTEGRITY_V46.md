# v4.6.0 Integrity Dashboard Blueprint

## Goal
Deliver a real-time, presentation-ready dashboard in VS Code that exposes governance integrity, evidence provenance, and seal status for GENOMA runs.

## Scope (v4.6.0)
- New `ollamaCopilot.integrityView` webview.
- 3 core panels:
  - Governance Compliance by domain.
  - Evidence Source Distribution (PubMed, Ensembl, CrossRef, others).
  - Audit Seal Health (sealed/unsealed + latest verification state).
- Optional identity chip: `actorId` + `orcidId` when present.

## Non-Goals (v4.6.0)
- PGP signing and verification workflow is available for seal receipts and evidence package artifacts.
- No external dashboard hosting.
- No remote telemetry backend requirement.

## Data Sources
- `.ollama_copilot_apply_chain.jsonl`
- `.genoma_inference_custody.jsonl`
- `reports/audit-seal-*.json`
- `reports/phyto_genomics_report.jsonl` (when available)

## Data Contract (Webview Payload)
```json
{
  "generatedAt": "2026-02-19T20:30:00.000Z",
  "window": { "from": "2026-02-01T00:00:00.000Z", "to": "2026-02-19T20:30:00.000Z" },
  "compliance": {
    "domains": [
      { "domain": "clinical_trials", "applyRate": 87.5, "rollbackRate": 2.1, "validationSuccessRate": 95.0, "blockRate": 6.3 },
      { "domain": "forensic_genetics", "applyRate": 82.0, "rollbackRate": 1.2, "validationSuccessRate": 97.1, "blockRate": 8.6 }
    ]
  },
  "evidenceSources": [
    { "source": "pubmed", "count": 128, "pct": 54.7 },
    { "source": "ensembl", "count": 61, "pct": 26.1 },
    { "source": "crossref", "count": 45, "pct": 19.2 }
  ],
  "sealHealth": {
    "latestSealFile": "reports/audit-seal-20260219-203000.json",
    "algorithm": "SHA-256",
    "strictVerified": true,
    "digest": "abc123...",
    "sealedAt": "2026-02-19T20:30:00.000Z"
  },
  "identity": {
    "actorId": "researcher_a",
    "orcidId": "0000-0002-1825-0097"
  }
}
```

## UI Layout
- Header:
  - Environment (`workspace`), period filter, refresh button.
  - Integrity badge (`green/yellow/red`) from seal + rollback + validation status.
- Row 1:
  - Domain compliance bar chart.
  - Evidence source doughnut chart.
- Row 2:
  - Seal verification card (algorithm, digest, strict result, timestamp).
  - Identity card (`actorId`, `orcidId`, latest chainId).
- Footer:
  - Last ingestion timestamp and file coverage diagnostics.

## Visual Rules
- `green`: strict seal verified and rollback rate under threshold.
- `yellow`: no seal or stale seal (> configurable hours).
- `red`: strict verify failed or hash mismatch detected.

## Commands
- `ollamaCopilot.openIntegrityView`
- `ollamaCopilot.refreshIntegrityView`
- `ollamaCopilot.exportIntegritySnapshot` (JSON/PNG later)

## Settings (proposed)
- `ollamaCopilot.integrityDashboardEnabled` (bool, default `true`)
- `ollamaCopilot.integrityDashboardWindowDays` (number, default `30`)
- `ollamaCopilot.researcherOrcidId` (string, optional)
- `ollamaCopilot.integritySealStaleHours` (number, default `24`)

## Implementation Plan
1. Data adapter
- Add `src/integrity/integrityMetrics.ts` to aggregate metrics from JSONL and seal files.
- Reuse existing policy/governance metric calculations where possible.

2. Webview
- Add `src/integrity/integrityViewHtml.ts`.
- Register view in `package.json` under `views` and command palette.

3. Integration
- Wire commands and refresh messaging in `src/extension.ts`.
- Add graceful empty states (missing logs, first run).

4. Quality
- Unit tests: parser + metric aggregation + seal state derivation.
- Snapshot tests for payload shape.
- `yarn run ci:quality` gate unchanged.

## Acceptance Criteria (v4.6.0)
- Dashboard opens and renders without requiring network.
- Charts update with real workspace artifacts.
- Seal status reflects strict verification result deterministically.
- Missing files do not crash UI; they show actionable hints.
- ORCID is shown when configured, omitted when empty.

## Demo Script (Mestrado)
1. Run a governed flow to generate custody logs.
2. Generate seal (`genoma:audit:seal`) and verify strict.
3. Open Integrity Dashboard.
4. Show:
- compliance chart by domain
- evidence source balance
- seal status card with SHA-256 + timestamp
- ORCID/actor identity context

## v4.6.1 Security UX Extensions (Proposed)

### 1) Key-Ring Health Check
Add a `pgpHealth` block to dashboard payload:

```json
{
  "pgpHealth": {
    "status": "ok",
    "keyId": "ABCDEF1234567890",
    "fingerprint": "ABCD EFGH IJKL MNOP QRST UVWX YZ12 3456 7890",
    "canSign": true,
    "secretKeyPresent": true,
    "publicKeyPresent": true,
    "createdAt": "2025-10-04T00:00:00.000Z",
    "expiresAt": null,
    "checkedAt": "2026-02-19T21:00:00.000Z"
  }
}
```

Collection strategy:
- Check executable from `ollamaCopilot.pgpExecutable` (fallback `gpg`).
- Resolve key by `ollamaCopilot.pgpKeyId`.
- Run key queries for public and secret ring; parse status output only.

States:
- `ok`: key resolved, secret key available, signing capability present.
- `missing`: configured key not found.
- `ambiguous`: multiple keys match configured identifier.
- `gpg_unavailable`: executable missing or command failed before lookup.

UI behavior:
- Show compact badge near integrity header.
- Surface precise remediation text per state (configure key id, install gpg, refine short id).

### 2) Visual Badge in HTML Report
When report artifacts are part of a signed Evidence Package, footer should include:
- Badge label: `Signed Evidence Package (PGP Verified)`.
- Signer fingerprint short form (last 16 hex chars).
- Verification timestamp in UTC.

Detection rules:
- Report render path receives package context (manifest + `.asc` path + verify result).
- Badge appears only when detached signature verification is successful for the package digest.
- Failed or skipped verification must render neutral text (`Signature not verified`).

### 3) Reproducibility Score Methodology
Use a weighted 0-100 score:

`reproducibilityScore = 0.35 * sealIntegrity + 0.25 * sourceDiversity + 0.25 * validationQuality + 0.15 * rollbackStability`

Metric definitions:
- `sealIntegrity` (0-100):
  - 100 when strict seal verification passes and seal age <= stale threshold.
  - 70 when strict pass but stale.
  - 0 when strict verification fails or no valid seal receipt exists.
- `sourceDiversity` (0-100):
  - Based on normalized Shannon diversity of evidence sources over selected window.
  - 0 for single-source concentration, 100 for balanced multi-source usage.
- `validationQuality` (0-100):
  - Primary input: validation success rate from apply chain.
  - Apply penalty for low sample sizes to reduce optimistic sparse windows.
- `rollbackStability` (0-100):
  - `100 - rollbackRatePct`, clamped to [0, 100].
  - Additional penalty for high-frequency rollback bursts in short windows.

Normalization and safeguards:
- All sub-scores clamped to [0, 100].
- Minimum sample gate (`n >= 10`) for stable score classification; below that mark as `low-confidence`.
- Window defaults to `ollamaCopilot.integrityDashboardWindowDays`.

Interpretation bands:
- `>= 85`: high reproducibility confidence.
- `70-84`: good, with targeted remediation recommended.
- `50-69`: moderate risk, investigation required.
- `< 50`: low reproducibility confidence.

### 4) Checksum Manifest Signing for Evidence Package
When building the Evidence Package ZIP, generate:
- `manifest.txt`: one line per artifact (`SHA256  relative/path/to/file`).
- `manifest.txt.asc`: detached signature for `manifest.txt` using configured PGP key.

Rationale:
- Preserves verifiability of individual extracted artifacts (HTML/PDF/JSON/PNG) over long-term archive workflows.
- Keeps trust chain intact even when assets are redistributed outside the original ZIP.

Manifest rules:
- Include all bundle members except transient/signature verification outputs.
- Sort paths lexicographically before hashing for deterministic output.
- Normalize path separator to `/` inside manifest entries.

Verification flow (`--verify-signature` future mode):
1. Verify detached signature (`manifest.txt.asc`) against `manifest.txt`.
2. Recompute SHA-256 for each listed artifact.
3. Emit per-file status (`ok`, `missing`, `mismatch`) to integrity diagnostics and report footer context.

Failure policy:
- Signature invalid => package trust status `red` (hard fail).
- Signature valid + file mismatch => package trust status `yellow` with explicit artifact list.
- Signature valid + all hashes match => package trust status `green`.

## v4.6.1 Delivery Note
- Key-ring health check is implemented in Integrity Dashboard payload/UI.
- Evidence package now includes `manifest.txt` + detached signature `manifest.txt.asc`.
- Verification output is emitted as `reports/evidence-package-verify-*.json` and consumed by dashboard/report trust indicators.

