// =============================================================================
// src/lib/feedback/screenshot-storage.ts — Private storage for report screenshots.
//
// SERVER ONLY. Uses the service-role Supabase key; never import from a "use
// client" module.
//
// ⚠️ A viewport capture of this app contains payroll data: worker names, daily
// wages, séptimo, descuentos, net pay, and on some screens bank accounts. So:
//
//   • the bucket is PRIVATE — there is no public URL, ever;
//   • it is written only by the service-role client, server-side;
//   • it is read only through short-lived signed URLs minted on /admin/reportes
//     for MASTER/ADMIN;
//   • the notification email links to that page and carries NO image, so no
//     payroll imagery ever reaches a mailbox or the mail provider's logs.
//
// Upload happens AFTER the report row is inserted. A Storage outage therefore
// costs the screenshot, never the report.
// =============================================================================

import { createServiceClient } from "@/lib/supabase/service";

export const BUG_REPORT_BUCKET = "bug-report-screenshots";

/** How long an admin's view of a screenshot stays valid. */
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/** Object path: year/month/<reportId>.jpg — keeps the bucket browsable and purgeable by age. */
export function screenshotObjectPath(reportId: string, createdAt: Date): string {
  const year = createdAt.getUTCFullYear();
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  return `${year}/${month}/${reportId}.jpg`;
}

export type ScreenshotUploadResult =
  | { path: string; error: null }
  | { path: null; error: string };

/**
 * Uploads the JPEG. Returns the error as a value rather than throwing: the
 * caller has already stored the report and must not fail because of this.
 */
export async function uploadScreenshot(
  reportId: string,
  createdAt: Date,
  base64Jpeg: string,
): Promise<ScreenshotUploadResult> {
  const path = screenshotObjectPath(reportId, createdAt);

  try {
    const bytes = Buffer.from(base64Jpeg, "base64");
    if (bytes.length === 0) {
      return { path: null, error: "La imagen recibida estaba vacía" };
    }

    const supabase = createServiceClient();
    const { error } = await supabase.storage
      .from(BUG_REPORT_BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });

    if (error) return { path: null, error: error.message };

    return { path, error: null };
  } catch (error) {
    return {
      path: null,
      error: error instanceof Error ? error.message : "Error desconocido al subir la imagen",
    };
  }
}

/**
 * Short-lived signed URL for the admin view. Returns null (never throws) so one
 * unreadable object cannot break the whole reports page.
 */
export async function signedScreenshotUrl(path: string): Promise<string | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from(BUG_REPORT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
