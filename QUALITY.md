# Quality Guarantee

This project enforces software quality on every release with an engineering-first workflow.

## Workflow

1. Generate proposal/patch from chat.
2. Preview and select files/hunks to apply.
3. Apply or rollback safely.
4. Run validation (`Apply + Validate` or CI gate).

## Safety

- Multi-file apply uses explicit selection and confirmation.
- `Undo Apply` restores the last applied multi-file snapshot.
- Post-apply actions include quick review in Source Control.

## Quality Gates

- Type checks: `yarn run check-types`
- Lint: `yarn run lint`
- Unit tests: `yarn run test`
- Prompt quality checks:
  - `yarn run eval:quality`
  - `yarn run eval:cases`
  - `yarn run eval:golden`

Combined gate:

```bash
yarn run ci:quality
```

## Evals

- `tools/eval-quality.mjs`: structural safeguards.
- `tools/eval-real-cases.mjs`: realistic scenario checks.
- `tools/eval-golden.mjs`: golden baseline checks.
- `tools/capture-golden-from-log.mjs`: capture anonymized candidates from local logs.
- `tools/eval-governance.mjs`: governance experiment metrics (rollback/validation/block/override by domain).

## Governance Experiment

Generate domain metrics from custody chain:

```bash
yarn run eval:governance
```

Baseline vs governed using split date:

```bash
yarn run eval:governance --splitDate 2026-02-01T00:00:00Z --out governance-report.json
```

Custom windows:

```bash
yarn run eval:governance --fromBaseline 2026-01-01 --toBaseline 2026-01-31 --fromGoverned 2026-02-01 --toGoverned 2026-02-28 --out governance-report.json
```
