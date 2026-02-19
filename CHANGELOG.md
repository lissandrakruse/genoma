# Changelog

All notable changes to this extension are documented here.
GENOMA is a governance-first translational research runtime with audit-grade compliance artifacts.

## Suggestions

Suggestions for improving GENOMA are welcome.

- Open an issue: `https://github.com/lissandrakruse/genoma/issues`
- Prefix title with: `[Suggestion]`
- Include: problem, proposed improvement, expected research impact
- Attach a sample event JSON if possible.
- Direct contact (email): `t7426541@gmail.com`
- Direct contact (WhatsApp): `+55 42 99127-4857`
- Donation support (Pix): `+55 42 99127-4857`

## v4.5.0 - Federated Policy Sync (Preview)

### Added
- Remote Policy Sync CLI for federated teams: `tools/compliance/sync-remote-policy.mjs` + `yarn run genoma:policy:sync -- --url <remote-policy-url>`.
- Policy loader now accepts remote `imports` / `extends` URLs (`https://...`) in `.ollama_policies.json`.
- Audit log sealing command for verifiability: `tools/compliance/seal-audit-log.mjs` + `yarn run genoma:audit:seal`.
- Audit seal verification command: `tools/compliance/verify-audit-seal.mjs` + `yarn run genoma:audit:verify`.

### Improved
- Remote policy imports support cache fallback for resilient offline/restricted operation (`.genoma_remote_policy_cache.json`).
- Remote import resolution now supports URL-relative modules for shared policy bundles across institutions.
- Privacy Shield now obfuscates local system paths in JSONL logs by default (`genoma:privacy:sanitize`, `--obfuscatePaths true|false`).
- Audit seal verification now supports strict mode (`genoma:audit:verify -- --strict true`) to enforce digest + file size + line count consistency.
- Remote policy sync now supports conditional HTTP refresh via `ETag` / `Last-Modified` to avoid unnecessary downloads on unstable lab networks.
- Path obfuscation now keeps deterministic, human-auditable structure within each run (for example, `C:\Users\<name>\...` becomes `<USER_PATH>\...`).
- Audit HTML report footer can now display direct seal linkage (`Integrity verified via Seal [SHA-256: ...]`) when a seal receipt is available.

### Quality
- `yarn run ci:quality` passing with federated policy sync support.
- Seal receipts are generated in `reports/` with SHA-256 digest metadata for external timestamp/notary publication.

## v4.6.1 - UX Security Refinement

### Added
- Key-Ring Health Check in Integrity Dashboard for `ollamaCopilot.pgpKeyId` availability and signing readiness.
- Dashboard status states for PGP readiness: `ok`, `missing`, `ambiguous`, `gpg_unavailable`.
- PGP key metadata panel in dashboard diagnostics (fingerprint, capabilities, created/expires when available).
- One-Click Evidence Package now emits `manifest.txt` (SHA-256 per included artifact) plus detached signature `manifest.txt.asc` and registers it in package artifacts.
- New verification command: `ollamaCopilot.verifyEvidencePackageSignature` for signature + per-file manifest validation.

### Improved
- Audit HTML report footer can show a visual trust badge when report artifacts are detected inside a PGP-signed Evidence Package.
- Quick verification context in report footer now includes signature status + signer fingerprint (short form).
- Evidence consumers can validate individual extracted files against a signed manifest without requiring the original ZIP container.

### Quality
- `yarn run ci:quality` passing with security UX refinements.
- Integrity dashboard now surfaces evidence package verification diagnostics from `reports/evidence-package-verify-*.json`.

## v4.6.0 - Integrity Dashboard + Research Identity (Preview)

### Added
- Integrity Dashboard technical blueprint for implementation and demo readiness: `docs/DASHBOARD_INTEGRITY_V46.md`.
- Integrity Dashboard webview: `ollamaCopilot.integrityView`.
- Dashboard commands:
  - `ollamaCopilot.openIntegrityView`
  - `ollamaCopilot.refreshIntegrityView`
  - `ollamaCopilot.exportIntegritySnapshot`
  - `ollamaCopilot.exportIntegrityDashboardPng`
  - `ollamaCopilot.buildEvidencePackage`
  - `ollamaCopilot.signLatestSealReceipt`
  - `ollamaCopilot.signEvidencePackage`
