// agent-loop.js
// -----------------------------------------------------------------------
// This is the integration layer that was missing. It runs inside
// background.js (imported as an ES module — background.js was switched to
// "type": "module" in manifest.json for this). It chains together:
//
//   1. screen-reader  -> capture screenshot + extract interactive DOM elements
//   2. vision-engine  -> (via offscreen doc) detect faces/images in the screenshot
//   3. pii-vault      -> regex-scan each element's text, redact in place
//   4. schema-adapter -> assemble a ScreenContext matching server/schemas.py
//   5. server         -> POST /analyze, get back an AgentAction
//   6. screen-reader   -> execute the action (click/type/scroll) in the page
//
// Loops until the server returns "done", "ask_user", or "abort", or a
// step cap is hit (safety net against infinite loops during the demo).
// -----------------------------------------------------------------------

import { buildScreenContext } from "./schema-adapter.js";
import { scanText } from "../pii-vault/regex-rules.js";
import { getCredential } from "../pii-vault/vault.js";

// NOTE: point this at wherever server/main.py is actually running.
// Defaults to the local dev server from server/README.md.
const SERVER_BASE_URL = "http://localhost:8000";
const MAX_STEPS = 15; // safety cap so a bad loop can't run forever during a demo

let offscreenReady = false;

async function ensureOffscreenDocument() {
  if (offscreenReady) return;
  const existing = await chrome.offscreen.hasDocument?.();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: "offscreen/offscreen.html",
      reasons: ["WORKERS"],
      justification: "Runs the client-side vision model (Florence-2) that must not process on the server for privacy reasons.",
    });
  }
  offscreenReady = true;
}

function captureScreen() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "CAPTURE_SCREEN" }, (response) => {
      if (response?.success) resolve(response.screenshotUrl);
      else reject(new Error(response?.error || "screen capture failed"));
    });
  });
}

function sendToActiveTab(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return reject(new Error("no active tab"));
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(response);
      });
    });
  });
}

async function getDomElements() {
  // som-overlay.js already renders badges via RUN_SOM_PERCEPTION; we reuse
  // the same content-script pass but ask dom-extractor directly for the
  // structured list (RUN_SOM_PERCEPTION only returned a count before).
  const response = await sendToActiveTab({ action: "GET_INTERACTIVE_ELEMENTS" });
  if (!response?.success) throw new Error("failed to extract DOM elements from page");
  return response.elements;
}

async function runVisionDetection(imageUrl, imageWidth, imageHeight) {
  await ensureOffscreenDocument();
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { target: "offscreen", type: "RUN_VISION_DETECTION", imageUrl, imageWidth, imageHeight },
      (response) => {
        if (response?.success) resolve(response.detections);
        else reject(new Error(response?.error || "vision detection failed"));
      }
    );
  });
}

async function startServerSession(task) {
  const res = await fetch(`${SERVER_BASE_URL}/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task }),
  });
  if (!res.ok) throw new Error(`session/start failed: ${res.status}`);
  const data = await res.json();
  return data.session_id;
}

async function analyzeScreen(screenContext) {
  const res = await fetch(`${SERVER_BASE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(screenContext),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`analyze failed (${res.status}): ${detail.detail || res.statusText}`);
  }
  const data = await res.json();
  return data.action;
}

// Resolves the server's placeholder tokens (e.g. "{{USER_SAVED_PASSWORD}}")
// against the local encrypted vault. The server NEVER sees or invents the
// real value — see server/README.md "Why placeholders instead of real values".
async function resolveValueRef(valueRef, urlDomain) {
  if (!valueRef) return null;
  const match = /^\{\{USER_SAVED_(\w+)\}\}$/.exec(valueRef);
  if (!match) return valueRef; // literal value, not a placeholder
  const field = match[1].toLowerCase(); // "password" | "email" | ...
  const cred = await getCredential(urlDomain);
  if (!cred) throw new Error(`No saved credential for ${urlDomain} to resolve ${valueRef}`);
  if (field === "password") return cred.password;
  if (field === "email" || field === "username") return cred.username;
  return null;
}

