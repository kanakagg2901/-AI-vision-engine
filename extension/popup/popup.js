// =========================================================
// AEGIS POPUP CONTROLLER
// P2 TWO-STAGE VOICE INTEGRATION
// CREDENTIAL VAULT UI
// =========================================================

import { redactRegions } from "../redaction-hud/canvas-redactor.js";
import {
  vaultExists,
  createVault,
  unlockVault,
  lockVault,
  isUnlocked,
  saveCredential,
  getCredential,
  deleteCredential
} from "../pii-vault/vault.js";


// =========================================================
// MAIN POPUP DOM REFERENCES
// =========================================================

const taskInput = document.getElementById("taskInput");

const redactionHudCard =
  document.getElementById("redactionHudCard");

const redactionPreview =
  document.getElementById("redactionPreview");

const runBtn =
  document.getElementById("runBtn");

const stopBtn =
  document.getElementById("stopBtn");

const micBtn =
  document.getElementById("micBtn");

const voiceStatus =
  document.getElementById("voiceStatus");

const consoleBox =
  document.getElementById("consoleBox");

const clearSomBtn =
  document.getElementById("clearSomBtn");

const statusBadge =
  document.getElementById("statusBadge");


// =========================================================
// VAULT DOM REFERENCES
// =========================================================

const vaultCreateView =
  document.getElementById("vaultCreateView");

const vaultUnlockView =
  document.getElementById("vaultUnlockView");

const vaultStatusView =
  document.getElementById("vaultStatusView");

const vaultFormView =
  document.getElementById("vaultFormView");


const createMasterPwd =
  document.getElementById("createMasterPwd");

const createMasterPwd2 =
  document.getElementById("createMasterPwd2");

const createVaultBtn =
  document.getElementById("createVaultBtn");

const createVaultError =
  document.getElementById("createVaultError");


const unlockMasterPwd =
  document.getElementById("unlockMasterPwd");

const unlockVaultBtn =
  document.getElementById("unlockVaultBtn");

const unlockVaultError =
  document.getElementById("unlockVaultError");


const vaultSiteName =
  document.getElementById("vaultSiteName");

const vaultBadge =
  document.getElementById("vaultBadge");

const vaultSavedInfo =
  document.getElementById("vaultSavedInfo");

const vaultUsernameDisplay =
  document.getElementById("vaultUsernameDisplay");

const vaultNotSavedInfo =
  document.getElementById("vaultNotSavedInfo");

const manageCredBtn =
  document.getElementById("manageCredBtn");

const addCredBtn =
  document.getElementById("addCredBtn");

const lockVaultBtn =
  document.getElementById("lockVaultBtn");


const vaultFormBack =
  document.getElementById("vaultFormBack");

const credSite =
  document.getElementById("credSite");

const credUsername =
  document.getElementById("credUsername");

const credPassword =
  document.getElementById("credPassword");

const credNotes =
  document.getElementById("credNotes");

const saveCredBtn =
  document.getElementById("saveCredBtn");

const deleteCredBtn =
  document.getElementById("deleteCredBtn");

const credFormError =
  document.getElementById("credFormError");


// =========================================================
// STATE
// =========================================================

let currentSite = null;

let isListening = false;


// =========================================================
// SAFE LOGGING
// =========================================================

function logConsole(message) {
  if (!consoleBox) return;

  consoleBox.innerText = `> ${message}`;
}


// =========================================================
// STATUS BADGE
// =========================================================

function updateStatus(text, isActive = false) {
  if (!statusBadge) return;

  const statusText =
    statusBadge.querySelector(".status-text");

  if (statusText) {
    statusText.innerText = text;
  }

  if (isActive) {
    statusBadge.classList.add("active");
  } else {
    statusBadge.classList.remove("active");
  }
}


// =========================================================
// INITIALIZATION
// =========================================================

