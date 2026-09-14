import { runAgentTask } from "../agent/agent-loop.js";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_AGENT_TASK") {
    // This is the entry point that was missing: previously popup.js only
    // ever triggered RUN_SOM_PERCEPTION (DOM tagging) and never called into
    // vision-engine / pii-vault / server at all. runAgentTask() is the full
    // perceive -> redact -> reason -> act loop (see agent-loop.js).
    runAgentTask(request.task, (stepInfo) => {
      // stream progress back to the popup so the console box updates live
      chrome.runtime.sendMessage({ action: "AGENT_STEP_UPDATE", stepInfo }).catch(() => {});
    })
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (request.action === "CAPTURE_SCREEN") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, screenshotUrl: dataUrl });
      }
    });
    return true;
  }

  if (request.action === "EXECUTE_ACTION") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, request, sendResponse);
      }
    });
    return true;
  }
});
