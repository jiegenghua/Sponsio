/**
 * DevOps agent tools — Vercel AI SDK ``tool({...})`` shape.
 *
 * All five tools are stubs: in production they'd shell out, hit a DB,
 * write to disk, etc. The point of this example is the *contract*
 * surface — Sponsio gates each call before it touches the host.
 */

import { tool } from "ai";
import { z } from "zod";

export const bash = tool({
  description: "Run a bash command on the production host.",
  parameters: z.object({ command: z.string() }),
  execute: async ({ command }) => `$ ${command}\n[stub] command executed`,
});

export const runSql = tool({
  description: "Run a SQL query against the production database.",
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => `[stub] SQL: ${query.slice(0, 60)}…`,
});

export const writeFile = tool({
  description: "Write content to a path on the host.",
  parameters: z.object({ path: z.string(), content: z.string() }),
  execute: async ({ path, content }) => `[stub] wrote ${content.length} bytes to ${path}`,
});

export const shutdownHost = tool({
  description: "Power off a host. DESTRUCTIVE — requires confirm_shutdown_host first.",
  parameters: z.object({ host: z.string() }),
  execute: async ({ host }) => `[stub] ${host} powering off`,
});

export const confirmShutdownHost = tool({
  description: "Confirm a pending host shutdown. Must run before shutdown_host.",
  parameters: z.object({ host: z.string() }),
  execute: async ({ host }) => `[stub] confirmed shutdown of ${host}`,
});

export const TOOL_NAMES = {
  bash: "bash",
  run_sql: "run_sql",
  write_file: "write_file",
  shutdown_host: "shutdown_host",
  confirm_shutdown_host: "confirm_shutdown_host",
} as const;
