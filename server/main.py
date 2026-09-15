"""
FastAPI server for the privacy-preserving vision agent (server-side half).

Endpoints:
  POST /session/start    -> create a session for a new task
  POST /analyze          -> receive sanitized screen context, return next action
  POST /session/end      -> clean up session state

Run:
  uvicorn main:app --reload --port 8000
"""

import uuid
import time
import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from schemas import ScreenContext, AnalyzeResponse
from llm_client import get_next_action

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agent-server")

app = FastAPI(title="Privacy-Preserving Vision Agent - Server")

SESSIONS: dict[str, dict] = {}

MAX_HISTORY_TURNS = 6


class StartSessionRequest(BaseModel):
    task: str


class StartSessionResponse(BaseModel):
    session_id: str


@app.post("/session/start", response_model=StartSessionResponse)
def start_session(req: StartSessionRequest):
    session_id = str(uuid.uuid4())
    SESSIONS[session_id] = {"task": req.task, "history": [], "created": time.time()}
    logger.info(f"session started {session_id} task={req.task!r}")
    return StartSessionResponse(session_id=session_id)


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(ctx: ScreenContext):
    session = SESSIONS.get(ctx.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="unknown session_id; call /session/start first")

    _redact_if_looks_unredacted(ctx)

    t0 = time.time()
    action = get_next_action(ctx, session["history"])
    latency_ms = (time.time() - t0) * 1000
    logger.info(f"session={ctx.session_id} step={ctx.step_index} action={action.action} "
                f"latency={latency_ms:.0f}ms")

    session["history"].append({"role": "user", "content": f"[step {ctx.step_index} context omitted from log]"})
    session["history"].append({"role": "assistant", "content": action.model_dump_json()})
    session["history"] = session["history"][-MAX_HISTORY_TURNS * 2:]

    return AnalyzeResponse(session_id=ctx.session_id, step_index=ctx.step_index, action=action)


@app.post("/session/end")
def end_session(session_id: str):
    SESSIONS.pop(session_id, None)
    return {"status": "ended"}


def _luhn_valid(digits: str) -> bool:
    """Same validation standard pii-vault/checksum.js already applies client-side."""
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def _redact_if_looks_unredacted(ctx: ScreenContext) -> None:
    """
    Second-layer privacy check: catch anything that looks like it slipped
    through client-side redaction, and sanitize it in place rather than
    hard-blocking the whole request.
    """
    import re
    email_pattern = re.compile(r"[\w\.-]+@[\w\.-]+\.\w+")
    card_candidate_pattern = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")

    for el in ctx.elements:
        if el.redacted:
            continue
        text = el.label or ""
        original_text = text

        email_match = email_pattern.search(text)
        if email_match:
            text = text[:email_match.start()] + "[EMAIL]" + text[email_match.end():]

        for match in list(card_candidate_pattern.finditer(text))[::-1]:
            digits = re.sub(r"[ -]", "", match.group(0))
            if len(digits) in (13, 15, 16, 17, 18, 19) and _luhn_valid(digits):
                text = text[:match.start()] + "[CARD]" + text[match.end():]

        if text != original_text:
            logger.warning(
                f"session={ctx.session_id} step={ctx.step_index}: server-side redaction "
                f"caught unredacted pattern in element {el.element_id} that the client "
                f"missed - sanitized before sending to the model."
            )
            el.label = text
            el.redacted = True