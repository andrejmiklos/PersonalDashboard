// Pairing code format, shared by the Worker and scripts/pair.ts. Keep this file free of imports:
// Node runs the scripts with type stripping.

/** Letters and digits without look-alikes (0/O, 1/I/L): 31 symbols, ~39.6 bits for 8 characters. */
export const PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_TTL_MS = 10 * 60_000;
/** Failed attempts after which the active code stops working. */
export const PAIRING_MAX_FAILED = 10;

export const PAIRING_CODE_PATTERN = new RegExp(`^[${PAIRING_ALPHABET}]{${PAIRING_CODE_LENGTH}}$`);

/** Random code from the CSPRNG; rejection sampling keeps every symbol equally likely. */
export function generatePairingCode(): string {
  const limit = 256 - (256 % PAIRING_ALPHABET.length);
  let code = '';
  while (code.length < PAIRING_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit && code.length < PAIRING_CODE_LENGTH) {
        code += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length];
      }
    }
  }
  return code;
}

/** Accepts what a person types: any case, spaces and dashes. */
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

/** `ABCD-EFGH` for reading aloud or typing. */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
