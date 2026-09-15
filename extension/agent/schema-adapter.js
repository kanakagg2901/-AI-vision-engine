// schema-adapter.js
const PII_TYPE_TO_CATEGORY = {
  EMAIL: "EMAIL",
  PHONE: "PHONE",
  CARD: "CARD_NUMBER",
  PASSWORD: "PASSWORD",
  AADHAAR: "GENERIC_PII",
  CVV: "GENERIC_PII",
};

const VISION_LABEL_TO_CATEGORY = {
  face: "FACE",
  image: "GENERIC_PII",
};

let redactionCounter = 0;
let elementCounter = 0;

export function resetIdCounters() {
  redactionCounter = 0;
  elementCounter = 0;
}

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
    let sanitized = rawText;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      sanitized = sanitized.slice(0, m.index) + `[${m.type}]` + sanitized.slice(m.index + m.raw.length);
    }
    label = sanitized;

    for (const m of matches) {
      const tag = piiMatchToRedactionTag(m, bbox || { x: 0, y: 0, width: 0, height: 0 });
      redactionsOut.push(tag);
      redaction_ref = tag.tag_id;
    }
  }

  return {
    element_id,
    role:
  el.tagName === "input"
    ? `input:${el.type || "text"}`
    : el.tagName.toLowerCase(),
    selector: `[data-som-id="${el.id}"]`,
    label: label.slice(0, 80),
    bbox,
    redacted,
    redaction_ref,
  };
}

const MAX_ELEMENTS_PER_REQUEST = 60;

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

  let cappedDomElements = domElements;
  if (domElements.length > MAX_ELEMENTS_PER_REQUEST) {
    const withText = domElements
      .filter((el) => (el.innerText || "").trim().length > 0)
      .sort((a, b) => (b.innerText || "").trim().length - (a.innerText || "").trim().length);
    const withoutText = domElements.filter((el) => !(el.innerText || "").trim().length > 0);
    cappedDomElements = [...withText, ...withoutText].slice(0, MAX_ELEMENTS_PER_REQUEST);
  }

  const elements = cappedDomElements.map((el) => domElementToUIElement(el, scanText, redactions));

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