// vision-worker.js
// -----------------------------------------------------------------------
// UPDATED to match Person A's real model (Florence-2 in model-runtime.js),
// which does its OWN internal preprocessing and needs a RawImage/URL,
// NOT our preprocess.js tensor. So we now pass imageUrl directly to
// runInference() instead of building a tensor for the model call.
//
// >>> TO SWITCH BACK TO THE MOCK MODEL FOR QUICK TESTING <<<
// Change the import line below from "./model-runtime.js" to "./mock-model.js"
// and pass imageBitmap-based tensor again if needed. (Mock doesn't need imageUrl.)
// -----------------------------------------------------------------------

import { postprocess } from "./postprocess.js";
import { initModel, runInference } from "./model-runtime.js";

let modelReady = false;

// Initialize the model ONCE when the worker starts.
// This can take a while the first time (downloading model weights).
const modelInitPromise = initModel()
  .then((result) => {
    modelReady = true;
    console.log("[vision-worker] model ready. backend used:", result.backend);
  })
  .catch((err) => {
    console.error("[vision-worker] model failed to initialize:", err);
  });

self.onmessage = async (event) => {
  const { type, imageUrl, imageWidth, imageHeight, requestId } = event.data;

  if (type !== "RUN_DETECTION") return;

  try {
    if (!imageUrl) {
      throw new Error("No imageUrl provided — Florence-2 needs a URL or RawImage, not just imageBitmap");
    }

    // Make sure the model has finished loading before we try to use it
    if (!modelReady) {
      await modelInitPromise;
    }

    const t0 = performance.now();

    // Preprocessing is handled INSIDE runInference() for Florence-2,
    // so there's no separate preprocess step to time here anymore.
    const t1 = performance.now();

    const rawOutput = await runInference(imageUrl);
    const t2 = performance.now();

    const detections = postprocess(rawOutput, imageWidth, imageHeight);
    const t3 = performance.now();

    const timings = {
      preprocessMs: Math.round(t1 - t0), // ~0, expected — preprocessing moved inside runInference
      inferenceMs: Math.round(t2 - t1),
      postprocessMs: Math.round(t3 - t2),
      totalMs: Math.round(t3 - t0),
    };
    console.log("[vision-worker] timings:", timings);

    self.postMessage({
      type: "DETECTION_RESULT",
      requestId,
      detections,
      timings,
    });
  } catch (err) {
    console.error("[vision-worker] error:", err);
    self.postMessage({
      type: "DETECTION_ERROR",
      requestId,
      error: err.message,
    });
  }
};
