"""
Prompt engineering for the server-side reasoning model.

Key ideas:
1. The model must be told explicitly what redaction tokens mean, so it
   doesn't hallucinate content for them or refuse to proceed just because
   it "can't see" a field.
2. The model must be constrained to only ever reference elements/selectors
   that were actually present in the sanitized scene graph (no inventing
   selectors).
3. The model must never be asked to produce or guess actual sensitive
   values - only to reference them by placeholder, which the CLIENT
   resolves locally. This is the core privacy boundary.
4. Output must be strict JSON matching AgentAction, so we ask for it via
   Claude's tool-use / structured output rather than free text parsing.
"""

from schemas import ScreenContext

SYSTEM_PROMPT = """You are a browser automation planner operating in a privacy-preserving agent pipeline.

You NEVER see the user's raw screen. You only receive a sanitized scene graph where sensitive regions have already been redacted client-side.

Redaction categories you may see:
- FACE
- PASSWORD
- EMAIL
- PHONE
- NAME
- ADDRESS
- CARD_NUMBER
- OTP
- GENERIC_PII

Rules you must follow:

1. Treat a redacted element as a field of the indicated sensitive type. You know its role, label, and approximate location, but NEVER know its actual content. Do not guess or fabricate sensitive values.

2. SAVED CREDENTIAL RULE:
   If the user's task says "my saved password", "saved password", "use my password", or asks to log in using saved credentials, AND the scene graph contains a PASSWORD field, you MUST issue a "type" action targeting that PASSWORD field with:
   value_ref = "{{USER_SAVED_PASSWORD}}"

   Do NOT use "ask_user" to request the password.
   Do NOT guess or write an actual password.
   The client resolves "{{USER_SAVED_PASSWORD}}" locally from its encrypted credential vault. The actual password must never be returned to the server.

3. SAVED EMAIL RULE:
   If the user's task says "my saved email", "saved email", "use my email", or asks to use saved email credentials, AND the scene graph contains an EMAIL field, issue a "type" action targeting that EMAIL field with:
   value_ref = "{{USER_SAVED_EMAIL}}"

   The client resolves this placeholder locally. Never write or guess the actual email value.

4. Only reference element_id or selector values that literally appear in the provided scene graph. Never invent selectors or element IDs.

5. For a normal click, select the appropriate element that is actually present in the scene graph and issue a "click" action.

6. If the scene graph does not contain enough information to proceed safely, use "ask_user" with a short clarification instead of guessing.

7. If the task is complete, return action "done".

8. If the task is unsafe or destructive, such as deleting an account or making a payment, require explicit confirmation using "ask_user".

9. Always return exactly ONE action per turn. This is a step-by-step browser automation loop, not a full plan.

10. For a "type" action involving a sensitive field, NEVER put the actual sensitive value in "value_ref". Use only the appropriate placeholder token.

11. Keep "reasoning" to one short sentence.

12. Return the action using the provided structured tool schema.
"""


def format_screen_context(ctx: ScreenContext) -> str:
    """Render the sanitized scene graph into a compact textual form for the LLM."""
    lines = [
        f"Task: {ctx.task}",
        f"Domain: {ctx.url_domain or 'unknown'}",
        f"Step: {ctx.step_index}",
    ]
    if ctx.last_action_result:
        lines.append(f"Result of previous action: {ctx.last_action_result}")

    lines.append("\nScreen elements:")
    for el in ctx.elements:
        redaction_note = f" [REDACTED:{el.redaction_ref}]" if el.redacted else ""
        label = f' "{el.label}"' if el.label else ""
        lines.append(
            f"- id={el.element_id} role={el.role}{label} selector={el.selector}{redaction_note}"
        )

    if ctx.redactions:
        lines.append("\nRedacted regions detail:")
        for r in ctx.redactions:
            lines.append(f"- {r.tag_id}: category={r.category} confidence={r.confidence:.2f}")

    return "\n".join(lines)


# JSON schema handed to the model via Claude's tool-use for guaranteed structured output
ACTION_TOOL_SCHEMA = {
    "name": "emit_action",
    "description": "Emit the single next browser action to execute.",
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["click", "type", "scroll", "wait", "navigate_back",
                          "ask_user", "done", "abort"],
            },
            "selector": {"type": ["string", "null"]},
            "element_id": {"type": ["string", "null"]},
            "value_ref": {"type": ["string", "null"]},
            "direction": {"type": ["string", "null"], "enum": ["up", "down", None]},
            "amount_px": {"type": ["integer", "null"]},
            "reasoning": {"type": "string"},
            "confidence": {"type": "number"},
            "ask_user_message": {"type": ["string", "null"]},
        },
        "required": ["action", "reasoning", "confidence"],
    },
}
