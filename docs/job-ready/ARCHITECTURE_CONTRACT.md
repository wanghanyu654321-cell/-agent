# Job-Ready Architecture Contract V1

Status: **TASK 0 CONTRACT CANDIDATE — PENDING INDEPENDENT CONTRACT GATE**.

This document freezes proposed successor interfaces for review, not implemented capabilities or permission to start parallel work. Sections marked **CONTRACT GAP** cannot be implemented by choosing an unstated default. No product evaluation or external-provider execution is authorized here.

## 1. Provenance, purpose and reading boundary

- Repository: `wanghanyu654321-cell/-agent`.
- Exact inspected governance baseline: `7ae63a372773f0d9b5e4a8f10d832fe8460ec4d1`, branch `job-ready/governance-baseline-v1`.
- Its exact parent: `e315073bfdc0de980d7689193bf88d62766e02d5`.
- Task-0 branch: `job-ready/task0-architecture-contract-v1`.
- Authority: [AGENTS.md](../../AGENTS.md), [Job-Ready state](CURRENT_STATE.md), [parallel directive](JOB_READY_PARALLEL_EXECUTION_DIRECTIVE.md). Historical phase descriptions are implementation/provenance evidence, not permission for successor work.

Primary objective: the smallest credible AI Application Engineer / FDE delivery proof. Secondary objective: a thin Enterprise WeChat text front desk for 1–5 person beauty stores. Neither objective authorizes a SaaS platform or production/customer-deployment claim.

The following inspected implementation anchors govern reuse. “Existing” below means code at the baseline, not a new test run by Task 0.

| Boundary | Existing implementation and applicable evidence | Consequence for successor |
| --- | --- | --- |
| Runtime | `src/index.ts`; `tests/support-agent-runtime.test.ts`, `tests/bounded-runtime-evidence-routing.test.ts`, `tests/governed-grounding-runtime.test.ts`, `tests/business-persistence-port.test.ts` | Reuse `SupportAgentRuntime`, Pi Agent, four tools, cancellation and durable ports. No second loop. |
| Safety / FAQ / knowledge | `src/safety.ts`, `src/knowledge.ts`; `tests/safety-runtime.test.ts`, `tests/faq-admission.test.ts`, `tests/governed-knowledge.test.ts`; `docs/v1-safety/KNOWLEDGE_CONTRACT.md`, `docs/v2.0-knowledge/RETRIEVAL_CONTRACT.md`, `docs/v2.0.1-faq/FAQ_ADMISSION_CONTRACT.md` | Safety is separate from ordinary evidence; FAQ admission is not an exception to governance. |
| Identity | `src/enterprise/auth.ts`, `identity.ts`; `tests/enterprise-identity.test.ts`; enterprise identity, execution-context and tool-capability contracts | Cookie resolves a user with exactly one membership. There is no customer role or channel identity implementation. |
| Business / database | `src/enterprise/business.ts`, `postgres.ts`; migrations `001_enterprise_identity.sql`, `002_support_business_persistence.sql`; `tests/enterprise-support-service.test.ts`, `tests/postgres-business.integration.test.ts` | Existing scoped Conversation/Ticket/Handoff/Audit and migration ledger remain authoritative. |
| Application / provider / private corpus | `src/enterprise/application.ts`, `pi-runtime.ts`, `private-knowledge.ts`, `src/private-corpus.ts`; `tests/enterprise-application.integration.test.ts`, `tests/enterprise-private-knowledge.test.ts` | Explicit private/real opt-in, Pi `ModelRuntime` public API, strict single-scope private loader; no silent demo fallback. |
| HTTP / UI | `src/enterprise/http-api.ts`, `src/http-api.ts`, `web/src/App.tsx`, `session.ts`, `support.ts`, `business.ts`, `audit.tsx` | Enterprise same-origin auth/API is the ingress, not the legacy portfolio HTTP adapter. Public projections exclude raw events and audit payload. |
| Delivery / proof | `README.md`, `Dockerfile`, `compose.yaml`, `.github/workflows/customer-support-agent-gate.yml`; `tests/real-source-runtime-smoke.test.ts`; `docs/portfolio/REAL_SOURCE_RUNTIME_PROOF_V1.md`, `REAL_SOURCE_RUNTIME_BADCASE_001.md`, `PILOT_PRIVATE_STORE_KNOWLEDGE_DIRECTIVE.md` | Current stack has Node + PostgreSQL only. Existing durable proof and historical failures stay immutable. |

### Existing facts that must not be overstated

1. PostgreSQL stores business records and a Pi session reference, not full Pi conversation recovery. Pi SessionManager owns JSONL/message state; enterprise default composition does not configure persistent Pi session storage.
2. `toolsCalled` includes attempted/failed calls; it does not establish durable Ticket/Handoff success.
3. Runtime `grounding.evidence` can describe an intermediate lookup even when final output is fallback. `knowledgeRouting.authorizedEvidenceIds` is computed from final result evidence. Do not present intermediate grounding as final authorization.
4. Private FAQ entries take the FAQ path; policy/sop/reference take ordinary retrieval. Current FAQ selection admits before exposing content. Current ordinary routing authorizes exactly one admitted entry, not a Top-1 choice among several.
5. Existing identity capabilities are `agent:invoke`, `conversation:read`, `ticket:create`, `handoff:create`, `audit:read`. No StoreOps capabilities or endpoints exist yet.
6. PR #9 Evidence Durability is approved; Real-Source Runtime Proof V1 is **REJECTED**. The recorded three attempts, zero retries and failed A/B results are not rewritten by this contract.

## 2. Bounded system topology

```text
WeCom text callback                       React operations console
        |                                          |
verified channel adapter                 same-origin cookie session
        +------------------+-----------------------+
                           v
                 Node Enterprise Application
      identity / membership / scope / RBAC / deterministic workflow
             |                  |                    |
       thin StoreOps       existing Pi Agent     RetrievalService
             |             four existing tools       |
             |                  |               FastAPI retrieval
             |             Node admission <---- candidate evidence
             +------------------+--------------------+
                                v
               PostgreSQL business + derived pgvector index
```

Pi alone owns Agent execution, provider/model completion, tool dispatch foundation, Skills and session mechanics. Node alone grants authority, admits evidence, decides answerability/Safety and confirms business transitions. FastAPI owns chunking/embedding/search only. React and WeCom are clients, not authority sources.

Hosted target, only after later authorization: HTTPS/Nginx on Linux → Node; private Compose network → FastAPI and PostgreSQL+pgvector. FastAPI and PostgreSQL are not public ingress. Preserve deterministic CI/default Docker proof; `pi-real` stays explicit. Pi packages stay exact `0.84.3`. Product model/provider is not changed by Task 0.

