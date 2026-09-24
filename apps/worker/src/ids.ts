const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const ID_LENGTH = 16;

/** Prefixed random id such as `tok_k3x…` (docs/07-api.md §8); 80 bits of randomness. */
export function generateId(prefix: 'tok' | 'lay' | 'src' | 'acc'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  // 256 is a multiple of 32, so masking keeps every character equally likely.
  const body = Array.from(bytes, (b) => BASE32[b & 31]).join('');
  return `${prefix}_${body}`;
}

export const ID_PATTERN = /^[a-z]{3}_[a-z2-7]{16}$/;
export const LAYOUT_ID_PATTERN = /^lay_[a-z2-7]{16}$/;
