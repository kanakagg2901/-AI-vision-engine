"""
Simulates the browser extension's traffic, so you can demo the server
end-to-end before the client-side ViT/redaction pipeline is wired up.

Run the server first:
    uvicorn main:app --reload --port 8000
Then:
    python demo_client.py
"""

import requests

BASE = "http://127.0.0.1:8000"

# 1. Start a session with a natural-language task
resp = requests.post(f"{BASE}/session/start", json={"task": "Log me into my email account"})
session_id = resp.json()["session_id"]
print("session:", session_id)

# 2. Simulate the sanitized scene graph the client would send for a login page.
#    Note: the password field is marked redacted, no raw value ever appears.
screen_context = {
    "session_id": session_id,
    "task": "Log me into my email account",
    "url_domain": "mail.example.com",
    "viewport": {"x": 0, "y": 0, "width": 1280, "height": 800},
    "step_index": 0,
    "elements": [
        {"element_id": "el_1", "role": "input", "selector": "#email",
         "label": "Email address", "redacted": False},
        {"element_id": "el_2", "role": "input", "selector": "#password",
         "label": None, "redacted": True, "redaction_ref": "redact_1"},
        {"element_id": "el_3", "role": "button", "selector": "#submit",
         "label": "Sign in", "redacted": False},
    ],
    "redactions": [
        {"tag_id": "redact_1", "category": "PASSWORD",
         "bbox": {"x": 100, "y": 240, "width": 200, "height": 30}, "confidence": 0.97}
    ],
}

resp = requests.post(f"{BASE}/analyze", json=screen_context)
print(resp.json())