- Integrity metrics engine for local workspace artifacts: `src/integrity/integrityMetrics.ts`.
- Integrity webview renderer: `src/integrity/integrityViewHtml.ts`.
- New settings:
  - `ollamaCopilot.integrityDashboardEnabled`
  - `ollamaCopilot.integrityDashboardWindowDays`
  - `ollamaCopilot.researcherOrcidId`
  - `ollamaCopilot.integritySealStaleHours`
  - `ollamaCopilot.pgpExecutable`
  - `ollamaCopilot.pgpKeyId`
  - `ollamaCopilot.pgpArmor`
- Integrity Dashboard now flags stale seal receipts using configurable age threshold.
- Integrity metrics now include reproducibility scoring (seal integrity, source diversity, validation quality, rollback stability).
- One-Click Evidence Package command now creates ZIP bundles with manifest checksums for committee/journal supplementary material.
- PGP starter commands added for detached-signature workflows over seal receipts and evidence package ZIP artifacts.
- Integrity Dashboard now supports PNG export for visual evidence capture (`reports/integrity-dashboard-*.png`).

### Planned
- Optional native screenshot capture integration for environments with restricted canvas export policies.

## v4.4.0 - Clinical Trials + Forensic Genetics Governance Baseline

### Added
- Strategic roadmap for post-v4.3 cycle planning: `ROADMAP.md`.
- New policy domain for clinical trial governance: `clinical_trials` in `.ollama_policies.json`.
- Clinical trial compliance schema: `tools/compliance/clinical-trial-event.schema.json`.
- Clinical trial compliance example payload: `tools/compliance/clinical-trial-event.example.json`.
- New policy domain for forensic genetics governance: `forensic_genetics` in `.ollama_policies.json`.
- Forensic genetics compliance schema: `tools/compliance/forensic-genetics-event.schema.json`.
- Forensic genetics compliance example payload: `tools/compliance/forensic-genetics-event.example.json`.
- Human-readable audit report generator: `tools/compliance/generate-audit-report.mjs` + `yarn run genoma:audit:report`.
- Privacy Shield log sanitizer (JSONL): `tools/compliance/sanitize-custody-log.mjs` + `yarn run genoma:privacy:sanitize`.

### Improved
- Policy baseline now covers translational research scenarios with stronger deny conditions and dual-approval gates for:
  - trial phase/cross-border/vulnerable population events
  - criminal/kinship/cross-border forensic workflows
- Domain suspension controls expanded for high-risk governance tracks:
  - `clinical_trials` rollback threshold profile
  - `forensic_genetics` rollback threshold profile
- Audit reporting now defaults to timestamped output in `reports/` (for example: `reports/audit-report-YYYYMMDD-HHMMSS.html`).
- Audit report now includes a methodology section describing translational evidence score priorities and anti-bias logic.
- Report scripts standardized to `reports/` outputs:
  - `genoma:report`
  - `genoma:phyto`
  - `genoma:phyto:summary`
  - `genoma:phyto:rank`
  - `eval:phyto-report`

### Quality
- JSON policy and compliance artifacts validated.
- `yarn run ci:quality` passing after governance baseline additions.
- Local audit artifacts ignored in repository hygiene: `.ollama_copilot_apply_chain.jsonl`, `audit-report.html`.
- `reports/` ignored by default to avoid report artifact drift in git history.
- Audit report generation verified with example events (clinical + forensic).

## v4.3.0 - Cross-Domain Phyto-Veterinary Intelligence

### Added
- Phyto‑vet policy domain with suspension threshold (`botanical_pharmacology`).
- Phyto safety validator: `tools/compliance/phyto-validator.mjs` (optional registry override).
- Example registry template: `tools/compliance/phyto-registry.example.json`.
- Phyto‑genomics batch runner: `tools/genoma/eval-phyto-genomics.mjs` + `yarn run genoma:phyto`.
- Report schema: `tools/compliance/phyto-genomics-report.schema.json`.
- Default plants list for batch runner: `tools/genoma/plants.json`.
- Phyto report validator: `tools/compliance/validate-phyto-report.mjs` + `yarn run eval:phyto-report`.
- Phyto summary table generator: `tools/genoma/phyto-summary-table.mjs` + `yarn run genoma:phyto:summary`.
- Evidence ranking generator with anti-bias quotas: `tools/genoma/rank-evidence.mjs` + `yarn run genoma:phyto:rank`.
- Batch run metadata report: `phyto_genomics_meta.json`.
- Example registry now includes dog/cat contraindication samples (lily, onion, cannabis, sago palm).
- ResearchAgent backend for translational search (PubMed + Ensembl + CrossRef): `src/research/ResearchAgent.ts`.
- Translational research panel (sidebar view): `ollamaCopilot.researchView`.
- CodeAction "Research on GENOMA" for selected terms (editor).