No voice, full CRM/member/prepaid/cashier/inventory/marketing, workforce/room/bed/device scheduling, full booking engine, Meituan/Douyin API, Multi-Agent, MCP, Redis/Kafka/Kubernetes, GraphRAG, agentic retrieval, reranker or new Agent tools.

## 3. Shared value and authority conventions

All new DTOs below are `job-ready-v1` contracts. Required fields are required; only `?` fields may be omitted. Unknown fields are rejected on new write requests. IDs are opaque nonempty strings, never authority. Times are UTC RFC3339 instants unless explicitly a local `YYYY-MM-DD` date or `HH:mm` interval. Versions are positive integers for mutable business rows, immutable nonempty strings for knowledge. Hashes are lowercase SHA-256 of UTF-8 bytes. Errors never include SQL, paths, secrets or upstream messages.

`Scope = { tenantId: string; storeId: string }` comes exclusively from `SupportExecutionContext.scope`. Browser writes must omit scope, role, capabilities, permissions and `mayEscalate`. Node verifies referenced objects within that scope; foreign and absent IDs both return `not_found`. New service methods receive `context` separately from the DTO, and enforce capabilities themselves, not only in HTTP.

Reuse the three existing roles. The following **additive, code-owned** capability mapping is proposed for this successor only; it cannot change existing five permissions or introduce editable roles:

| New capability | agent | supervisor | admin | Scope |
| --- | --- | --- | --- | --- |
| `storeops:read` | yes | yes | yes | Own tenant/store operations projections |
| `availability:write` | no | yes | yes | Human-maintained staff availability |
| `booking-intent:create` | yes | yes | yes | Pending intent only |
| `booking-intent:manage` | no | yes | yes | Confirm, propose alternative, cancel |

An agent may cancel only an intent they created that is still `pending_confirmation`; this is an ownership-limited use of `booking-intent:create`, not general management. Knowledge ingestion and ChannelBinding provisioning remain trusted operator operations, not new public/admin CRUD UIs. Existing `audit:read` remains admin-only. Supervisor StoreOps access must not reveal raw Audit payloads.

User-supplied text, including extracted service/time/staff suggestions, is untrusted data. For this thin increment, humans submit/confirm structured StoreOps forms; no new booking tool is added to Pi. Any later LLM extraction can populate a proposal only and must not cause an automatic StoreOps write.

## 4. StoreOps domain and database contract

### 4.1 Reused persistence and migration rules

Reuse `users`, `tenants`, `stores`, `memberships`, `conversations`, `tickets`, `handoffs`, `audit_events`, `auth_sessions` and `enterprise_schema_migrations`. Do not rewrite 001/002. New SQL is applied once through the existing single-client transaction/ledger mechanism; failed SQL rolls back without an applied marker. No ORM/framework. Schema migrations use an owner connection, not the limited FastAPI account.

Every new scoped row has a composite FK to `stores(id, tenant_id)`. New conversation links use `(conversation_id, tenant_id, store_id)` → existing `conversations(id, tenant_id, store_id)`. Add only the parent composite unique keys needed below, in successor migrations; no destructive constraint recreation. Deletes of referenced identities/conversations are restricted, not cascading across business history. All authorization and mutation occur in one Node service transaction where a race can invalidate the decision.

### 4.2 ChannelBinding — new table required

`channel_bindings` purpose: approved external identity mapping, not a token store.

Columns: `id text PK`, `tenant_id text`, `store_id text`, `corp_id text`, `application_id text`, `external_subject_id text`, `membership_id text`, `status text CHECK(active|disabled)`, `version integer CHECK(>0)`, `created_at timestamptz`, `updated_at timestamptz`. All non-null.

- UNIQUE `(corp_id, application_id, external_subject_id)` prevents one external identity selecting multiple tenants. `application_id` is a namespaced adapter identity after GAP-01 is resolved, not a browser choice.
- Add UNIQUE `(id, tenant_id, store_id)` to memberships; binding composite FK `(membership_id,tenant_id,store_id)` enforces membership ownership. No copied role/capabilities in this table.
- UNIQUE `(id,tenant_id,store_id)` on bindings supports scoped inbound/intent references; index `(tenant_id,store_id,status)`.
- Trusted operator provisions after verifying both external subject and existing membership. Re-provision identical key/membership is a no-op; mismatching ownership is a conflict, never upsert-to-another-user. Disable by version compare-and-swap; no deletion/rebinding that reattributes history in this sprint.
- Node channel adapter reads only after verified ingress, checks active, loads user and current membership, and rechecks exactly-one-membership rule before calling `createSupportExecutionContext`. Missing/disabled/multiple membership fails closed. Cached role/scope is forbidden.
- GAP-01/GAP-02 block actual channel identity provisioning; an external consumer must not automatically become an `agent`.

### 4.3 DailyAvailability — new table required

`daily_availability` columns: `id text PK`, `tenant_id text`, `store_id text`, `staff_membership_id text`, `local_date date`, `time_zone text`, `windows jsonb`, `status text CHECK(published|withdrawn)`, `source text CHECK(human)`, `version integer CHECK(>0)`, `updated_by_membership_id text`, `created_at timestamptz`, `updated_at timestamptz`. All non-null.

- Both membership references use the scoped composite FK defined above. UNIQUE `(tenant_id,store_id,staff_membership_id,local_date)` is the idempotent resource key and date-read index prefix.
- `windows` is exactly an array of `{start:"HH:mm",end:"HH:mm"}`; sorted, non-overlapping, half-open, same-day, maximum 24 intervals. An empty published array means explicitly no listed availability; a missing/withdrawn row means **unknown**, not unavailable. Node validates IANA timezone, real date, interval syntax/order before SQL; DB checks JSON array, allowed status/source and version. No overnight intervals; represent them on two dates.
- One explicit operator-configured store timezone is used for all writes in a scope. Missing/invalid timezone blocks availability writes; never infer it from browser/system timezone. Store configuration is Node-owned deployment input, not a new shift/calendar engine.
- Supervisor/admin alone writes via `availability:write`; all scoped `storeops:read` users read. Staff reference is a same-scope membership, not a new staff directory. Selecting a staff target does not grant that staff member's authority.
- Create with `expectedVersion=0`; existing update requires exact version, increments once. Concurrent mismatches return 409. Identical GET/PUT retries cannot create a second resource; stale mutation returns conflict rather than silently overwriting newer state.
- Availability is advisory, never a capacity reservation or guarantee of service suitability. Confirmed intents do not automatically subtract intervals.

### 4.4 BookingIntent — new table required

