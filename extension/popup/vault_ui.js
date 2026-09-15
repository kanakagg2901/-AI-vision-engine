// Aegis Credential Vault UI
// The popup never imports vault.js directly.
// All vault operations are handled by the background service worker.

let currentSite = "";
let editingCredential = false;


// --------------------------------------------------
// Send a request to the background service worker
// --------------------------------------------------

function vaultMessage(action, data = {}) {
  return new Promise((resolve, reject) => {

    chrome.runtime.sendMessage(
      {
        action,
        ...data
      },
      (response) => {

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          reject(new Error("No response from background service."));
          return;
        }

        if (!response.success) {
          reject(new Error(response.error || "Vault operation failed."));
          return;
        }

        resolve(response);
      }
    );
  });
}


// --------------------------------------------------
// Normalize website
// --------------------------------------------------

function normalizeSite(value) {
  if (!value) return "";

  try {
    const url = value.includes("://")
      ? new URL(value)
      : new URL(`https://${value}`);

    return url.hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return value
      .trim()
      .toLowerCase()
      .replace(/^www\./, "");
  }
}


// --------------------------------------------------
// Get current active tab
// --------------------------------------------------

async function getCurrentSite() {

  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const tab = tabs[0];

  if (!tab?.url) {
    return "";
  }

  try {
    const url = new URL(tab.url);

    // Do not treat Chrome internal pages as websites.
    if (
      url.protocol === "chrome:" ||
      url.protocol === "edge:" ||
      url.protocol === "about:"
    ) {
      return "";
    }

    return normalizeSite(url.hostname);

  } catch {
    return "";
  }
}


// --------------------------------------------------
// DOM helpers
// --------------------------------------------------

function $(id) {
  return document.getElementById(id);
}


function show(element, visible = true) {
  if (!element) return;

  element.hidden = !visible;
}


function setMessage(message, type = "") {

  const element = $("aegis-vault-message");

  if (!element) return;

  element.textContent = message;
  element.className = `aegis-vault-message ${type}`;
}


function setStatus(text, type = "") {

  const element = $("aegis-vault-status-pill");

  if (!element) return;

  element.textContent = text;
  element.className = `aegis-vault-status-pill ${type}`;
}


// --------------------------------------------------
// Show/hide vault screens
// --------------------------------------------------

function showCreateVault() {

  show($("aegis-vault-create"), true);
  show($("aegis-vault-unlock"), false);
  show($("aegis-vault-main"), false);
  show($("aegis-credential-form"), false);

  setStatus("Not created", "locked");
}


function showUnlockVault() {

  show($("aegis-vault-create"), false);
  show($("aegis-vault-unlock"), true);
  show($("aegis-vault-main"), false);
  show($("aegis-credential-form"), false);

  setStatus("Locked", "locked");
}


async function showVaultMain() {

  show($("aegis-vault-create"), false);
  show($("aegis-vault-unlock"), false);
  show($("aegis-vault-main"), true);
  show($("aegis-credential-form"), false);

  setStatus("Unlocked", "unlocked");

  await refreshCurrentCredential();
  await refreshSavedSites();
}


// --------------------------------------------------
// Create Vault
// --------------------------------------------------

async function handleCreateVault(event) {

  event.preventDefault();

  const password = $("aegis-master-create")?.value || "";
  const confirmation = $("aegis-master-confirm")?.value || "";

  if (password.length < 8) {
    setMessage(
      "Master password must be at least 8 characters.",
      "error"
    );
    return;
  }

  if (password !== confirmation) {
    setMessage(
      "Master passwords do not match.",
      "error"
    );
    return;
  }

  try {

    setMessage("Creating encrypted vault...");

    await vaultMessage("VAULT_CREATE", {
      masterPassword: password
    });

    $("aegis-master-create").value = "";
    $("aegis-master-confirm").value = "";

    setMessage(
      "Vault created successfully.",
      "success"
    );

    await showVaultMain();

  } catch (error) {

    setMessage(error.message, "error");
  }
}


// --------------------------------------------------
// Unlock Vault
// --------------------------------------------------

async function handleUnlockVault(event) {

  event.preventDefault();

  const password = $("aegis-master-unlock")?.value || "";

  if (!password) {
    setMessage(
      "Enter your master password.",
      "error"
    );
    return;
  }

  try {

    setMessage("Unlocking vault...");

    await vaultMessage("VAULT_UNLOCK", {
      masterPassword: password
    });

    $("aegis-master-unlock").value = "";

    setMessage(
      "Vault unlocked.",
      "success"
    );

    await showVaultMain();

  } catch (error) {

    $("aegis-master-unlock").value = "";

    setMessage(
      error.message,
      "error"
    );
  }
}


