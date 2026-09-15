// agent-loop.js

import { buildScreenContext } from "./schema-adapter.js";
import { scanText } from "../pii-vault/regex-rules.js";
import { getCredential } from "../pii-vault/vault.js";

const SERVER_BASE_URL = "http://localhost:8000";
const MAX_STEPS = 15;

let offscreenReady = false;
let stopRequested = false;


// ============================================================
// OFFSCREEN DOCUMENT
// ============================================================

async function ensureOffscreenDocument() {
  if (offscreenReady) return;

  const existing = await chrome.offscreen.hasDocument?.();

  if (!existing) {
    await chrome.offscreen.createDocument({
      url: "offscreen/offscreen.html",
      reasons: ["WORKERS"],
      justification:
        "Runs the client-side vision model and local privacy processing."
    });
  }

  offscreenReady = true;
}


// ============================================================
// SCREEN CAPTURE
// ============================================================

function captureScreen() {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      null,
      { format: "png" },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(chrome.runtime.lastError.message)
          );
        } else if (!dataUrl) {
          reject(
            new Error("screen capture returned no data")
          );
        } else {
          resolve(dataUrl);
        }
      }
    );
  });
}


// ============================================================
// ACTIVE TAB MESSAGE
// ============================================================

function sendToActiveTab(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(
      {
        active: true,
        currentWindow: true
      },
      (tabs) => {
        if (!tabs[0]) {
          reject(new Error("no active tab"));
          return;
        }

        chrome.tabs.sendMessage(
          tabs[0].id,
          message,
          (response) => {
            if (chrome.runtime.lastError) {
              reject(
                new Error(
                  chrome.runtime.lastError.message
                )
              );
              return;
            }

            resolve(response);
          }
        );
      }
    );
  });
}


// ============================================================
// DOM EXTRACTION
// ============================================================

async function getDomElements() {
  const response = await sendToActiveTab({
    action: "GET_INTERACTIVE_ELEMENTS"
  });

  if (!response?.success) {
    throw new Error(
      "failed to extract DOM elements from page"
    );
  }

  return response.elements || [];
}


// ============================================================
// LOCAL VISION
// ============================================================

async function runVisionDetection(
  imageUrl,
  imageWidth,
  imageHeight
) {
  await ensureOffscreenDocument();

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        target: "offscreen",
        type: "RUN_VISION_DETECTION",
        imageUrl,
        imageWidth,
        imageHeight
      },
      (response) => {
        if (response?.success) {
          resolve(response.detections || []);
        } else {
          reject(
            new Error(
              response?.error ||
              "vision detection failed"
            )
          );
        }
      }
    );
  });
}


// ============================================================
// LOCAL SCREEN REDACTION
// ============================================================

async function redactScreenshot(
  imageUrl,
  regions,
  mode = "blackout"
) {
  await ensureOffscreenDocument();

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        target: "offscreen",
        type: "REDACT_SCREENSHOT",
        imageUrl,
        regions,
        mode
      },
      (response) => {
        if (response?.success) {
          resolve(response.sanitizedImage);
        } else {
          reject(
            new Error(
              response?.error ||
              "local screenshot redaction failed"
            )
          );
        }
      }
    );
  });
}


// ============================================================
// SERVER SESSION
// ============================================================

async function startServerSession(task) {
  const res = await fetch(
    `${SERVER_BASE_URL}/session/start`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ task })
    }
  );

  if (!res.ok) {
    throw new Error(
      `session/start failed: ${res.status}`
    );
  }

  const data = await res.json();

  return data.session_id;
}


// ============================================================
// SERVER ANALYSIS
// ============================================================

async function analyzeScreen(screenContext) {
  const res = await fetch(
    `${SERVER_BASE_URL}/analyze`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(screenContext)
    }
  );

  if (!res.ok) {
    const detail = await res
      .json()
      .catch(() => ({}));

    throw new Error(
      `analyze failed (${res.status}): ${
        detail.detail || res.statusText
      }`
    );
  }

  const data = await res.json();

  return data.action;
}


// ============================================================
// SAVED CREDENTIAL RESOLUTION
// ============================================================

async function resolveValueRef(
  valueRef,
  urlDomain
) {
  if (!valueRef) {
    return valueRef;
  }

  const match =
    /^\{\{USER_SAVED_(\w+)\}\}$/.exec(valueRef);

  // Normal non-placeholder value
  if (!match) {
    return valueRef;
  }

  const field =
    match[1].toLowerCase();

  const cred =
    await getCredential(urlDomain);

  console.log(
    "[Aegis Credential Debug]",
    {
      domain: urlDomain,
      credentialFound: !!cred,
      usernameFound: !!cred?.username,
      passwordFound: !!cred?.password
    }
  );

  if (!cred) {
    throw new Error(
      `No saved credential found for ${urlDomain}`
    );
  }

  if (field === "password") {
    return cred.password;
  }

  if (
    field === "email" ||
    field === "username"
  ) {
    return cred.username;
  }

  throw new Error(
    `Unsupported saved credential field: ${field}`
  );
}


