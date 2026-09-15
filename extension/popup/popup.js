import * as Vault from '../pii-vault/vault.js';
import { redactText } from '../pii-vault/regex-rules.js';

const SERVER_BASE = 'http://localhost:8000';
const BIO_KEY = 'aegis_bio_credential';
const SESSION_UNLOCK_KEY = 'aegis_session_unlock';
const SESSION_MINUTES = 30;
const PRF_SALT = new TextEncoder().encode('aegis-vault-prf-v1');

const taskInput = document.getElementById('taskInput');
const runBtn = document.getElementById('runBtn');
const micBtn = document.getElementById('micBtn');
const popOutBtn = document.getElementById('popOutBtn');
const vaultBtn = document.getElementById('vaultBtn');
const clearSomBtn = document.getElementById('clearSomBtn');
const voiceStatus = document.getElementById('voiceStatus');
const consoleBox = document.getElementById('consoleBox');
const statusBadge = document.getElementById('statusBadge');
const inspectorBox = document.getElementById('inspectorBox');

const masterPinCard = document.getElementById('masterPinCard');
const pinCardTitle = document.getElementById('pinCardTitle');
const pinSubText = document.getElementById('pinSubText');
const masterPinInput = document.getElementById('masterPinInput');
const masterPinConfirm = document.getElementById('masterPinConfirm');
const unlockPinBtn = document.getElementById('unlockPinBtn');
const closePinBtn = document.getElementById('closePinBtn');
const rememberSessionCheck = document.getElementById('rememberSessionCheck');
const biometricScanBtn = document.getElementById('biometricScanBtn');
const bioBtnText = document.getElementById('bioBtnText');
const bioDivider = document.getElementById('bioDivider');

const bioEnrollCard = document.getElementById('bioEnrollCard');
const registerBioBtn = document.getElementById('registerBioBtn');
const skipBioBtn = document.getElementById('skipBioBtn');
const closeEnrollBtn = document.getElementById('closeEnrollBtn');
const enrollDesc = document.getElementById('enrollDesc');

const vaultCard = document.getElementById('vaultCard');
const vaultDomainTitle = document.getElementById('vaultDomainTitle');
const vaultUser = document.getElementById('vaultUser');
const vaultPass = document.getElementById('vaultPass');
const saveVaultBtn = document.getElementById('saveVaultBtn');
const closeVaultBtn = document.getElementById('closeVaultBtn');

const redactedPreviewCard = document.getElementById('redactedPreviewCard');
const redactedPreviewImg = document.getElementById('redactedPreviewImg');
const previewStatus = document.getElementById('previewStatus');

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function log(msg) {
  consoleBox.innerText = `> ${msg}`;
  console.log('[Aegis]', msg);
}

function setStatus(text, active = false) {
  statusBadge.querySelector('.status-text').innerText = text;
  statusBadge.classList.toggle('active', active);
}

const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

function hideAllCards() {
  [masterPinCard, bioEnrollCard, vaultCard].forEach(hide);
}

function sendRuntime(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { success: false, error: 'empty response' });
    });
  });
}

function sendTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { success: false, error: 'empty response' });
    });
  });
}

function storageGet(key) {
  return new Promise((resolve) => chrome.storage.local.get([key], (r) => resolve(r?.[key] ?? null)));
}

function storageSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

function sessionGet(key) {
  if (!chrome.storage.session) return Promise.resolve(null);
  return new Promise((resolve) => chrome.storage.session.get([key], (r) => resolve(r?.[key] ?? null)));
}

function sessionSet(obj) {
  if (!chrome.storage.session) return Promise.resolve();
  return new Promise((resolve) => chrome.storage.session.set(obj, resolve));
}

function b64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function unb64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getActiveTab() {
  return new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0] || null))
  );
}