window.addEventListener("DOMContentLoaded", async () => {

  // -------------------------------------------------------
  // Initialize Aegis Voice
  // -------------------------------------------------------

  if (window.AegisVoice) {

    window.AegisVoice.init(

      // Voice command captured
      (command) => {

        if (taskInput) {
          taskInput.value = command;
        }

        logConsole(
          `Voice command captured: "${command}". Say "Execute" to start.`
        );
      },

      // Voice trigger "Execute"
      () => {

        logConsole(
          'Voice trigger "Execute" received!'
        );

        triggerAgentExecution();
      },

      // Voice status update
      (statusText, listeningState) => {

        if (voiceStatus) {
          voiceStatus.innerText = statusText;
        }

        isListening = listeningState;

        if (listeningState) {

          if (micBtn) {
            micBtn.classList.add("listening");
          }

          updateStatus("Listening", true);

        } else {

          if (micBtn) {
            micBtn.classList.remove("listening");
          }

          updateStatus("Standby", false);
        }
      },

      // Voice logger
      logConsole
    );
  }


  // -------------------------------------------------------
  // Initialize credential vault
  // -------------------------------------------------------

  await refreshVaultUI();

});


// =========================================================
// MICROPHONE BUTTON
// =========================================================

if (micBtn) {

  micBtn.addEventListener("click", () => {

    if (!window.AegisVoice) {
      logConsole("Voice system is unavailable.");
      return;
    }

    if (isListening) {
      window.AegisVoice.stop();
    } else {
      window.AegisVoice.start();
    }

  });

}


// =========================================================
// RUN BUTTON
// =========================================================

if (runBtn) {
  runBtn.addEventListener(
    "click",
    triggerAgentExecution
  );
}


// =========================================================
// AGENT STEP UPDATES
// =========================================================

chrome.runtime.onMessage.addListener((message) => {

  // Ignore unrelated messages
  if (
    !message ||
    message.action !== "AGENT_STEP_UPDATE"
  ) {
    return;
  }


  // -------------------------------------------------------
  // SAFELY read stepInfo
  // -------------------------------------------------------

  const stepInfo = message.stepInfo;

  if (!stepInfo) {
    logConsole("Agent sent an empty step update.");
    return;
  }


  const {
    phase,
    step,
    action,
    screenshotUrl,
    regions,
    redactionCount
  } = stepInfo;


  let phaseLabel =
    phase || "unknown";


  // -------------------------------------------------------
  // Capture phase
  // -------------------------------------------------------

  if (phase === "capture") {

    phaseLabel =
      `Step ${step}: capturing screen...`;
  }


  // -------------------------------------------------------
  // DOM extraction phase
  // -------------------------------------------------------

  else if (phase === "dom-extract") {

    phaseLabel =
      `Step ${step}: reading page structure...`;
  }


  // -------------------------------------------------------
  // Vision phase
  // -------------------------------------------------------

  else if (phase === "vision") {

    phaseLabel =
      `Step ${step}: running on-device vision model...`;
  }


  // -------------------------------------------------------
  // Redaction phase
  // -------------------------------------------------------

  else if (phase === "redact") {

    phaseLabel =
      `Step ${step}: redacted ${
        redactionCount ?? 0
      } sensitive region(s) locally before any network request...`;
  }


  // -------------------------------------------------------
  // Analyze phase
  // -------------------------------------------------------

  else if (phase === "analyze") {

    phaseLabel =
      `Step ${step}: sending sanitized context to server...`;
  }


  // -------------------------------------------------------
  // Action phase
  // -------------------------------------------------------

  else if (phase === "action") {

    // IMPORTANT:
    // action may be undefined.
    // Optional chaining prevents the old popup crash.

    const actionName =
      action?.action || "unknown";

    const reasoning =
      action?.reasoning || "";

    phaseLabel =
      `Step ${step}: server says "${actionName}"${
        reasoning
          ? ` (${reasoning})`
          : ""
      }`;
  }


  // -------------------------------------------------------
  // Finished
  // -------------------------------------------------------

  else if (phase === "finished") {

    phaseLabel =
      "Task complete.";
  }


  // -------------------------------------------------------
  // Ask user
  // -------------------------------------------------------

  else if (phase === "ask_user") {

    const message =
      action?.ask_user_message ||
      "please clarify";

    phaseLabel =
      `Agent needs input: ${message}`;
  }


  // -------------------------------------------------------
  // Aborted
  // -------------------------------------------------------

  else if (phase === "aborted") {

    phaseLabel =
      `Agent aborted: ${
        action?.reasoning ||
        "unknown reason"
      }`;
  }


  // -------------------------------------------------------
  // Stopped
  // -------------------------------------------------------

  else if (phase === "stopped") {

    phaseLabel =
      "Task stopped by user.";
  }


  // -------------------------------------------------------
  // Display update
  // -------------------------------------------------------

  logConsole(phaseLabel);


  // =======================================================
  // LOCAL REDACTION PREVIEW
  // =======================================================

  if (
    phase === "redact" &&
    screenshotUrl &&
    Array.isArray(regions)
  ) {

    redactRegions(
      screenshotUrl,
      regions,
      "blackout"
    )
      .then((dataUrl) => {

        if (redactionPreview) {
          redactionPreview.src = dataUrl;
        }

        if (redactionHudCard) {
          redactionHudCard.style.display =
            regions.length > 0
              ? "block"
              : "none";
        }

      })
      .catch((error) => {

        console.error(
          "[Aegis Popup] Redaction preview failed:",
          error
        );

      });
  }

});


