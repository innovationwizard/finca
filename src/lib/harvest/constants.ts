// Names and defaults for the harvest pilot. Gaps versus the spec are marked.

/** New activity. Does not replace "Corte de Café". No price is seeded. */
export const HARVEST_ACTIVITY_NAME = "Entrega de Café";
export const HARVEST_ACTIVITY_SHORT_NAME = "EC";

export const PERSON_PHOTOS_BUCKET = "person-photos";
export const IDENTITY_DOCUMENTS_BUCKET = "identity-documents";

export const FACE_DESCRIPTOR_LENGTH = 1024;
export const FACE_MODEL_FILES = [
  "blazeface.json",
  "blazeface.bin",
  "facemesh.json",
  "facemesh.bin",
  "faceres.json",
  "faceres.bin",
] as const;

/**
 * Uncalibrated. Similarity 0.5 and 3 frames are placeholders and must be
 * verified on the finca phones. Not a confirmed cutoff.
 */
export const FACE_MATCH_MIN_SIMILARITY_KEY = "face_match_min_similarity";
export const FACE_MATCH_MIN_SIMILARITY_DEFAULT = 0.5;

/** Uncalibrated. Must be verified on the finca phones. */
export const FACE_MATCH_CONSECUTIVE_FRAMES = 3;

export const MADUREZ_VALUES = ["Maduro", "Inmaduro"] as const;
export type Madurez = (typeof MADUREZ_VALUES)[number];

export const PHOTO_SLOTS = ["face", "dpiFront", "dpiBack", "partida"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

export const LB_PER_QQ = 100;
