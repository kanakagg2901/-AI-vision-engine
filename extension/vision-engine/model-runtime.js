// model-runtime.js
// -----------------------------------------------------------------------
// SWAPPED (was Florence-2 — see model-runtime.florence-2.archived.js,
// kept in full, not deleted).
//
// WHY: Florence-2's CAPTION_TO_PHRASE_GROUNDING task requires an
// autoregressive generate() call — even after the team's real CHANGE 1/2
// optimizations in the archived file (narrowing labels, merging into one
// call), that was still multiple seconds per screen. Not usable for a live
// demo loop that needs to run on every step.
//
// REPLACEMENT: MediaPipe's BlazeFace short-range FaceDetector. It's a
// single forward pass (bounding-box regression, no token generation) —
// typically well under 100ms — and returns REAL per-detection confidence
// scores, unlike Florence-2's grounding task which had no real scores and
// hardcoded every score to 1.0 (see the archived file's CHANGE 3 note).
//
// INTERFACE CONTRACT PRESERVED ON PURPOSE:
//   initModel(config)   -> { backend, ready }        (unchanged shape)
//   runInference(input) -> { boxes, labels, scores }  (unchanged shape;
//     boxes are still normalized 0-1 [x1,y1,x2,y2], exactly what
//     postprocess.js already expects)
// Nothing in postprocess.js, vision-worker.js, agent-loop.js, or
// schema-adapter.js needed to change because of this swap.
//
// SCOPE TRADE-OFF (flagged, not hidden): BlazeFace only detects faces. The
// old TARGET_LABELS included "image" (generic photo/graphic content) too.
// That capability is dropped here to hit today's demo — faces are the
// PII risk the problem statement calls out by name ("blurring faces"), so
// this is the right trade under time pressure. Restoring generic image
// detection later (via the archived Florence-2 code, or a small object
// detector) is a follow-up, not a regression introduced silently.
// -----------------------------------------------------------------------
import { FaceDetector, FilesetResolver } from './vendor/vision_bundle.mjs';
import { detectBackend } from './backend-detect.js';

// Only the small JS bundle (~150KB) is vendored locally, for the same CSP
// reason as transformers.js (see the archived file's CHANGE 4 note): a
// remote *script* import is blocked under MV3's default CSP. The WASM
// runtime and the model weights below are DATA fetches at runtime, not
// script loads, so — like the Hugging Face model weights before — they're
// unaffected by that restriction and can stay on Google's CDN/storage.
const WASM_FILESET_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let faceDetector = null;
let backendUsed = null;

export async function initModel(config = {}) {
  const device = config.device || await detectBackend(); // 'webgpu' or 'wasm' — same detection helper as before
  const delegate = device === 'webgpu' ? 'GPU' : 'CPU';

  const vision = await FilesetResolver.forVisionTasks(WASM_FILESET_URL);

  try {
    faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: config.modelAssetUrl || MODEL_ASSET_URL,
        delegate,
      },
      runningMode: 'IMAGE',
    });
    backendUsed = delegate === 'GPU' ? 'webgpu' : 'wasm';
  } catch (err) {
    console.warn(`Failed to init FaceDetector with delegate=${delegate}, falling back to CPU`, err);
    faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: config.modelAssetUrl || MODEL_ASSET_URL,
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
    });
    backendUsed = 'wasm';
  }

  return { backend: backendUsed, ready: true };
}

export async function runInference(imageInput) {
  if (!faceDetector) {
    throw new Error("Model not initialized — call initModel() first");
  }

  // vision-worker.js passes a data: URL (the screenshot) the same way it
  // did for Florence-2's RawImage.fromURL(). ImageBitmap decoding works
  // fine inside a Worker (no DOM needed for createImageBitmap/fetch).
  const imageBitmap = imageInput instanceof ImageBitmap
    ? imageInput
    : await urlToImageBitmap(imageInput);

  const result = faceDetector.detect(imageBitmap);

  const boxes = [];
  const labels = [];
  const scores = [];

  for (const detection of result.detections || []) {
    const bb = detection.boundingBox;
    if (!bb) continue;

    // Real confidence from the model — unlike Florence-2's hardcoded 1.0,
    // this makes postprocess.js's CONFIDENCE_THRESHOLD filter meaningful.
    const score = detection.categories?.[0]?.score ?? 0.9;

    boxes.push([
      bb.originX / imageBitmap.width,
      bb.originY / imageBitmap.height,
      (bb.originX + bb.width) / imageBitmap.width,
      (bb.originY + bb.height) / imageBitmap.height,
    ]);
    labels.push("face");
    scores.push(score);
  }

  return { boxes, labels, scores };
}

async function urlToImageBitmap(imageUrl) {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return await createImageBitmap(blob);
}