// =========================================================
// START AGENT TASK
// =========================================================

function triggerAgentExecution() {

  const taskText =
    taskInput?.value?.trim();


  if (!taskText) {

    logConsole(
      "Please speak or type a task directive first."
    );

    return;
  }


  // -------------------------------------------------------
  // Update UI
  // -------------------------------------------------------

  updateStatus(
    "Processing",
    true
  );

  logConsole(
    "Starting agent task..."
  );


  if (runBtn) {
    runBtn.style.display = "none";
  }

  if (stopBtn) {
    stopBtn.style.display = "inline-flex";
  }


  // -------------------------------------------------------
  // Start background agent
  // -------------------------------------------------------

  chrome.runtime.sendMessage(
    {
      action: "START_AGENT_TASK",
      task: taskText
    },
    (response) => {

      // Chrome runtime error protection
      if (chrome.runtime.lastError) {

        if (runBtn) {
          runBtn.style.display = "";
        }

        if (stopBtn) {
          stopBtn.style.display = "none";
        }

        updateStatus(
          "Standby",
          false
        );

        logConsole(
          `Agent connection error: ${
            chrome.runtime.lastError.message
          }`
        );

        return;
      }


      // Restore buttons
      if (runBtn) {
        runBtn.style.display = "";
      }

      if (stopBtn) {
        stopBtn.style.display = "none";
      }


      // ---------------------------------------------------
      // Successful task
      // ---------------------------------------------------

      if (response?.success) {

        updateStatus(
          "Standby",
          false
        );

        logConsole(
          `Task finished: ${
            response.result?.status ||
            "completed"
          }`
        );

        return;
      }


      // ---------------------------------------------------
      // Failed task
      // ---------------------------------------------------

      updateStatus(
        "Standby",
        false
      );

      logConsole(
        `Agent error: ${
          response?.error ||
          "unknown error"
        }`
      );

    }
  );
}


// =========================================================
// STOP AGENT
// =========================================================

if (stopBtn) {

  stopBtn.addEventListener(
    "click",
    () => {

      logConsole(
        "Stopping task..."
      );

      chrome.runtime.sendMessage(
        {
          action: "STOP_AGENT_TASK"
        },
        () => {

          if (chrome.runtime.lastError) {
            console.warn(
              "[Aegis Popup] Stop message:",
              chrome.runtime.lastError.message
            );
          }

        }
      );

    }
  );

}


// =========================================================
// CLEAR SCREEN-OF-MARKS OVERLAY
// =========================================================