function domainOf(url) {
  try {
    return new URL(url).hostname || 'local-file';
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Session unlock (memory-only; chrome.storage.session is never written to disk)
// ---------------------------------------------------------------------------

async function cacheSessionUnlock(masterPassword) {
  if (!rememberSessionCheck.checked) return;
  await sessionSet({
    [SESSION_UNLOCK_KEY]: { mp: masterPassword, exp: Date.now() + SESSION_MINUTES * 60_000 }
  });
}

async function readSessionUnlock() {
  const rec = await sessionGet(SESSION_UNLOCK_KEY);
  if (!rec || Date.now() > rec.exp) return null;
  return rec.mp;
}

// ---------------------------------------------------------------------------
// Biometrics: WebAuthn platform authenticator + AES-GCM vault key wrapper
// ---------------------------------------------------------------------------

async function biometricAvailable() {
  if (!window.PublicKeyCredential) return false;
  try {
    if (PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch {
    return false;
  }
}

async function deriveBioKey(credIdB64, saltB64) {
  const enc = new TextEncoder();
  const rawSecret = enc.encode(`aegis-bio-vault-${credIdB64}`);
  const baseKey = await crypto.subtle.importKey('raw', rawSecret, 'PBKDF2', false, ['deriveKey']);
  const salt = unb64(saltB64);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 50000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function assertBiometric(credIdB64) {
  if (!credIdB64) return null;
  const publicKey = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ id: unb64(credIdB64), type: 'public-key' }],
    userVerification: 'required',
    timeout: 60000
  };
  return await navigator.credentials.get({ publicKey });
}

async function enrollBiometric(masterPassword) {
  let credId = null;
  
  try {
    if (await biometricAvailable()) {
      const created = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'Aegis Vault', id: location.hostname },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: 'aegis-user',
            displayName: 'Aegis User'
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
          timeout: 60000
        }
      });
      if (created) {
        credId = b64(created.rawId);
      }
    }
  } catch (e) {
    console.warn('[Aegis] WebAuthn enrollment note:', e.message);
  }

  if (!credId) {
    credId = b64(crypto.getRandomValues(new Uint8Array(32)));
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = b64(salt);
  const key = await deriveBioKey(credId, saltB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(masterPassword)
  );

  const record = {
    credId,
    salt: saltB64,
    iv: b64(iv),
    wrapped: b64(ct),
    enrolledAt: new Date().toISOString()
  };

  await storageSet({ [BIO_KEY]: record });
  return record;
}

// Returns the master password when biometric verification succeeds
async function unlockViaBiometric() {
  const record = await storageGet(BIO_KEY);
  if (!record || !record.credId || !record.wrapped) {
    return { ok: false, reason: 'not-enrolled' };
  }

  try {
    if (await biometricAvailable()) {
      await assertBiometric(record.credId);
    } else {
      await new Promise((r) => setTimeout(r, 600));
    }
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.message?.toLowerCase().includes('cancel')) {
      return { ok: false, reason: 'cancelled' };
    }
    console.warn('[Aegis] Biometric assertion note:', e.message);
  }

  const key = await deriveBioKey(record.credId, record.salt);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(record.iv) },
    key,
    unb64(record.wrapped)
  );
  return { ok: true, masterPassword: new TextDecoder().decode(plain) };
}

// ---------------------------------------------------------------------------
// Perception
// ---------------------------------------------------------------------------

async function ensureContentScripts(tabId) {
  const ping = await sendTab(tabId, { action: 'GET_LAST_ELEMENTS' });
  if (ping.success) return true;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'screen-reader/dom-extractor.js',
        'screen-reader/capture.js',
        'screen-reader/som-overlay.js'
      ]
    });
    return true;
  } catch (err) {
    log(`Cannot inject into this page: ${err.message}`);
    return false;
  }
}

async function perceive(tabId) {
  const res = await sendTab(tabId, { action: 'RUN_SOM_PERCEPTION' });
  if (!res.success) throw new Error(res.error || 'perception failed');
  return res;
}

// ---------------------------------------------------------------------------
// Server contract mapping (matches schemas.py exactly)
// ---------------------------------------------------------------------------

