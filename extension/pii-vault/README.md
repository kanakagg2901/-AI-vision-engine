# pii-vault (P4)

On-device privacy and credential vault module for the browser extension. When the screen reader grabs text from the page, this module scans and redacts sensitive data (Aadhaar, cards, passwords, phones, emails) so raw secrets never leave the device to the server LLM, while letting the HUD know where to paint blackout boxes. It also includes an encrypted local vault for storing passwords client-side.

## Files

- `checksum.js` - Verhoeff algorithm for Aadhaar, Luhn mod-10 for cards, and card brand detection.
- `regex-rules.js` - PII regex patterns cross-checked with checksums, plus overlap deduplication and `[TYPE]` redaction.
- `vault.js` - Encrypted password vault using PBKDF2 + AES-GCM via Web Crypto, persisted in `chrome.storage.local`.

## Usage

### Redacting text before sending to LLM
```javascript
import { redactText, scanText } from './regex-rules.js';

// replace secrets with tags like [CARD], [PASSWORD], [AADHAAR]
const safeText = redactText(rawScreenText);

// or get exact spans + indices to draw blackout boxes in the HUD
const matches = scanText(rawScreenText);
```

### Saving & retrieving credentials
```javascript
import { createVault, unlockVault, saveCredential, getCredential, lockVault } from './vault.js';

await createVault('masterPassword123');
await saveCredential('github.com', 'octocat', 'myToken', 'personal');

// later in session
const cred = await getCredential('github.com');
lockVault(); // wipes keys from memory
```

## Running tests

```bash
node test.mjs
```
