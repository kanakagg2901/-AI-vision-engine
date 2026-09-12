import {
  AutoModel as YoloModel,
  AutoProcessor as YoloProcessor,
  Florence2ForConditionalGeneration,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0';
import { detectBackend } from './backend-detect.js';
 
// Labels YOLO can realistically detect via COCO categories
const COCO_TO_CONTRACT = {
  "person": "face", // proxy — detects whole person region, not just the face
};
 
// Labels only Florence-2's phrase grounding can handle
const GROUNDING_LABELS = ["password-field", "text-field", "button", "image"];
const PROMPT_PHRASES = {
  "password-field": "a password input field",
  "text-field": "a text input box",
  "button": "a button",
  "image": "an image or photo",
};
 
// IoU threshold above which two boxes from *different* labels are considered
// the same underlying region (Florence-2 grounding duplicate).
const DEDUP_IOU_THRESHOLD = 0.8;
 
// Priority used to decide which label "wins" when two boxes overlap.
// Lower index = higher priority.
const LABEL_PRIORITY = ["password-field", "text-field", "button", "image", "face"];
 
let yoloModel = null;
let yoloProcessor = null;
let florenceModel = null;
let florenceProcessor = null;
let tokenizer = null;
let backendUsed = null;
 
export async function initModel(config = {}) {
  // --- YOLO setup (fast path for "face") ---
  yoloModel = await YoloModel.from_pretrained(config.yoloModelId || 'onnx-community/yolov10s');
  yoloProcessor = await YoloProcessor.from_pretrained(config.yoloModelId || 'onnx-community/yolov10s');
 
  if (yoloModel?.config?.model_type !== 'yolov10' && !yoloModel?.config?.id2label) {
    console.warn(
      '[detect.js] YOLO model was not recognized as a known architecture by transformers.js ' +
      '("Unknown model class" / "assuming encoder-only architecture" in console). ' +
      'output0 may not be a valid detection tensor — verify with output0.dims before trusting boxes/labels/scores.'
    );
  }
 
  // --- Florence-2 setup (for UI-specific labels) ---
  const florenceModelId = config.florenceModelId || 'onnx-community/Florence-2-base-ft';
  const device = config.device || await detectBackend();
 
  try {
    florenceModel = await Florence2ForConditionalGeneration.from_pretrained(florenceModelId, {
      dtype: {
        embed_tokens: 'fp16',
        vision_encoder: 'fp16',
        encoder_model: 'q4',
        decoder_model_merged: 'q4',
      },
      device: device,
    });
    backendUsed = device;
  } catch (err) {
    console.warn(`Florence-2 failed to load on ${device}, falling back to wasm`, err);
    florenceModel = await Florence2ForConditionalGeneration.from_pretrained(florenceModelId, {
      dtype: {
        embed_tokens: 'fp16',
        vision_encoder: 'fp16',
        encoder_model: 'q4',
        decoder_model_merged: 'q4',
      },
      device: 'wasm',
    });
    backendUsed = 'wasm';
  }
 
  florenceProcessor = await AutoProcessor.from_pretrained(florenceModelId);
  tokenizer = await AutoTokenizer.from_pretrained(florenceModelId);
 
  return { backend: backendUsed, ready: true };
}
 
async function runYolo(image) {
  const boxes = [];
  const labels = [];
  const scores = [];
 
  const { pixel_values, reshaped_input_sizes } = await yoloProcessor(image);
  const { output0 } = await yoloModel({ images: pixel_values });
 
  // Sanity check: a real YOLO detection head returns [batch, num_boxes, 6]
  // (xmin, ymin, xmax, ymax, score, class_id). If the model fell back to a
  // generic encoder (see the warning in initModel), this shape check will
  // usually fail and we skip rather than emit garbage boxes.
  if (!output0?.dims || output0.dims.length !== 3 || output0.dims[2] !== 6) {
    console.warn(
      `[detect.js] Unexpected output0 shape ${JSON.stringify(output0?.dims)} — ` +
      `skipping YOLO pass, likely due to an unrecognized model architecture.`
    );
    return { boxes, labels, scores };
  }
 
  const predictions = output0.tolist()[0];
  const [newHeight, newWidth] = reshaped_input_sizes[0];
  const threshold = 0.5;
 
  for (const [xmin, ymin, xmax, ymax, score, id] of predictions) {
    if (score < threshold) continue;
 
    const mappedLabel = COCO_TO_CONTRACT[yoloModel.config.id2label?.[id]];
    if (!mappedLabel) continue;
 
    boxes.push([
      (xmin * image.width / newWidth) / image.width,
      (ymin * image.height / newHeight) / image.height,
      (xmax * image.width / newWidth) / image.width,
      (ymax * image.height / newHeight) / image.height,
    ]);
    labels.push(mappedLabel);
    scores.push(score); // real confidence from YOLO
  }
 
  return { boxes, labels, scores };
}
 
async function runFlorenceGrounding(image, vision_inputs, label) {
  const task = '<CAPTION_TO_PHRASE_GROUNDING>';
  const phrase = PROMPT_PHRASES[label] || label;
  const prompts = florenceProcessor.construct_prompts(`${task}${phrase}`);
  const text_inputs = tokenizer(prompts);
 
  const generated_ids = await florenceModel.generate({
    ...text_inputs,
    ...vision_inputs,
    max_new_tokens: 40,
  });
 
  const generated_text = tokenizer.batch_decode(generated_ids, { skip_special_tokens: false })[0];
  const result = florenceProcessor.post_process_generation(generated_text, task, image.size);
 
  const boxes = [];
  const labels = [];
  const scores = [];
 
  const grounding = result[task];
  if (grounding && grounding.bboxes) {
    for (let i = 0; i < grounding.bboxes.length; i++) {
      const [x1, y1, x2, y2] = grounding.bboxes[i];
      const isFullImageFallback = (x2 - x1) / image.size[0] > 0.95 && (y2 - y1) / image.size[1] > 0.95;
      if (!isFullImageFallback) {
        boxes.push([x1 / image.size[0], y1 / image.size[1], x2 / image.size[0], y2 / image.size[1]]);
        labels.push(label);
        scores.push(1.0); // Florence-2 grounding still has no real confidence — known limitation
      }
    }
  }
 
  return { boxes, labels, scores };
}
 
// --- IoU dedup helpers -----------------------------------------------------
 
function iou(boxA, boxB) {
  const [ax1, ay1, ax2, ay2] = boxA;
  const [bx1, by1, bx2, by2] = boxB;
 
  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);
 
  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;
 
  const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
  const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);
  const unionArea = areaA + areaB - interArea;
 
  return unionArea > 0 ? interArea / unionArea : 0;
}
 