`booking_intents` columns: `id text PK`, `tenant_id text`, `store_id text`, `conversation_id text`, `customer_id text`, `channel_binding_id text NULL`, `requested_service text`, `requested_start timestamptz NULL`, `requested_end timestamptz NULL`, `preferred_staff_membership_id text NULL`, `status text`, `alternative_start timestamptz NULL`, `alternative_end timestamptz NULL`, `confirmed_start timestamptz NULL`, `confirmed_end timestamptz NULL`, `created_by_membership_id text`, `updated_by_membership_id text`, `idempotency_key text`, `create_request_hash text`, `version integer`, `created_at timestamptz`, `updated_at timestamptz`. Other columns non-null.

- Status CHECK is exactly the four states below; version > 0; each paired start/end is both null or both present with end > start. Alternative times required in `alternative_proposed`; confirmed times required in `confirmed`. Confirmation writes its explicit interval to `confirmed_start/end` without overwriting the original request or alternative. Cancellation retains any previous confirmation interval as history, not an active booking. Service is bounded to 200 characters, customer reference to the existing opaque conversation customer, not a new CRM/person table.
- Existing conversation scope FK plus new parent UNIQUE `(id,tenant_id,store_id,customer_id)` supports FK including customer ownership. Node derives `customer_id` from the conversation, never rebinds it from request data. Optional binding and staff, and creator/updater, have scoped composite FKs. A channel-associated intent must reference the binding associated with that conversation's verified ingress.
- UNIQUE `(tenant_id,store_id,idempotency_key)`; index `(tenant_id,store_id,status,created_at,id)` for read order. Same key + same canonical create fields returns original row; same key + different fields returns 409. Creation hash includes conversation/service/time/staff/binding and derived creator. SQL uniqueness arbitrates concurrent inserts.
- Node-only writes; scoped `storeops:read` reads. GET order is newest created time, then ID. A channel message alone or LLM output cannot confirm an intent.

| From | Action → To | Authority and deterministic checks |
| --- | --- | --- |
| absent | create → `pending_confirmation` | Human `booking-intent:create`; existing owned conversation; optional requested times/staff validated |
| pending | confirm → `confirmed` | Human `booking-intent:manage`; explicit final start/end, valid same-scope staff if selected, current expected version |
| pending | propose alternative → `alternative_proposed` | Human `booking-intent:manage`; explicit alternative interval; does not confirm |
| alternative_proposed | confirm → `confirmed` | Human `booking-intent:manage` explicitly confirms stored alternative interval |
| pending / alternative_proposed / confirmed | cancel → `cancelled` | Human manager; or creator agent for their own pending intent only |
| cancelled | none | Terminal; create a new keyed intent for a new request |

No other transition, auto-confirmation or LLM-chosen status is accepted. No confirmed rescheduling workflow. Mutation requires `expectedVersion`, uses scoped `UPDATE ... WHERE version=... AND status=...`, increments once; repeat stale actions return `booking_intent_conflict` without side effects. A human confirmation records a decision, not payment, workforce conflict detection or an external booking-system reservation. Staff preference is not assigned staff or proof of professional suitability. Missing availability must be visibly unknown to the human, never inferred as a promise.

### 4.5 Needs Attention — reuse Handoff, no parallel queue table

Existing Handoff already durably deduplicates `(tenant_id,store_id,conversation_id)`; use it for actual handoffs. Ordinary handoff still requires `handoff:create`/existing Runtime guards. Mandatory qualified Safety escalation remains the existing separate path, including release of reservation after durable failure. Do not grant agents ordinary handoff permission to make a dashboard row appear.

Needs Attention is a read-only scoped projection of existing conversations plus latest `support-agent.audit` final outcome and existing handoff records. Include conversations whose latest completed outcome is fallback, or which have a durable handoff. Thus unknown/ambiguous/denied/exceptional unresolved requests are visible even when ordinary handoff was forbidden. An explicitly requested special-price exception without approved evidence remains unresolved; do not invent prices or infer a specific reason from fallback text.

No assignment/resolution/status lifecycle is added to Handoff. Projection exposes `basis: fallback|durable_handoff`, not an invented internal diagnosis. Include at most one row per conversation, prefer durable_handoff basis when both exist. Supervisor/admin scoped `storeops:read` may read this reduced projection; this does **not** grant `/audit-events` access or reveal raw audit. Agent access to this new manager view is forbidden. The current public Audit DTO stays admin-only. No new Audit event type/framework is required for this read projection.

## 5. Enterprise WeChat text contract

### 5.1 Official transport decision boundary

**CONTRACT GAP-01:** repository contains no implemented/approved WeCom API family. Internal custom-application messages and external-customer/customer-service messages do not have interchangeable callbacks, identity fields or reply APIs. Independent approval must name one official first-party protocol, callback URL/verification/decryption rules, event identity fields, acknowledgement deadline and egress API before Core A implements its wire format. This document does not invent WeCom endpoints, crypto or retry schedules. No search snippet or generic SDK assumption can close the gap.

The frozen internal adapter input, after verified decryption, is:

```ts
type VerifiedWeComText = {
  corpId: string; applicationId: string; externalSubjectId: string;
  messageId: string; sentAt: string; text: string;
};
```

Text only, bounded to 4,000 characters; unknown type, missing stable message ID, wrong configured corp/application, oversized/invalid payload are rejected before business dispatch. Transport verification is not business authorization.

Ingress order is fixed: raw-size bound → official signature verification → official decryption and destination validation → text schema → durable message identity claim → binding/current membership resolution → Node context → existing `EnterpriseSupportService.respond`. Never use the legacy public demo HTTP contract. Signature/time freshness must follow the selected official protocol, not a guessed TTL. No request-supplied scope or external name can create a membership.

**CONTRACT GAP-02:** existing Users are employee accounts with password hashes and agent/supervisor/admin roles. A real external customer's relationship to an internal User/Membership is not established. Reviewer must settle whether the first channel is employee-operated, or authorize a specific safe external-customer binding model. Until then, only existing verified internal-member fixtures may model the boundary; no synthetic customer-to-staff privilege mapping, shared supervisor identity or automatic user provisioning.

### 5.2 PostgreSQL deduplication — new table required

`wecom_inbound_messages` columns: `id text PK`, `corp_id text`, `application_id text`, `message_id text`, `payload_hash text`, `state text CHECK(processing|completed|failed|indeterminate)`, `binding_id text NULL`, `tenant_id text NULL`, `store_id text NULL`, `conversation_id text NULL`, `request_id text`, `result_type text NULL`, `error_category text NULL`, `delivery_state text CHECK(not_sent|sent|indeterminate)`, `created_at timestamptz`, `updated_at timestamptz`. Other columns non-null. `result_type`, when present, is answer/fallback/escalation.

