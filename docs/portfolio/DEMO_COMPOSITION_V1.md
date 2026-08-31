# Portfolio V1 deterministic demo composition

`DETERMINISTIC PORTFOLIO DEMO — NOT A PRODUCTION MODEL PROVIDER.`

This local composition demonstrates the existing business runtime without an OAuth
login, API key, network model call, or semantic-selector call. It uses deterministic
Pi faux messages only to request real Runtime tools; it does not replace the Runtime,
knowledge admission, safety policy, bounded evidence routing, authorization, or output
guards.

## Start locally

```powershell
npm run demo
```

The server listens on `http://127.0.0.1:3000`. Set `PORT` to a valid integer TCP
port to override it. `Ctrl+C` and `SIGTERM` close the server cleanly.

The fixed default demo identity is `demo-tenant` / `demo-store` /
`demo-customer`. Incoming requests retain the existing `SupportRequest` contract;
this demo adds no production authentication or identity security model.

## Composition

```text
npm run demo
  -> Portfolio Demo Composition
  -> deterministic Faux Pi actions
  -> real SupportAgentRuntime
  -> FAQ / governed knowledge / ticket / handoff
  -> safety, evidence routing, output guard
  -> thin HTTP adapter
  -> 127.0.0.1:3000
```

The demo owns one process-scoped `InMemorySupportStore`. Ticket and handoff state is
therefore observable and idempotent while the process runs; restarting the demo resets
that state. The faux Pi registration is serialized per request so one scenario cannot
consume another scenario's deterministic response sequence.

## Curated scenarios

| ID | Input | Real path | Expected outcome |
| --- | --- | --- | --- |
| `faq-business-hours` | `请问门店营业时间？` | `search_faq` -> FAQ admission | answer with FAQ evidence |
| `single-refund-timing` | `退款一般多久到账？` | `search_knowledge` -> one governed candidate | grounded answer with one evidence record |
| `no-governed-evidence` | `门店有免费停车位吗？` | `search_knowledge` -> zero admitted candidates | fallback with no evidence |
| `ambiguous-refund-rules` | `这个退款到底应该按哪个规则处理？` | `search_knowledge` -> two admitted candidates | bounded-routing fallback with no evidence |
| `safety-escalation` | `顾客做项目时皮肤越来越痒，我该怎么继续？` | safety detector -> Runtime escalation/handoff | escalation and pause language |
| `ticket-creation` | `帮我记录一个退款售后工单` | authorized `create_ticket` | answer after a real tool call; requires `tickets:write` |
| `human-handoff` | `这个投诉我需要转人工处理` | authorized `handoff_to_human` | escalation after a real tool call; requires `handoff:write` and `mayEscalate` |

Scenario metadata exported by `src/portfolio-demo.ts` contains only safe frontend
fields: ID, title, user message, description, required permissions, escalation flag,
and expected outcome. It does not reveal faux action queues, hidden prompts, audit
records, or suppressed candidate bodies.

## Demo knowledge boundary

`src/portfolio-demo-data.ts` contains only `DEMO / SYNTHETIC PORTFOLIO DATA`, marked
`synthetic_test_only` and referenced through `demo://portfolio/...`. It is not a real
merchant policy, production knowledge base, or evaluation holdout. The composition
alone opts into synthetic-fixture admission; production defaults remain unchanged.

## Unknown input and scope

This deterministic portfolio mode supports only the seven curated demonstrations.
Unknown free-form input takes the real Runtime's no-evidence path and fails closed; it
does not act as a general offline assistant or invent business facts.

The composition does not demonstrate production authentication, a database platform,
CORS, a customer frontend, a real model provider, OAuth, or semantic-selector runtime
calls. It remains a frozen deterministic demonstration path while enterprise delivery
closure proceeds separately.