/**
 * Removes near-duplicate boxes that come from different labels but represent
 * the same underlying region (a known Florence-2 grounding limitation — e.g.
 * "a password input field" and "a text input box" both grounding to the same
 * ambiguous element). Keeps the higher-priority label; among equal priority,
 * keeps the higher score.
 */
function dedupeDetections(boxes, labels, scores) {
  const n = boxes.length;
  const keep = new Array(n).fill(true);
 
  const priorityOf = (label) => {
    const idx = LABEL_PRIORITY.indexOf(label);
    return idx === -1 ? LABEL_PRIORITY.length : idx;
  };
 
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (!keep[j]) continue;
      if (labels[i] === labels[j]) continue; // same-label duplicates are left alone
 
      if (iou(boxes[i], boxes[j]) >= DEDUP_IOU_THRESHOLD) {
        const pi = priorityOf(labels[i]);
        const pj = priorityOf(labels[j]);
 
        let loser;
        if (pi !== pj) {
          loser = pi < pj ? j : i;
        } else {
          loser = scores[i] >= scores[j] ? j : i;
        }
        keep[loser] = false;
      }
    }
  }
 
  const dedupedBoxes = [];
  const dedupedLabels = [];
  const dedupedScores = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) {
      dedupedBoxes.push(boxes[i]);
      dedupedLabels.push(labels[i]);
      dedupedScores.push(scores[i]);
    }
  }
 
  return { boxes: dedupedBoxes, labels: dedupedLabels, scores: dedupedScores };
}
 
// -----------------------------------------------------------------------------
 
export async function runInference(imageInput) {
  if (!yoloModel || !florenceModel) {
    throw new Error("Model not initialized — call initModel() first");
  }
 
  const image = imageInput instanceof RawImage
    ? imageInput
    : await RawImage.read(imageInput);
 
  const allBoxes = [];
  const allLabels = [];
  const allScores = [];
 
  // Fast pass: YOLO for "face"
  const yoloResult = await runYolo(image);
  allBoxes.push(...yoloResult.boxes);
  allLabels.push(...yoloResult.labels);
  allScores.push(...yoloResult.scores);
 
  // Slower passes: Florence-2 for UI-specific labels only
  const vision_inputs = await florenceProcessor(image);
  for (const label of GROUNDING_LABELS) {
    const result = await runFlorenceGrounding(image, vision_inputs, label);
    allBoxes.push(...result.boxes);
    allLabels.push(...result.labels);
    allScores.push(...result.scores);
  }
 
  // Remove cross-label duplicates (e.g. password-field vs text-field
  // grounding to the same box) before returning results.
  return dedupeDetections(allBoxes, allLabels, allScores);
}
 