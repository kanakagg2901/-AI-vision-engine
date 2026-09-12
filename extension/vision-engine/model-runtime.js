import {
  Florence2ForConditionalGeneration,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0';

const TARGET_LABELS = ["face", "password-field", "text-field", "button", "image"];

// Natural-language phrasing for grounding — output labels stay as the exact
// strings above (what P4/P6 expect), this map is only used to prompt the model.
const PROMPT_PHRASES = {
  "face": "a face",
  "password-field": "a password input field",
  "text-field": "a text input box",
  "button": "a button",
  "image": "an image or photo",
};

let model = null;
let processor = null;
let tokenizer = null;
let backendUsed = null;

export async function initModel(config = {}) {
  const modelId = config.modelId || 'onnx-community/Florence-2-base-ft';

  model = await Florence2ForConditionalGeneration.from_pretrained(modelId, {
    dtype: 'fp32',
  });
  processor = await AutoProcessor.from_pretrained(modelId);
  tokenizer = await AutoTokenizer.from_pretrained(modelId);

  backendUsed = 'wasm';

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

  for (const label of TARGET_LABELS) {
    const task = '<CAPTION_TO_PHRASE_GROUNDING>';
    const phrase = PROMPT_PHRASES[label] || label;
    const prompts = processor.construct_prompts(`${task}${phrase}`);
    const text_inputs = tokenizer(prompts);

    const generated_ids = await model.generate({
      ...text_inputs,
      ...vision_inputs,
      max_new_tokens: 60,
    });

    const generated_text = tokenizer.batch_decode(generated_ids, { skip_special_tokens: false })[0];
    const result = processor.post_process_generation(generated_text, task, image.size);

    const grounding = result[task];
    if (grounding && grounding.bboxes) {
      for (let i = 0; i < grounding.bboxes.length; i++) {
        const [x1, y1, x2, y2] = grounding.bboxes[i];
        boxes.push([x1 / image.size[0], y1 / image.size[1], x2 / image.size[0], y2 / image.size[1]]);
        labels.push(label); // always the exact contract string, never the phrase
        scores.push(1.0);
      }
    }
  }

  return { boxes, labels, scores };
}