if (clearSomBtn) {

  clearSomBtn.addEventListener(
    "click",
    () => {

      chrome.tabs.query(
        {
          active: true,
          currentWindow: true
        },
        (tabs) => {

          if (chrome.runtime.lastError) {

            logConsole(
              `Could not access active tab: ${
                chrome.runtime.lastError.message
              }`
            );

            return;
          }


          if (!tabs[0]?.id) {

            logConsole(
              "No active tab found."
            );

            return;
          }


          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              action: "CLEAR_SOM"
            },
            () => {

              if (chrome.runtime.lastError) {

                logConsole(
                  "Could not clear perception overlay. "
                  + "The current page may not support the extension."
                );

                return;
              }


              updateStatus(
                "Standby",
                false
              );

              logConsole(
                "Perception overlay cleared."
              );

            }
          );

        }
      );

    }
  );

}


// =========================================================
// ===================== CREDENTIAL VAULT =================
// =========================================================


// ---------------------------------------------------------
// Hide every vault screen
// ---------------------------------------------------------

function hideAllVaultViews() {

  if (vaultCreateView) {
    vaultCreateView.style.display = "none";
  }

  if (vaultUnlockView) {
    vaultUnlockView.style.display = "none";
  }

  if (vaultStatusView) {
    vaultStatusView.style.display = "none";
  }

  if (vaultFormView) {
    vaultFormView.style.display = "none";
  }


  if (createVaultError) {
    createVaultError.innerText = "";
  }

  if (unlockVaultError) {
    unlockVaultError.innerText = "";
  }

  if (credFormError) {
    credFormError.innerText = "";
  }
}


// ---------------------------------------------------------
// Get active tab hostname
// ---------------------------------------------------------

function getCurrentHostname() {

  return new Promise((resolve) => {

    chrome.tabs.query(
      {
        active: true,
        currentWindow: true
      },
      (tabs) => {

        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }


        try {

          const url =
            new URL(
              tabs[0]?.url || ""
            );

          resolve(
            url.hostname || null
          );

        } catch {

          resolve(null);
        }

      }
    );

  });

}


// ---------------------------------------------------------
// Refresh vault UI
// ---------------------------------------------------------

async function refreshVaultUI() {

  hideAllVaultViews();


  try {

    const exists =
      await vaultExists();


    // -----------------------------------------------------
    // Vault does not exist
    // -----------------------------------------------------

    if (!exists) {

      if (vaultCreateView) {
        vaultCreateView.style.display = "flex";
      }

      return;
    }


    // -----------------------------------------------------
    // Vault exists but is locked
    // -----------------------------------------------------

    if (!isUnlocked()) {

      if (vaultUnlockView) {
        vaultUnlockView.style.display = "flex";
      }

      return;
    }


    // -----------------------------------------------------
    // Vault exists and is unlocked
    // -----------------------------------------------------

    await showSiteStatus();

  } catch (error) {

    console.error(
      "[Aegis Vault] UI refresh failed:",
      error
    );

    if (vaultUnlockView) {
      vaultUnlockView.style.display = "flex";
    }

    if (unlockVaultError) {
      unlockVaultError.innerText =
        error?.message ||
        "Unable to initialize vault.";
    }

  }

}


// ---------------------------------------------------------
// Show current website credential status
// ---------------------------------------------------------

async function showSiteStatus() {

  if (vaultStatusView) {
    vaultStatusView.style.display = "flex";
  }


  const hostname =
    await getCurrentHostname();


  currentSite =
    hostname;


  // -------------------------------------------------------
  // No active website
  // -------------------------------------------------------

  if (!hostname) {

    if (vaultSiteName) {
      vaultSiteName.innerText =
        "No active tab";
    }

    if (vaultBadge) {
      vaultBadge.innerText = "—";
      vaultBadge.className =
        "vault-badge";
    }

    if (vaultSavedInfo) {
      vaultSavedInfo.style.display =
        "none";
    }

    if (vaultNotSavedInfo) {
      vaultNotSavedInfo.style.display =
        "none";
    }

    return;
  }


  if (vaultSiteName) {
    vaultSiteName.innerText =
      hostname;
  }


  // -------------------------------------------------------
  // Look up credential
  // -------------------------------------------------------

  const cred =
    await getCredential(hostname);


  // -------------------------------------------------------
  // Credential exists
  // -------------------------------------------------------

  if (cred) {

    if (vaultBadge) {
      vaultBadge.innerText =
        "Saved";

      vaultBadge.className =
        "vault-badge saved";
    }


    if (vaultUsernameDisplay) {
      vaultUsernameDisplay.innerText =
        `Username: ${cred.username}`;
    }


    if (vaultSavedInfo) {
      vaultSavedInfo.style.display =
        "block";
    }

    if (vaultNotSavedInfo) {
      vaultNotSavedInfo.style.display =
        "none";
    }

  }


  // -------------------------------------------------------
  // Credential does not exist
  // -------------------------------------------------------

  else {

    if (vaultBadge) {
      vaultBadge.innerText =
        "Not saved";

      vaultBadge.className =
        "vault-badge missing";
    }


    if (vaultSavedInfo) {
      vaultSavedInfo.style.display =
        "none";
    }

    if (vaultNotSavedInfo) {
      vaultNotSavedInfo.style.display =
        "block";
    }

  }

}


