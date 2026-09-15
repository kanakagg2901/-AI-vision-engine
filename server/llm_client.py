"""
Thin wrapper around Groq's API (OpenAI-compatible chat completions), using
forced tool-use so the model's response is always valid JSON matching
AgentAction - no regex/string parsing of free text.
"""

import os
import json
from groq import Groq

from schemas import ScreenContext, AgentAction
from prompts import SYSTEM_PROMPT, format_screen_context, ACTION_TOOL_SCHEMA

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

MODEL = "openai/gpt-oss-120b"


def _to_openai_tool(anthropic_style_tool: dict) -> dict:
    """Convert prompts.py's Anthropic-shaped tool schema into the OpenAI/Groq shape."""
    return {
        "type": "function",
        "function": {
            "name": anthropic_style_tool["name"],
            "description": anthropic_style_tool["description"],
            "parameters": anthropic_style_tool["input_schema"],
        },
    }


def get_next_action(ctx: ScreenContext, history: list[dict]) -> AgentAction:
    user_content = format_screen_context(ctx)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history + [
        {"role": "user", "content": user_content}
    ]

    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=500,
        messages=messages,
        tools=[_to_openai_tool(ACTION_TOOL_SCHEMA)],
        tool_choice={"type": "function", "function": {"name": "emit_action"}},
    )

    tool_call = response.choices[0].message.tool_calls[0]
    action_data = json.loads(tool_call.function.arguments)

    return AgentAction(**action_data)