### Improved
- Domain policy engine supports per‑domain suspension thresholds.
- Phyto batch evaluator supports JSONL input, aliases, retry/backoff, and summary output (`phyto_genomics_summary.json`).
- PubMed lookups now handle `429` rate limits via retries.
- Batch output includes PubMed records (ESummary) when available.
- Batch runner supports registry override, cache TTL, and schema validation (`tools/compliance/phyto-genomics-report.schema.json`).
- Added cache/output artifacts to `.gitignore` (`.phyto_pubmed_cache.json`, `phyto_genomics_report.jsonl`, `phyto_genomics_summary.json`, `phyto_genomics_report.csv`, `phyto_genomics_meta.json`, `phyto_genomics_summary_table.md`, `phyto_genomics_summary_table.csv`).
- Batch output now includes a CSV export (`phyto_genomics_report.csv`) for downstream analysis.
- Super Chat slash commands for research: `/pubmed`, `/genome`, `/evidence`, `/translate`.
- Translate now ranks evidence by priority (human clinical > animal model > in vitro) with keyword signals.
- EvidenceBalancer applies anti-bias quotas + source diversity for translational ranking.
- ResearchAgent now uses persistent cache + custody JSONL trail for evidence queries.
- ResearchAgent adds schema validation, normalization, and per-source metrics.

### Quality
- Run `tools/compliance/phyto-validator.mjs` before batch inference.

## v4.2.0 - International Biomedical Readiness + Repository Publishing

### Added
- International biomedical compliance baseline documentation:
  - `docs/INTERNATIONAL_COMPLIANCE.md`
- Data-source license registry for federated biomedical datasets:
  - `DATA_LICENSES.md`
- JSON schema for ingestion license metadata enforcement:
  - `tools/compliance/data-license-entry.schema.json`
- Federated join governance documentation and enforcement artifacts:
  - `docs/FEDERATED_JOINS.md`
  - `tools/compliance/federation-event.schema.json`
  - `.ollama_policies.json` baseline domain `biomedical_federation`
  - `.genoma_federation_event.example.json` template
  - `tools/eval-federation-policy.mjs` (`yarn run eval:federation`)
- Research and validation documentation:
  - `docs/RESEARCH_PROPOSAL.md`
  - `docs/EXPERIMENT_PROTOCOL.md`
  - `docs/PROPOSTAS_MESTRADO.md`
  - `docs/PRE_PROJETO_MESTRADO.md`
  - `docs/LANDMARK_CRITERIA.md`
  - `docs/GENOMA_RUNTIME.md`
- README international section with compliance and biomedical federation references.

### Improved
- Marketplace-facing messaging now includes international biomedical governance posture.
- Added functional federated genomic runtime demo:
  - `src/genoma/*`
  - `yarn run genoma:demo`
  - `yarn run genoma:report`
  - `yarn run genoma:benchmark`
- Upgraded research runtime with:
  - optional live Ensembl connector mode
  - optional live ClinVar connector mode (NCBI E-utilities with safe fallback)
  - canonical biomedical ID normalization
  - score breakdown for candidate prioritization
  - reproducibility fingerprint report output
  - benchmark suite for federated ranking behavior
  - persisted research artifacts (`.genoma_federation_events.jsonl`, `.genoma_inference_custody.jsonl`)
  - full run CLI (`yarn run genoma:run`)
  - full run with strict citation gate (`yarn run genoma:run:strict`)