// =========================================================
// CREATE VAULT
// =========================================================

if (createVaultBtn) {

  createVaultBtn.addEventListener(
    "click",
    async () => {

      const p1 =
        createMasterPwd?.value || "";

      const p2 =
        createMasterPwd2?.value || "";


      if (createVaultError) {
        createVaultError.innerText = "";
      }


      if (!p1 || p1.length < 8) {

        if (createVaultError) {
          createVaultError.innerText =
            "Master password must be at least 8 characters.";
        }

        return;
      }


      if (p1 !== p2) {

        if (createVaultError) {
          createVaultError.innerText =
            "Passwords do not match.";
        }

        return;
      }


      try {

        await createVault(p1);


        if (createMasterPwd) {
          createMasterPwd.value = "";
        }

        if (createMasterPwd2) {
          createMasterPwd2.value = "";
        }


        logConsole(
          "Vault created and unlocked."
        );


        await refreshVaultUI();

      } catch (error) {

        if (createVaultError) {
          createVaultError.innerText =
            error?.message ||
            "Failed to create vault.";
        }

      }

    }
  );

}


// =========================================================
// UNLOCK VAULT
// =========================================================

if (unlockVaultBtn) {

  unlockVaultBtn.addEventListener(
    "click",
    async () => {

      const pwd =
        unlockMasterPwd?.value || "";


      if (unlockVaultError) {
        unlockVaultError.innerText = "";
      }


      if (!pwd) {

        if (unlockVaultError) {
          unlockVaultError.innerText =
            "Enter your master password.";
        }

        return;
      }


      try {

        const ok =
          await unlockVault(pwd);


        if (!ok) {

          if (unlockVaultError) {
            unlockVaultError.innerText =
              "Incorrect master password.";
          }

          return;
        }


        if (unlockMasterPwd) {
          unlockMasterPwd.value = "";
        }


        logConsole(
          "Vault unlocked."
        );


        await refreshVaultUI();

      } catch (error) {

        if (unlockVaultError) {
          unlockVaultError.innerText =
            error?.message ||
            "Failed to unlock vault.";
        }

      }

    }
  );

}


// =========================================================
// ENTER KEY — UNLOCK
// =========================================================

if (unlockMasterPwd) {

  unlockMasterPwd.addEventListener(
    "keydown",
    (event) => {

      if (event.key === "Enter") {
        event.preventDefault();

        if (unlockVaultBtn) {
          unlockVaultBtn.click();
        }
      }

    }
  );

}


// =========================================================
// ENTER KEY — CREATE
// =========================================================

if (createMasterPwd2) {

  createMasterPwd2.addEventListener(
    "keydown",
    (event) => {

      if (event.key === "Enter") {
        event.preventDefault();

        if (createVaultBtn) {
          createVaultBtn.click();
        }
      }

    }
  );

}


// =========================================================
// LOCK VAULT
// =========================================================

if (lockVaultBtn) {

  lockVaultBtn.addEventListener(
    "click",
    async () => {

      lockVault();

      logConsole(
        "Vault locked."
      );

      await refreshVaultUI();

    }
  );

}


// =========================================================
// OPEN CREDENTIAL FORM
// =========================================================

