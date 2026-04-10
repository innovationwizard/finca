// =============================================================================
// GET /api/planilla/signed-upload-url
// Returns a short-lived signed URL so the browser can upload the notebook photo
// directly to Supabase Storage, bypassing the Vercel 4.5 MB body limit.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { apiRequireRole, SETTINGS_ROLES } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAgriculturalYear } from "@/lib/utils/agricultural-year";

export async function GET(request: NextRequest) {
  const auth = await apiRequireRole(...SETTINGS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;
  const ext = searchParams.get("ext") || "jpg";
  const contentType = searchParams.get("contentType") || "image/jpeg";

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(contentType)) {
    return NextResponse.json(
      { error: "Formato de imagen no soportado. Use JPEG, PNG o WebP." },
      { status: 400 },
    );
  }

  const agYear = getCurrentAgriculturalYear();
  const timestamp = Date.now();
  const storagePath = `planilla/${agYear}/${timestamp}.${ext}`;

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from("notebook-photos")
    .createSignedUploadUrl(storagePath);

  if (error) {
    console.error("Signed upload URL error:", error);
    return NextResponse.json(
      { error: `Error al generar URL de subida: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: storagePath,
  });
}
