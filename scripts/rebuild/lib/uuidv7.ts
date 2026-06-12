// =============================================================================
// scripts/rebuild/lib/uuidv7.ts — UUIDv7 generator with an explicit timestamp.
// Used by the rebuild to regenerate every existing PK as a v7 whose embedded
// time = the row's original created_at (truthful chronological ordering).
// RFC 9562 §5.7 layout: 48-bit unix_ts_ms | ver(7) | rand_a | var(10) | rand_b.
// =============================================================================

import { randomBytes } from "node:crypto";

/** Generate a UUIDv7 string whose 48-bit timestamp encodes `date` (ms). */
export function uuidv7FromDate(date: Date): string {
  const ms = date.getTime();
  if (!Number.isFinite(ms)) {
    throw new Error(`uuidv7FromDate: invalid date ${String(date)}`);
  }
  const b = randomBytes(16);
  // 48-bit big-endian millisecond timestamp → bytes 0..5
  b[0] = Math.floor(ms / 2 ** 40) % 256;
  b[1] = Math.floor(ms / 2 ** 32) % 256;
  b[2] = Math.floor(ms / 2 ** 24) % 256;
  b[3] = Math.floor(ms / 2 ** 16) % 256;
  b[4] = Math.floor(ms / 2 ** 8) % 256;
  b[5] = ms % 256;
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Read the 48-bit millisecond timestamp back out of a v7 uuid (for verification). */
export function timestampOfUuidv7(uuid: string): number {
  const hex = uuid.replace(/-/g, "").slice(0, 12);
  return parseInt(hex, 16);
}
