import { initModel, runInference } from './model-runtime.js';

async function runTest() {
  console.log("Loading model...");
  const { backend } = await initModel();
  console.log("Model loaded on:", backend);

  console.log("Running inference...");
  const result = await runInference('./sample.jpg');
  console.log("Detections:", result);
}

runTest();