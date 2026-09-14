// Aegis Popup Controller + Two-Stage Voice Integration (P2)

import { redactRegions } from "../redaction-hud/canvas-redactor.js";

const taskInput = document.getElementById('taskInput');
const redactionHudCard = document.getElementById('redactionHudCard');
const redactionPreview = document.getElementById('redactionPreview');
const runBtn = document.getElementById('runBtn');
const micBtn = document.getElementById('micBtn');
const voiceStatus = document.getElementById('voiceStatus');
const consoleBox = document.getElementById('consoleBox');
const clearSomBtn = document.getElementById('clearSomBtn');
const statusBadge = document.getElementById('statusBadge');

function logConsole(msg) {
  consoleBox.innerText = `> ${msg}`;
}

function updateStatus(text, isActive = false) {
  const statusText = statusBadge.querySelector('.status-text');
  statusText.innerText = text;
  if (isActive) {
    statusBadge.classList.add('active');
  } else {
    statusBadge.classList.remove('active');
  }
}

let isListening = false;

window.addEventListener('DOMContentLoaded', () => {
  if (window.AegisVoice) {
    window.AegisVoice.init(
      // 1. On Command Captured (Populates input box)
      (command) => {
        taskInput.value = command;
        logConsole(`Voice command captured: "${command}". Say "Execute" to start.`);
      },
      // 2. On Execute Triggered (When user says "Execute")
      () => {
        logConsole('Voice trigger "Execute" received!');
        triggerAgentExecution();
      },
      // 3. On Status Change
      (statusText, listeningState) => {
        voiceStatus.innerText = statusText;
        isListening = listeningState;
        if (listeningState) {
          micBtn.classList.add('listening');
          updateStatus('Listening', true);
        } else {
          micBtn.classList.remove('listening');
          updateStatus('Standby', false);
        }
      },
      // 4. Console Logger
      logConsole
    );
  }
});

micBtn.addEventListener('click', () => {
  if (window.AegisVoice) {
    if (isListening) {
      window.AegisVoice.stop();
    } else {
      window.AegisVoice.start();
    }
  }
});

runBtn.addEventListener('click', triggerAgentExecution);

// Live progress from the agent loop (extension/agent/agent-loop.js), relayed
// through background.js. This is what previously never fired — the Run
// button only ever rendered the SoM overlay and stopped there.
chrome.runtime.onMessage.addListener((message) => {
  if (message.action !== "AGENT_STEP_UPDATE") return;
  const { phase, step, action, screenshotUrl, regions, redactionCount } = message.stepInfo;
  const phaseLabel = {
    capture: `Step ${step}: capturing screen...`,
    "dom-extract": `Step ${step}: reading page structure...`,
    vision: `Step ${step}: running on-device vision model...`,
    redact: `Step ${step}: redacted ${redactionCount ?? 0} sensitive region(s) locally before any network request...`,
    analyze: `Step ${step}: sending sanitized context to server...`,
    action: `Step ${step}: server says "${action.action}" (${action.reasoning || ""})`,
    finished: `Task complete.`,
    ask_user: `Agent needs input: ${action.ask_user_message || "please clarify"}`,
    aborted: `Agent aborted: ${action.reasoning || "unknown reason"}`,
  }[phase] || phase;
  logConsole(phaseLabel);

  // Live proof-of-redaction HUD: shows judges exactly what got blacked out
  // on-device, BEFORE anything was sent to the server (the server never
  // actually receives this image at all — only the metadata in
  // ScreenContext.redactions — this preview is purely for demo visibility).
  if (phase === "redact" && screenshotUrl && regions) {
    redactRegions(screenshotUrl, regions, "blackout").then((dataUrl) => {
      redactionPreview.src = dataUrl;
      redactionHudCard.style.display = regions.length > 0 ? "block" : "none";
    });
  }
});

function triggerAgentExecution() {
  const taskText = taskInput.value.trim();
  if (!taskText) {
    logConsole("Please speak or type a task directive first.");
    return;
  }

  updateStatus('Processing', true);
  logConsole("Starting agent task...");

  chrome.runtime.sendMessage({ action: "START_AGENT_TASK", task: taskText }, (response) => {
    if (response?.success) {
      updateStatus('Standby', false);
      logConsole(`Task finished: ${response.result.status}`);
    } else {
      updateStatus('Standby', false);
      logConsole(`Agent error: ${response?.error || "unknown error"}`);
    }
  });
}

clearSomBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "CLEAR_SOM" }, () => {
        updateStatus('Standby', false);
        logConsole("Perception overlay cleared.");
      });
    }
  });
});
