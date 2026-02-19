# Ollama Copilot Dev+DS

Local-first AI assistant for VS Code with an engineering governance layer for safe AI-driven code changes.

Apply AI-generated changes with policy enforcement and audit trail.

- Super Chat in VS Code Chat panel
- Premium side Webview chat UI
- Local Ollama + cloud Ollama-compatible endpoints
- Multi-domain modes: Dev, Data Science, Dev+DS, DevOps/Infra, Power BI
- Policy, trust, approval, custody, and governance heatmap workflows

## Language Versions

- Portuguese (Brazil): `README.pt-BR.md`
- Hindi: `README.hi.md`

## Why This Extension

Most assistants stop at "generate code".
This extension goes further: it helps teams govern AI code changes with policy controls, auditability, and measurable outcomes.

## What's New (v4.x)

- Policy-as-code with `extends`, `imports`, and `profiles` (`strict`, `balanced`, `experimental`)
- Domain-aware risk and trust scoring
- Dual approval for high-risk overrides
- Tamper-evident chain-of-custody (HMAC + hash chain)
- Optional Git provenance (branch/commit metadata with `chainId` + `sourceHash`)
- Governance heatmap by domain in Webview
- Governance experiment metrics CLI (`yarn run eval:governance`)

## Release Highlights (4.1.0)

- Policy Imports for reusable governance modules via `imports` in `.ollama_policies.json`
- Expanded Governance Heatmap with domain-level rollback/validation/block/override rates
- Top triggered rule per domain + clickable domain rows for governance prompt drafting

## Open Super Chat

1. Open `View -> Chat`
2. Type `@ollama-cloud-chat`
3. Run `/provider` to select endpoint + model

## Commands

| Command | Description |
|---|---|
| `/help` | Show available commands |
| `/ollama-cloud-chat` or `/ollama` | Lock session to local Ollama endpoint |
| `/endpoint local` | Lock session to local endpoint |
| `/endpoint cloud` | Lock session to cloud endpoint |
| `/login` or `/ollama.com` | Open Ollama Cloud login in browser |
| `/token` or `/apikey` | Open input box to paste Ollama Cloud API key |
| `/provider` or `/endpoint` | Select endpoint + model |
| `/mode code` | Software engineering mode |
| `/mode ds` | Data science mode |
| `/mode devds` | Hybrid developer + data science mode |
| `/mode devops` | DevOps mode (PowerShell-first) |
| `/mode infra` | Infrastructure mode (PowerShell-first) |
| `/mode pbi` | Power BI mode |
| `/action <name>` | Set action (validated by current mode) |
| `/context file` | Use file snippet around cursor |
| `/context workspace` | Use multi-file context from workspace/folder |
| `/context selection` | Use selected text |
| `/context off` | No editor context |
| `/temp 0.3` | Set temperature (`0..2`) |
| `/status` | Show current session state |
| `/reset` | Reset current session state |

## Modes

- `code`: explain, refactor, tests, fix, review, security
- `ds`: eda, sql, features, train_eval, debug, doc
- `devds`: end-to-end software + data workflow
- `devops` / `infra`: PowerShell-first operations guidance
- `pbi`: pbi_model, pbi_m, pbi_dax, pbi_visuals, pbi_checks

## Premium Webview Features

- Presets for common workflows
- Quick Prompts chips (one-click task starters)
- Favorites with search
- Markdown rendering (code blocks, links, lists)
- Message-level actions: Copy / Apply / Favorite / Reuse
- Retry button for last request
- Provider/model/mode/action/context controls
- `Setup Rapido` section: `Usar Local`, `Conectar Cloud`, `Escolher Modelo Local`, `Testar Ollama Local`
- One-click Local/Cloud switch with clearer visibility
- Cloud-selected UI shows inline Login and Set Token actions
- Local runtime health in panel (`online/offline` + model count)
- If Cloud is selected without token, chat auto-falls back to Local Ollama

## Governance Layer

- Policy guardrails before apply (`.ollama_policies.json`)
- Domain-level enforcement and explainability
- Trust-based gating from observed behavior
- Override audit with justification + optional dual approval
- Tamper-evident custody trail:
  - `.ollama_copilot_apply_chain.jsonl`
  - `chainId`, signatures, `prevHash`, `entryHash`
- Optional Git provenance for repository-level evidence
- Domain heatmap for operational tuning

## Key Settings (Governance)

- `ollamaCopilot.policyEnabled`
- `ollamaCopilot.policyFile`
- `ollamaCopilot.policyProfile`
- `ollamaCopilot.policyRiskThreshold`
- `ollamaCopilot.policyTrustEnabled`
- `ollamaCopilot.policyDualApprovalEnabled`
- `ollamaCopilot.policyCustodySigningEnabled`
- `ollamaCopilot.policyGitProvenanceEnabled`

## Cloud + Onboarding

- First-run guided onboarding for Ollama Cloud login + API keys
- First run auto-opens Ollama Copilot sidebar after install
- Commands in Command Palette:
  - `Ollama Copilot: Open Ollama Cloud Signup / Keys`
  - `Ollama Copilot: Open Cloud API Keys`
  - `Ollama Copilot: Set Cloud API Key`

## Reliability & Product Quality

- Action validation by mode (Webview + Super Chat)
- Structured output templates for review/devops workflows
- Legacy extension upgrade prompt (optional uninstall)
- Settings migration/versioning support
- Optional local telemetry (opt-in): `.ollama_copilot_telemetry.jsonl`
- Optional audit log: `.ollama_copilot_log.jsonl`

## International Readiness

- International compliance baseline: `docs/INTERNATIONAL_COMPLIANCE.md`
- Data source license registry: `DATA_LICENSES.md`
- License metadata schema (for ingestion enforcement): `tools/compliance/data-license-entry.schema.json`

### Biomedical International Framework

- Designed for multi-jurisdiction biomedical projects with traceable governance workflows.
- Supports a federated data-core strategy across `Ensembl`, `NCBI/ClinVar`, `gnomAD`, `UniProt`, and `Open Targets`.
- Enforces per-source metadata for `license`, `dataset version`, `terms URL`, `attribution`, and `redistribution`.
- Provides an engineering baseline for `GDPR`, `LGPD`, and `HIPAA`-aligned operations.
- Keeps provenance-ready records for high-impact actions and dataset lineage.
- Includes release-gate documentation for compliance review and legal handoff.

Compliance and legal docs:
- `docs/INTERNATIONAL_COMPLIANCE.md`
- `DATA_LICENSES.md`
- `tools/compliance/data-license-entry.schema.json`

Note: this is an engineering compliance baseline, not legal advice.

## Governance Experiment

```bash
yarn run eval:governance --splitDate 2026-02-01T00:00:00Z --out governance-report.json
```

This produces domain-level metrics for:
- rollback rate
- validation success rate
- block/override rate
- baseline vs governed deltas

## Development

```bash
yarn compile
yarn test
```

## Local-first

Supports:
- Local Ollama (`http://localhost:11434`)
- Remote Ollama-compatible APIs