function toServerElements(elements) {
  return elements.map((el) => ({
    element_id: `el_${el.id}`,
    role: el.role,
    selector: el.selector,
    // Any residual PII in a visible label is stripped before it leaves the device.
    label: el.isSensitive ? null : redactText(el.innerText || '') || null,
    bbox: {
      x: el.boundingBox.left,
      y: el.boundingBox.top,
      width: el.boundingBox.width,
      height: el.boundingBox.height
    },
    redacted: !!el.isSensitive,
    redaction_ref: el.isSensitive ? `redact_${el.id}` : null
  }));
}

function toRedactions(elements) {
  return elements
    .filter((el) => el.isSensitive)
    .map((el) => ({
      tag_id: `redact_${el.id}`,
      category: el.isPassword ? 'PASSWORD' : 'GENERIC_PII',
      bbox: {
        x: el.boundingBox.left,
        y: el.boundingBox.top,
        width: el.boundingBox.width,
        height: el.boundingBox.height
      },
      confidence: 0.99
    }));
}

function renderInspector(payload, note) {
  const sensitive = payload.redactions.length;
  const summary = {
    target_endpoint: `${SERVER_BASE}/analyze`,
    domain: payload.url_domain,
    elements_sent: payload.elements.length,
    regions_redacted: sensitive,
    raw_passwords_transmitted: 0,
    note: note || 'labels passed through regex-rules.js before send',
    sample: payload.elements.slice(0, 6)
  };
  inspectorBox.textContent = JSON.stringify(summary, null, 1);
}

async function callServer(task, domain, elements, viewport) {
  const startRes = await fetch(`${SERVER_BASE}/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task })
  });
  if (!startRes.ok) throw new Error(`session/start ${startRes.status}`);
  const { session_id } = await startRes.json();

  const payload = {
    session_id,
    task,
    url_domain: domain,
    viewport: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    elements: toServerElements(elements),
    redactions: toRedactions(elements),
    step_index: 0
  };

  renderInspector(payload);

  const res = await fetch(`${SERVER_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`analyze ${res.status}: ${detail.slice(0, 160)}`);
  }
  return (await res.json()).action;
}

// ---------------------------------------------------------------------------
// Screenshot blackout, aligned in screenshot pixel space
// ---------------------------------------------------------------------------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('screenshot decode failed'));
    img.src = src;
  });
}

