// Quick smoke test script for pii-vault modules

import {
  verhoeffGenerate,
  validateAadhaar,
  luhnValidate,
  validateCreditCard
} from './checksum.js';

import {
  scanText,
  redactText,
  containsPII
} from './regex-rules.js';

import {
  createVault,
  unlockVault,
  lockVault,
  isUnlocked,
  saveCredential,
  getCredential,
  listSites,
  changeMasterPassword
} from './vault.js';

async function main() {
  console.log('1. Checking Verhoeff & Luhn checksums...');
  const testAadhaar = verhoeffGenerate('23456789012');
  console.log('generated aadhaar:', testAadhaar);
  if (!validateAadhaar(testAadhaar)) throw new Error('Aadhaar validation failed on valid generated number');

  // tamper check
  const tampered = testAadhaar.slice(0, 11) + (Number(testAadhaar.slice(-1)) + 1) % 10;
  if (validateAadhaar(tampered)) throw new Error('Tampered Aadhaar was accepted');

  if (!luhnValidate('4111111111111111')) throw new Error('Luhn failed on test card');
  const card = validateCreditCard('4111111111111111');
  if (!card.valid || card.network !== 'Visa') throw new Error('Visa validation failed');
  console.log('checksums ok\n');

  console.log('2. Testing PII scan and redaction...');
  const sample = [
    'User profile:',
    'Email: contact_user@domain.org',
    'Phone: +91 98765 43210',
    `Aadhaar: ${testAadhaar.slice(0, 4)} ${testAadhaar.slice(4, 8)} ${testAadhaar.slice(8)}`,
    'Card: 4111-1111-1111-1111',
    'password: SuperSecretP@ssw0rd!',
    'CVV: 789'
  ].join('\n');

  if (!containsPII(sample)) throw new Error('containsPII returned false');

  const findings = scanText(sample);
  console.log(`found ${findings.length} matches:`);
  for (const f of findings) {
    console.log(`  [${f.type}] raw="${f.raw}" value="${f.value}" at index ${f.index}`);
  }

  const redacted = redactText(sample);
  console.log('\nRedacted text output:');
  console.log(redacted);

  if (redacted.includes('SuperSecretP@ssw0rd!') || redacted.includes('contact_user@domain.org')) {
    throw new Error('Sensitive text leaked into redacted output');
  }
  console.log('scanner & redaction ok\n');

  console.log('3. Testing vault lifecycle...');
  await createVault('hackathon2026');
  if (!isUnlocked()) throw new Error('Vault should be unlocked after create');

  await saveCredential('github.com', 'octocat', 'gh_secret_token_123', 'dev account');
  const cred = await getCredential('github.com');
  if (cred.username !== 'octocat' || cred.password !== 'gh_secret_token_123') {
    throw new Error('Retrieved credential does not match');
  }

  const sites = await listSites();
  if (!sites.includes('github.com')) throw new Error('listSites missing saved site');

  lockVault();
  if (isUnlocked()) throw new Error('Vault should be locked');

  // wrong password should return false without throwing
  const wrongTry = await unlockVault('wrongpassword');
  if (wrongTry !== false || isUnlocked()) throw new Error('Unlock succeeded with wrong password');

  // correct password
  const okTry = await unlockVault('hackathon2026');
  if (!okTry || !isUnlocked()) throw new Error('Unlock failed with correct password');

  const reloaded = await getCredential('github.com');
  if (reloaded.password !== 'gh_secret_token_123') throw new Error('Decrypted credential corrupted');

  // password change
  await changeMasterPassword('hackathon2026', 'newpass2027');
  lockVault();
  if (await unlockVault('hackathon2026') !== false) throw new Error('Old password still works');
  if (!await unlockVault('newpass2027')) throw new Error('New password failed to unlock');
  console.log('vault ok\n');

  console.log('All checks passed!');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
