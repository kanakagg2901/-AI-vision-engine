// postprocess.js
// -----------------------------------------------------------------------
// Turns the AI model's raw output into a clean, simple list of detections
// that Person 3 (screen reader) and Person 6 (redaction) can easily use.
//
// Does three things:
//   1. Removes low-confidence detections (confidence thresholding)
//   2. Removes duplicate overlapping boxes (NMS)
//   3. Converts normalized 0-1 coordinates into real pixel coordinates
// -----------------------------------------------------------------------

const CONFIDENCE_THRESHOLD = 0.5; // ignore anything model is <50% sure about
const NMS_IOU_THRESHOLD = 0.5;    // how much overlap counts as "duplicate"

/**
 * Main function: clean up raw model output.
 * @param {Object} rawOutput - { boxes, labels, scores } from the model (normalized 0-1 coords)
 * @param {number} imageWidth - actual pixel width of the original screenshot
 * @param {number} imageHeight - actual pixel height of the original screenshot
 * @returns {Array<{box: number[], label: string, score: number}>}
 */
export function postprocess(rawOutput, imageWidth, imageHeight) {
  const { boxes, labels, scores } = rawOutput;

  // Step 1: Combine everything into one array of objects (easier to work with)
  let detections = boxes.map((box, i) => ({
    box,               // still normalized 0-1 here: [x1,y1,x2,y2]
    label: labels[i],
    score: scores[i],
  }));

  // Step 2: Remove low-confidence detections
  detections = detections.filter((d) => d.score >= CONFIDENCE_THRESHOLD);

  // Step 3: Remove duplicate/overlapping boxes (NMS)
  detections = nonMaxSuppression(detections, NMS_IOU_THRESHOLD);

  // Step 4: Convert normalized (0-1) coordinates into real pixel coordinates
  detections = detections.map((d) => ({
    ...d,
    box: [
      Math.round(d.box[0] * imageWidth),  // x1
      Math.round(d.box[1] * imageHeight), // y1
      Math.round(d.box[2] * imageWidth),  // x2
      Math.round(d.box[3] * imageHeight), // y2
    ],
  }));

  return detections;
}

/**
 * Non-Max Suppression: removes overlapping boxes of the SAME label,
 * keeping only the highest-confidence one.
 * You don't need to fully understand this math -- just know it removes duplicates.
 */
function nonMaxSuppression(detections, iouThreshold) {
  // Sort by confidence, highest first
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const keep = [];

  while (sorted.length > 0) {
    const current = sorted.shift(); // take the highest-confidence one
    keep.push(current);

    // Remove any remaining boxes that overlap too much with this one
    // (and share the same label -- different objects can overlap fine)
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (
        sorted[i].label === current.label &&
        calculateIoU(current.box, sorted[i].box) > iouThreshold
      ) {
        sorted.splice(i, 1);
      }
    }
  }

  return keep;
}

/**
 * IoU = "Intersection over Union" -- a standard way to measure how much
 * two boxes overlap. Returns a value from 0 (no overlap) to 1 (identical).
 */
function calculateIoU(boxA, boxB) {
  const [ax1, ay1, ax2, ay2] = boxA;
  const [bx1, by1, bx2, by2] = boxB;

  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  const interWidth = Math.max(0, interX2 - interX1);
  const interHeight = Math.max(0, interY2 - interY1);
  const interArea = interWidth * interHeight;

  const areaA = (ax2 - ax1) * (ay2 - ay1);
  const areaB = (bx2 - bx1) * (by2 - by1);
  const unionArea = areaA + areaB - interArea;

  if (unionArea === 0) return 0;
  return interArea / unionArea;
}