- Added scientific citation custody module:
  - DOI/PMID validator (`tools/eval-citations.mjs`)
  - citation input schema (`tools/compliance/citation-check-input.schema.json`)
  - example claims input (`tools/compliance/citation-claims.example.json`)
  - documentation (`docs/CITATION_VALIDATION.md`)
  - script (`yarn run eval:citations`)
  - integrated citation audit into full run (`.genoma_citation_audit.jsonl`)
- Repository hygiene improved by ignoring local audit/telemetry log artifacts:
  - `.ollama_copilot_log.jsonl`
  - `.ollama_copilot_telemetry.jsonl`
- Git publication workflow completed for `main` on `lissandrakruse/genoma`.

### Quality
- Rebase conflict on `LICENSE` resolved cleanly during publish.
- Full CI quality gate is recommended before next VS Code Marketplace release:
  - `yarn run ci:quality`

## v4.1.0 - Policy Imports + Expanded Heatmap Table

### Added
- Policy Imports:
  - `.ollama_policies.json` now supports reusable governance modules via `imports`.
  - Policy composition now supports `extends` + `imports` + `profiles`.
- Expanded Governance Heatmap:
  - domain-level rollback / validation / block / override rates
  - top triggered rule per domain
  - clickable rows to draft domain-focused governance prompts

### Improved
- Policy loader now resolves inheritance/composition and selected profile (`ollamaCopilot.policyProfile`) before evaluation.
- Governance operations panel now exposes more actionable domain-level signals for runtime policy tuning.

### Quality
- `yarn run ci:quality` passing.

## v4.0.0 - Policy-as-Code Profiles + Governance Heatmap

### Added
- Policy-as-code composition with project profile selection:
  - setting: `ollamaCopilot.policyProfile` (`strict` | `balanced` | `experimental`)
  - policy file supports:
    - `extends` (inherit base policies)
    - `profiles` (named overrides per environment)
- Live governance heatmap in Webview:
  - rollback rate by domain
  - validation success by domain
  - block/override rate by domain
  - top triggered rule per domain

### Improved
- Policy loader now resolves policy inheritance and profile overrides before evaluation.
- Webview operations panel now surfaces domain-risk operational signals in real time.

### Quality
- `yarn run ci:quality` passing.

## v3.9.0 - Governance Experiment Metrics Pipeline

### Added
- Governance experiment evaluator:
  - `tools/eval-governance.mjs`
  - `yarn run eval:governance`
- Metrics by domain from custody chain:
  - rollback rate
  - validation success rate
  - block rate
  - override rate
  - apply/attempt volumes
- Baseline vs governed comparison modes:
  - split-date mode (`--splitDate`)
  - explicit windows (`--fromBaseline`, `--toBaseline`, `--fromGoverned`, `--toGoverned`)
- Optional JSON report export:
  - `--out governance-report.json`

### Improved
- Quality guide now includes governance experiment workflow and CLI examples.
- Project is ready for empirical evaluation of policy impact over time (research/masters methodology).

### Quality
- `yarn run ci:quality` passing.

## v3.8.0 - Tamper-Evident Custody + Git Provenance

### Added
- Tamper-evident custody trail signing:
  - HMAC signature per entry
  - hash-chain linking with `prevHash` and `entryHash`
  - secret stored in VS Code SecretStorage
- Custody verification command:
  - `ollamaCopilot.verifyCustodyTrail`
- Git provenance integration (optional):
  - branch creation by chain id
  - automated commit with `chainId` and `sourceHash`
  - optional `--signoff` and `-S` commit modes

### Added Settings
- `ollamaCopilot.policyCustodySigningEnabled`
- `ollamaCopilot.policyGitProvenanceEnabled`
- `ollamaCopilot.policyGitCreateBranch`
- `ollamaCopilot.policyGitCommitEnabled`
- `ollamaCopilot.policyGitCommitSignoff`
- `ollamaCopilot.policyGitCommitGpgSign`
- `ollamaCopilot.policyGitBranchPrefix`

### Improved
- Chain-of-custody now records tamper-evident signatures for policy/apply/validate/rollback events.
- Apply flow can project governance evidence into Git history for team-level auditing.

### Quality
- `yarn run ci:quality` passing.

## v3.7.0 - Reputation-Based Agent Trust Score

### Added
- Domain trust scoring engine based on observed behavior history:
  - validation success rate
  - rollback rate
  - sample volume
