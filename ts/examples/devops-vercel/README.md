# DevOps Agent — Vercel AI SDK + Sponsio

An "infra cleanup" agent that runs shell commands, queries the prod
database, writes log files, and (rarely) reboots hosts. Without
contracts, a misaligned model or a prompt-injection chain can
`rm -rf /`, `DROP TABLE`, or scribble outside `/tmp`.

This example shows how to add Sponsio to a Vercel AI SDK app so every
dangerous action is gated *before* the underlying tool runs.

## Patterns demonstrated

| Pattern | Why it's here |
|---|---|
| `dangerous_bash_commands` | bans `rm -rf` / `chmod` / `> /app` / `python -c` / `tee /app` etc. by regex against `bash` args |
| `dangerous_sql_verbs` | bans `DROP` / `TRUNCATE` / `DELETE` / `ALTER` against the `run_sql.query` field (case-insensitive) |
| `scope_limit` | confines `write_file` to `/tmp/` and `/var/log/` |
| `must_confirm` | `shutdown_host` requires `confirm_shutdown_host` first |
| `tool_allowlist` | only the five expected tools may run — anything else (e.g. `delete_records`) is rejected |
| `rate_limit` | at most 5 `bash` invocations per session |

The same set is shipped both inline (in `demo.ts`) and as a yaml
(`sponsio.reference.yaml`). Real deployments load yaml via
`new Sponsio({ config: "sponsio.reference.yaml" })`.

## Two ways to run

### Deterministic demo (no API key)

```bash
cd ts && npm install
cd examples/devops-vercel
npx tsx demo.ts
```

A canned 10-step trajectory replays through the guard. Six are
intentional violations: `rm -rf`, `DROP TABLE`, writing `/etc/passwd`,
shutting down without confirm, calling an off-allowlist tool.

### LLM-driven run (Gemini)

```bash
GOOGLE_API_KEY=AIza... npx tsx agent.ts
```

`agent.ts` wraps the Vercel `generateText` model with
`sponsioMiddleware(guard)` — the AI SDK never sees a blocked tool
call, and the model gets a follow-up note explaining the refusal.

## How Sponsio is wired in

Three lines:

```ts
import { Sponsio } from "@sponsio/sdk";
import { sponsioMiddleware } from "@sponsio/sdk/vercel-ai";

const guard = new Sponsio({ config: "sponsio.reference.yaml", agentId: "devops_bot" });
const model = wrapLanguageModel({ model: google("gemini-2.0-flash"), middleware: sponsioMiddleware(guard) });
```

That's the whole integration. Tool definitions are unchanged.
