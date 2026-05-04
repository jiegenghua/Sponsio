/**
 * Refund agent tools — LangChain ``tool(fn, { name, schema })`` shape.
 *
 * All three tools are stubs: in production they'd call your billing
 * API. The interesting surface for the example is the contract layer
 * around them.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const lookupOrder = tool(
  async ({ orderId }) => `Order ${orderId}: $48.99 paid 2025-04-01`,
  {
    name: "lookup_order",
    description: "Look up an order's metadata.",
    schema: z.object({ orderId: z.string() }),
  },
);

export const issueRefund = tool(
  async ({ orderId, amount }: { orderId: string; amount: number }) =>
    `Refunded $${amount.toFixed(2)} for ${orderId}`,
  {
    name: "issue_refund",
    description: "Issue a routine refund.",
    schema: z.object({ orderId: z.string(), amount: z.number() }),
  },
);

export const issueRefundHighValue = tool(
  async ({ orderId, amount }: { orderId: string; amount: number }) =>
    `Refunded $${amount.toFixed(2)} (HIGH VALUE) for ${orderId}`,
  {
    name: "issue_refund_high_value",
    description: "Issue a high-value refund. Requires senior_eng approval.",
    schema: z.object({ orderId: z.string(), amount: z.number() }),
  },
);

export const ALL_TOOLS = [lookupOrder, issueRefund, issueRefundHighValue];
