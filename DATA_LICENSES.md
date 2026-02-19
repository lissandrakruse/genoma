# Data Licenses Registry

Last reviewed: 2026-02-19
Owner: Data Governance
Status: active

## Purpose

This registry tracks dataset licensing and usage constraints for international operation.
Every ingestion source must appear here before production use.

## Usage policy

1. No dataset can be promoted to production without a completed entry.
2. Each entry must include license, attribution, and allowed use.
3. If a source has mixed licensing, use the most restrictive effective rule.
4. Clinical or personal data must also pass privacy controls (GDPR, LGPD, HIPAA as applicable).

## Sources

| Source | Scope | License/Terms | Commercial Use | Attribution Required | Redistribution | Last Checked | Notes |
|---|---|---|---|---|---|---|---|
| Ensembl | Genes, transcripts, variants | Ensembl disclaimer / terms | Yes (generally) | Recommended | Check third-party subsets | 2026-02-19 | Validate downstream third-party annotations per release. |
| NCBI / ClinVar | Clinical variants, references | NCBI data policy; ClinVar publicly accessible | Yes (generally) | Recommended | Check third-party content flags | 2026-02-19 | Some content may carry independent third-party rights. |
| gnomAD | Population allele frequencies | Open access (dataset/channel-specific terms) | Yes (generally) | Recommended | Usually yes for derived summaries | 2026-02-19 | Confirm terms per distribution channel and release. |
| UniProt | Protein knowledgebase | CC BY 4.0 | Yes | Yes (required) | Yes under CC BY | 2026-02-19 | Attribution text must be shown in reports and exports. |
| Open Targets | Target-disease evidence | CC0 1.0 (data), Apache 2.0 (code) | Yes | Not required (recommended) | Yes | 2026-02-19 | Track upstream source constraints referenced by platform. |

## Required metadata fields per ingestion

- `source_id`
- `dataset_name`
- `dataset_version`
- `release_date`
- `license_id`
- `terms_url`
- `allowed_use`
- `attribution_text`
- `redistribution_allowed`
- `contains_personal_data`
- `compliance_reviewed_at`
- `compliance_owner`

## Mandatory checks before release

1. License review completed and dated.
2. Attribution text present for all CC BY or equivalent datasets.
3. Redistribution status explicitly set.
4. Privacy impact assessed for any personal/clinical data.
5. Source URLs and versions frozen in release notes.
