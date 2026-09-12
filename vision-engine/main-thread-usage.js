


const visionWorker = new Worker("./vision-worker.js", { type: "module" });


let requestCounter = 0;
const pendingRequests = new Map();

/**
 * Send an image to the worker and get back clean detections.
 * @param {ImageBitmap} imageBitmap
 * @param {number} imageWidth - real pixel width of the original image
 * @param {number} imageHeight - real pixel height of the original image
 * @returns {Promise<Array>} clean detections
 */
function detectObjectsInImage(imageBitmap, imageUrl, imageWidth, imageHeight) { // NEW: added imageUrl parameter
  return new Promise((resolve, reject) => {
    const requestId = requestCounter++;
    pendingRequests.set(requestId, { resolve, reject });

    visionWorker.postMessage({
      type: "RUN_DETECTION",
      imageBitmap,
      imageUrl,      // NEW: Florence-2 needs this directly, not just the bitmap
      imageWidth,
      imageHeight,
      requestId,
    });
  });
}


visionWorker.onmessage = (event) => {
  const { type, requestId, detections, timings, error } = event.data;
  const pending = pendingRequests.get(requestId);
  if (!pending) return; // unknown request, ignore

  pendingRequests.delete(requestId);

  if (type === "DETECTION_RESULT") {
    console.log("Got detections:", detections);
    console.log("Timings:", timings);
    pending.resolve(detections);
  } else if (type === "DETECTION_ERROR") {
    console.error("Worker error:", error);
    pending.reject(new Error(error));
  }
};


export { detectObjectsInImage };