async function executeAction(action, urlDomain) {
  if (action.action === "click") {
    return sendToActiveTab({
      action: "EXECUTE_SOM_ACTION",
      actionType: "click",
      targetId: action.element_id,
    });
  }
  if (action.action === "type") {
    const value = await resolveValueRef(action.value_ref, urlDomain);
    return sendToActiveTab({
      action: "EXECUTE_SOM_ACTION",
      actionType: "type",
      targetId: action.element_id,
      textValue: value,
    });
  }
  if (action.action === "scroll") {
    return sendToActiveTab({
      action: "EXECUTE_SOM_ACTION",
      actionType: "scroll",
      direction: action.direction,
      amount: action.amount_px,
    });
  }
  // "wait", "navigate_back", "done", "ask_user", "abort" need no DOM execution here
  return { success: true };
}

/**
 * Runs the full perceive -> redact -> reason -> act loop for one task.
 * @param {string} task - natural language goal, e.g. "log me into my bank account"
 * @param {Function} onStep - callback(stepInfo) for popup console logging
 */
export async function runAgentTask(task, onStep = () => {}) {
  const sessionId = await startServerSession(task);
  let lastActionResult = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    onStep({ phase: "capture", step });
    const screenshotUrl = await captureScreen();

    onStep({ phase: "dom-extract", step });
    const domElements = await getDomElements();

    onStep({ phase: "vision", step });
    let visionDetections = [];
    try {
      // imageWidth/imageHeight come from the page's viewport since the
      // screenshot is a viewport capture (see background.js captureVisibleTab)
      const { innerWidth, innerHeight } = await sendToActiveTab({ action: "GET_VIEWPORT_SIZE" })
        .then((r) => r || { innerWidth: 1280, innerHeight: 800 });
      visionDetections = await runVisionDetection(screenshotUrl, innerWidth, innerHeight);
    } catch (err) {
      // Vision is best-effort: if the local model fails/isn't loaded yet,
      // fall back to DOM-only redaction rather than blocking the whole task.
      console.warn("[agent-loop] vision detection unavailable, continuing DOM-only:", err.message);
    }

    const urlDomainResp = await sendToActiveTab({ action: "GET_URL_DOMAIN" });
    const urlDomain = urlDomainResp?.domain || "";
    const viewportResp = await sendToActiveTab({ action: "GET_VIEWPORT_SIZE" });

    const screenContext = buildScreenContext({
      sessionId,
      task,
      urlDomain,
      viewportSize: { width: viewportResp?.innerWidth || 1280, height: viewportResp?.innerHeight || 800 },
      domElements,
      visionDetections,
      scanText,
      stepIndex: step,
      lastActionResult,
    });

    onStep({
      phase: "redact",
      step,
      screenshotUrl,
      // canvas-redactor.js expects {x, y, width, height} regions in pixel
      // coords — RedactionTag.bbox from schema-adapter.js is already that shape.
      regions: screenContext.redactions.map((r) => r.bbox),
      redactionCount: screenContext.redactions.length,
    });

    onStep({ phase: "analyze", step, screenContext });
    const action = await analyzeScreen(screenContext);
    onStep({ phase: "action", step, action });

    if (action.action === "done") {
      onStep({ phase: "finished", step, action });
      return { status: "done", action };
    }
    if (action.action === "ask_user") {
      onStep({ phase: "ask_user", step, action });
      return { status: "ask_user", action };
    }
    if (action.action === "abort") {
      onStep({ phase: "aborted", step, action });
      return { status: "aborted", action };
    }

    try {
      await executeAction(action, urlDomain);
      lastActionResult = `${action.action} succeeded`;
    } catch (err) {
      lastActionResult = `${action.action} failed: ${err.message}`;
    }
  }

  return { status: "step_limit_reached" };
}