- New trust controls:
  - `ollamaCopilot.policyTrustEnabled`
  - `ollamaCopilot.policyTrustMinScoreAutoApply`
  - `ollamaCopilot.policyTrustLowScoreRiskPenalty`
- Trust signals included in policy/apply chain events:
  - `minTrustScore`

### Improved
- Policy decision now combines:
  - patch context
  - domain policy
  - dynamic risk
  - domain trust reputation
- Low-trust domains now:
  - receive extra risk penalty
  - require explicit trust-gate confirmation before apply when below trust threshold
- Policy preview shows domain trust and trust gate threshold.

### Quality
- `yarn run ci:quality` passing.

## v3.6.0 - Dual Approval Governance for High-Risk Overrides

### Added
- Dual-approval controls for high-risk policy override:
  - `ollamaCopilot.policyDualApprovalEnabled`
  - `ollamaCopilot.policySecondApproverRequired`
- Override audit fields in governance trail:
  - `actorId`
  - `approverId`
- Second-approver confirmation code challenge tied to `chainId`.

### Improved
- High-risk override flow can enforce:
  - primary actor identity
  - distinct second approver identity
  - explicit approval-code confirmation
- Chain-of-apply log now captures override actor metadata for custody and compliance.

### Quality
- `yarn run ci:quality` passing.

## v3.5.0 - Domain Policy + Explainability + Chain of Custody

### Added
- Domain-aware policy in `.ollama_policies.json`:
  - per-domain path patterns
  - override allow/deny
  - required tests by domain
  - max patch lines by domain
  - risk multiplier by domain
- Apply chain log with custody trail:
  - file: `.ollama_copilot_apply_chain.jsonl`
  - `chainId`, `sourceHash`, policy verdict, apply result, validation result, rollback result
- Domain governance history used by policy engine:
  - rollback rate per domain
  - validation success per domain

### Improved
- Policy explainability now includes:
  - matched domains
  - blocked-by reasons
  - override-allowed signal
- Dynamic risk now uses:
  - patch context
  - observed domain behavior
- Auto-suspend policy block for risky domains:
  - high rollback + low validation success over minimum samples

### Quality
- `yarn run ci:quality` passing.

## v3.4.0 - Adaptive Policy Threshold + Justified Override

### Added
- New command to bootstrap project policy file:
  - `Ollama Copilot: Create Policy Template`
  - command id: `ollamaCopilot.createPolicyTemplate`
- New policy controls:
  - `ollamaCopilot.policyDynamicThresholdEnabled`
  - `ollamaCopilot.policyRollbackPenaltyStartPct`
  - `ollamaCopilot.policyRollbackPenaltyMax`
  - `ollamaCopilot.policyRequireJustification`

### Improved
- Policy threshold now adapts to historical rollback rate from telemetry.
- High-risk override can require mandatory audit justification.
- Policy preview now shows effective threshold and rollback-rate signal.

### Quality
- `yarn run ci:quality` passing.

## v3.3.0 - Policy Guardrail Engine MVP

### Added
- Project-level policy guardrails before `Apply`:
  - `ollamaCopilot.policyEnabled`
  - `ollamaCopilot.policyFile`
  - `ollamaCopilot.policyRiskThreshold`
- Default policy model with:
  - forbidden path blocking
  - risk scoring for warning rules
  - large patch risk increment
  - required test pattern check
- Policy telemetry events:
  - `webview_policy_blocked`
  - `webview_policy_canceled`
  - `webview_policy_override`

### Improved
- `Apply` now evaluates selected workspace targets before write operations.
- High-risk patches require explicit user confirmation.
- Inline policy verdict is shown in Webview apply preview flow.

### Quality
- `yarn run ci:quality` passing.

## v3.2.0 - Elite UX + Metrics + Configurable Validation

### Added
- Inline apply preview summary in Webview before patch execution.
- Project-level validation command setting:
  - `ollamaCopilot.validateCommand`
- Product metrics line in Webview:
  - average response time
  - validation success rate
  - rollback rate

### Improved
- `Apply + Validate` now auto-detects package manager command fallback (`pnpm` / `yarn` / `npm`) when custom command is not configured.
- Simpler one-line status messaging during auto-lane execution.

