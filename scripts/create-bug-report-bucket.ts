// =============================================================================
// scripts/create-bug-report-bucket.ts — Create the PRIVATE storage bucket that
// holds "Reportar" screenshots. Idempotent: re-running it is a no-op.
//   npx dotenv -e .env.local -- npx tsx scripts/create-bug-report-bucket.ts
//
// ⚠️ The bucket MUST stay private. These captures contain payroll data — worker
// names, wages, séptimo, descuentos, net pay, sometimes bank accounts. Reads go
// exclusively through short-lived signed URLs minted server-side for MASTER/ADMIN
// on /admin/reportes. If this script ever reports `public: true`, that is a
// security defect, not a configuration preference.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { BUG_REPORT_BUCKET } from "../src/lib/feedback/screenshot-storage";

// Mirrors the intake cap (~3 M base64 chars ≈ 2.2 MB) with headroom, so an
// oversize object is refused by Storage as well as by the validator.
const FILE_SIZE_LIMIT = 3 * 1024 * 1024; // 3 MB

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: existing, error: listError } = await supabase.storage.getBucket(
    BUG_REPORT_BUCKET,
  );

  if (existing && !listError) {
    console.log(`Bucket "${BUG_REPORT_BUCKET}" ya existe.`);
    console.log(`  público: ${existing.public}`);
    if (existing.public) {
      console.error(
        "  ⚠️ ESTE BUCKET ES PÚBLICO Y NO DEBE SERLO. Cámbialo a privado en Supabase.",
      );
      process.exit(1);
    }
    process.exit(0);
  }

  const { error } = await supabase.storage.createBucket(BUG_REPORT_BUCKET, {
    public: false,
    fileSizeLimit: FILE_SIZE_LIMIT,
    allowedMimeTypes: ["image/jpeg"],
  });

  if (error) {
    console.error(`No se pudo crear el bucket: ${error.message}`);
    process.exit(1);
  }

  console.log(`Bucket "${BUG_REPORT_BUCKET}" creado (privado).`);
  process.exit(0);
})();