- UNIQUE `(corp_id,application_id,message_id)` is the durable dedupe key; it includes the receiver application namespace, not just MsgId. A duplicate with changed verified payload hash is rejected as an integrity conflict.
- Nullable binding/scope/conversation are initially unresolved; CHECK requires binding/tenant/store either all null or all non-null, and a non-null conversation requires resolved scope. Binding FK includes scope; conversation FK includes scope. Node verifies customer ownership through the existing business service. Index `(tenant_id,store_id,created_at,id)` supports bounded internal diagnostics. Rows carry no token, message body, answer or raw callback.
- Node adapter alone inserts/updates; trusted operator can inspect safe diagnostics. React does not get external identifiers; no optional channel-status page is needed in this sprint.
- Insert/claim commits **before** dispatch. UNIQUE conflict never starts another Agent invocation. Complete duplicate: acknowledge per official protocol, no re-dispatch or second outbound response. Processing duplicate: acknowledge without parallel work. Failed/indeterminate duplicate: do not auto-retry; surface safe operator state. Persist result/delivery state after work; external send and SQL are not claimed atomic.
- Node serializes active dispatch per scoped conversation and refuses overlapping dispatch rather than racing Pi session state. Store conversation identity is a Node-generated opaque reference associated with the verified binding; no browser/callback-concocted cross-scope ID. Exact external-customer conversation mapping is blocked by GAP-02.
- Process death after claim has uncertain completion: preserve processing/indeterminate evidence, no automatic replay on restart. No queue/worker/recovery framework. This deliberately trades automatic delivery recovery for no duplicate business dispatch.

### 5.3 Egress and human handling

Internal egress takes `{requestId, bindingId, conversationId, publicResult}` where `publicResult` is the existing public SupportResult projection. Node resolves recipient and scope again; the model never supplies a recipient, corp or delivery credential. Only final text can enter the authorized channel response; no candidates, raw events, traces or reasoning. Manager notification is a bounded notice with a scoped operations link/reference, not customer/private knowledge contents; actual manager recipient configuration is part of GAP-01/GAP-02 approval. At most one send per claimed inbound record; no blind send retry when acknowledgement is lost. Delivery uncertainty is not recorded as sent or as a durable handoff.

Actual external response sending/manager notification requires channel approval and explicit deployment authorization; this contract does not authorize autonomous customer replies or live traffic. Core A can implement offline contract fixtures after Contract Gate, not call a live channel under Task 0.

## 6. Node ↔ FastAPI wire contract

### 6.1 Trust, bounds and health

Three endpoints only. Node is the only caller, on the private service network with a dedicated operator-provisioned service credential (never browser cookie or Pi token). Missing/invalid service credential is 401. No wildcard CORS; proxy must not expose `/knowledge/*`. Service authentication identifies Node; tenant/store in the request is derived by Node from authenticated context or trusted ingestion scope, never forwarded from client input. FastAPI still applies explicit SQL scope filters; network placement alone is insufficient.

Bodies are strict JSON; search maximum 32 KiB, ingest maximum 8 KiB. Response maximum 256 KiB. `requestId` correlates work, not authorization. Node's current AbortSignal and remaining Runtime/tool budget govern a search; propagate disconnect/cancellation to HTTP/embedding/DB work, discard late results, no retry or silent lexical/model/provider switch. No increased 2,000 ms per-tool or 10,000 ms overall limits. Operator ingestion is a separate one-shot bounded job, not an Agent tool; configured finite ingestion deadline must be declared in the deployment runbook before execution.

`GET /health` (service-authenticated) succeeds with HTTP 200 and exactly `{schemaVersion:"job-ready-v1",status:"ok"}` only when DB is reachable, required schema/vector extension exists, and the pinned embedding profile is loadable. Dependency failure: 503 bounded error, not status ok. Health never makes a paid/external model call.

### 6.2 Approved ingestion

```ts
type IngestRequest = {
  schemaVersion: "job-ready-v1"; requestId: string; scope: Scope;
  documentId: string; version: string; contentSha256: string;
  embeddingProfileId: string;
};
type IngestResponse = {
  schemaVersion: "job-ready-v1"; requestId: string;
  documentId: string; version: string; contentSha256: string;
  embeddingProfileId: string; chunkCount: number;
  outcome: "indexed" | "already_indexed";
};
```

No status/role/permission/content supplied by Python or public callers. Node first loads approved private entries through the existing loader, rejects mixed/unscoped/synthetic input, and registers canonical document/version/content in PostgreSQL. Ingestion reads that exact approved registry row/hash. Missing, inactive, retired, changed hash or wrong scope fails closed. Same document/version/profile/hash ingestion is idempotent. Changed bytes under an existing version are a conflict, never overwrite. HTTP 200 means all chunks atomically published for that version/profile, not merely a scheduled job. Failure leaves no partially searchable generation.

### 6.3 Search and Candidate Evidence

```ts
type SearchRequest = {
  schemaVersion: "job-ready-v1"; requestId: string; scope: Scope;
  query: string; topK: 3; embeddingProfileId: string;
};
type CandidateEvidence = {
  chunkId: string; documentId: string; version: string;
  sourceRef: string; kind: "policy" | "sop" | "reference";
  scope: Scope; status: "approved"; contentSha256: string;
  chunkSha256: string; text: string; score: number; rank: number;
  embeddingProfileId: string;
};
type SearchResponse = {
  schemaVersion: "job-ready-v1"; requestId: string;
  candidates: CandidateEvidence[];
};
```

Query: 1–4,000 characters. Up to three **distinct document-version** candidates, ranks exactly 1..N; each text at most 2,000 Unicode code points, finite cosine score in [-1,1]. No generated answer, rationale, hidden reasoning, business outcome or Safety evidence field. Empty result is HTTP 200 with `candidates:[]`, distinct from failed retrieval. A response mentioning another scope, unsupported version/schema/profile, duplicate document, fabricated hash/rank or oversized body is rejected, not trimmed into apparent success.

Core B's Node adapter implements existing `RetrievalService.search(query, signal, context)`; missing context fails closed. It reconciles each returned document/version/hash/sourceRef/kind/scope against the Node-owned active approved registry; returned text/hash must match that registered chunk and an exact span of canonical document content. A Python-provided `status:"approved"` alone is never admission. Rehydrate the **canonical full entry** into `RetrievalEvidence {id:documentId,text:canonicalContent,knowledge:{kind,status,version,sourceRef,scope},relevance:{score,rank}}`. Chunk ID is diagnostic, not a new public factual identity. Then apply the existing Node admission and cardinality rule before Pi sees anything.

Consequences: one document's several chunks cannot manufacture ambiguity; two distinct admitted documents still fail closed even if one score is higher. No selected Top1 fallback. Final `SupportResult.evidence` remains the existing `{id,kind,version,sourceRef}` list of actually used canonical entries. Scores and raw candidates are not final authorization. Neither service synthesizes `SafetyEvidence` from ordinary documents.

### 6.4 RAG persistence

Two new tables, not a second knowledge approval system:

