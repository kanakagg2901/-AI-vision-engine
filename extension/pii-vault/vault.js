// Encrypted local password vault using Web Crypto API (PBKDF2 + AES-GCM) and chrome.storage.
// Master password is never saved; only the derived CryptoKey stays in memory while unlocked.

const STORAGE_KEY = 'pii_vault_data';
const PBKDF2_ITERATIONS = 150000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

// in-memory fallback for testing outside chrome extension context
const fallbackStore = new Map();

let sessionKey = null;
let sessionSalt = null;
let sessionVault = null;

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getStorageItem(key) {
  if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (res) => resolve(res ? res[key] : null));
    });
  }
  return fallbackStore.has(key) ? fallbackStore.get(key) : null;
}

async function setStorageItem(key, value) {
  if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }
  fallbackStore.set(key, value);
}

function assertUnlocked() {
  if (!isUnlocked()) {
    throw new Error('Vault is locked. Call unlockVault() first.');
  }
}

async function deriveKey(masterPassword, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPayload(key, payload) {
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(payload));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  return {
    iv,
    ciphertext: new Uint8Array(ciphertext)
  };
}

async function decryptPayload(key, iv, ciphertext) {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
  } catch {
    // bad password or corrupted data
    return null;
  }
}

async function persistCurrentVault() {
  assertUnlocked();
  const { iv, ciphertext } = await encryptPayload(sessionKey, sessionVault);
  await setStorageItem(STORAGE_KEY, {
    salt: bytesToBase64(sessionSalt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext)
  });
}

export async function vaultExists() {
  const record = await getStorageItem(STORAGE_KEY);
  return Boolean(record?.salt && record?.iv && record?.ciphertext);
}

// initializes an empty encrypted vault with a fresh salt and unlocks the session
export async function createVault(masterPassword) {
  if (!masterPassword || typeof masterPassword !== 'string') {
    throw new Error('Master password must be a non-empty string.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(masterPassword, salt);
  const initialData = {};

  const { iv, ciphertext } = await encryptPayload(key, initialData);
  await setStorageItem(STORAGE_KEY, {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext)
  });

  sessionKey = key;
  sessionSalt = salt;
  sessionVault = initialData;
}

// unlocks vault and loads contents into memory, returns false on bad password instead of throwing
export async function unlockVault(masterPassword) {
  if (!masterPassword) return false;

  const record = await getStorageItem(STORAGE_KEY);
  if (!record?.salt || !record?.iv || !record?.ciphertext) {
    throw new Error('No vault exists to unlock. Call createVault() first.');
  }

  const salt = base64ToBytes(record.salt);
  const iv = base64ToBytes(record.iv);
  const ciphertext = base64ToBytes(record.ciphertext);

  const key = await deriveKey(masterPassword, salt);
  const decrypted = await decryptPayload(key, iv, ciphertext);

  if (!decrypted) return false;

  sessionKey = key;
  sessionSalt = salt;
  sessionVault = decrypted;
  return true;
}

export function lockVault() {
  sessionKey = null;
  sessionSalt = null;
  sessionVault = null;
}

export function isUnlocked() {
  return sessionKey !== null && sessionVault !== null;
}

export async function saveCredential(site, username, password, notes = '') {
  assertUnlocked();
  if (!site) throw new Error('Site identifier is required.');

  sessionVault[site] = {
    username: String(username || ''),
    password: String(password || ''),
    notes: String(notes || ''),
    updatedAt: new Date().toISOString()
  };

  await persistCurrentVault();
}

export async function getCredential(site) {
  assertUnlocked();
  if (!site || !sessionVault[site]) return null;
  return { ...sessionVault[site] };
}

export async function listSites() {
  assertUnlocked();
  return Object.keys(sessionVault);
}

export async function deleteCredential(site) {
  assertUnlocked();
  if (!site || !sessionVault[site]) return false;

  delete sessionVault[site];
  await persistCurrentVault();
  return true;
}

export async function changeMasterPassword(oldPassword, newPassword) {
  assertUnlocked();
  if (!newPassword) throw new Error('New master password is required.');

  const record = await getStorageItem(STORAGE_KEY);
  if (!record) throw new Error('Vault record not found in storage.');

  const salt = base64ToBytes(record.salt);
  const iv = base64ToBytes(record.iv);
  const ciphertext = base64ToBytes(record.ciphertext);

  const oldKey = await deriveKey(oldPassword, salt);
  const check = await decryptPayload(oldKey, iv, ciphertext);
  if (!check) throw new Error('Old master password verification failed.');

  const newSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const newKey = await deriveKey(newPassword, newSalt);
  const encrypted = await encryptPayload(newKey, sessionVault);

  await setStorageItem(STORAGE_KEY, {
    salt: bytesToBase64(newSalt),
    iv: bytesToBase64(encrypted.iv),
    ciphertext: bytesToBase64(encrypted.ciphertext)
  });

  sessionKey = newKey;
  sessionSalt = newSalt;
}
