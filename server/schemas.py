"""
Data contracts between the browser extension (client) and this FastAPI server.

Design principle: the server should NEVER see raw pixels, raw text values of
sensitive fields, or unredacted PII. It only sees a *sanitized scene graph* -
a structured, DOM/vision-derived description of the screen where sensitive
regions have been replaced with typed placeholder tokens by the client-side
ViT + redaction pipeline.
"""

from __future__ import annotations
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Inbound: sanitized screen context sent BY the client
# ---------------------------------------------------------------------------

class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class RedactionTag(BaseModel):
    """
    A single redacted region. The client's local model has already
    detected + blurred/masked this region; the server only gets metadata,
    never the underlying content.
    """
    tag_id: str                     # e.g. "redact_3"
    category: Literal[
        "FACE", "PASSWORD", "EMAIL", "PHONE", "NAME",
        "ADDRESS", "CARD_NUMBER", "OTP", "GENERIC_PII"
    ]
    bbox: BoundingBox
    confidence: float = Field(ge=0.0, le=1.0)


class UIElement(BaseModel):
    """
    One element of the sanitized scene graph (a button, input, text block,
    image region, etc.), analogous to a redacted accessibility tree node.
    """
    element_id: str                 # stable selector-able id, e.g. "el_12"
    role: str                       # "button" | "input" | "text" | "image" | "link" | ...
    selector: Optional[str] = None  # CSS selector or accessibility path the
                                     # client can resolve back to a real element
    label: Optional[str] = None     # visible non-sensitive text/aria-label
    bbox: Optional[BoundingBox] = None
    redacted: bool = False
    redaction_ref: Optional[str] = None  # points to a RedactionTag.tag_id


class ScreenContext(BaseModel):
    """
    The full payload the extension POSTs to /analyze.
    This is the ONLY thing that crosses the network to the server.
    """
    session_id: str
    task: str                       # natural-language user goal, e.g.
                                     # "log me into my bank account"
    url_domain: Optional[str] = None       # domain only, never full URL w/ query params
    viewport: BoundingBox
    elements: list[UIElement]
    redactions: list[RedactionTag] = Field(default_factory=list)
    step_index: int = 0
    last_action_result: Optional[str] = None   # e.g. "click succeeded", "element not found"


# ---------------------------------------------------------------------------
# Outbound: action instruction returned TO the client
# ---------------------------------------------------------------------------

class AgentAction(BaseModel):
    action: Literal[
        "click", "type", "scroll", "wait", "navigate_back",
        "ask_user", "done", "abort"
    ]
    selector: Optional[str] = None
    element_id: Optional[str] = None
    # For "type": the VALUE must reference a client-side placeholder the
    # extension resolves locally (e.g. "{{USER_SAVED_EMAIL}}"), never a
    # literal secret authored server-side.
    value_ref: Optional[str] = None
    direction: Optional[Literal["up", "down"]] = None
    amount_px: Optional[int] = None
    reasoning: str                  # short rationale, useful for logging/debug
    confidence: float = Field(ge=0.0, le=1.0, default=0.8)
    ask_user_message: Optional[str] = None


class AnalyzeResponse(BaseModel):
    session_id: str
    step_index: int
    action: AgentAction