| Table | Columns and constraints | Ownership / concurrency |
| --- | --- | --- |
| `rag_documents` | Composite PK `(tenant_id,store_id,document_id,version)`; `kind` (faq/policy/sop/reference), `title`, `content`, `content_sha256`, `source_ref`, `updated_date date`, `tags jsonb`, `status` (approved/unapproved/retired/synthetic_test_only), `active boolean`, `created_at timestamptz`; all non-null. Scoped store FK; UNIQUE active `(tenant_id,store_id,document_id)` partial index. CHECK tags array and allowed kind/status. | Node registry writer only; Python SELECT only. `content`/version/hash immutable. Node operator records status/activation from approved input, not model output. Active private registrations must be approved; reject synthetic before registration in private mode. |
| `rag_chunks` | Composite PK `(tenant_id,store_id,document_id,version,embedding_profile_id,chunk_id)`; `ordinal integer`, `text`, `chunk_sha256`, `embedding vector(D)`, `created_at timestamptz`; all non-null. Composite document FK; UNIQUE document/version/profile/ordinal; ordinal >= 0. Index `(tenant_id,store_id,embedding_profile_id,document_id,version)`. | Python index writer only after registry check; Node may SELECT for verification. No rights on approval or any business/identity table. Transaction replaces an incomplete attempt only before publishing; advisory transaction lock per scoped document/version/profile serializes simultaneous ingestion. |

All fields not explicitly typed above are text except booleans/integers/JSON. The registry is a durable projection of Node-approved knowledge, not an automatic review workflow. No approval UI, LLM approval or knowledge auto-write. Private contents remain outside Git/eval reports.

Chunking V1: deterministic contiguous spans of at most 2,000 Unicode code points, zero overlap, ordinal from zero; no summarization or invented text. Chunk ID is SHA-256 of an unambiguous JSON tuple `[tenantId,storeId,documentId,version,profileId,ordinal,chunkSha256]`, UTF-8, compact separators, non-ASCII characters unescaped, no trailing newline; reject unpaired surrogate inputs. Node and Python contract fixtures bind exact Unicode bytes/hashes. Chunking/profile change requires a new profile ID and reindex, never mutation of frozen evidence.

Retrieval V1: exact cosine scan, no ANN index/reranker. Join active approved document versions, exact tenant AND store, matching profile, kind policy/sop/reference **before** nearest-neighbor ranking. Apply the approved relevance floor; group by document/version using its maximum eligible chunk score; tie-break documentId then chunkId; return up to three distinct documents. No relaxation of filters to fill Top-K. No vector-to-lexical fallback on exception.

Node transaction deactivates/retires an old document version before activating its replacement. During reindex, absence of ready chunks yields no answer, never stale evidence. Search joins registry so retired/inactive entries stop being searchable immediately. Node revalidates active version immediately before authorization; no cross-scope or stale-version cache. Historical version rows remain available for attribution but not retrieval. Registry/DB unavailability is a failure, not an empty successful lookup.

**CONTRACT GAP-03:** no embedding model, immutable revision/artifact hash, dimensions `D`, execution location or permitted content-egress policy exists at baseline. Reviewer/operator must approve one profile binding these values and normalization/cosine metric. No API key, remote embedding call, guessed vector dimension or floating model revision is authorized. Until resolved, Core B can build DTO/filter tests with deterministic injected vectors only; concrete vector schema/profile and real indexing are blocked.

**CONTRACT GAP-04:** a numerical vector relevance floor cannot be inferred from existing lexical scores. Always returning nearest neighbors would violate no-answer behavior. Freeze a profile-specific floor on a separate calibration population before final holdout; reviewer must approve the floor and calibration provenance. Missing floor means vector-mode configuration unavailable, not “all candidates relevant.” Preserve FIRST comparison and do not tune on final failures.

Lexical retrieval remains available as the existing explicit baseline, not deleted or rescored. Final Integration may add an explicit `ENTERPRISE_RETRIEVAL_MODE=lexical|vector` (default lexical); vector requires valid profile and admitted private registry or startup fails. FAQ remains the existing approved FAQ adapter in both modes; it does not bypass status/version/sourceRef/scope or duplicate FAQ into ordinary vector retrieval. Deterministic portfolio synthetic fixtures stay test/demo-only and cannot enter private vector mode.

## 7. React-facing StoreOps API contract

Existing auth/me is the only identity truth source. Existing Support/Ticket/Handoff/Audit routes and DTOs are unchanged. New routes are under `/api/v1/storeops`, before SPA fallback, same-origin, no browser secrets or editable tenant/store authority. Scope selectors in new bodies/query strings are rejected. Successful list responses use `{items:T[]}`; no records differs from unverified/error. Server-derived context remains visible through existing `/auth/me`, not duplicated as authority in every write.

New DTOs (dates/times/versions follow section 3):

```ts
type AvailabilityDTO = {
  id: string; staffMembershipId: string; staffDisplayName: string;
  localDate: string; timeZone: string;
  windows: {start:string;end:string}[];
  status: "published" | "withdrawn"; source: "human"; version: number;
  updatedAt: string;
};
type BookingIntentDTO = {
  id:string; conversationId:string; customerId:string;
  requestedService:string; requestedStart:string|null; requestedEnd:string|null;
  preferredStaffMembershipId:string|null;
  status:"pending_confirmation"|"confirmed"|"alternative_proposed"|"cancelled";
  alternativeStart:string|null; alternativeEnd:string|null;
  confirmedStart:string|null; confirmedEnd:string|null;
  createdByUserId:string; version:number; createdAt:string; updatedAt:string;
};
type KnowledgeDTO = {
  id:string; kind:"faq"|"policy"|"sop"|"reference";
  title:string; version:string; sourceRef:string; updatedAt:string;
  status:"approved";
};
type NeedsAttentionDTO = {
  conversationId:string; basis:"fallback"|"durable_handoff";
  handoffId:string|null; lastActivityAt:string;
};
```

No callback identity, raw audit, provider payload, private text bulk export or hidden diagnosis. Knowledge list shows current approved registry metadata, **not** a claim that every entry answered the current request; actual used evidence is still in SupportResult. `createdByUserId` comes from the service for intent permissions, not from browser writes. It does not imply historical Runtime audit has actor attribution.