if (addCredBtn) {

  addCredBtn.addEventListener(
    "click",
    () => {
      openCredForm(false);
    }
  );

}


if (manageCredBtn) {

  manageCredBtn.addEventListener(
    "click",
    () => {
      openCredForm(true);
    }
  );

}


// ---------------------------------------------------------
// Open credential form
// ---------------------------------------------------------

async function openCredForm(existing) {

  hideAllVaultViews();


  if (vaultFormView) {
    vaultFormView.style.display =
      "flex";
  }


  if (credSite) {
    credSite.value =
      currentSite || "";
  }


  if (credSite) {
    credSite.disabled =
      !!currentSite;
  }


  // -------------------------------------------------------
  // Editing existing credential
  // -------------------------------------------------------

  if (existing && currentSite) {

    const cred =
      await getCredential(
        currentSite
      );


    if (credUsername) {
      credUsername.value =
        cred?.username || "";
    }


    if (credPassword) {
      credPassword.value = "";

      credPassword.placeholder =
        "Leave blank to keep current password";
    }


    if (credNotes) {
      credNotes.value =
        cred?.notes || "";
    }


    if (deleteCredBtn) {
      deleteCredBtn.style.display =
        "block";
    }

  }


  // -------------------------------------------------------
  // Adding new credential
  // -------------------------------------------------------

  else {

    if (credUsername) {
      credUsername.value = "";
    }

    if (credPassword) {
      credPassword.value = "";
      credPassword.placeholder =
        "Password";
    }

    if (credNotes) {
      credNotes.value = "";
    }

    if (deleteCredBtn) {
      deleteCredBtn.style.display =
        "none";
    }

  }

}


// =========================================================
// BACK FROM CREDENTIAL FORM
// =========================================================

if (vaultFormBack) {

  vaultFormBack.addEventListener(
    "click",
    async () => {

      await refreshVaultUI();

    }
  );

}


// =========================================================
// SAVE CREDENTIAL
// =========================================================

if (saveCredBtn) {

  saveCredBtn.addEventListener(
    "click",
    async () => {

      const site =
        credSite?.value?.trim() || "";

      const username =
        credUsername?.value?.trim() || "";

      const password =
        credPassword?.value || "";

      const notes =
        credNotes?.value?.trim() || "";


      if (credFormError) {
        credFormError.innerText = "";
      }


      // -----------------------------------------------------
      // Required fields
      // -----------------------------------------------------

      if (!site || !username) {

        if (credFormError) {
          credFormError.innerText =
            "Website and username are required.";
        }

        return;
      }


      let finalPassword =
        password;


      // -----------------------------------------------------
      // Existing password preservation
      // -----------------------------------------------------

      if (!finalPassword) {

        const existing =
          await getCredential(site);


        if (existing) {

          finalPassword =
            existing.password;

        } else {

          if (credFormError) {
            credFormError.innerText =
              "Password is required.";
          }

          return;
        }

      }


      // -----------------------------------------------------
      // Save encrypted credential
      // -----------------------------------------------------

      try {

        await saveCredential(
          site,
          username,
          finalPassword,
          notes
        );


        // IMPORTANT:
        // Never log the password.

        logConsole(
          `Credential saved for ${site}.`
        );


        if (credPassword) {
          credPassword.value = "";
        }


        await refreshVaultUI();

      } catch (error) {

        if (credFormError) {
          credFormError.innerText =
            error?.message ||
            "Failed to save credential.";
        }

      }

    }
  );

}


// =========================================================
// DELETE CREDENTIAL
// =========================================================

if (deleteCredBtn) {

  deleteCredBtn.addEventListener(
    "click",
    async () => {

      if (!currentSite) {
        return;
      }


      const confirmed =
        window.confirm(
          `Delete saved credential for ${currentSite}?`
        );


      if (!confirmed) {
        return;
      }


      try {

        await deleteCredential(
          currentSite
        );


        logConsole(
          `Credential deleted for ${currentSite}.`
        );


        await refreshVaultUI();

      } catch (error) {

        if (credFormError) {
          credFormError.innerText =
            error?.message ||
            "Failed to delete credential.";
        }

      }

    }
  );

}