# Architecture Expansion Governance V1

Status: **ACTIVE REPOSITORY GOVERNANCE RULE** for every future architecture
proposal in this repository.

This is a repository-local architecture governance rule, not an
industry-standard theorem. It exists because this repository's delivery value
depends on thin, verifiable boundaries: one Pi-owned Agent Runtime, Node-owned
authority, a governed evidence path, and evaluation gates whose thresholds stay
in their evaluators. A new architectural seam must pay for itself in removed or
isolated complexity before it is justified.

## 1. The six questions

Every future architecture proposal must answer all six questions in writing
before implementation is authorized. An unanswered question is a rejection
reason, not a detail to fill in later.

1. **ADDITION CASE** — Which observed failure, badcase, regression, or
   governance finding requires this new boundary? Name the recorded evidence.
   An anticipated-but-unobserved problem is not sufficient.
2. **EXISTING-BOUNDARY CASE** — Why cannot the existing contracts absorb the
   requirement? Existing seams include the AgentProfile layer, Safety
   precedence, Evidence Governance, tenant/store authority, the
   `RetrievalService` boundary, and the existing evaluation gates. A proposal
   that has not asked the existing boundaries to solve the problem first is
   premature.
3. **ABLATION CASE** — When the proposed component is disabled or removed,
   which measured, testable property degrades? A component whose ablation
   changes no governed metric is dead weight and must not be added.
4. **FAILURE CASE** — When the new component itself fails, which core paths
   still run? Failure of an added seam must not take down Safety precedence,
   the durable PostgreSQL business boundary, or the deterministic CI/Docker
   delivery proof.
5. **COMPLEXITY CASE** — What new state, coordination, test-matrix surface,
   and deployment/operational burden does the proposal introduce? Count them
   explicitly; uncounted complexity is understated complexity.
6. **MEASUREMENT CASE** — Which existing metric or Harness result demonstrates
   that the new architecture improves the system? A measurement plan that
   requires building its own evaluator first is an expansion proposal in
   disguise.

## 2. Core principle

A new architecture boundary is justified only when the complexity it removes
or isolates is greater than the complexity it introduces. When the two sides
cannot be separated with existing evidence, the tie resolves against the new
boundary: the repository keeps the thinner system.

## 3. Existing measurement sources for MEASUREMENT CASE

Proposals should cite existing governed measurements rather than inventing new
scoring:

- `evals/governance/manifest.ts` — the descriptive index of every governed
  metric/invariant, its authoritative evaluator, and its gate behavior.
- `evals/regression/matrix.ts` — the deterministic side-plane aggregator that
  compares current reports against tracked baselines row by row, with no
  blended overall score.
- Report-only MRR and difficulty breakdown in `src/retrieval-eval.ts` —
  reported values for retrieval diagnosis, with no acceptance threshold.

These sources report existing gates; citing them is measurement reuse, not new
claim creation.

## 4. Scope and non-goals

- This rule governs architecture proposals: new boundaries, components,
  processes, or cross-cutting state. It does not replace bugfix workflow or
  the frozen sprint claim boundaries recorded in
  [Job-Ready Current State](CURRENT_STATE.md).
- This rule grants no authority by itself: every proposal still needs explicit
  successor authorization before implementation.
- Historical deferrals and closed-phase evidence are immutable inputs to these
  questions, not material to be rewritten by a proposal.
