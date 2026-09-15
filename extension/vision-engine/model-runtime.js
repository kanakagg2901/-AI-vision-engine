// model-runtime.js
// -----------------------------------------------------------------------
// SWAPPED (was Florence-2 — see model-runtime.florence-2.archived.js,
// kept in full, not deleted).
//
// COVERAGE: this isn't face-only. It runs TWO fast MediaPipe models, both
// single forward passes (no token generation), both from the same already-
// vendored bundle:
//   1. FaceDetector (BlazeFace short-range) — faces.
//   2. ObjectDetector (EfficientDet-Lite0), restricted to a privacy-
//      relevant allowlist — person, cell phone, laptop, tv/monitor, book —
//      to catch screens, devices, and documents a face-only model would
//      miss, without wasting time flagging irrelevant objects.
// Both combined typically finish in well under 300ms total, vs. multiple
// seconds for a single Florence-2 generate() call.
//
// INTERFACE CONTRACT PRESERVED: initModel()/runInference() keep the exact
// same shapes as before. Nothing downstream needed to change.
// -----------------------------------------------------------------------
import { FaceDetector, ObjectDetector, FilesetResolver } from './vendor/vision_bundle.mjs';
import { detectBackend } from './backend-detect.js';

const WASM_FILESET_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const OBJECT_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite';

const OBJECT_CATEGORY_ALLOWLIST = ['person', 'cell phone', 'laptop', 'tv', 'book'];

let faceDetector = null;
let objectDetector = null;
let backendUsed = null;

export async function initModel(config = {}) {
  const device = config.device || await detectBackend();
  const delegate = device === 'webgpu' ? 'GPU' : 'CPU';

  const vision = await FilesetResolver.forVisionTasks(WASM_FILESET_URL);

  async function createDetectors(useDelegate) {
    const face = await FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: config.faceModelUrl || FACE_MODEL_URL, delegate: useDelegate },
      runningMode: 'IMAGE',
    });
    const object = await ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: config.objectModelUrl || OBJECT_MODEL_URL, delegate: useDelegate },
      runningMode: 'IMAGE',
      scoreThreshold: 0.5,
      categoryAllowlist: OBJECT_CATEGORY_ALLOWLIST,
    });
    return { face, object };
  }

  try {
    ({ face: faceDetector, object: objectDetector } = await createDetectors(delegate));
    backendUsed = delegate === 'GPU' ? 'webgpu' : 'wasm';
  } catch (err) {
    console.warn(`Failed to init detectors with delegate=${delegate}, falling back to CPU`, err);
    ({ face: faceDetector, object: objectDetector } = await createDetectors('CPU'));
    backendUsed = 'wasm';
  }

  return { backend: backendUsed, ready: true };
}

export async function runInference(imageInput) {
  if (!faceDetector || !objectDetector) {
    throw new Error("Model not initialized — call initModel() first");
  }

  const imageBitmap = imageInput instanceof ImageBitmap
    ? imageInput
    : await urlToImageBitmap(imageInput);

  const boxes = [];
  const labels = [];
  const scores = [];

  function addDetections(detections, labelFor) {
    for (const detection of detections || []) {
      const bb = detection.boundingBox;
      if (!bb) continue;
      const category = detection.categories?.[0];
      const score = category?.score ?? 0.9;

      boxes.push([
        bb.originX / imageBitmap.width,
        bb.originY / imageBitmap.height,
        (bb.originX + bb.width) / imageBitmap.width,
        (bb.originY + bb.height) / imageBitmap.height,
      ]);
      labels.push(labelFor(category));
      scores.push(score);
    }
  }

  const faceResult = faceDetector.detect(imageBitmap);
  addDetections(faceResult.detections, () => 'face');

  const objectResult = objectDetector.detect(imageBitmap);
  addDetections(objectResult.detections, (category) => category?.categoryName || 'image');

  return { boxes, labels, scores };
}

async function urlToImageBitmap(imageUrl) {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return await createImageBitmap(blob);
}