| View / endpoint | Action/request | Authority | Empty/error interpretation |
| --- | --- | --- | --- |
| Today Availability: GET `/availability?date=YYYY-MM-DD` | `{items:AvailabilityDTO[]}` plus `staff:{membershipId,displayName}[]` and server `timeZone`. Staff are same-scope current memberships; no roster management. | `storeops:read` | Missing staff row = availability not recorded; published [] = no listed window. Never show network failure as empty. |
| PUT `/availability/:staffMembershipId/:date` | `{expectedVersion:number,windows:{start,end}[],status:"published"|"withdrawn"}` → AvailabilityDTO | `availability:write`; target staff scope checked | 409 version conflict: reload, do not silently retry/overwrite. Timezone from Node configuration. |
| Booking Intents: GET `/booking-intents` | `{items:BookingIntentDTO[]}` | `storeops:read` | Empty = no intents returned, not no capacity. |
| POST `/booking-intents` | `Idempotency-Key` header; body `{conversationId,requestedService,requestedStart?:string,requestedEnd?:string,preferredStaffMembershipId?:string}` → BookingIntentDTO (201 new, 200 duplicate) | `booking-intent:create` | Inaccessible conversation/staff 404; mismatched key409. `customerId`, creator and channel binding derived server-side. |
| POST `/booking-intents/:id/transition` | `{expectedVersion,action:"confirm"|"propose_alternative"|"cancel",start?:string,end?:string}` → BookingIntentDTO | State/role/creator matrix in 4.4 | Confirm pending requires time pair; confirm alternative uses stored alternative with no new pair; propose requires pair; cancel forbids pair. Unknown fields/action or impossible transition rejected. |
| Knowledge / Evidence: GET `/knowledge` | `{items:KnowledgeDTO[]}` only | `storeops:read` | No approved entries displayed vs retrieval unavailable remain separate. No upload/approve action. Existing SupportResult displays actual evidence. |
| Needs Attention: GET `/needs-attention` | `{items:NeedsAttentionDTO[]}`; link existing scoped conversation/handoff proof | Supervisor/admin + `storeops:read` | Empty means no matching persisted projection. No guessed “resolved” state, assignment or ordinary-handoff bypass. |

Route paths in the table are relative to `/api/v1/storeops`. Availability read has the explicitly stated extra staff/timeZone fields; other lists have only items. No pagination framework in this small-store sprint: booking/needs lists are server-bounded to latest 100 with optional `truncated:true` when more exist (otherwise false); UI labels the bound, not “all records.” Knowledge returns all admitted metadata for the bounded private pack or fails explicit size validation, never silently truncates factual admission. New request strings/IDs max200 characters except query/text limits already stated.

All authenticated requests reuse the existing session request layer. Any 401 clears identity AND StoreOps/request/result/evidence state and returns to login; stale responses after identity generation changes cannot repaint. A 403 retains identity/scope, shows forbidden, and must not fabricate authority. Disable duplicate submission while in flight; version/key still protect server state if clients race. Same-origin mutation requests require validated Origin when present; no cross-origin credentialed access. No localStorage/sessionStorage authority, raw sessionEvents, evidence candidates as authorized proof, or internal fallback explanations.

## 8. Runtime Reliability A/B contract (future Core A only)

### 8.1 Badcase A: governed result at the deadline

Observed durable evidence establishes calls and final fallback near 10 seconds; it does **not** expose the exact intermediate admission instant. Do not assert that a real admitted snapshot existed solely from a tool name. Before implementation, reproduce deterministically both “single evidence settled before deadline” and “lookup unfinished at deadline.” Preserve original failed run unchanged.

Required narrow invariant: an ordinary, uniquely admitted canonical evidence result settled **before** the deadline can be finalized as the existing bounded evidence-text answer despite provider-only finalization delay. This is not accepting late tool output or increasing timeout.

Eligibility for deadline finalization requires all of: ordinary path; exactly one current governed entry; query/scope/version matched; complete successful read; no in-flight tool/side effect; no tool failure, tool/Agent-limit violation, unresolved authority condition, mandatory/ordinary handoff override or Safety requirement. A later completed zero/ambiguous ordinary lookup replaces the snapshot; never resurrect an older single hit. Earlier read-only miss alone does not invalidate a later settled single hit. A changed/retired source or uncertainty fails closed.

At deadline still abort Pi/provider/tool work, seal turn state and reject all late mutations. If that pre-deadline snapshot is eligible, return only its canonical bounded content and actual evidence; never return delayed provider prose. If not eligible, preserve controlled fallback. A pending/failed durable write cannot be declared successful by this rule. Safety result/escalation must follow its existing higher-priority path; the repair must not convert a Safety or authority failure into an ordinary answer.

Record deadline occurrence separately from final outcome. `SupportResult.evidence` and authorized audit evidence must agree. Audit may record candidate/intermediate IDs separately but must label them as not final authority. Preserve actual Pi events; do not fabricate completion events to explain the result.

### 8.2 Badcase B: required knowledge check is policy-owned

For an ordinary support input with no admitted FAQ answer, Node must deterministically execute the governed ordinary knowledge check once for the original request text within existing budget, without waiting for the model to choose a tool. Safety handling runs first; successful admitted FAQ keeps its direct path. This rule applies to all remaining ordinary requests, including nonsense/no-match queries, not specific case IDs, phrases or corpus entries. Explicit StoreOps form commands are separate deterministic APIs, not model intent routing.

Reuse one product-owned `search_knowledge` operation for this policy invocation and Pi tool dispatch: same schema, admission, timeout/AbortSignal, tool budget and output guard. Account the actual operation once; cache only that turn's completed same-query/same-scope result to avoid duplicate identical work. Policy-origin execution must be identified in audit (`knowledgeCheckOrigin: policy|pi_tool`); it is an actual tool operation, not a forged Pi Agent event. `toolsCalled` records actual calls; raw Pi events remain only Pi's events. Different later queries remain governed/budgeted and can invalidate earlier evidence.

Precheck failure cannot be hidden by provider prose, FAQ retry or arbitrary Top1. Zero admitted → fallback; exactly one → bounded governed answer; multiple → fallback/no authorized bodies. No model selector, extra Agent loop, credentials or new public tool. No new permission bypass for Ticket/Handoff. If budget expires before the required check settles, record an uncompleted/failed check and fallback; never claim it ran successfully.

Core A regression matrix: FAQ miss→single answer/exact ID; miss→zero fallback; miss→multiple fallback; single then tool failure fallback; predeadline single/provider delay versus incomplete read/deadline; same tests with Safety/authority/durable-write overrides; later ambiguity invalidates earlier single; late provider/tool cannot alter finished result; omitted model tool still performs required check; FAQ admitted path preserved; budget counted once/no query-specific branches. Run faux Pi events plus persisted audit, not helper-only mocks. No real-provider rerun is authorized by Task 0 or inferred from offline PASS.

## 9. Bounded errors and observability

New Node HTTP errors retain the existing envelope `{error:string}`. Existing endpoints/codes are not renamed. FastAPI adds `{schemaVersion:"job-ready-v1",requestId:string,error:string}` for its internal protocol. Do not forward its raw response/error into public SupportResult.

