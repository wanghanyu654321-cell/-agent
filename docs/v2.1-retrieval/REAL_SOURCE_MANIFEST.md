# V2.1 Source Manifest

## Historical checkpoint

| Classification | Count | Evidence |
| --- | ---: | --- |
| `REAL_SOURCE` | 0 at `6d92603` | No private user-supplied or user-designated authoritative business document existed at the original checkpoint. |
| `SYNTHETIC_FIXTURE` | Existing test material only | `knowledge/fixtures/`, `knowledge/safety/fixtures/`, and evaluation fixtures explicitly declare test-only status. |
| `UNKNOWN_AUTHORITY` | Excluded | Product skills, prior reports, and the read-only Pi source are not authoritative sources for business facts. |

The workspace was enumerated without scanning outside the task workspace or treating any repository file as a business-policy source. No raw source content, customer record, internal manual, price sheet, or identifier is included in this manifest.

## Public benchmark sources (retrieved 2026-08-29)

| ID | Role | Publisher / title | Published | SHA-256 of retrieved page | Categories |
| --- | --- | --- | --- | --- | --- |
| MT-TERMS-2026 | `PUBLIC_OFFICIAL_AUTHORITY` | Meituan Rules Center, Meituan Group-buy User Service Terms | 2026-04-23 | `02f522b2fe0529e8f6ce27f9fb453d119a119d65e5b9b04b851bbdf3710f6c03` | voucher use, refund, after-sales |
| MT-GUARANTEE-2026 | `PUBLIC_OFFICIAL_AUTHORITY` | Meituan Rules Center, Meituan Group-buy Service Guarantee | 2026-01-01 | `45bc155cf6519bf9f77a33fcafdb63aff90cefe4b53a0123cd12f397ada13180` | unconsumed and expired voucher refund |
| MT-FULFILLMENT-2026 | `PUBLIC_OFFICIAL_AUTHORITY` | Meituan Rules Center, In-store Merchant Fulfillment Guarantee | 2026-08-20 | `6c847818f17db6bcb665bb1defc425b62221b9df865e009961803ce2c260185d` | reservation and merchant fulfillment |
| DP-HELP-UNCONSUMED | `PUBLIC_OFFICIAL_AUTHORITY` | Dianping official help, KTV/entertainment/beauty | date not displayed | `6e5f79ab8e8efc24961517046ff59c70976397c1154b8224abc3f7eb7cb22b6f` | unverified voucher help |
| PC-001 | `PUBLIC_REAL_CASE` | Black Cat Complaint aggregate listing | retrieved 2026-08-29 | not retained | de-identified query wording only; never factual authority |

The repository retains only atomic facts and source references in `knowledge/public-benchmark/approved/`; full source pages remain ignored local retrieval evidence. `SYNTHETIC_QUERY` records are labelled as augmentation and cannot authorize a fact.

For each future `REAL_SOURCE`, record a stable source ID, source type/reference, SHA-256 content hash, available source date/version, approval reference, scope, and a public-safe statement of whether release is authorized. Keep raw content private.
