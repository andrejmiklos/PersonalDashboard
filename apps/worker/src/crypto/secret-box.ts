import { ApiError } from '../errors';

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/** Sealed value could not be opened: wrong key, wrong context, tampered or malformed. */
export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: spreading a large array into fromCharCode overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Authenticated encryption for secrets stored in D1 (refresh tokens, access tokens, personal payloads).
 * The context (e.g. `refresh:acc_x`) is authenticated but not stored, so a sealed value cannot be
 * moved to another row or purpose.
 */
export interface SecretBox {
  seal(plaintext: string, context: string): Promise<string>;
  open(sealed: string, context: string): Promise<string>;
}

/** Sealed format: `v1.<base64 iv>.<base64 ciphertext with tag>`; the version allows key rotation later. */
export async function createSecretBox(base64Key: string | undefined): Promise<SecretBox> {
  let raw: Uint8Array<ArrayBuffer> | null;
  try {
    raw = base64Key ? fromBase64(base64Key.trim()) : null;
  } catch {
    raw = null;
  }
  if (raw?.length !== KEY_BYTES) {
    throw new ApiError(500, 'not_configured', 'TOKEN_ENC_KEY is missing or is not 32 bytes of base64');
  }
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const encoder = new TextEncoder();

  return {
    async seal(plaintext, context) {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
        key,
        encoder.encode(plaintext),
      );
      return `${VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
    },

    async open(sealed, context) {
      const [version, ivText, cipherText, ...rest] = sealed.split('.');
      if (version !== VERSION || !ivText || !cipherText || rest.length > 0) {
        throw new SecretBoxError('Unsupported sealed format');
      }
      try {
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromBase64(ivText), additionalData: encoder.encode(context) },
          key,
          fromBase64(cipherText),
        );
        return new TextDecoder().decode(plain);
      } catch {
        throw new SecretBoxError('Cannot open sealed value');
      }
    },
  };
}
