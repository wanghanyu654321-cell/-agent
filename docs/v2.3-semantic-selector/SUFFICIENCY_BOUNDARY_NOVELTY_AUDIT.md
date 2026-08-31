# Sufficiency Boundary Holdout V2.2 novelty audit

The 12 primary queries were authored after the V2.1 result and are checked as exact-string non-collisions against the public benchmark, Holdout V1, Holdout V2, and Holdout V2.1. They also use only new `H22-` holdout-only evidence IDs, so no V2.1 candidate combination can recur.

| Scope | Result |
| --- | --- |
| New official propositions | 12 (within required 8–12) |
| Evidence record source | Meituan Rules Center, first party only |
| Runtime/public-corpus admission | 0 / 0 |
| Primary cases | 12 uniquely worded queries |
| Group A / Group B | 4 direct non-uniqueness SELECT / 8 true insufficiency ABSTAIN |
| Candidate use per proposition | exactly 2 or fewer |
| Exact historical query collision | 0 |
| Exact V2.1 candidate-combination reuse | 0 |

The semantic distinction is also covered by the deterministic fixture: evidence stating `A 或 B 都可以` must be selected for a unique-option question, while `应及时完成` must be abstained for a numeric-deadline question.
