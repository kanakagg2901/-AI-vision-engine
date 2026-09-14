// -----------------------------------------------------------------------
// CHANGE 4 (integration pass): switched this from a CDN import to the
// vendored copy at ./vendor/transformers.min.mjs.
// Reason: MV3 extension pages/workers use a default CSP of
// "script-src 'self' 'wasm-unsafe-eval'". A remote ES module import (or
// `new Worker(cdnUrl)`) is script execution from a non-'self' origin and
// gets blocked at runtime — this worked in the standalone test.html only
// because that page isn't loaded as a packaged/unpacked extension page
// under the extension's CSP. The model weights themselves (fetched by
// from_pretrained() from huggingface.co) are unaffected by this — those
// are data fetches, not script loads, so they still come from the network
// normally; only the *library code* needed vendoring.
// -----------------------------------------------------------------------
import {
  Florence2ForConditionalGeneration,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
} from './vendor/transformers.min.mjs';
import { detectBackend } from './backend-detect.js';

// -----------------------------------------------------------------------
// CHANGE 1: Narrowed TARGET_LABELS from 5 down to 2.
// Reason: password-field / text-field / button are already detected 100%
// accurately and instantly from the DOM (Person 3/Person 4's work) -- no
// model needed for those. Vision should only handle what the DOM CANNOT
// tell us: faces and photo/image content. This directly cuts our biggest
// latency cost (fewer generate() calls) and removes a source of
// inaccurate localization we saw on form/button elements.
// -----------------------------------------------------------------------
const TARGET_LABELS = ["face", "image"];

const PROMPT_PHRASES = {
  "face": "a human face",
  "image": "a photo or image",
};

let model = null;
let processor = null;
let tokenizer = null;
let backendUsed = null;

export async function initModel(config = {}) {
  const modelId = config.modelId || 'onnx-community/Florence-2-base-ft';
  const device = config.device || await detectBackend(); // 'webgpu' or 'wasm'

  try {
    model = await Florence2ForConditionalGeneration.from_pretrained(modelId, {
      dtype: 'fp32',
      device: device,
    });
    backendUsed = device;
  } catch (err) {
    console.warn(`Failed to load model on ${device}, falling back to wasm`, err);
    model = await Florence2ForConditionalGeneration.from_pretrained(modelId, {
      dtype: 'fp32',
      device: 'wasm',
    });
    backendUsed = 'wasm';
  }

  processor = await AutoProcessor.from_pretrained(modelId);
  tokenizer = await AutoTokenizer.from_pretrained(modelId);

  return { backend: backendUsed, ready: true };
}

export async function runInference(imageInput) {
  if (!model || !processor || !tokenizer) {
    throw new Error("Model not initialized — call initModel() first");
  }

  const image = imageInput instanceof RawImage
    ? imageInput
    : await RawImage.fromURL(imageInput);

  const vision_inputs = await processor(image);

  const boxes = [];
  const labels = [];
  const scores = [];

  // -----------------------------------------------------------------------
  // CHANGE 2: Merged all label prompts into ONE combined phrase and ONE
  // generate() call, instead of looping model.generate() once per label.
  // Reason: each generate() call was the dominant cost (measured ~19s total
  // for 5 calls, roughly ~3-4s each). Combining into a single call should
  // cut total inference time roughly proportional to the number of labels
  // removed (5 calls -> 1 call), on top of the savings from CHANGE 1.
  // -----------------------------------------------------------------------
  const task = '<CAPTION_TO_PHRASE_GROUNDING>';
  const combinedPhrase = Object.values(PROMPT_PHRASES).join(". ");
  const prompts = processor.construct_prompts(`${task}${combinedPhrase}`);
  const text_inputs = tokenizer(prompts);

  const generated_ids = await model.generate({
    ...text_inputs,
    ...vision_inputs,
    max_new_tokens: 80, // slightly increased vs single-label calls since we may get multiple objects back at once
  });

  const generated_text = tokenizer.batch_decode(generated_ids, { skip_special_tokens: false })[0];
  const result = processor.post_process_generation(generated_text, task, image.size);

  const grounding = result[task];
  if (grounding && grounding.bboxes) {
    for (let i = 0; i < grounding.bboxes.length; i++) {
      const [x1, y1, x2, y2] = grounding.bboxes[i];
      const isFullImageFallback = (x2 - x1) / image.size[0] > 0.95 && (y2 - y1) / image.size[1] > 0.95;
      if (!isFullImageFallback) {
        boxes.push([x1 / image.size[0], y1 / image.size[1], x2 / image.size[0], y2 / image.size[1]]);

        // -----------------------------------------------------------------
        // CHANGE 3: Since we now ask for multiple labels in ONE call,
        // Florence-2 returns its own matched phrase text per box (via
        // grounding.labels, if the library provides it) instead of us
        // knowing the label in advance from the loop variable. We map that
        // returned phrase back to our exact contract label strings here so
        // labels stay exactly "face" or "image" as P4/P6 expect.
        // -----------------------------------------------------------------
        const matchedText = (grounding.labels && grounding.labels[i]) ? grounding.labels[i].toLowerCase() : "";
        const finalLabel = matchedText.includes("face") ? "face" : "image";
        labels.push(finalLabel);

        // NOTE: score is still hardcoded to 1.0 — CAPTION_TO_PHRASE_GROUNDING
        // is a generation-based task and does not return real confidence
        // values. Flagged to team; downstream confidence-threshold filtering
        // (P6) will not be meaningful until/unless we switch to a task type
        // with real scores.
        scores.push(1.0);
      }
    }
  }

  return { boxes, labels, scores };
}
