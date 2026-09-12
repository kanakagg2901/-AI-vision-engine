

/**
 * Pretend to run an AI model on an image tensor.
 * @param {Float32Array} imageTensor - shape [1,3,224,224], values 0-1
 * @returns {Promise<Object>} raw model output
 */
export async function runInference(imageTensor) {
  // Pretend this takes a little bit of time, like a real model would.
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Return FAKE detections. Coordinates are normalized (0 to 1),
  // NOT pixel values -- this matches what we agreed with Person A.
  return {
    boxes: [
      [0.10, 0.10, 0.35, 0.30], // a fake "face" box
      [0.50, 0.60, 0.90, 0.75], // a fake "password-field" box
      [0.05, 0.80, 0.40, 0.95], // a fake "button" box
    ],
    labels: ["face", "password-field", "button"],
    scores: [0.95, 0.88, 0.62],
  };
}