### Quality
- `yarn run ci:quality` passing.

## v3.1.0 - Elite Workflow Complete

### Added
- Inline apply preview in Webview panel before patch execution.
- `Apply + Validate` with automatic project validation command:
  - custom setting: `ollamaCopilot.validateCommand`
  - automatic package-manager fallback (pnpm/yarn/npm)
- Quality operations guide: `QUALITY.md`.
- Golden candidate capture tool:
  - `yarn run golden:capture`
  - outputs `tools/golden-candidates.json` from local logs.

### Improved
- Semantic workspace context prioritization by query terms (prompt-aware file ranking).
- Apply/rollback/validate telemetry coverage for product-level performance tracking.
- Quality gate remains strict with structural, real-case, and golden evals.

### Quality
- `yarn run ci:quality` passing.

## v3.0.0 - Super Engineering Experience

### Added
- Visual diff preview before hunk-level apply for multi-file patches.
- `Apply + Validate` action in Webview (`check-types` + `lint` run automatically after apply).
- Golden eval dataset and runner:
  - `tools/golden-cases.json`
  - `yarn run eval:golden`

### Improved
- Workspace context file prioritization now uses prompt terms for more semantic relevance.
- Product telemetry now tracks apply/rollback/validate workflow events.
- Quality gate expanded:
  - `eval:quality`
  - `eval:cases`
  - `eval:golden`

### Quality
- `yarn run ci:quality` passing.

## v2.9.0 - Hunk-Level Apply + Real-Case Evals

### Added
- Hunk-level selection for multi-file diff apply:
  - pick files first
  - then pick exact hunks to apply
- Real-case output evaluation suite:
  - `yarn run eval:cases`
  - integrated into `yarn run ci:quality`

### Improved
- Safer partial apply flow with fine-grained patch control.
- Quality gate now validates concrete response-shape scenarios (review, implementation, devops runbook).

### Quality
- `yarn run ci:quality` passing.

## v2.8.7 - Premium Apply Follow-up UX

### Added
- Post-apply action prompt after multi-file apply:
  - `Review Changes` (opens Source Control view)
  - `Undo Apply`
  - `OK`

### Improved
- Safer and faster edit loop after project-wide changes, with immediate review/rollback options.

### Quality
- `yarn run ci:quality` passing.

## v2.8.6 - Lean + Powerful Context Performance

### Added
- New settings for workspace context performance tuning:
  - `ollamaCopilot.workspaceContextMaxFiles`
  - `ollamaCopilot.workspaceContextCacheMs`

### Improved
- Workspace context now uses short-lived caching to avoid rescanning the project on every prompt.
- Reduced context scan overhead while preserving multi-file reasoning quality.
- Webview model search no longer persists state on every keystroke.

### Quality
- `yarn run ci:quality` passing.

## v2.8.5 - Marketplace Update Notice

### Added
- Automatic update notice when extension version changes after Marketplace update.
- Update prompt options:
  - `View Changelog`
  - `Reload Window`
  - `Later`

### Improved
- Post-update UX now makes it explicit that a new version is installed and guides users to release notes.

### Quality
- `yarn run ci:quality` passing.

## v2.8.4 - Codex-Like Response Flow

### Improved
- Engineering responses now default to a clearer execution flow:
  - `Result`
  - `Changes`
  - `Validation`
- Prompt behavior is more consistent with a pragmatic Codex-style experience across Webview and Super Chat.

### Quality
- `yarn run ci:quality` passing.

## v2.8.3 - Super Chat Auto-Lane (Codex-Like)

### Added
- Super Chat now auto-detects lane from each prompt (`dev`, `devops`, `ds`, `other`) and maps mode/action automatically.

### Improved
- Super Chat behavior now matches the simple Webview experience more closely.
- Cleaner implementation and lint-safe inference rules.

### Quality
- `yarn run ci:quality` passing.

## v2.8.2 - Partial Multi-File Apply Selection

### Added
- File checklist selection before multi-file apply:
  - choose exactly which files to apply from generated diff/blocks
  - confirm selection before applying

### Improved
- Safer control for project-wide edits with selective apply and explicit cancel flow.

### Quality
- `yarn run ci:quality` passing.

## v2.8.1 - Safe Multi-File Apply Preview

