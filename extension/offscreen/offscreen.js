// offscreen.js
// -----------------------------------------------------------------------
// Runs inside the hidden offscreen document.
//
// Responsibilities:
// 1. Run the local vision model.
// 2. Perform LOCAL screenshot redaction.
//
// IMPORTANT:
// Raw screenshots are processed inside the browser.
// The redacted/sanitized result can be used by the client without
// exposing the original sensitive pixels to the server.
// -----------------------------------------------------------------------

import { detectObjectsInImage } from "../vision-engine/main-thread-usage.js";
import { redactRegions } from "../redaction-hud/canvas-redactor.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.target !== "offscreen") {
    return false;
  }

  // ================================================================
  // 1. LOCAL VISION DETECTION
  // ================================================================

  if (message.type === "RUN_VISION_DETECTION") {

    (async () => {

      try {

        const detections = await detectObjectsInImage(
          null,
          message.imageUrl,
          message.imageWidth,
          message.imageHeight
        );

        console.log(
          "[offscreen] Local vision detection completed:",
          detections
        );

        sendResponse({
          success: true,
          detections: detections
        });

      } catch (err) {

        console.error(
          "[offscreen] Vision detection failed:",
          err
        );

        sendResponse({
          success: false,
          error: err.message
        });

      }

    })();

    return true;
  }


  // ================================================================
  // 2. LOCAL SCREENSHOT REDACTION
  // ================================================================

  if (message.type === "REDACT_SCREENSHOT") {

    (async () => {

      try {

        if (!message.imageUrl) {
          throw new Error(
            "No screenshot provided for redaction"
          );
        }

        const regions = Array.isArray(message.regions)
          ? message.regions
          : [];

        const mode = message.mode || "blackout";

        console.log(
          `[offscreen] Starting LOCAL redaction of ${regions.length} region(s)`
        );

        const sanitizedImage = await redactRegions(
          message.imageUrl,
          regions,
          mode
        );

        console.log(
          "[offscreen] LOCAL screenshot redaction completed"
        );

        sendResponse({
          success: true,
          sanitizedImage: sanitizedImage
        });

      } catch (err) {

        console.error(
          "[offscreen] Screenshot redaction failed:",
          err
        );

        sendResponse({
          success: false,
          error: err.message
        });

      }

    })();

    return true;
  }


  // ================================================================
  // Unknown message
  // ================================================================

  return false;
});