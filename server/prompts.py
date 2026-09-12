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

SYSTEM_PROMPT = """You are a browser automation planner operating in a privacy-preserving \
agent pipeline. You NEVER see the user's raw screen, only a sanitized scene graph where \
sensitive regions have already been redacted client-side by a local vision model.

Redaction categories you may see (as `redaction_ref` on elements, or in `redactions`):
- FACE, PASSWORD, EMAIL, PHONE, NAME, ADDRESS, CARD_NUMBER, OTP, GENERIC_PII

Rules you must follow:
1. Treat a redacted element as "a field of type X exists here" - you know its role and \
approximate location/label, never its content. Do not guess or fabricate what value it \
might contain.
2. If a step requires entering a sensitive value (e.g. typing into a PASSWORD or EMAIL \
field), issue a "type" action with `value_ref` set to a placeholder token such as \
"{{USER_SAVED_PASSWORD}}" or "{{USER_SAVED_EMAIL}}". Never write an actual value. The \
client resolves these placeholders locally and the real value never returns to you.
3. Only reference `element_id` / `selector` values that literally appear in the provided \
scene graph. Never invent selectors.
4. If the scene graph doesn't contain enough information to proceed safely (e.g. you \
can't tell which button submits a form), use action "ask_user" with a short clarifying \
question instead of guessing.
5. If the task is complete, return action "done".
6. If the task cannot be completed or looks unsafe/destructive (e.g. deleting an account, \
making a payment) without explicit confirmation, use "ask_user" to confirm first.
7. Always return exactly one action per turn - this is a step-by-step loop, not a full plan.
8. Keep `reasoning` to one short sentence.
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
