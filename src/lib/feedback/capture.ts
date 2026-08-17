"use client";

// =============================================================================
// src/lib/feedback/capture.ts — Screenshot + environment capture for "Reportar".
//
// TWO RULES GOVERN THIS FILE:
//
//   1. captureScreenshot RESOLVES, NEVER REJECTS. A capture bug must not cost us
//      the report. Every failure path returns null; the report is sent anyway
//      and the absence is stated explicitly to the user and in the notification.
//
//   2. The capture is taken WHEN THE LAUNCHER IS CLICKED, before the modal
//      opens (see BugReportWidget). Capturing at submit time yields a
//      screenshot of the modal covering the very data being reported.
//
// The widget excludes itself (WIDGET_EXCLUDE_SELECTOR) for the same reason: the
// launcher would otherwise appear in every capture, sometimes over the exact
// cell the user is reporting.
// =============================================================================

import { snapdom } from "@zumer/snapdom";
import type { BugReportMeta } from "@/lib/validators/bug-report";
import { BUG_REPORT_SCREENSHOT_MAX_B64 } from "@/lib/validators/bug-report";

/** Marker attribute carried by every node the widget owns. */
export const WIDGET_EXCLUDE_ATTR = "data-bug-report-widget";
export const WIDGET_EXCLUDE_SELECTOR = `[${WIDGET_EXCLUDE_ATTR}]`;

/** Hard ceiling on capture time. A slow page must not stall the report. */
const CAPTURE_TIMEOUT_MS = 5000;

/** Output width cap. Keeps the payload well inside the request-body limit. */
const MAX_WIDTH_PX = 1600;

const JPEG_QUALITY = 0.8;

/** Metadata collection is synchronous and cannot fail. */
export function collectMetadata(): BugReportMeta {
  return {
    userAgent: navigator.userAgent.slice(0, 500),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen.width}x${window.screen.height}`,
    dpr: window.devicePixelRatio || 1,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    capturedAt: new Date().toISOString(),
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("FileReader falló"));
    reader.onload = () => {
      const result = String(reader.result);
      // Strip the "data:image/jpeg;base64," prefix — the contract is raw base64.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

async function capture(): Promise<Blob> {
  const blob = await snapdom.toBlob(document.body, {
    // Only what the user can actually see. A full-document capture of a long
    // planilla is both enormous and less useful than the rows in front of them.
    clip: "viewport",
    type: "jpg",
    format: "jpg",
    quality: JPEG_QUALITY,
    backgroundColor: "#ffffff",
    // dpr 1 + width cap: predictable payload size on retina phones, where the
    // default device pixel ratio would triple the bytes for no added legibility.
    dpr: 1,
    width: Math.min(window.innerWidth, MAX_WIDTH_PX),
    exclude: [WIDGET_EXCLUDE_SELECTOR],
    excludeMode: "remove",
    // Fonts are not worth the extra fetches here; layout and values are.
    embedFonts: false,
    fast: true,
  });
  return blob;
}

/**
 * Base64 JPEG of the current viewport, or null when anything at all goes wrong.
 * @returns base64 without the `data:` prefix, or null.
 */
export async function captureScreenshot(): Promise<string | null> {
  try {
    const blob = await Promise.race([
      capture(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("La captura excedió el tiempo límite")),
          CAPTURE_TIMEOUT_MS,
        ),
      ),
    ]);

    const b64 = await blobToBase64(blob);

    if (b64.length > BUG_REPORT_SCREENSHOT_MAX_B64) {
      console.warn(
        `[Reportar] Captura descartada por tamaño: ${b64.length} caracteres base64 (máximo ${BUG_REPORT_SCREENSHOT_MAX_B64}).`,
      );
      return null;
    }

    return b64;
  } catch (error) {
    console.warn("[Reportar] No se pudo capturar la pantalla:", error);
    return null;
  }
}
