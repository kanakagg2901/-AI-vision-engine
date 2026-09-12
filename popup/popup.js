// Aegis Popup Controller + Voice Integration (P2)

const taskInput = document.getElementById('taskInput');
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
      (command, autoTrigger = true) => {
        taskInput.value = command;
        voiceStatus.innerText = `Captured: "${command}"`;
        logConsole(`Voice command captured: "${command}"`);
        if (autoTrigger) {
          triggerAgentExecution();
        }
      },
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

function triggerAgentExecution() {
  const taskText = taskInput.value.trim();
  if (!taskText) {
    logConsole("Please speak or type a task directive first.");
    return;
  }

  updateStatus('Processing', true);
  logConsole("Capturing viewport & computing SoM overlay...");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;

    chrome.tabs.sendMessage(tabs[0].id, { action: "RUN_SOM_PERCEPTION" }, (response) => {
      if (response && response.success) {
        updateStatus('Perceiving', true);
        logConsole(`Set-of-Marks active! Tagged ${response.elementCount} interactive nodes.`);
      } else {
        updateStatus('Standby', false);
        logConsole("Failed to inject perception overlay.");
      }
    });
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
