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
  const predictions = output0.tolist()[0];

  const [newHeight, newWidth] = reshaped_input_sizes[0];
  const threshold = 0.5;

  for (const [xmin, ymin, xmax, ymax, score, id] of predictions) {
    if (score < threshold) continue;

    const mappedLabel = COCO_TO_CONTRACT[yoloModel.config.id2label[id]];
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

  return { boxes: allBoxes, labels: allLabels, scores: allScores };
}