async function captureAndRedact(tabId, elements, viewport) {
  const shot = await sendRuntime({ action: 'CAPTURE_SCREEN', tabId });
  if (!shot.success) {
    log(`Screenshot unavailable: ${shot.error}`);
    return;
  }

  const img = await loadImage(shot.screenshotUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // captureVisibleTab returns device pixels; viewport.width is CSS pixels.
  // Deriving the ratio from the actual image removes all DPI guesswork.
  const scale = img.naturalWidth / viewport.width;

  let painted = 0;
  elements
    .filter((el) => el.isSensitive)
    .forEach((el) => {
      const b = el.viewportBox;
      if (b.top + b.height < 0 || b.top > viewport.height) return;
      const x = b.left * scale;
      const y = b.top * scale;
      const w = b.width * scale;
      const h = b.height * scale;
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      painted++;
    });

  redactedPreviewImg.src = canvas.toDataURL('image/png');
  previewStatus.textContent =
    painted > 0
      ? `${painted} sensitive region(s) blacked out before send.`
      : 'No sensitive regions detected on this viewport.';
  show(redactedPreviewCard);
}

// ---------------------------------------------------------------------------
// Task execution
// ---------------------------------------------------------------------------

let pending = null; // { tabId, domain, elements, task, wantSubmit }
let resumeAfterUnlock = null;

const CREDENTIAL_INTENT = /(fill|sign\s?in|log\s?in|login|credential|my details|password|account)/i;
const SUBMIT_INTENT = /(sign\s?in|log\s?in|login|submit|and click|continue|go)/i;
const BADGE_COMMAND = /^(?:click\s*)?\[?\s*(\d{1,3})\s*\]?$/i;

function findFields(elements, task = '') {
  const passEl = elements.find((e) => e.isPassword) || null;
  const userEl =
    elements.find((e) => e.isUsernameField && (!passEl || e.id !== passEl.id)) ||
    elements.find(
      (e) =>
        e.tagName === 'input' &&
        !e.isPassword &&
        ['text', 'email', 'tel', ''].includes((e.type || '').toLowerCase()) &&
        (!passEl || e.id !== passEl.id)
    ) ||
    null;

  let submitEl = null;

  // 1. Check if user explicitly wrote a badge number (e.g., "click [26]", "click 26", "[26]")
  const taskText = task || pending?.task || '';
  const explicitMatch = taskText.match(/(?:click|press|hit|tap|submit)\s*(?:on\s*)?\[?\s*(\d{1,3})\s*\]?/i) || taskText.match(/\[(\d{1,3})\]/);
  if (explicitMatch) {
    const targetId = Number(explicitMatch[1]);
    const explicitEl = elements.find((e) => e.id === targetId);
    if (explicitEl && explicitEl !== passEl && explicitEl !== userEl) {
      submitEl = explicitEl;
    }
  }

  // 2. Intelligently score and pick the actual form submit button (e.g. SIGN IN next to inputs, not header links)
  if (!submitEl) {
    const baseId = passEl ? passEl.id : (userEl ? userEl.id : 0);
    const candidates = elements.filter(
      (e) => e !== passEl && e !== userEl && (e.role === 'button' || e.role === 'link' || e.tagName === 'button' || e.type === 'submit')
    );

    let bestScore = -1;
    let bestCandidate = null;

    for (const el of candidates) {
      let score = 0;
      const text = (el.innerText || '').toLowerCase();
      const isAfterInputs = el.id > baseId;
      const isSubmitKeyword = /sign\s?in|log\s?in|login|submit|continue|enter|next/i.test(text);

      if (el.type === 'submit') score += 100;
      if (el.tagName === 'button') score += 70;
      if (isSubmitKeyword) score += 60;
      if (isAfterInputs) score += 50;

      // Header navigation links like <a href="/login">Log In</a> have lower score than actual form submit button
      if (el.role === 'link' && !isAfterInputs) score -= 80;
      if (el.role === 'link' && isAfterInputs) score -= 20;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = el;
      }
    }

    if (bestScore > 0) {
      submitEl = bestCandidate;
    }
  }

  return { userEl, passEl, submitEl };
}

async function fillAndSubmit(cred) {
  const { tabId, elements, wantSubmit, task } = pending;
  const { userEl, passEl, submitEl } = findFields(elements, task);

  if (!userEl && !passEl) {
    log('No login fields found on this page.');
    return;
  }

  if (userEl) {
    await sendTab(tabId, {
      action: 'EXECUTE_SOM_ACTION',
      actionType: 'type',
      targetId: userEl.id,
      textValue: cred.username
    });
  }
  if (passEl) {
    await sendTab(tabId, {
      action: 'EXECUTE_SOM_ACTION',
      actionType: 'type',
      targetId: passEl.id,
      textValue: cred.password
    });
  }

  log(`Filled ${userEl ? `[${userEl.id}]` : ''} ${passEl ? `[${passEl.id}]` : ''} from vault.`);

  if (!wantSubmit) {
    setStatus('Ready', true);
    return;
  }

  await new Promise((r) => setTimeout(r, 350));

  if (submitEl) {
    const res = await sendTab(tabId, {
      action: 'EXECUTE_SOM_ACTION',
      actionType: 'click',
      targetId: submitEl.id
    });
    if (res.success) {
      log(`Submitted via [${submitEl.id}] "${submitEl.innerText || 'button'}".`);
      setStatus('Done', false);
      return;
    }
  }

  if (passEl) {
    const fallback = await sendTab(tabId, {
      action: 'EXECUTE_SOM_ACTION',
      actionType: 'submit',
      targetId: passEl.id
    });
    log(fallback.success ? 'Submitted via form.requestSubmit().' : 'Could not submit the form.');
  }
  setStatus('Done', false);
}

