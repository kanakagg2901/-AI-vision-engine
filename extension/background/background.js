import { runAgentTask, requestStop } from "../agent/agent-loop.js";
import {
  vaultExists,
  createVault,
  unlockVault,
  lockVault,
  isUnlocked,
  saveCredential,
  getCredential,
  listSites,
  deleteCredential
} from "../pii-vault/vault.js";
async function handleVaultRequest(request) {
  switch (request.action) {

    case "VAULT_STATUS": {
      return {
        success: true,
        exists: await vaultExists(),
        unlocked: isUnlocked()
      };
    }

    case "VAULT_CREATE": {
      const masterPassword = String(request.masterPassword || "");

      if (masterPassword.length < 8) {
        throw new Error("Master password must be at least 8 characters.");
      }

      await createVault(masterPassword);

      return {
        success: true,
        unlocked: true
      };
    }

    case "VAULT_UNLOCK": {
      const masterPassword = String(request.masterPassword || "");

      const unlocked = await unlockVault(masterPassword);

      if (!unlocked) {
        throw new Error("Incorrect master password.");
      }

      return {
        success: true,
        unlocked: true
      };
    }

    case "VAULT_LOCK": {
      lockVault();

      return {
        success: true,
        unlocked: false
      };
    }

    case "VAULT_GET_CREDENTIAL_META": {
      if (request.action === "VAULT_GET_CREDENTIAL") {
  const cred = await getCredential(request.site);

  return {
    success: true,
    credential: cred || null
  };
}
      const site = String(request.site || "");

      const credential = await getCredential(site);

      return {
        success: true,
        exists: !!credential,
        username: credential?.username || "",
        notes: credential?.notes || "",
        hasPassword: !!credential?.password
      };
    }

    case "VAULT_SAVE_CREDENTIAL": {
      const site = String(request.site || "").trim();
      const username = String(request.username || "").trim();
      const notes = String(request.notes || "");

      if (!site) {
        throw new Error("Website is required.");
      }

      if (!username) {
        throw new Error("Username or email is required.");
      }

      let password = String(request.password || "");

      // When editing a credential, allow the existing password
      // to remain unchanged if the password field is left blank.
      if (!password && request.preserveExistingPassword) {
        const existing = await getCredential(site);
        password = existing?.password || "";
      }

      if (!password) {
        throw new Error("Password is required.");
      }

      await saveCredential(
        site,
        username,
        password,
        notes
      );

      return {
        success: true
      };
    }

    case "VAULT_LIST_SITES": {
      return {
        success: true,
        sites: await listSites()
      };
    }

    case "VAULT_DELETE_CREDENTIAL": {
      const site = String(request.site || "").trim();

      if (!site) {
        throw new Error("Website is required.");
      }

      const deleted = await deleteCredential(site);

      return {
        success: true,
        deleted
      };
    }

    default:
      return null;
  }
}
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request) {
    return false;
  }

  // Handle all vault operations in the background service worker.
  if (request.action?.startsWith("VAULT_")) {
    handleVaultRequest(request)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        console.error("[Aegis Vault]", error.message);

        sendResponse({
          success: false,
          error: error.message
        });
      });

    return true;
  }   
  if (request.action === "START_AGENT_TASK") {
    runAgentTask(request.task, (stepInfo) => {
      chrome.runtime.sendMessage({ action: "AGENT_STEP_UPDATE", stepInfo }).catch(() => {});
    })
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "STOP_AGENT_TASK") {
    requestStop();
    sendResponse({ success: true });
    return false;
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