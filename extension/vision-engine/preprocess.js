// preprocess.js
// -----------------------------------------------------------------------
// Turns a raw image (like a screenshot) into the number-array format
// ("tensor") that the AI model expects.
//
// Agreed format with Person A:
//   Shape: [1, 3, 224, 224]  (batch=1, channels=3 for RGB, height=224, width=224)
//   Values: 0 to 1 (not 0-255)
//   Channel order: RGB
// -----------------------------------------------------------------------

const MODEL_INPUT_SIZE = 224; // width and height the model expects

/**
 * Convert an ImageBitmap (a browser image object) into a model-ready tensor.
 * @param {ImageBitmap} imageBitmap - the raw screenshot/image
 * @returns {Float32Array} flattened tensor of shape [1,3,224,224]
 */
export function preprocessImage(imageBitmap) {
  // Step 1: Draw the image onto a small canvas, resizing it to 224x224.
  // (AI models expect a FIXED size input, so we must resize/squish the image.)
  const canvas = new OffscreenCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

  // Step 2: Get the raw pixel data. This comes back as a flat array like:
  // [R, G, B, A, R, G, B, A, ...] one group of 4 numbers per pixel (0-255 each).
  const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const pixels = imageData.data; // Uint8ClampedArray, length = 224*224*4

  // Step 3: Convert into the shape the model wants: [1, 3, 224, 224]
  // This means: all RED values first, then all GREEN values, then all BLUE.
  // (This ordering is called "CHW" - channel, height, width - very common for AI models.)
  const numPixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const tensor = new Float32Array(3 * numPixels); // 3 channels

  for (let i = 0; i < numPixels; i++) {
    const r = pixels[i * 4] / 255;     // normalize 0-255 -> 0-1
    const g = pixels[i * 4 + 1] / 255;
    const b = pixels[i * 4 + 2] / 255;
    // (we ignore alpha / transparency channel - models don't need it)

    tensor[i] = r;                  // all R values go first
    tensor[numPixels + i] = g;      // all G values go second
    tensor[numPixels * 2 + i] = b;  // all B values go third
  }

  return tensor; // this is your [1,3,224,224] tensor, flattened
}

/**
 * Helper: convert a raw image (from screenshot capture) into an ImageBitmap
 * that preprocessImage() can use. Use this first if you have a Blob/base64.
 * @param {Blob} imageBlob
 * @returns {Promise<ImageBitmap>}
 */
export async function blobToImageBitmap(imageBlob) {
  return await createImageBitmap(imageBlob);
}