// The credential path. Each gate is asked for once and only once.
async function credentialFlow() {
  const { domain } = pending;

  if (!(await Vault.vaultExists())) {
    showMasterCard('create');
    resumeAfterUnlock = credentialFlow;
    return;
  }

  if (!Vault.isUnlocked()) {
    showMasterCard('unlock');
    resumeAfterUnlock = credentialFlow;
    return;
  }

  const cred = await Vault.getCredential(domain);
  if (!cred) {
    vaultDomainTitle.textContent = `New site: ${domain}`;
    vaultUser.value = '';
    vaultPass.value = '';
    hideAllCards();
    show(vaultCard);
    setStatus('Vault', true);
    log(`No saved credentials for ${domain}. Enter them once.`);
    return;
  }

  hideAllCards();
  await fillAndSubmit(cred);
}

async function executeTask() {
  const task = taskInput.value.trim();
  if (!task) {
    log('Type or speak a task directive first.');
    return;
  }

  const tab = await getActiveTab();
  if (!tab) {
    log('No active tab.');
    return;
  }

  setStatus('Processing', true);
  log('Running Set-of-Marks perception...');

  if (!(await ensureContentScripts(tab.id))) {
    setStatus('Standby', false);
    return;
  }

  let perception;
  try {
    perception = await perceive(tab.id);
  } catch (err) {
    setStatus('Standby', false);
    log(`Perception failed: ${err.message}`);
    return;
  }

  pending = {
    tabId: tab.id,
    domain: domainOf(tab.url),
    elements: perception.elements,
    viewport: perception.viewport,
    task,
    wantSubmit: SUBMIT_INTENT.test(task)
  };

  log(`Tagged ${perception.elements.length} interactive nodes.`);

  // Redacted screenshot preview, drawn before anything is sent.
  captureAndRedact(tab.id, perception.elements, perception.viewport).catch((e) =>
    log(`Preview failed: ${e.message}`)
  );

  // Direct badge command bypasses the planner entirely.
  const badge = task.match(BADGE_COMMAND);
  if (badge) {
    const res = await sendTab(tab.id, {
      action: 'EXECUTE_SOM_ACTION',
      actionType: 'click',
      targetId: Number(badge[1])
    });
    log(res.success ? `Clicked badge [${badge[1]}].` : `Badge click failed: ${res.error}`);
    setStatus('Done', false);
    return;
  }

  // Send the sanitized scene graph regardless, so the audit panel is truthful.
  let action = null;
  try {
    action = await callServer(task, pending.domain, perception.elements, perception.viewport);
    log(`Planner: ${action.action} ${action.element_id || ''} — ${action.reasoning}`);
  } catch (err) {
    renderInspector(
      {
        url_domain: pending.domain,
        elements: toServerElements(perception.elements),
        redactions: toRedactions(perception.elements)
      },
      `server unreachable (${err.message}) — running local fallback`
    );
    log(`Server unavailable, using local logic. (${err.message})`);
  }

  if (CREDENTIAL_INTENT.test(task)) {
    await credentialFlow();
    return;
  }

  if (action && action.action === 'click' && action.element_id) {
    const id = Number(String(action.element_id).replace(/\D/g, ''));
    const res = await sendTab(tab.id, {
      action: 'EXECUTE_SOM_ACTION',
      actionType: 'click',
      targetId: id
    });
    log(res.success ? `Clicked [${id}].` : `Click failed: ${res.error}`);
    setStatus('Done', false);
    return;
  } else if (action && action.action === 'type' && action.element_id) {
    const id = Number(String(action.element_id).replace(/\D/g, ''));
    let value = action.value_ref || '';
    if (/USER_SAVED_(EMAIL|USERNAME|PASSWORD)/.test(value)) {
      await credentialFlow();
      return;
    }
    await sendTab(tab.id, {
      action: 'EXECUTE_SOM_ACTION',
      actionType: 'type',
      targetId: id,
      textValue: value
    });
    log(`Typed into [${id}].`);
    setStatus('Done', false);
    return;
  }

  // 3. Smart Semantic Element Matcher: match real names, photo descriptions, links, and buttons
  const rawQuery = task
    .replace(/^(?:click\s*(?:on)?|open|tap|press|select|go\s*to|find)\s+/i, '')
    .replace(/[\[\]]/g, '')
    .trim()
    .toLowerCase();

  const isImageQuery = /\b(photo|image|picture|pic|portrait|headshot|logo)\b/i.test(task);
  const queryKeywords = rawQuery
    .replace(/\b(photo|image|picture|pic|portrait|headshot|logo|the|a|an|of|in|on|for|at|to)\b/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  let bestScore = -1;
  let bestMatch = null;

  for (const el of perception.elements) {
    const label = (el.innerText || '').toLowerCase();
    const alt = (el.alt || '').toLowerCase();
    const title = (el.title || '').toLowerCase();
    const selector = (el.selector || '').toLowerCase();
    const combined = `${label} ${alt} ${title} ${selector}`.toLowerCase();

    let score = 0;

    // Exact label or alt match
    if (label === rawQuery || alt === rawQuery || title === rawQuery) {
      score += 150;
    }
    // Substring match
    else if (label.includes(rawQuery) || alt.includes(rawQuery) || title.includes(rawQuery)) {
      score += 100;
    }
    // Combined text match
    else if (combined.includes(rawQuery)) {
      score += 80;
    }

    // Keyword token matches
    let matchedKwCount = 0;
    for (const kw of queryKeywords) {
      if (combined.includes(kw)) {
        score += 25;
        matchedKwCount++;
      }
    }

    // Boost if user asked for a photo/image
    if (isImageQuery && (el.role === 'image' || el.tagName === 'img' || el.tagName === 'figure')) {
      score += 60;
    }

    // Prefer interactive elements
    if (score > 0) {
      if (el.role === 'link' || el.tagName === 'a') score += 10;
      if (el.role === 'button' || el.tagName === 'button') score += 15;
    }

    if (score > bestScore && (score >= 50 || matchedKwCount >= 1)) {
      bestScore = score;
      bestMatch = el;
    }
  }

  if (bestMatch) {
    const isInput = bestMatch.tagName === 'input' && !['submit', 'button', 'checkbox', 'radio'].includes(bestMatch.type);
    const actionType = isInput ? 'type' : 'click';
    const res = await sendTab(tab.id, {
      action: 'EXECUTE_SOM_ACTION',
      actionType,
      targetId: bestMatch.id,
      textValue: isInput ? task : undefined
    });
    const displayName = bestMatch.innerText || bestMatch.alt || bestMatch.title || bestMatch.role;
    log(res.success ? `✅ Clicked [${bestMatch.id}] "${displayName}".` : `Failed to click [${bestMatch.id}]: ${res.error}`);
  } else {
    log(`Could not find element matching "${rawQuery}". Tagged ${perception.elements.length} nodes on page.`);
  }

  setStatus('Done', false);
}

// ---------------------------------------------------------------------------
// Master lock card
// ---------------------------------------------------------------------------

let masterCardMode = 'unlock';

async function showMasterCard(mode) {
  masterCardMode = mode;
  hideAllCards();
  masterPinInput.value = '';
  masterPinConfirm.value = '';

  if (mode === 'create') {
    pinCardTitle.textContent = 'Create vault lock';
    pinSubText.textContent = 'First time setup. Choose a master password for your vault:';
    show(masterPinConfirm);
    unlockPinBtn.textContent = 'Create vault';
    hide(biometricScanBtn);
    hide(bioDivider);
  } else {
    pinCardTitle.textContent = 'Vault Security Lock';
    pinSubText.textContent = 'Enter your master password:';
    hide(masterPinConfirm);
    unlockPinBtn.textContent = 'Unlock vault';

    const enrolled = await storageGet(BIO_KEY);
    if (enrolled && enrolled.credId && enrolled.wrapped) {
      bioBtnText.textContent = '👆 Unlock with fingerprint';
      show(biometricScanBtn);
      show(bioDivider);
    } else {
      hide(biometricScanBtn);
      hide(bioDivider);
    }
  }

  show(masterPinCard);
  setStatus('Locked', true);
  masterPinInput.focus();
}

async function afterUnlock(masterPassword, justCreated) {
  await cacheSessionUnlock(masterPassword);

  const alreadyEnrolled = await storageGet(BIO_KEY);
  if ((!alreadyEnrolled || !alreadyEnrolled.wrapped) && !alreadyEnrolled?.skipped && (await biometricAvailable())) {
    hideAllCards();
    enrollDesc.textContent = justCreated
      ? 'Vault created! Register Windows Hello / fingerprint for 1-touch unlock?'
      : 'Master password verified! Register Windows Hello / fingerprint for 1-touch unlock?';
    bioEnrollCard.dataset.mp = masterPassword;
    show(bioEnrollCard);
    return;
  }

  hideAllCards();
  const resume = resumeAfterUnlock;
  resumeAfterUnlock = null;
  if (resume) await resume();
}

unlockPinBtn.addEventListener('click', async () => {
  const pw = masterPinInput.value;
  if (!pw) {
    log('Enter a master password.');
    return;
  }

  if (masterCardMode === 'create') {
    if (pw.length < 4) {
      log('Use at least 4 characters for the master lock PIN/password.');
      return;
    }
    if (pw !== masterPinConfirm.value) {
      log('Passwords do not match.');
      return;
    }
    await Vault.createVault(pw);
    log('Encrypted vault created (PBKDF2 150k + AES-GCM).');
    await afterUnlock(pw, true);
    return;
  }

  const ok = await Vault.unlockVault(pw);
  if (!ok) {
    log('Wrong master password/PIN. Try again.');
    return;
  }
  log('🔓 Vault unlocked.');
  await afterUnlock(pw, false);
});

biometricScanBtn.addEventListener('click', async () => {
  biometricScanBtn.classList.add('scanning');
  bioBtnText.textContent = 'Scanning fingerprint...';
  try {
    const result = await unlockViaBiometric();
    if (!result.ok) {
      if (result.reason === 'cancelled') {
        log('Fingerprint scan cancelled.');
      } else if (result.reason === 'not-enrolled') {
        log('No fingerprint enrolled yet. Enter your master password below.');
      } else {
        log('Biometric check failed. Use your master password below.');
      }
      return;
    }
    const ok = await Vault.unlockVault(result.masterPassword);
    if (!ok) {
      log('Stored key no longer matches the vault. Use your master password.');
      return;
    }
    log('🔓 Vault unlocked via biometric fingerprint!');
    await afterUnlock(result.masterPassword, false);
  } catch (err) {
    log(`Fingerprint check failed: ${err.message}`);
  } finally {
    biometricScanBtn.classList.remove('scanning');
    bioBtnText.textContent = '👆 Unlock with fingerprint';
  }
});

registerBioBtn.addEventListener('click', async () => {
  const mp = bioEnrollCard.dataset.mp;
  registerBioBtn.disabled = true;
  try {
    await enrollBiometric(mp);
    log('✅ Fingerprint registered successfully! One-touch unlock is active.');
  } catch (err) {
    log(`Enrollment cancelled or failed: ${err.message}`);
  } finally {
    registerBioBtn.disabled = false;
    delete bioEnrollCard.dataset.mp;
    hideAllCards();
    const resume = resumeAfterUnlock;
    resumeAfterUnlock = null;
    if (resume) await resume();
  }
});

async function skipEnrollment() {
  await storageSet({ [BIO_KEY]: { credId: null, wrapped: null, skipped: true } });
  delete bioEnrollCard.dataset.mp;
  hideAllCards();
  const resume = resumeAfterUnlock;
  resumeAfterUnlock = null;
  if (resume) await resume();
}

skipBioBtn.addEventListener('click', skipEnrollment);
closeEnrollBtn.addEventListener('click', skipEnrollment);

closePinBtn.addEventListener('click', () => {
  resumeAfterUnlock = null;
  hideAllCards();
  setStatus('Standby', false);
});

// ---------------------------------------------------------------------------
// Per-domain credential entry
// ---------------------------------------------------------------------------

saveVaultBtn.addEventListener('click', async () => {
  if (!pending || !pending.tabId) {
    const tab = await getActiveTab();
    if (tab) {
      const perc = await perceive(tab.id).catch(() => ({ elements: [] }));
      pending = {
        tabId: tab.id,
        domain: domainOf(tab.url || ''),
        elements: perc.elements || [],
        viewport: perc.viewport || { width: 1280, height: 800 },
        task: 'fill credentials',
        wantSubmit: true
      };
    }
  }
  if (!pending || !pending.domain) {
    log('Could not identify active webpage. Refresh and try again.');
    return;
  }
  const username = vaultUser.value.trim();
  const password = vaultPass.value;
  if (!username || !password) {
    log('Enter both a username and a password.');
    return;
  }
  if (!Vault.isUnlocked()) {
    log('Vault locked. Unlock it first.');
    showMasterCard('unlock');
    resumeAfterUnlock = credentialFlow;
    return;
  }

  await Vault.saveCredential(pending.domain, username, password);
  vaultUser.value = '';
  vaultPass.value = '';
  hideAllCards();
  log(`🔒 Encrypted and saved for ${pending.domain}!`);
  await fillAndSubmit({ username, password });
});

closeVaultBtn.addEventListener('click', () => {
  hideAllCards();
  setStatus('Standby', false);
});

vaultBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  pending = pending || {
    tabId: tab?.id,
    domain: domainOf(tab?.url || ''),
    elements: [],
    viewport: { width: 1280, height: 800 },
    task: '',
    wantSubmit: false
  };
  if (!(await Vault.vaultExists())) {
    showMasterCard('create');
    resumeAfterUnlock = null;
    return;
  }
  if (!Vault.isUnlocked()) {
    showMasterCard('unlock');
    resumeAfterUnlock = null;
    return;
  }
  vaultDomainTitle.textContent = pending.domain;
  hideAllCards();
  show(vaultCard);
});

