# V2.3 Benchmark Contract Audit V2

Audit V2 replaces Audit V1 as the consistency-reviewed benchmark interpretation. It is deterministic and offline: the explicit 50-case findings do not import or inspect Recovery-2 traces. The complete record is [benchmark-contract-audit-v2.json](../../evals/selection/semantic/reports/benchmark-contract-audit-v2.json).

The frozen rubric is direct + sufficient: SUPPORTED means the evidence itself contains enough factual/action content; PARTIAL means a material requested fact/action is absent; UNSUPPORTED means no material grounding exists. Every case has an explicit intent, evidence fact, directness, sufficiency, classification, unsupported-inference flag, and case-specific reason. There is no default-SUPPORTED path.

| Classification | Count | Rate |
| --- | ---: | ---: |
| SUPPORTED | 37 | 74% |
| PARTIAL | 13 | 26% |
| UNSUPPORTED | 0 | 0% |

PARTIAL: `public-04, public-23, public-26, public-28, public-29, public-36, public-37, public-38, public-39, public-40, public-41, public-42, public-44`.

Compared with V1, `public-36` through `public-40` are now PARTIAL because their `怎么办` queries request a remedy while the reservation evidence only classifies a non-reception scenario; it supplies no customer action. `public-43` is now SUPPORTED because its factual-status intent is directly answered by the notice/unavailable-time obligation. `public-26` and `public-29` remain PARTIAL: “按页面展示的退款机制处理” identifies a governing mechanism but does not state an application procedure.

Recovery-2 is joined only after this freeze. Of its 44 traces, the 36 traces for SUPPORTED multi-candidate cases are correct with no wrong selection or abstention. The 8 traces for PARTIAL cases have 3 selections, 5 abstentions, and no wrong-evidence selection. This is diagnostic only.

**BENCHMARK CONTRACT PARTIALLY VALID.** The V2 explicit evidence shows a material topical-relevance versus sufficient-answer mismatch. The immutable Recovery-2 Gate remains **FAILED**, is not recalculated, and does not alone adjudicate semantic-selector capability. No tuning, rerun, runtime integration, tag, or release is authorized.
