// =============================================================================
// src/lib/utils/uuidv7.ts — UUIDv7 generator for browser and server code.
// RFC 9562 §5.7 layout: 48-bit unix_ts_ms | ver(7) | rand_a | var(10) | rand_b.
// Uses Web Crypto (globalThis.crypto.getRandomValues), available in every
// supported browser and in Node ≥ 19. The Node-only variant with an explicit
// timestamp lives in scripts/rebuild/lib/uuidv7.ts.
// =============================================================================

const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A new UUIDv7 string for the current time. */
export function uuidv7(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  const ms = Date.now();
  b[0] = Math.floor(ms / 2 ** 40) % 256;
  b[1] = Math.floor(ms / 2 ** 32) % 256;
  b[2] = Math.floor(ms / 2 ** 24) % 256;
  b[3] = Math.floor(ms / 2 ** 16) % 256;
  b[4] = Math.floor(ms / 2 ** 8) % 256;
  b[5] = ms % 256;
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** True when `s` is a well-formed UUIDv7. */
export function isUuidv7(s: string): boolean {
  return UUIDV7_RE.test(s);
}
