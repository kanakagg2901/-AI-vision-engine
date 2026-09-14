// schema-adapter.js
// -----------------------------------------------------------------------
// This is the piece that was missing: it translates the output of each
// person's module into the exact JSON shape server/schemas.py validates
// (ScreenContext / UIElement / RedactionTag), so the FastAPI server can
// accept it without a 422.
//
// Server contract (see server/schemas.py):
//   RedactionTag.category must be one of:
//     "FACE" | "PASSWORD" | "EMAIL" | "PHONE" | "NAME" |
//     "ADDRESS" | "CARD_NUMBER" | "OTP" | "GENERIC_PII"
//   UIElement: { element_id, role, selector, label, bbox, redacted, redaction_ref }
//   ScreenContext: { session_id, task, url_domain, viewport, elements, redactions,
//                     step_index, last_action_result }
// -----------------------------------------------------------------------

// pii-vault/regex-rules.js types -> server category enum
// (AADHAAR and CVV have no direct server category, so they fall back to
// GENERIC_PII rather than crashing pydantic validation with an unknown enum value.)
const PII_TYPE_TO_CATEGORY = {
  EMAIL: "EMAIL",
  PHONE: "PHONE",
  CARD: "CARD_NUMBER",
  PASSWORD: "PASSWORD",
  AADHAAR: "GENERIC_PII",
  CVV: "GENERIC_PII",
};

// vision-engine/model-runtime.js labels -> server category enum
const VISION_LABEL_TO_CATEGORY = {
  face: "FACE",
  image: "GENERIC_PII", // a detected photo/image region may contain PII we can't OCR client-side; treat conservatively
};

let redactionCounter = 0;
let elementCounter = 0;

export function resetIdCounters() {
  redactionCounter = 0;
  elementCounter = 0;
}

/**
 * Convert one pii-vault scanText() match (already tied to a specific DOM
 * element's text) into a server RedactionTag.
 * @param {Object} match - { type, value, raw, index, confidence } from regex-rules.js
 * @param {Object} bbox - { x, y, width, height } of the element the text came from
 */
export function piiMatchToRedactionTag(match, bbox) {
  const tag_id = `redact_${redactionCounter++}`;
  const category = PII_TYPE_TO_CATEGORY[match.type] || "GENERIC_PII";
  return {
    tag_id,
    category,
    bbox,
    confidence: typeof match.confidence === "number" ? match.confidence : 0.8,
  };
}

/**
 * Convert one vision-engine detection (from postprocess.js output) into a
 * server RedactionTag. Detection boxes from postprocess.js are already in
 * real pixel coordinates: [x1, y1, x2, y2].
 * @param {Object} detection - { box: [x1,y1,x2,y2], label, score }
 */
export function visionDetectionToRedactionTag(detection) {
  const tag_id = `redact_${redactionCounter++}`;
  const category = VISION_LABEL_TO_CATEGORY[detection.label] || "GENERIC_PII";
  const [x1, y1, x2, y2] = detection.box;
  return {
    tag_id,
    category,
    bbox: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
    confidence: typeof detection.score === "number" ? detection.score : 0.8,
  };
}

/**
 * Convert one dom-extractor.js interactive element into a server UIElement,
 * running pii-vault's regex scan on its visible text and redacting the
 * label in place if anything sensitive is found. Password-type inputs are
 * always redacted regardless of what regex finds (their value is never in
 * innerText anyway, but we don't want to trust that blindly).
 *
 * @param {Object} el - one entry from P3DomExtractor.extractInteractiveElements()
 * @param {Function} scanText - regex-rules.js scanText
 * @param {Array} redactionsOut - RedactionTag array to push into when a match is found
 */
export function domElementToUIElement(el, scanText, redactionsOut) {
  const element_id = `el_${el.id ?? elementCounter++}`;
  const bbox = el.boundingBox
    ? {
        x: el.boundingBox.left,
        y: el.boundingBox.top,
        width: el.boundingBox.width,
        height: el.boundingBox.height,
      }
    : null;

  const isPasswordField = el.tagName === "input" && el.type === "password";
  const rawText = el.innerText || "";
  const matches = isPasswordField ? [] : scanText(rawText);

  let redacted = isPasswordField;
  let redaction_ref = null;
  let label = rawText;

  if (isPasswordField) {
    label = "[PASSWORD]";
    const tag = piiMatchToRedactionTag(
      { type: "PASSWORD", confidence: 0.95 },
      bbox || { x: 0, y: 0, width: 0, height: 0 }
    );
    redactionsOut.push(tag);
    redaction_ref = tag.tag_id;
  } else if (matches.length > 0) {
    redacted = true;
    // redact the visible label text itself so raw PII never leaves the device
    let sanitized = rawText;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      sanitized = sanitized.slice(0, m.index) + `[${m.type}]` + sanitized.slice(m.index + m.raw.length);
    }
    label = sanitized;

    // one RedactionTag per match, all pointing at this element's bbox
    // (element-level granularity — good enough for the HUD to blackout the whole field)
    for (const m of matches) {
      const tag = piiMatchToRedactionTag(m, bbox || { x: 0, y: 0, width: 0, height: 0 });
      redactionsOut.push(tag);
      redaction_ref = tag.tag_id; // last one wins if multiple; fine for redacted=true purposes
    }
  }

  return {
    element_id,
    role: el.tagName === "input" ? (el.type || "input") : el.tagName,
    selector: `[data-som-id="${el.id}"]`,
    label: label.slice(0, 200), // keep payload small; server doesn't need full text
    bbox,
    redacted,
    redaction_ref,
  };
}

/**
 * Assemble the full ScreenContext payload the server expects.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.task
 * @param {string} params.urlDomain
 * @param {{width:number, height:number}} params.viewportSize
 * @param {Array} params.domElements - raw output of P3DomExtractor.extractInteractiveElements()
 * @param {Array} params.visionDetections - raw output of postprocess.js (vision-engine)
 * @param {Function} params.scanText - regex-rules.js scanText
 * @param {number} params.stepIndex
 * @param {string|null} params.lastActionResult
 */
export function buildScreenContext({
  sessionId,
  task,
  urlDomain,
  viewportSize,
  domElements,
  visionDetections,
  scanText,
  stepIndex,
  lastActionResult,
}) {
  resetIdCounters();
  const redactions = [];

  const elements = domElements.map((el) => domElementToUIElement(el, scanText, redactions));

  for (const detection of visionDetections || []) {
    redactions.push(visionDetectionToRedactionTag(detection));
  }

  return {
    session_id: sessionId,
    task,
    url_domain: urlDomain,
    viewport: { x: 0, y: 0, width: viewportSize.width, height: viewportSize.height },
    elements,
    redactions,
    step_index: stepIndex,
    last_action_result: lastActionResult ?? null,
  };
}
