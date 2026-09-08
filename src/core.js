export const PAIRING_TTL_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
// Only the local fallback shortens TTLs: tolerate a client up to 60 seconds ahead.
// This is not a correction for arbitrary clock errors; rules retain their original limits.
export const CLOCK_SKEW_SAFETY_MS = 60_000;

export function calculateExpiresAt(clock, ttl) {
  return clock.now + ttl - (clock.source === 'local-fallback' ? CLOCK_SKEW_SAFETY_MS : 0);
}

export const MAX_TEXT_LENGTH = 500;

export function isValidPairingCode(value) {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}

export function generatePairingCode(random = globalThis.crypto) {
  if (!random?.getRandomValues) {
    throw new Error('Se necesita un generador aleatorio seguro.');
  }

  const range = 1_000_000;
  const maximumAccepted = Math.floor(0x1_0000_0000 / range) * range;
  const buffer = new Uint32Array(1);
  do {
    random.getRandomValues(buffer);
  } while (buffer[0] >= maximumAccepted);

  return String(buffer[0] % range).padStart(6, '0');
}

export function generateSessionId(random = globalThis.crypto) {
  if (!random?.getRandomValues) {
    throw new Error('Se necesita un generador aleatorio seguro.');
  }

  const bytes = new Uint8Array(16);
  random.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isExpired(expiresAt, now = Date.now()) {
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export function canClaimPairing(pairing, now = Date.now()) {
  return pairing === null || (Number.isFinite(pairing?.expiresAt) && pairing.expiresAt < now);
}

export function normalizeText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/gu, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
    .slice(0, maxLength)
    .trimEnd();
}

export function formatPairingCode(code) {
  return isValidPairingCode(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
