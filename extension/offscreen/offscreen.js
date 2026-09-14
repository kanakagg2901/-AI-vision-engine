// offscreen.js
// -----------------------------------------------------------------------
// Runs inside the hidden offscreen document created by background.js.
// Reuses vision-engine/main-thread-usage.js UNCHANGED — that file already
// creates the Worker and exposes detectObjectsInImage(); it was just never
// imported by anything before. This is the missing import.
// -----------------------------------------------------------------------
import { detectObjectsInImage } from "../vision-engine/main-thread-usage.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return false;

  if (message.type === "RUN_VISION_DETECTION") {
    (async () => {
      try {
        // imageBitmap can't cross the chrome.runtime message boundary, so
        // main-thread-usage.js is called with imageBitmap=null; Florence-2
        // only needs imageUrl anyway (see vision-worker.js comments).
        const detections = await detectObjectsInImage(
          null,
          message.imageUrl,
          message.imageWidth,
          message.imageHeight
        );
        sendResponse({ success: true, detections });
      } catch (err) {
        console.error("[offscreen] vision detection failed:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // keep the message channel open for the async response
  }

  return false;
});
