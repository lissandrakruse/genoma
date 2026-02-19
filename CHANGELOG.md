# Changelog

All notable changes to this extension are documented here.

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
