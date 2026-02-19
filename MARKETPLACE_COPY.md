# Marketplace Copy Kit

## Title Suggestion
Ollama Copilot Dev+DS - AI Change Governance Layer for VS Code

## Short Description Suggestion
Local-first AI assistant with policy guardrails, domain trust, dual approval, tamper-evident custody, Git provenance, and governance heatmap.

## Long Description
Ollama Copilot Dev+DS is a local-first AI assistant for VS Code built for real engineering workflows and governed AI code changes.

It combines:
- Super Chat inside the native VS Code Chat panel.
- A premium side Webview optimized for day-to-day delivery.
- Multi-endpoint support (local Ollama and optional cloud endpoints).
- A governance layer for safe, auditable AI-driven change operations.

### Why teams choose it
- Local-first execution by default.
- Optional cloud usage when needed.
- Mode-aware prompts (code, ds, devds, devops, infra, pbi).
- Action validation by mode to reduce misuse.
- Token-aware context control for predictable requests.
- Adaptive fallback from quality-first to faster local models after repeated failures.

### Governance layer highlights
- Policy-as-code (`.ollama_policies.json`) with:
  - `extends`
  - `imports`
  - `profiles` (`strict`, `balanced`, `experimental`)
- Domain-aware risk and trust scoring.
- High-risk override controls with justification and optional dual approval.
- Tamper-evident custody trail (HMAC + hash chain).
- Optional Git provenance (branch + commit metadata with `chainId` and `sourceHash`).
- Governance heatmap by domain (rollback, validation, block/override, top rule).

### Research and enterprise fit
- Built for AI change governance, not only AI generation.
- Provides measurable quality and governance outcomes by domain.
- Supports empirical evaluation pipelines (`yarn run eval:governance`).
- Suitable for restricted or audit-heavy environments (government, legal, forensic workflows).

## Suggested Keywords
ollama, local ai, vscode ai, ai assistant, copilot, code review, refactor, test generation, devops, infrastructure, powershell, data science, power bi, audit, governance, compliance, on-prem, secure ai, change governance

## Screenshot Captions
1. `Super Chat in VS Code Chat`: "Use @ollama-cloud-chat with provider/model controls and slash commands for engineering tasks."
2. `Governed Apply Workflow`: "Policy guardrails and risk-aware apply flow before workspace writes."
3. `Custody + Provenance`: "Tamper-evident chain-of-custody with optional Git provenance evidence."
4. `Governance Heatmap`: "Domain-level rollback/validation/block/override visibility for policy tuning."
5. `Premium Side Panel`: "Model, mode, context, apply/rollback/validate, and governance controls in one panel."

## Marketplace Readiness Checklist
- README top section reflects latest release highlights.
- CHANGELOG includes latest version at top with Added/Improved/Quality.
- Icon and branding files present (`media/icon.png`, `media/icon.svg`).
- `package.json` version, commands, keywords, categories, and repository links validated.
- `yarn run ci:quality` green before publishing.