| Condition | Boundary/code | Meaning |
| --- | --- | --- |
| Missing/expired session | 401 `unauthenticated`; login keeps `invalid_credentials` | Frontend clears identity/state |
| Unresolved/disabled channel identity | internal `identity_unresolved` | No Runtime dispatch, no auto-provision |
| Authority denied | 403 `forbidden` | Keep identity; no capability mutation |
| Foreign/absent object | 404 `not_found` | No cross-tenant existence disclosure |
| Invalid new DTO/scope override | 400 `invalid_request` / existing `invalid_scope_query` | Do not change legacy parsing claims |
| Version/idempotency/transition conflict | 409 `availability_conflict` / `booking_intent_conflict`; existing `conversation_conflict` unchanged | No overwrite or retry mutation |
| Channel duplicate | internal `duplicate_event`, normal official acknowledgement | Successful dedupe is not a second execution |
| Ingest changed version/hash | 409 `knowledge_version_conflict` | No implicit replacement |
| Retrieval unavailable | internal / FastAPI503 `retrieval_unavailable` | Failure, not successful zero matches |
| No/ambiguous admitted evidence | internal `no_governed_evidence` / `ambiguous_governed_evidence` | Final controlled fallback, not public invented reason |
| Deadline/provider/dependency | internal `upstream_timeout` / `provider_unavailable` / `dependency_unavailable`; HTTP503 for new non-Runtime service dependencies | Runtime still uses existing safe result contract |
| Unexpected error | existing500 `internal_error` | No exception text/SQL/paths exposed |

Safe structured end record fields: `requestId`, opaque `conversationId`, opaque tenant/store IDs, `channel: web|wecom`, `totalElapsedMs`, optional measured `retrievalElapsedMs`, `agentElapsedMs`, `dbElapsedMs`, `resultType`, bounded `errorCategory`, `toolsCalled`, `authorizedEvidenceIds`, `evidenceCount`, `knowledgeCheckOrigin` when applicable. Missing timings are absent, not invented zero; Agent time includes Pi overhead and is not labelled pure model time. Measurements can overlap; do not assert their sum equals total.

Reuse `support-agent.audit` for Runtime facts and existing PostgreSQL persistence; channel dedupe and StoreOps version rows hold their own operational facts. Do not add a second audit platform. New safe metadata remains internal until an explicit public DTO admits it. Current public Audit does not claim actor identity. Logs exclude raw queries/answers, external user IDs, credentials, headers, filesystem paths, corpus content, provider payloads, Pi events, session transcript and reasoning. Private business fields persist only where required (e.g. requested service), not duplicated in public logs. Real proof exports retain the existing narrower safe-evidence contract.

## 10. Retrieval evaluation contract

Track D authors **40** human-authored queries within the authorized 30–50 range: 24 answerable, 8 no-answer, 8 ambiguous. At least 8 cases across these groups are explicit tenant/store/approval/version negative controls. These are not real customer transcripts. Use approved source propositions and synthetic scoped test fixtures explicitly distinguished; no invented professional policy as factual gold. Final population/hashes freeze before comparison; lexical FIRST results preserved separately from later vector results.

```ts
type RetrievalEvalCase = {
  caseId:string; query:string; scope:Scope;
  expectedEvidenceIds:string[]; expectedAnswerability:"answerable"|"no_answer"|"ambiguous";
  expectedVersions:Record<string,string>; expectedSourceRefs:Record<string,string>;
  provenance:"human_authored_official_source"|"synthetic_isolation_fixture";
  sourceRefs:string[]; goldReason:string;
};
type RetrievalMeasurement = {
  caseId:string; sourceCommit:string; casesSha256:string; corpusSha256:string;
  mode:"lexical"|"vector"; embeddingProfileId?:string;
  returnedEvidenceIds:string[]; admittedEvidenceIds:string[];
  returnedVersions:Record<string,string>; actualAnswerability:"answerable"|"no_answer"|"ambiguous"|"unavailable";
  elapsedMs:number; errorCategory?:string; pass:boolean; failureReasons:string[];
};
```

Answerable gold has exactly one sufficient entry; ambiguous gold has at least two distinct admissible plausible entries and expects no final authorized evidence; no-answer gold is empty. Human `goldReason` must explain directness/sufficiency rather than infer truth from a nonempty list. Multiple chunks of the same entry are not two gold entries. Check returned versions/source references, not IDs alone. Unavailable retrieval is never counted as correct no-answer.

- **Recall@3:** macro mean of `|expected IDs intersect top-3 distinct returned IDs| / |expected IDs|` over nonempty-gold cases. Report answerable and ambiguous strata separately. Wrong versions/scope do not count as hits.
- **Wrong Evidence Rate:** number of returned distinct entries not valid gold for that case divided by all returned entries; report 0/0 as N/A, alongside coverage and per-case failures so all-empty retrieval cannot appear good.
- **No-answer Accuracy:** no-answer cases with successful empty admitted results divided by all no-answer cases; errors fail the numerator.
- **Retrieval Latency:** monotonic start-to-validated-response milliseconds; min/P50/P95/max with count and separate timeout/error counts, never success-only latency disguised as total.
- Always also report final 0/1/2+ routing accuracy, scope/status/version violations, dependency failures and each failed case ID. Candidate ranking quality and final answer authorization are different metrics.

Zero cross-scope/unapproved/stale evidence admission and zero ordinary authorization on 0/2+ are hard security invariants, not tunable quality thresholds. Task 0 does not invent a positive vector improvement claim. **CONTRACT GAP-05:** final numerical retrieval quality acceptance thresholds and calibration/final split must be independently approved before the held-out evaluation; no measured percentage can be labelled overall Job-Ready PASS without them. Contract and isolation tests can run offline after authorization; Task 0 itself runs no product evaluation.

## 11. Parallel ownership and integration freeze

The names below are reserved work branches from the independently accepted Task-0 commit, **not created or started by Task 0**. No branch independently merges another or changes this contract. A contract change requires independent review, not a fixture workaround.

| Track / reserved branch | Exclusive isolated work | Not owned |
| --- | --- | --- |
| Core A / `job-ready/core-a-runtime-storeops-v1` | `src/channels/wecom/**`, `src/storeops/**`, new `migrations/003_job_ready_storeops.sql` and `004_job_ready_rag.sql`, focused `tests/job-ready-core-a/**`, Runtime regression additions | Python/UI/deployment; GAP-blocked protocol or schema guesses |
| Core B / `job-ready/core-b-fastapi-rag-v1` | `ai-service/**` (service, Pydantic, embedding adapter, pinned Python dependencies, tests and image), new `src/retrieval/fastapi.ts`, `tests/job-ready-rag/**` | Business SQL/authority, shared Runtime/provider composition, metadata approval |
| Qoder C / `job-ready/react-storeops-v1` | `web/src/storeops/**`, `tests/web-storeops/**`, fixtures matching section 7 exactly | Backend endpoints/schema, shared App/session authority implementation |
| Qoder D / `job-ready/eval-delivery-v1` | `evals/job-ready-rag/**`, `deploy/job-ready/**` (Nginx/runbook examples), `scripts/job-ready-*.mjs` deterministic smoke helpers, `docs/job-ready/evidence/**` | Shared Compose/workflow/package files, algorithms/gold tuning/core fixes |
| Final GPT-6 Integration / `job-ready/integration-v1` | Shared wiring below after track evidence/review; no concurrent track edits | New product capabilities or unresolved gap decisions |