### Added
- Confirmation preview before applying multi-file changes from:
  - unified diff responses
  - `File: <path>` + fenced-code responses

### Improved
- Multi-file apply now requires explicit user confirmation with file sample list.
- Safer workflow for project-wide updates, aligned with professional engineering UX.

### Quality
- `yarn run ci:quality` passing.

## v2.8.0 - Engineering Quality Gate + Safe Multi-File Apply

### Highlights
- Added rollback-safe multi-file apply workflow for safer project-wide edits.
- Added quality gate automation to keep the project at a high engineering bar.

### Added
- `Undo Apply` action in Webview to rollback last multi-file apply operation.
- Apply snapshots for workspace-wide operations (diff and `File: <path>` blocks).
- Quality evaluation script: `yarn run eval:quality`.
- Full CI quality gate script: `yarn run ci:quality`.
- GitHub Actions workflow: `.github/workflows/quality-gate.yml`.

### Improved
- Multi-file apply now stores restoration snapshots before writing.
- Cloud/model/simple-agent UX quality checks are now enforced via CI.

### Quality
- `yarn run check-types` passing.
- `yarn run lint` passing.

## v2.7.0 - Codex-Like Simple Agent UX

### Highlights
- UX now defaults to a simpler, more agent-like flow focused on "ask -> solve -> apply".
- Behavior is closer to Codex style: direct, practical, solution-first responses.

### Added
- Model combobox with search (`type-to-filter`) in simple mode.
- Cloud picker list shown after token configuration, so user can choose which cloud endpoint to use.
- Auto lane detection from the question (`dev`, `devops`, `ds`, `other`) mapped to internal modes.
- Multi-file apply support for:
  - unified diff responses
  - `File: <path>` + fenced-code blocks

### Improved
- Simple mode now auto-selects strategy from the prompt with less manual control overhead.
- Workspace context includes broad project view + multi-file snippets for whole-project reasoning.
- Apply now prioritizes code extraction and workspace-wide patching before single-editor fallback.

### Quality
- `yarn run check-types` passing.
- `yarn run lint` passing.

## v2.6.0 - Workspace Context (No More Manual Paste)

### Highlights
- Added a new `workspace` context mode so the assistant can read multiple files from the current folder/workspace automatically.
- Improved default UX: Super Chat now starts with workspace context by default.

### Added
- New slash command mode: `/context workspace`.
- New default context option in settings and command palette: `workspace`.
- Webview context pill: `Workspace`.
- `Apply` now supports multi-file unified diff patches (workspace-wide apply when model returns a diff).
- `Apply` now also supports multi-file `File: <path>` + fenced-code blocks.

### Improved
- Context extraction now supports multi-file snippets from workspace files (with file labels and token/char budget control).
- Active editor file is prioritized in workspace context extraction.
- Workspace context scans more files before trimming by token/char budget.
- Workspace context now includes a workspace file list summary for better whole-project understanding.
- Help/docs updated to include the new context mode.

### Quality
- `yarn run check-types` passing.
- `yarn run lint` passing.

## v2.5.0 - Cloud Onboarding & Chat Routing

### Highlights
- Fixed VS Code view registration issue by explicitly setting `type: "webview"` for `ollamaCopilot.chatView`.
- Clearer and safer Local/Cloud routing in Webview and Super Chat.
- Guided Cloud onboarding (login -> keys -> token) for faster first-time use.

### Added
- Novos comandos no Super Chat:
  - `/ollama` to force Local Ollama mode.
  - `/login` e `/ollama.com` para abrir login do Ollama Cloud no navegador.
  - `/token` e `/apikey` para abrir entrada segura de API key.
- `Quick Setup` section in Webview with one-click actions:
  - `Usar Local`
  - `Conectar Cloud`
  - `Escolher Modelo Local` (lista modelos locais e salva o escolhido como preferido)
  - `Testar Ollama Local` (mostra status online/offline e quantidade de modelos)
- No primeiro uso apos instalar, a sidebar do Ollama Copilot abre automaticamente.