// --------------------------------------------------
// Check credential for current website
// --------------------------------------------------

async function refreshCurrentCredential() {

  if (!currentSite) {

    $("aegis-current-credential").textContent =
      "No website detected.";

    return;
  }

  $("aegis-current-credential").textContent =
    "Checking saved credentials...";

  try {

    const response = await vaultMessage(
      "VAULT_GET_CREDENTIAL_META",
      {
        site: currentSite
      }
    );

    if (response.exists) {

      renderCredentialExists(response);

    } else {

      renderCredentialMissing();
    }

  } catch (error) {

    setMessage(error.message, "error");
  }
}


// --------------------------------------------------
// Credential exists
// --------------------------------------------------

function renderCredentialExists(credential) {

  const container = $("aegis-current-credential");

  if (!container) return;

  container.innerHTML = "";

  const title = document.createElement("div");

  title.className = "aegis-credential-status success";

  title.textContent = "✓ Credential saved";

  const site = document.createElement("div");

  site.className = "aegis-credential-site";

  site.textContent = currentSite;

  const username = document.createElement("div");

  username.className = "aegis-credential-username";

  username.textContent =
    `Username: ${credential.username || "Not set"}`;

  const password = document.createElement("div");

  password.className = "aegis-credential-password";

  password.textContent =
    credential.hasPassword
      ? "Password: ••••••••"
      : "Password: Not set";

  const editButton = document.createElement("button");

  editButton.type = "button";
  editButton.textContent = "Edit Credential";
  editButton.className = "aegis-vault-button";

  editButton.addEventListener("click", () => {
    openCredentialForm(true, credential);
  });

  const deleteButton = document.createElement("button");

  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.className = "aegis-vault-button danger";

  deleteButton.addEventListener("click", deleteCurrentCredential);

  container.appendChild(title);
  container.appendChild(site);
  container.appendChild(username);
  container.appendChild(password);
  container.appendChild(editButton);
  container.appendChild(deleteButton);
}


// --------------------------------------------------
// Credential does not exist
// --------------------------------------------------

function renderCredentialMissing() {

  const container = $("aegis-current-credential");

  if (!container) return;

  container.innerHTML = "";

  const title = document.createElement("div");

  title.className = "aegis-credential-status";

  title.textContent = "No credential saved";

  const site = document.createElement("div");

  site.className = "aegis-credential-site";

  site.textContent = currentSite || "Unknown website";

  const text = document.createElement("p");

  text.textContent =
    "Save your credential in the encrypted Aegis Vault to let the agent use it locally.";

  container.appendChild(title);
  container.appendChild(site);
  container.appendChild(text);
}


// --------------------------------------------------
// Open credential form
// --------------------------------------------------

function openCredentialForm(edit = false, credential = null) {

  editingCredential = edit;

  show($("aegis-vault-main"), false);
  show($("aegis-credential-form"), true);

  $("aegis-credential-title").textContent =
    edit
      ? "Edit Credential"
      : "Save Credential";

  $("aegis-site").value = currentSite || "";

  $("aegis-username").value =
    credential?.username || "";

  $("aegis-password").value = "";

  $("aegis-notes").value =
    credential?.notes || "";

  const hint = $("aegis-password-hint");

  if (hint) {

    hint.textContent = edit
      ? "Leave password blank to keep the existing password."
      : "Password is required for a new credential.";
  }

  setMessage("");
}


// --------------------------------------------------
// Save credential
// --------------------------------------------------

async function handleSaveCredential(event) {

  event.preventDefault();

  const site = normalizeSite(
    $("aegis-site")?.value || ""
  );

  const username =
    $("aegis-username")?.value.trim() || "";

  const password =
    $("aegis-password")?.value || "";

  const notes =
    $("aegis-notes")?.value || "";

  if (!site) {

    setMessage(
      "Website is required.",
      "error"
    );

    return;
  }

  if (!username) {

    setMessage(
      "Username or email is required.",
      "error"
    );

    return;
  }

  if (!editingCredential && !password) {

    setMessage(
      "Password is required.",
      "error"
    );

    return;
  }

  try {

    setMessage("Encrypting and saving credential...");

    await vaultMessage(
      "VAULT_SAVE_CREDENTIAL",
      {
        site,
        username,
        password,
        notes,
        preserveExistingPassword: editingCredential
      }
    );

    // Clear sensitive form fields immediately.
    $("aegis-password").value = "";

    currentSite = site;

    setMessage(
      "Credential saved securely.",
      "success"
    );

    await showVaultMain();

  } catch (error) {

    setMessage(
      error.message,
      "error"
    );
  }
}


