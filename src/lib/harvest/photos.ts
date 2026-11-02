import { createServiceClient } from "@/lib/supabase/service";
import {
  IDENTITY_DOCUMENTS_BUCKET,
  PERSON_PHOTOS_BUCKET,
  type PhotoSlot,
} from "./constants";
import { splitCui } from "./cui";

const readyBuckets = new Set<string>();

function safeSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "x";
}

export function objectPath(slot: PhotoSlot, clientId: string, cui: string | null): {
  bucket: string;
  path: string;
} {
  if (slot === "face") {
    const folder = cui ? safeSegment(splitCui(cui).cui) : safeSegment(clientId);
    return { bucket: PERSON_PHOTOS_BUCKET, path: `${folder}/face.jpg` };
  }
  const folder = cui ? safeSegment(splitCui(cui).cui) : `pending/${safeSegment(clientId)}`;
  const file =
    slot === "dpiFront" ? "dpi-front.jpg" : slot === "dpiBack" ? "dpi-back.jpg" : "partida.jpg";
  return { bucket: IDENTITY_DOCUMENTS_BUCKET, path: `${folder}/${file}` };
}

async function ensurePrivateBucket(name: string): Promise<void> {
  if (readyBuckets.has(name)) return;
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(error.message);
  if (!data?.some((bucket) => bucket.name === name)) {
    const created = await supabase.storage.createBucket(name, { public: false });
    if (created.error && !/already exists/i.test(created.error.message)) {
      throw new Error(created.error.message);
    }
  }
  readyBuckets.add(name);
}

export async function uploadHarvestPhoto(
  slot: PhotoSlot,
  clientId: string,
  cui: string | null,
  bytes: Buffer,
): Promise<string> {
  const { bucket, path } = objectPath(slot, clientId, cui);
  await ensurePrivateBucket(bucket);
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedHarvestPhoto(bucket: string, path: string): Promise<string | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export function decodeImage(imageBase64: string): Buffer | null {
  const raw = imageBase64.includes(",") ? imageBase64.slice(imageBase64.indexOf(",") + 1) : imageBase64;
  if (raw.length === 0 || raw.length > 8_000_000) return null;
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length === 0 || bytes.length > 6_000_000) return null;
  return bytes;
}