Core A owns SQL for both StoreOps and the frozen RAG schema, including extension/profile dimension once GAP-03 resolves; Core B supplies query/DTO tests, not a competing migration. DB roles/grants isolate Python index writes from Node authority tables. Existing migration001/002 remain frozen. No peripheral branch edits existing historic evals/reports, Pi pins or governance state. New track evidence goes into owned isolated paths.

| Shared file | Sole change owner / stage | Exact reason / bound |
| --- | --- | --- |
| `src/index.ts` | Core A / core | Reliability A/B only; shared guarded lookup/snapshot; no new loop/tool/Safety behavior |
| `src/enterprise/identity.ts` | Core A / core | Add only section3 StoreOps capability mapping; no multi-membership/customer-role guess |
| `src/enterprise/postgres.ts` | Integration / final | Register 003/004 in existing ledger; repositories remain in new owned modules; preserve old persistence semantics |
| `src/enterprise/application.ts` | Integration / final | Compose new StoreOps/channel/explicit retrieval dependencies and lifecycle; retain approved defaults |
| `src/enterprise/http-api.ts` | Integration / final | Mount exactly contracted StoreOps routes and selected approved callback; preserve auth/static order and existing safe DTOs |
| `src/enterprise/pi-runtime.ts` | Integration / final | Thin injection of `RetrievalService` when explicit vector mode selected; current factory hardcodes lexical construction. No Pi auth/provider semantic changes |
| `web/src/App.tsx` | Integration / final | Mount Track C views through existing session lifecycle; no authority redesign |
| `compose.yaml`, `Dockerfile` | Integration / final | Wire private FastAPI/vector service and approved images/profile without losing existing deterministic persistence smoke |
| `package.json`, `package-lock.json` | Integration / final | Register approved scripts and only necessary declared dependencies; Pi pins unchanged |
| `.github/workflows/customer-support-agent-gate.yml` | Integration / final | Add isolated deterministic new gates; retain every existing dedicated PG/eval/Docker gate; external calls0 |
| `README.md`, `docs/job-ready/CURRENT_STATE.md` | Integration / final | Truthful combined evidence/runbook links only after validation; no automatic approval claim |

Files not allocated here remain frozen. In particular `src/knowledge.ts`, `src/safety.ts`, `src/semantic-selector.ts`, old proof harness/reports, existing Skills and tool contracts are not rewritten. Core B's adapter does canonical validation outside the core lexical algorithm. Existing shared frontend helpers are reused; if they cannot support the contract without changes, Integration must request a bounded amendment rather than a peripheral edit. No simultaneous owner handoff of shared files; final Integration consumes reviewed commits after their owners stop.

## 12. Implementation gates after independent Contract Gate

Required future deterministic evidence, not Task-0 executions:

1. A: signed/decrypted ingress negative tests after official protocol selection; binding disabled/missing/multi-membership/cross-scope; SQL dedupe concurrency and crash/uncertain-delivery no replay; all booking transitions/version races/idempotency and scoped FKs; human-only confirmation; Handoff reuse and mandatory Safety retry preservation.
2. B: exact Node/Pydantic DTO fixtures including Unicode hashes; real PostgreSQL+pgvector filtered queries, retired/version invalidation, chunk dedupe; ingest concurrency/rollback; AbortSignal/late response; forged status/scope/hash; dependency failure != no-answer. Deterministic embedding adapters in CI, no silent external downloads/model calls.
3. C: exact new API fixtures, 401/stale reset,403 authority retention, unknown availability, version conflicts, missing evidence vs network failure, no raw audit or automatic confirmation. Tool invoked != durable confirmed remains.
4. D: frozen 40-case population and FIRST metrics, negative controls, private-data-free reports, deterministic delivery restart proof. Real embedding/provider/channel tests require separate authorization and approved profiles/corpus egress.
5. Integration: `npm test`, dedicated PG Identity/Business/Application (zero skipped), build/check/integrity, existing Safety/robustness/holdout, Knowledge, lexical/public-real retrieval, Docker persistence, plus new StoreOps/RAG/HTTP tests. Clean-runner must bind exact source/tree; old green runs are not successor evidence. Missing DB or external environment is BLOCKED, not PASS.

Deployment evidence must distinguish local Docker, hosted TLS reachability, DB restart persistence, index readiness and real channel/provider success. Preserve current Pi-session limitation; restarting PostgreSQL alone does not establish full conversational memory recovery. No merge/tag/release/Ready/Pilot/autonomous-reply claim follows from passing these tests alone.

## 13. Open decisions and stop boundaries

| Gap | Required independent decision / evidence | Blocked work; permitted contract-only preparation |
| --- | --- | --- |
| CONTRACT GAP-01 | Name the official WeCom API family, first-party protocol references, wire callback/ack/egress contract and operator-controlled receiving/manager account configuration | Live/wire adapter implementation; normalized text/dedupe fixtures can be prepared after Contract Gate |
| CONTRACT GAP-02 | Resolve employee vs external-customer use and safe external→User/Membership/conversation mapping without granting customer staff authority | Real ChannelBinding provisioning/customer dispatch; no automatic user/customer-role invention |
| CONTRACT GAP-03 | Approve pinned embedding artifact/model/revision/dimension/location/data-egress profile and compatible pgvector build | Concrete vector(D) migration/profile, real embedding/ingest; DTOs and injected-vector tests only |
| CONTRACT GAP-04 | Approve profile-specific relevance floor and independent calibration provenance | Real vector answerability; never use unconditional nearest neighbor as no-answer policy |
| CONTRACT GAP-05 | Approve final retrieval quality thresholds and frozen calibration/holdout split | Overall retrieval-quality PASS claim; deterministic scope/security invariants remain mandatory |

Missing deployment credentials, domain, database or explicit store timezone are execution prerequisites, not permission to hard-code real values. They must remain outside Git; no secret values are requested by this document.

Task-0 completion means one document committed/pushed for independent review, **not** Contract Gate APPROVED. No Core/Qoder implementation, scaffolding, product evaluation, provider run, merge, tag, release or Ready transition is performed or authorized by this checkpoint. Stop for independent Contract Gate.
