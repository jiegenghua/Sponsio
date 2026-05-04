# Refund Agent — LangGraph + Sponsio (Layer-3 patterns)

A customer-support refund agent. The risk here is *not* SQL injection
or rm-rf; it's social engineering, leaking PII in the LLM's reply,
runaway responses, and high-value refunds slipping past human
approval.

This example shows how to add Sponsio to a LangGraph app with the
`wrapTools` adapter and use the **Layer-3** patterns to express
runtime properties the host stack already knows but the LLM doesn't:
who's calling, whether HITL approved, what the response can contain.

## Patterns demonstrated

| Pattern | Why it's here |
|---|---|
| `ctx_required` | refunds must run under an attested `caller_id` from the auth layer (`observeContext({caller_id: …})`) |
| `approval_active` | high-value refund needs a fresh `senior_eng` approval (event-clock bounded; `time_since` semantics) |
| `rate_limit` | per-session cap — at most 5 routine refunds |
| `no_pii` | LLM reply must not leak email / SSN / credit-card |
| `max_length` | LLM reply ≤ 200 words |

## Two ways to run

### Deterministic demo (no API key)

```bash
cd ts && npm install
cd examples/refund-langgraph
npx tsx demo.ts
```

A canned 8-step trajectory drives the guard through each contract:
no caller → blocked, attest → allow, high-value without approval →
blocked, HITL → approval refresh → allow, PII reply → blocked, clean
reply → ok, exhaust rate limit.

### LLM-driven run (Gemini)

```bash
GOOGLE_API_KEY=AIza... npx tsx agent.ts
```

`agent.ts` wires `wrapTools(ALL_TOOLS, guard)` so the agent sees
contract refusals as normal tool results and can decide whether to
retry after a prep step.

## How Sponsio is wired in

Three lines of integration:

```ts
import { Sponsio } from "@sponsio/sdk";
import { wrapTools } from "@sponsio/sdk/langchain";

const guard = new Sponsio({ config: "sponsio.reference.yaml", agentId: "refund_bot" });
guard.observeContext({ caller_id: "agent-1" });          // bridge the auth layer
const tools = wrapTools(ALL_TOOLS, guard);
```

Plus, when HITL approves, push it through the same hook:

```ts
guard.observeApproval({ role: "senior_eng", decision: "allow" });
```

That's the entire integration. Tool definitions and graph wiring are
unchanged.