// --------------------------------------------------
// Delete current credential
// --------------------------------------------------

async function deleteCurrentCredential() {

  if (!currentSite) return;

  const confirmed = confirm(
    `Delete the saved credential for ${currentSite}?`
  );

  if (!confirmed) return;

  try {

    await vaultMessage(
      "VAULT_DELETE_CREDENTIAL",
      {
        site: currentSite
      }
    );

    setMessage(
      "Credential deleted.",
      "success"
    );

    await refreshCurrentCredential();
    await refreshSavedSites();

  } catch (error) {

    setMessage(
      error.message,
      "error"
    );
  }
}


// --------------------------------------------------
// Saved sites list
// --------------------------------------------------

async function refreshSavedSites() {

  const list = $("aegis-saved-sites");

  if (!list) return;

  list.innerHTML = "";

  try {

    const response =
      await vaultMessage("VAULT_LIST_SITES");

    const sites = response.sites || [];

    if (sites.length === 0) {

      const empty = document.createElement("li");

      empty.textContent =
        "No saved websites.";

      list.appendChild(empty);

      return;
    }

    sites.forEach((site) => {

      const item = document.createElement("li");

      item.className =
        "aegis-saved-site-item";

      const name = document.createElement("span");

      name.textContent = site;

      const deleteButton =
        document.createElement("button");

      deleteButton.type = "button";
      deleteButton.textContent = "Delete";

      deleteButton.addEventListener(
        "click",
        async () => {

          const confirmed = confirm(
            `Delete credential for ${site}?`
          );

          if (!confirmed) return;

          try {

            await vaultMessage(
              "VAULT_DELETE_CREDENTIAL",
              {
                site
              }
            );

            await refreshSavedSites();

            if (site === currentSite) {
              await refreshCurrentCredential();
            }

            setMessage(
              "Credential deleted.",
              "success"
            );

          } catch (error) {

            setMessage(
              error.message,
              "error"
            );
          }
        }
      );

      item.appendChild(name);
      item.appendChild(deleteButton);

      list.appendChild(item);
    });

  } catch (error) {

    setMessage(
      error.message,
      "error"
    );
  }
}


// --------------------------------------------------
// Lock Vault
// --------------------------------------------------

async function handleLockVault() {

  try {

    await vaultMessage("VAULT_LOCK");

    setMessage(
      "Vault locked.",
      "success"
    );

    showUnlockVault();

  } catch (error) {

    setMessage(
      error.message,
      "error"
    );
  }
}


// --------------------------------------------------
// Initialize Vault UI
// --------------------------------------------------

export async function initVaultUI() {

  // Find current website.
  currentSite = await getCurrentSite();

  const domainElement =
    $("aegis-vault-domain");

  if (domainElement) {

    domainElement.textContent =
      currentSite
        ? `Current site: ${currentSite}`
        : "Current site: unavailable";
  }

  // Check vault status.
  try {

    const status =
      await vaultMessage("VAULT_STATUS");

    if (!status.exists) {

      showCreateVault();

    } else if (!status.unlocked) {

      showUnlockVault();

    } else {

      await showVaultMain();
    }

  } catch (error) {

    setMessage(
      error.message,
      "error"
    );
  }


  // Create vault form.
  $("aegis-create-form")
    ?.addEventListener(
      "submit",
      handleCreateVault
    );


  // Unlock vault form.
  $("aegis-unlock-form")
    ?.addEventListener(
      "submit",
      handleUnlockVault
    );


  // Open credential form.
  $("aegis-open-credential-form")
    ?.addEventListener(
      "click",
      () => openCredentialForm(false)
    );


  // Save credential form.
  $("aegis-credential-form")
    ?.addEventListener(
      "submit",
      handleSaveCredential
    );


  // Cancel credential form.
  $("aegis-cancel-credential")
    ?.addEventListener(
      "click",
      async () => {
        await showVaultMain();
      }
    );


  // Lock vault.
  $("aegis-lock-vault")
    ?.addEventListener(
      "click",
      handleLockVault
    );
}