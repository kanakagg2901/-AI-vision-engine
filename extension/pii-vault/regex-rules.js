// PII detection and redaction rules for on-device sanitization.
// Pairs regex pattern matching with checksum validation to keep false positives low.

import {
  onlyDigits,
  validateAadhaar,
  validateCreditCard
} from './checksum.js';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// indian phones: optional +91, 10 digits starting with 6-9
// todo: support international phone numbers if we expand beyond india
const INDIAN_PHONE_REGEX = /(?<!\w|\+)(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;

const AADHAAR_CANDIDATE_REGEX = /(?<!\d)[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g;
const CARD_CANDIDATE_REGEX = /(?<!\d)(?:\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}|\d{4}[\s-]?\d{6}[\s-]?\d{4,5}|\d{13,19})(?!\d)/g;

const LABELLED_PASSWORD_REGEX = /(?:password|passwd|pwd|pass)\s*[:=]\s*(["']?)([^\s"',;]+)\1/gi;
const LABELLED_CVV_REGEX = /(?:cvv2?|cvc2?|cid|security\s*code)\s*[:=]\s*(["']?)(\d{3,4})\b\1/gi;

const TYPE_PRIORITY = {
  CARD: 10,
  AADHAAR: 9,
  PASSWORD: 8,
  CVV: 7,
  EMAIL: 6,
  PHONE: 5
};

// scans text for all pii types and returns sorted matches with raw text + positions
export function scanText(text) {
  if (!text) return [];

  const candidates = [];

  for (const match of text.matchAll(EMAIL_REGEX)) {
    candidates.push({
      type: 'EMAIL',
      value: match[0],
      raw: match[0],
      index: match.index,
      confidence: 0.9
    });
  }

  for (const match of text.matchAll(INDIAN_PHONE_REGEX)) {
    const raw = match[0];
    const digits = onlyDigits(raw);
    if (digits.length === 10 || (digits.length === 12 && digits.startsWith('91'))) {
      candidates.push({
        type: 'PHONE',
        value: digits.length === 12 ? digits.slice(2) : digits,
        raw,
        index: match.index,
        confidence: 0.9
      });
    }
  }

  for (const match of text.matchAll(AADHAAR_CANDIDATE_REGEX)) {
    const raw = match[0];
    if (validateAadhaar(raw)) {
      candidates.push({
        type: 'AADHAAR',
        value: onlyDigits(raw),
        raw,
        index: match.index,
        confidence: 1.0
      });
    }
  }

  for (const match of text.matchAll(CARD_CANDIDATE_REGEX)) {
    const raw = match[0];
    const cardInfo = validateCreditCard(raw);
    if (cardInfo.valid) {
      candidates.push({
        type: 'CARD',
        value: onlyDigits(raw),
        raw,
        index: match.index,
        confidence: 1.0,
        network: cardInfo.network
      });
    }
  }

  // index points to the secret itself so HUD can blackout just the value
  for (const match of text.matchAll(LABELLED_PASSWORD_REGEX)) {
    const fullMatch = match[0];
    const passwordValue = match[2];
    candidates.push({
      type: 'PASSWORD',
      value: passwordValue,
      raw: passwordValue,
      index: match.index + fullMatch.lastIndexOf(passwordValue),
      confidence: 0.9
    });
  }

  for (const match of text.matchAll(LABELLED_CVV_REGEX)) {
    const fullMatch = match[0];
    const cvvValue = match[2];
    candidates.push({
      type: 'CVV',
      value: cvvValue,
      raw: cvvValue,
      index: match.index + fullMatch.lastIndexOf(cvvValue),
      confidence: 0.9
    });
  }

  candidates.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    if (b.raw.length !== a.raw.length) return b.raw.length - a.raw.length;
    return (TYPE_PRIORITY[b.type] || 0) - (TYPE_PRIORITY[a.type] || 0);
  });

  // resolve overlapping matches (e.g. card number containing 10-digit phone substring)
  const resolved = [];
  for (const candidate of candidates) {
    const candStart = candidate.index;
    const candEnd = candidate.index + candidate.raw.length;

    let overlapIdx = -1;
    for (let i = 0; i < resolved.length; i++) {
      const existing = resolved[i];
      if (candStart < existing.index + existing.raw.length && existing.index < candEnd) {
        overlapIdx = i;
        break;
      }
    }

    if (overlapIdx === -1) {
      resolved.push(candidate);
    } else {
      const existing = resolved[overlapIdx];
      const candPrio = TYPE_PRIORITY[candidate.type] || 0;
      const existPrio = TYPE_PRIORITY[existing.type] || 0;
      if (candPrio > existPrio || (candPrio === existPrio && candidate.raw.length > existing.raw.length)) {
        resolved[overlapIdx] = candidate;
      }
    }
  }

  return resolved.sort((a, b) => a.index - b.index);
}

export function containsPII(text) {
  return scanText(text).length > 0;
}

// replaces sensitive spans with [TYPE] tags, walks backwards so indices don't shift
export function redactText(text) {
  if (!text) return '';
  const matches = scanText(text);
  if (matches.length === 0) return text;

  let sanitized = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const before = sanitized.slice(0, match.index);
    const after = sanitized.slice(match.index + match.raw.length);
    sanitized = `${before}[${match.type}]${after}`;
  }

  return sanitized;
}