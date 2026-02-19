# International Compliance Baseline

Last updated: 2026-02-19

## Scope

This baseline defines minimum legal and operational controls for international biomedical tooling.
It applies to data ingestion, processing, model usage, reporting, and exports.

## Regulatory posture

- `GDPR`: required when processing data related to people in the EU/EEA.
- `LGPD`: required for personal data processing in Brazil.
- `HIPAA`: required when handling protected health information in the United States in covered contexts.

## Core principles

1. Data minimization: collect only what is needed for defined biomedical objectives.
2. Purpose limitation: do not reuse clinical data outside declared lawful purpose.
3. Traceability: keep immutable source, version, and transformation lineage.
4. Access control: enforce least privilege and role-based access.
5. Security by default: encryption at rest/in transit and auditable secrets handling.

## Operational controls

1. Licensing
- Every external source must be registered in `DATA_LICENSES.md`.
- Ingestion must fail if required license metadata is missing.

2. Privacy
- Pseudonymize direct identifiers before analytics workflows.
- Keep re-identification keys isolated with stricter access policy.
- Retention and deletion windows must be explicit per dataset class.

3. Provenance
- Store `source_id`, `dataset_version`, `release_date`, and `ingested_at` for all records.
- Preserve evidence links for clinically relevant outputs.

4. Cross-border data handling
- Define data residency by tenant or workspace.
- Block exports to regions not approved by policy.
- Log transfer purpose and legal basis for cross-region movement.

5. Auditability
- Every high-impact action must be attributable (who, what, when, why).
- Keep append-only audit trails for compliance investigations.

## Release gate checklist

1. Data source licenses reviewed within last 90 days.
2. Privacy impact assessment completed for sensitive workflows.
3. Regional policy checks enabled for export and sharing.
4. Attribution footer present in reports where required.
5. Compliance owner signoff captured in release record.

## Incident response minimum

1. Identify affected data domains and jurisdictions.
2. Freeze high-risk pipelines while triaging blast radius.
3. Notify legal/compliance contacts by severity runbook.
4. Keep forensic-grade evidence records for postmortem.

## Not legal advice

This document is an engineering control baseline.
Formal legal interpretation must be validated by qualified counsel for each deployment jurisdiction.
