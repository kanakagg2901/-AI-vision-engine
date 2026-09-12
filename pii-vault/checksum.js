// Checksum algorithms (Verhoeff for Aadhaar, Luhn for credit cards).
// Pure math, no external deps so it works in extension content scripts or node.

export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

// multiplication table for D5 dihedral group
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

// permutation table based on digit distance from the right
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export function verhoeffValidate(numberString) {
  const digits = onlyDigits(numberString);
  if (!digits) return false;

  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
}

// calculates check digit and appends it to generate valid test aadhaar numbers
export function verhoeffGenerate(numberWithoutCheckDigit) {
  const digits = onlyDigits(numberWithoutCheckDigit);
  if (!digits) return '';

  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][reversed[i]]];
  }
  return `${digits}${VERHOEFF_INV[c]}`;
}

// validates 12-digit aadhaar: rejects numbers starting with 0/1 and verifies verhoeff checksum
export function validateAadhaar(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 12) return false;
  if (digits[0] === '0' || digits[0] === '1') return false;
  return verhoeffValidate(digits);
}

export function luhnValidate(value) {
  const digits = onlyDigits(value);
  if (!digits) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

// checks BIN prefixes for common card brands
export function detectCardNetwork(value) {
  const digits = onlyDigits(value);
  if (!digits) return 'Unknown';

  // rupay cards start with 60, 6521/6522, 508, etc. check before discover
  if (
    /^652[12]/.test(digits) ||
    /^508[5-9]/.test(digits) ||
    /^60(?:6[1-9]|7\d|8[0-5])/.test(digits) ||
    /^60/.test(digits) ||
    /^(?:353|356)/.test(digits)
  ) {
    return 'RuPay';
  }

  if (/^4/.test(digits)) return 'Visa';
  if (/^(?:5[1-5]|2(?:2[2-9][1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720))/.test(digits)) {
    return 'Mastercard';
  }
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^(?:6011|65|64[4-9]|622)/.test(digits)) return 'Discover';

  return 'Unknown';
}

export function validateCreditCard(value) {
  const digits = onlyDigits(value);
  const length = digits.length;
  const network = detectCardNetwork(digits);

  let validLength = length >= 13 && length <= 19;
  if (network === 'American Express') validLength = length === 15;
  else if (network === 'Mastercard' || network === 'RuPay') validLength = length === 16;
  else if (network === 'Visa') validLength = length === 13 || length === 16 || length === 19;
  else if (network === 'Discover') validLength = length === 16 || length === 19;

  return {
    valid: validLength && luhnValidate(digits),
    network,
    length
  };
}
