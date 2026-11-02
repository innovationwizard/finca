// Names and defaults for the harvest pilot. Gaps versus the spec are marked.

/** New activity. Does not replace "Corte de Café". */
export const HARVEST_ACTIVITY_NAME = "Entrega de Cereza";
export const HARVEST_ACTIVITY_SHORT_NAME = "EC";
export const HARVEST_ACTIVITY_DEFAULT_PRICE = 0.85;
/** Assumption: first vigencia covers cosecha 2526 onward. Not stated in the spec. */
export const HARVEST_FIRST_VIGENCIA = "2025-10-01";

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
 * Human 3.3 documents similarity above 0.5 as a match (higher is closer).
 * The spec asks for a distance cutoff and does not give a number. This is the
 * shipped default, stored in system_settings.face_match_min_similarity.
 */
export const FACE_MATCH_MIN_SIMILARITY_KEY = "face_match_min_similarity";
export const FACE_MATCH_MIN_SIMILARITY_DEFAULT = 0.5;

/** "A few consecutive frames." The spec does not say how many. */
export const FACE_MATCH_CONSECUTIVE_FRAMES = 3;

export const MADUREZ_VALUES = ["Maduro", "Inmaduro"] as const;
export type Madurez = (typeof MADUREZ_VALUES)[number];

export const PHOTO_SLOTS = ["face", "dpiFront", "dpiBack", "partida"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

export const LB_PER_QQ = 100;
