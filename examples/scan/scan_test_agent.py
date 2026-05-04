"""Sample agent file for testing `sponsio scan`.

Run `sponsio scan examples/scan/scan_test_agent.py` and the scanner
detects the tool inventory below and proposes deterministic contracts
for the obvious gaps: unguarded writes, external sinks without
confirmation, sensitive reads without rate limits, idempotency gaps
on reversible actions.

The tools below are deliberately unsafe so the scanner has something
to flag. Do NOT use this file as a real agent.
"""

from langchain.tools import tool


@tool
def query_user_records(user_id: str) -> dict:
    """Read full PII records (email, SSN, address) from the users table.

    This is a sensitive read — it pulls personally identifiable info that
    should never flow to external sinks without review.
    """
    return {"id": user_id, "email": "redacted@example.com"}


@tool
def query_orders(user_id: str) -> list:
    """Read a user's order history from the orders table."""
    return []


@tool
def issue_refund(order_id: str, amount: float) -> bool:
    """Issue a refund for an order. Writes to the orders + payments tables.

    Mutates financial state — must be idempotent, rate-limited, and preceded
    by a policy check.
    """
    return True


@tool
def delete_user(user_id: str) -> bool:
    """Delete a user record from the users table. Destructive and irreversible."""
    return True


@tool
def send_email(to: str, subject: str, body: str) -> bool:
    """Send an email to any recipient. External communication, no gating."""
    return True


@tool
def post_to_slack(channel: str, message: str) -> bool:
    """Post a message to a public Slack channel."""
    return True


@tool
def execute_sql(query: str) -> list:
    """Run arbitrary SQL against the production database.

    Privileged operation — no auth tool exists in this set, so this is a
    missing-auth gap.
    """
    return []
