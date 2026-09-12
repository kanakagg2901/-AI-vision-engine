
window.P3Capture = {
  captureViewport(callback) {
    chrome.runtime.sendMessage({ action: "CAPTURE_SCREEN" }, (response) => {
      if (response && response.success) {
        console.log("[P3 Capture] Viewport screenshot captured successfully.");
        if (callback) callback(response.screenshotUrl);
      } else {
        console.error("[P3 Capture] Viewport capture failed:", response?.error);
        if (callback) callback(null);
      }
    });
  }
};
