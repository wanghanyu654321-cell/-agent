# V2.1 provenance metadata and narrow interpretation

## Mechanical result remains immutable

The V2.1 first-exposure Gate remains **FAILED**. Its 48-call journal and frozen case bytes are not edited: `holdout-v2.1-23/primary` and `holdout-v2.1-23/reversed` both selected `HO2-MT-MGMT-VALID-COUPON` where the frozen contract expected `ABSTAIN`.

## Independent interpretation does not rewrite that result

The V2.1-23 gold contract is disputed. The selected evidence says a merchant should fulfil the promised service **or** reach a reasonable solution. That text can directly support the answer that the rule does not prescribe one uniquely mandatory solution. Accordingly, the historical V2.1 mechanical failure alone does **not** establish a semantic-capability failure.

This is an interpretation of the boundary, not a revision of any historical score, gold, trace, report, prompt, or selector. The V2.1 Gate is still formally failed and no retry or tuning is authorized.

## Timestamp metadata defect

`holdout-v2.1/holdout-freeze-manifest.json` has a `createdAt` value later than the real attempt manifest timestamp, even though Git proves freeze commit `1c0ebd44128a32a98cc3ed1fca915fcd88a2e764` precedes evaluation commit `37ccec0954c04536362daf20a559473808abf6d6`.

For future chronology claims, authority order is:

1. Git commit graph;
2. immutable commit SHA; then
3. attempt-manifest `sourceCommit` / `holdoutFrozenCommit` fields.

Historical `createdAt` alone is not reliable ordering evidence.
