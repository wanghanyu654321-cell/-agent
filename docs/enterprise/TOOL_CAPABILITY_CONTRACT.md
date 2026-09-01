# Tool capability contract

The existing four product tools remain owned and enforced by `SupportAgentRuntime`.
Phase 2A supplies server-derived legacy permissions at the enterprise HTTP boundary; it
does not claim that tool internals have been rewritten around `SupportExecutionContext`.

| Tool | Purpose | Read/write | Required capability | Scope | Side effect / idempotency | Failure / audit |
| --- | --- | --- | --- | --- | --- | --- |
| `search_faq` | Retrieve admitted FAQ evidence | Read | `agent:invoke` to invoke the enterprise endpoint | derived tenant/store applies to evidence admission | none | no admitted evidence fails closed; grounding is audited |
| `search_knowledge` | Retrieve governed knowledge | Read | `agent:invoke` | derived tenant/store passed to retrieval | none | 0 or 2+ candidates fail closed; routing and grounding are audited |
| `create_ticket` | Create a support ticket | Write | `ticket:create`, projected to legacy `tickets:write` | Runtime uses server-derived tenant/store | unique by tenant plus idempotency key; PostgreSQL is final concurrent authority when composed | denied capability or duplicate is blocked; `support-agent.audit` records tools called |
| `handoff_to_human` | Escalate to a human | Write | `handoff:create`, projected to legacy `handoff:write` and `mayEscalate` | conversation belongs to server-derived Runtime scope | one handoff per tenant/store/conversation; concurrent reservation plus PostgreSQL constraint when composed | denied capability or duplicate is blocked; audit records the outcome |

Safety escalation retains its stronger Runtime precedence and may create its existing
qualified-human handoff without ordinary customer-driven handoff capability. No customer
tool receives filesystem, shell, knowledge-write, or generic mutation access.
