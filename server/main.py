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
import sys
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add current directory to path for submodule resolution
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from schemas import ScreenContext, AnalyzeResponse
from llm_client import get_next_action

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agent-server")

app = FastAPI(title="Privacy-Preserving Vision Agent - Server")

# The extension popup runs on a chrome-extension:// origin, so without CORS the
# browser blocks every /analyze call before it reaches FastAPI. Wide open is
# fine here because the server only ever listens on localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store. Swap for Redis in a real deployment; keep it
# ephemeral either way - no long-term storage of screen contexts.
SESSIONS: dict[str, dict] = {}

MAX_HISTORY_TURNS = 6  # cap context growth -> keeps latency bounded


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

    # Basic leakage guard: reject payloads that look like they still contain
    # obviously unredacted sensitive patterns (defense in depth - the client
    # should already have redacted, this is a server-side sanity net).
    _reject_if_looks_unredacted(ctx)

    t0 = time.time()
    action = get_next_action(ctx, session["history"])
    latency_ms = (time.time() - t0) * 1000
    logger.info(f"session={ctx.session_id} step={ctx.step_index} action={action.action} "
                f"latency={latency_ms:.0f}ms")

    # Update rolling history (trimmed) for multi-turn coherence
    session["history"].append({"role": "user", "content": f"[step {ctx.step_index} context omitted from log]"})
    session["history"].append({"role": "assistant", "content": action.model_dump_json()})
    session["history"] = session["history"][-MAX_HISTORY_TURNS * 2:]

    return AnalyzeResponse(session_id=ctx.session_id, step_index=ctx.step_index, action=action)


@app.post("/session/end")
def end_session(session_id: str):
    SESSIONS.pop(session_id, None)
    return {"status": "ended"}


def _reject_if_looks_unredacted(ctx: ScreenContext) -> None:
    """
    Cheap heuristic safety net: flag payloads containing patterns that look
    like raw emails, card numbers, or phone numbers slipping through, in
    case the client-side redaction pipeline missed something. This does NOT
    replace the client-side detector - it's a last line of defense so the
    server can refuse to forward obviously-leaked data to the LLM.
    """
    import re
    patterns = {
        "email": re.compile(r"[\w\.-]+@[\w\.-]+\.\w+"),
        "card": re.compile(r"\b(?:\d[ -]*?){13,16}\b"),
    }
    for el in ctx.elements:
        if el.redacted:
            continue
        text = el.label or ""
        for name, pat in patterns.items():
            if pat.search(text):
                raise HTTPException(
                    status_code=400,
                    detail=f"Payload rejected: unredacted {name}-like pattern detected in "
                           f"element {el.element_id}. Client redaction must run before send."
                )