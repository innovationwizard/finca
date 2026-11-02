// =============================================================================
// scripts/create-harvest-buckets.ts — Create the PRIVATE buckets before any
// harvest photo is uploaded. The app does not create them on first upload.
// Idempotent: re-running it is a no-op when both buckets already exist and
// are private.
//
//   npx dotenv -e .env.local -- npx tsx scripts/create-harvest-buckets.ts
//
// Required bucket names, both private:
//   person-photos
//   identity-documents
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import {
  IDENTITY_DOCUMENTS_BUCKET,
  PERSON_PHOTOS_BUCKET,
} from "../src/lib/harvest/constants";

const BUCKETS = [PERSON_PHOTOS_BUCKET, IDENTITY_DOCUMENTS_BUCKET];

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno.");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  for (const name of BUCKETS) {
    const { data: existing, error: readError } = await supabase.storage.getBucket(name);
    if (existing && !readError) {
      console.log(`Bucket "${name}" ya existe. público: ${existing.public}`);
      if (existing.public) {
        console.error(`"${name}" es público y debe ser privado.`);
        process.exit(1);
      }
      continue;
    }

    const { error } = await supabase.storage.createBucket(name, {
      public: false,
      allowedMimeTypes: ["image/jpeg"],
    });
    if (error) {
      console.error(`No se pudo crear el bucket "${name}": ${error.message}`);
      process.exit(1);
    }
    console.log(`Bucket "${name}" creado (privado).`);
  }

  process.exit(0);
})();