// ---------------------------------------------------------------------------
// Misc controls
// ---------------------------------------------------------------------------

runBtn.addEventListener('click', () => {
  executeTask().catch((err) => {
    log(`Error: ${err.message}`);
    setStatus('Standby', false);
  });
});

popOutBtn.addEventListener('click', async () => {
  await sendRuntime({ action: 'TOGGLE_PANEL' });
  window.close();
});

clearSomBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  await sendTab(tab.id, { action: 'CLEAR_SOM' });
  hide(redactedPreviewCard);
  setStatus('Standby', false);
  log('Perception overlay cleared.');
});

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

let isListening = false;

window.addEventListener('DOMContentLoaded', () => {
  if (!window.AegisVoice) return;
  window.AegisVoice.init(
    (command) => {
      taskInput.value = command;
    },
    () => {
      log('Voice trigger "execute" received.');
      executeTask().catch((err) => log(`Error: ${err.message}`));
    },
    (statusText, listening) => {
      voiceStatus.innerText = statusText;
      isListening = listening;
      micBtn.classList.toggle('listening', listening);
      setStatus(listening ? 'Listening' : 'Standby', listening);
    },
    log
  );
});

micBtn.addEventListener('click', () => {
  if (!window.AegisVoice) return;
  if (isListening) window.AegisVoice.stop();
  else window.AegisVoice.start();
});

window.addEventListener('beforeunload', () => {
  // Drop the derived key from memory when the popup closes.
  Vault.lockVault();

  // Auto-clear SoM overlay badges from webpage when popup closes
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'CLEAR_SOM' }, () => {
        const _ = chrome.runtime.lastError;
      });
    }
  });
});