// ============================================================
// ACTION EXECUTION
// ============================================================

async function executeAction(
  action,
  urlDomain
) {
  if (!action) {
    throw new Error("No action returned by server");
  }


  // ----------------------------------------------------------
  // CLICK
  // ----------------------------------------------------------

  if (action.action === "click") {
    return sendToActiveTab({
      action: "EXECUTE_SOM_ACTION",
      actionType: "click",
      targetId: action.element_id
    });
  }


  // ----------------------------------------------------------
  // TYPE
  // ----------------------------------------------------------

  if (action.action === "type") {
    const value =
      await resolveValueRef(
        action.value_ref,
        urlDomain
      );

    if (value == null) {
      throw new Error(
        "Resolved type value is empty"
      );
    }

    return sendToActiveTab({
      action: "EXECUTE_SOM_ACTION",
      actionType: "type",
      targetId: action.element_id,
      textValue: value
    });
  }


  // ----------------------------------------------------------
  // SCROLL
  // ----------------------------------------------------------

  if (action.action === "scroll") {
    return sendToActiveTab({
      action: "EXECUTE_SOM_ACTION",
      actionType: "scroll",
      direction: action.direction,
      amount: action.amount_px
    });
  }


  // ----------------------------------------------------------
  // WAIT
  // ----------------------------------------------------------

  if (action.action === "wait") {
    const amount =
      action.amount_px || 1000;

    await new Promise((resolve) =>
      setTimeout(resolve, amount)
    );

    return { success: true };
  }


  // ----------------------------------------------------------
  // NAVIGATE BACK
  // ----------------------------------------------------------

  if (action.action === "navigate_back") {
    return sendToActiveTab({
      action: "GO_BACK"
    });
  }


  // ----------------------------------------------------------
  // DONE / ASK USER / ABORT
  // ----------------------------------------------------------

  if (
    action.action === "done" ||
    action.action === "ask_user" ||
    action.action === "abort"
  ) {
    return {
      success: true
    };
  }


  throw new Error(
    `Unsupported action: ${action.action}`
  );
}


// ============================================================
// STOP
// ============================================================

export function requestStop() {
  stopRequested = true;
}


// ============================================================
// MAIN AGENT LOOP
// ============================================================

