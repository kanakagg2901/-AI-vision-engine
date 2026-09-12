"""
Thin wrapper around the Anthropic API. Uses forced tool-use so the model's
response is always valid JSON matching AgentAction - no regex/string parsing
of free text, which is a common source of flaky agent demos.
"""

import os
import json
from anthropic import Anthropic

from schemas import ScreenContext, AgentAction
from prompts import SYSTEM_PROMPT, format_screen_context, ACTION_TOOL_SCHEMA

client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

MODEL = "claude-sonnet-4-5"  # swap for a smaller/cheaper model if latency-bound


def get_next_action(ctx: ScreenContext, history: list[dict]) -> AgentAction:
    """
    history: list of prior {"role": "user"/"assistant", "content": ...} turns
             for this session_id, so the model has short-term memory of the
             multi-step task without the client re-sending everything raw.
    """
    user_content = format_screen_context(ctx)

    messages = history + [{"role": "user", "content": user_content}]

    response = client.messages.create(
        model=MODEL,
        max_tokens=500,
        system=SYSTEM_PROMPT,
        messages=messages,
        tools=[ACTION_TOOL_SCHEMA],
        tool_choice={"type": "tool", "name": "emit_action"},
    )

    tool_block = next(b for b in response.content if b.type == "tool_use")
    action_data = tool_block.input

    return AgentAction(**action_data)