### Improved
- Melhor descoberta de comandos em `/help`.
- Comportamento de sessao mais previsivel ao alternar entre Local e Cloud.
- UI do Webview com destaque visual para alternancia Local/Cloud.
- Fluxo Cloud com acoes inline de login e token no proprio Webview.
- Se Cloud estiver sem token, o Webview faz fallback automatico para Local para manter o chat disponivel.
- Experiencia local mais objetiva com diagnostico rapido do runtime Ollama.

### Quality
- `yarn run check-types` passing.

## v2.4.0 - Adaptive Reliability & Model-Aware Execution

### Highlights
- More reliable model execution with adaptive fallback strategies.
- Better context control with token-aware limits.
- Clearer operational visibility with model health and cloud cost indicators.

### Added
- Adaptive model strategy fallback (`best_local` -> `fastest`) after repeated failures per endpoint cooldown window.
- New setting `ollamaCopilot.maxContextTokens` for token-aware context budget.
- Cloud cost badge in Webview (`Cloud cost`) based on model-size heuristic.
- Error-kind classification (`timeout`, `network`, `server`, `auth`, `rate_limit`) for smarter retry behavior.

### Improved
- Super Chat now uses adaptive strategy and endpoint/model health guidance.
- Context extraction now respects both character and token limits.
- Retry flow now falls back to the next ranked model only for retryable failures.
- Observability: retries and error kind are recorded in telemetry and audit trails.

### Fixed
- Garbled error output in Super Chat stream failures.
- Inconsistent strategy usage between Webview and Super Chat model selection.

### Quality
- `yarn run check-types` passing.
- `yarn run lint` passing.
- `yarn run test` passing.
- End-to-end test stability improvements in progress.

### Security
- Local-first execution with optional cloud endpoints.
- Audit-friendly telemetry with explicit user opt-in.
- Suitable for restricted environments (e.g., government, legal, forensic workflows).

## v2.3.0 - Premium Experience

### Added
- Premium Webview features:
  - Quick Prompts chips.
  - Favorites with search.
  - Message-level actions (Copy / Apply / Favorite / Reuse).
- Optional local telemetry logger (`ollamaCopilot.telemetry.optIn`) that writes to `.ollama_copilot_telemetry.jsonl`.
- First-run telemetry consent prompt.
- Settings migration/versioning framework (`runSettingsMigrations`).
- Status bar one-click open button for chat.

### Improved
- Webview markdown experience with better code block emphasis.
- Prompt templates for review and infra/devops workflows.
- End-to-end product flow (onboarding + legacy upgrade + cloud helpers).
- Testability by extracting action rules into `src/actionRules.ts`.

### Fixed
- Legacy upgrade prompt repeat behavior (now persisted).
- Cloud onboarding timing bug when cloud endpoint is not configured.
- Activity bar icon compatibility (using `media/icon.svg`).
- Action validation consistency between Webview and Chat Participant.

### Quality
- `yarn compile` passing.
- `yarn test` passing.

## v2.2.0 - Super Chat Plus

### Added
- New modes: `devds`, `devops`, and `infra`.
- PowerShell-focused DevOps/Infra actions (`infra_ps`, `infra_ci`, `infra_iac`, `infra_obs`, `infra_secops`, `infra_runbook`).
- Slash command `/status` to inspect session state.
- Action validation by mode for Webview and Super Chat.
- Cloud helper commands in Command Palette (`ollamaCopilot.openCloudKeys`, `ollamaCopilot.setCloudApiKey`).
- Webview retry button for last request.
- Basic markdown rendering in Webview messages.

### Improved
- Structured output templates for:
  - code/devds reviews (findings/risk/next steps).
  - infra/devops workflows (diagnosis/commands/verification/rollback).
- Safer handling when action does not match mode.
- Documentation updated for new modes and commands.

### Fixed
- Command contribution mismatch for cloud helpers.
- Broken/garbled UI text in several places.
- Context trim marker normalization (`/* ...trimmed... */`).

## v2.1.0 - Super Chat Edition

### Added
- Chat Participant integrated with VS Code Chat panel.
- Endpoint selection (Local Ollama or Cloud).
- Per-session model selection.
- Modes: Dev / Data Science / Power BI.
- Slash commands: `/provider`, `/mode`, `/context`, `/temp`, `/reset`.

### Improved
- Prompt builder per mode.
- Conversation history compaction.
- Model cache per endpoint.

### Fixed
- Participant name validation for VS Code Chat.