export async function runAgentTask(
  task,
  onStep = () => {}
) {
  stopRequested = false;

  const sessionId =
    await startServerSession(task);

  let lastActionResult = null;
  let lastActionSignature = null;


  // ==========================================================
  // STEP LOOP
  // ==========================================================

  for (
    let step = 0;
    step < MAX_STEPS;
    step++
  ) {

    // --------------------------------------------------------
    // STOP CHECK
    // --------------------------------------------------------

    if (stopRequested) {
      onStep({
        phase: "stopped",
        step
      });

      stopRequested = false;

      return {
        status: "stopped"
      };
    }


    // --------------------------------------------------------
    // CAPTURE
    // --------------------------------------------------------

    onStep({
      phase: "capture",
      step
    });

    const screenshotUrl =
      await captureScreen();


    // --------------------------------------------------------
    // DOM
    // --------------------------------------------------------

    onStep({
      phase: "dom-extract",
      step
    });

    const domElements =
      await getDomElements();


    // --------------------------------------------------------
    // LOCAL VISION
    // --------------------------------------------------------

    onStep({
      phase: "vision",
      step
    });

    let visionDetections = [];

    try {
      const viewport =
        await sendToActiveTab({
          action: "GET_VIEWPORT_SIZE"
        });

      const innerWidth =
        viewport?.innerWidth || 1280;

      const innerHeight =
        viewport?.innerHeight || 800;

      visionDetections =
        await runVisionDetection(
          screenshotUrl,
          innerWidth,
          innerHeight
        );

    } catch (err) {

      console.warn(
        "[agent-loop] vision unavailable, continuing DOM-only:",
        err.message
      );

    }


    // --------------------------------------------------------
    // DOMAIN
    // --------------------------------------------------------

    const urlDomainResp =
      await sendToActiveTab({
        action: "GET_URL_DOMAIN"
      });

    const urlDomain =
      urlDomainResp?.domain || "";


    // --------------------------------------------------------
    // VIEWPORT
    // --------------------------------------------------------

    const viewportResp =
      await sendToActiveTab({
        action: "GET_VIEWPORT_SIZE"
      });


    // --------------------------------------------------------
    // BUILD SANITIZED CONTEXT
    // --------------------------------------------------------

    const screenContext =
      buildScreenContext({
        sessionId,
        task,
        urlDomain,

        viewportSize: {
          width:
            viewportResp?.innerWidth ||
            1280,

          height:
            viewportResp?.innerHeight ||
            800
        },

        domElements,
        visionDetections,
        scanText,
        stepIndex: step,
        lastActionResult
      });


    // --------------------------------------------------------
    // REDACTION REGIONS
    // --------------------------------------------------------

    const redactionRegions =
      screenContext.redactions
        .filter((r) => r.bbox)
        .map((r) => r.bbox);


    onStep({
      phase: "redact",
      step,
      screenshotUrl,
      regions: redactionRegions,
      redactionCount:
        redactionRegions.length
    });


    // --------------------------------------------------------
    // LOCAL REDACTION
    // --------------------------------------------------------

    let sanitizedScreenshotUrl = null;

    try {

      if (redactionRegions.length > 0) {

        sanitizedScreenshotUrl =
          await redactScreenshot(
            screenshotUrl,
            redactionRegions,
            "blackout"
          );

        console.log(
          `[agent-loop] local redaction complete: ${redactionRegions.length} region(s)`
        );

      } else {

        console.log(
          "[agent-loop] no regions to redact"
        );

      }

    } catch (err) {

      console.error(
        "[agent-loop] LOCAL REDACTION FAILED:",
        err
      );

      // NEVER continue with an unsanitized screen.
      throw new Error(
        `Privacy sanitization failed. Refusing to send unsanitized screen: ${err.message}`
      );
    }


    // --------------------------------------------------------
    // ANALYZE
    // --------------------------------------------------------

    onStep({
      phase: "analyze",
      step,
      screenContext
    });

    const action =
      await analyzeScreen(
        screenContext
      );


    // --------------------------------------------------------
    // ACTION UPDATE
    // --------------------------------------------------------

    onStep({
      phase: "action",
      step,
      action
    });


    // --------------------------------------------------------
    // DONE
    // --------------------------------------------------------

    if (action.action === "done") {

      onStep({
        phase: "finished",
        step,
        action
      });

      return {
        status: "done",
        action
      };
    }


    // --------------------------------------------------------
    // ASK USER
    // --------------------------------------------------------

    if (
      action.action === "ask_user"
    ) {

      onStep({
        phase: "ask_user",
        step,
        action
      });

      return {
        status: "ask_user",
        action
      };
    }


    // --------------------------------------------------------
    // ABORT
    // --------------------------------------------------------

    if (
      action.action === "abort"
    ) {

      onStep({
        phase: "aborted",
        step,
        action
      });

      return {
        status: "aborted",
        action
      };
    }


    // --------------------------------------------------------
    // PREVENT IDENTICAL ACTION LOOP
    // --------------------------------------------------------

    const actionSignature =
      JSON.stringify({
        action: action.action,
        element_id:
          action.element_id,
        selector:
          action.selector,
        value_ref:
          action.value_ref,
        direction:
          action.direction
      });


    if (
      actionSignature ===
      lastActionSignature
    ) {

      lastActionResult =
        "The previous action was already executed. Choose the NEXT action instead of repeating it.";

      console.warn(
        "[agent-loop] repeated action detected:",
        actionSignature
      );

      continue;
    }


    // --------------------------------------------------------
    // EXECUTE EXACTLY ONCE
    // --------------------------------------------------------

    try {

      const result =
        await executeAction(
          action,
          urlDomain
        );

      lastActionSignature =
        actionSignature;

      if (
        result?.success === false
      ) {

        lastActionResult =
          `${action.action} failed.`;

      } else {

        lastActionResult =
          `${action.action} succeeded.`;
      }


      onStep({
        phase: "executed",
        step,
        action,
        result
      });


    } catch (err) {

      console.error(
        "[agent-loop] action execution failed:",
        err
      );

      lastActionSignature =
        actionSignature;

      lastActionResult =
        `${action.action} failed: ${err.message}`;


      onStep({
        phase: "action-error",
        step,
        action,
        error: err.message
      });
    }
  }


  // ==========================================================
  // STEP LIMIT
  // ==========================================================

  onStep({
    phase: "finished",
    step: MAX_STEPS,
    action: {
      action: "step_limit_reached"
    }
  });

  return {
    status: "step_limit_reached"
  };
}