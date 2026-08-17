// =============================================================================
// src/lib/feedback/copy.ts — Every user-facing string of the "Reportar" widget.
//
// Centralized so the wording can be changed without touching behaviour (and so
// the app stays i18n-ready). The strings marked VALIDATED come from the source
// spec and have been tested with real non-technical users — do not reword them
// casually. The rest are first-pass Spanish, open to improvement.
// =============================================================================

export const FEEDBACK_COPY = {
  // ── Launcher ───────────────────────────────────────────────────────────────
  launcher: "Reportar", // VALIDATED
  launcherAriaLabel: "Reportar un problema",

  // ── Type selection ─────────────────────────────────────────────────────────
  chooseTitle: "¿Qué quieres reportar?",
  kindDatoIncorrecto: "Aquí hay un dato incorrecto", // VALIDATED
  kindFaltaAlgo: "Aquí hace falta algo", // VALIDATED

  // ── Type A: dato incorrecto ────────────────────────────────────────────────
  // Three fields on purpose: WHERE, OBSERVED, EXPECTED. These are the three
  // facts needed to act on a report and the three a user rarely volunteers.
  // Collapsing them into one free-text box measurably degrades report quality.
  labelDonde: "¿Dónde? Fila y columna:", // VALIDATED
  labelAppDice: "La app dice:", // VALIDATED
  labelAppDeberiaDecir: "La app debería decir:", // VALIDATED

  // ── Type B: falta algo ─────────────────────────────────────────────────────
  labelQueFalta: "¿Qué es lo que hace falta?", // VALIDATED

  // ── Actions ────────────────────────────────────────────────────────────────
  submit: "ENVIAR", // VALIDATED
  submitting: "Enviando…",
  back: "← Regresar",
  close: "Cerrar",
  success: "✓ Reporte enviado. ¡Gracias!", // VALIDATED

  // ── Screenshot status ──────────────────────────────────────────────────────
  // Always visible, so the reporter knows what is being sent with the report.
  screenshotCapturing: "Capturando la pantalla…",
  screenshotIncluded: "✓ Se incluye una foto de la pantalla",
  screenshotUnavailable: "Sin foto de la pantalla — el reporte se envía igual",

  // ── Errors ─────────────────────────────────────────────────────────────────
  offline: "Sin conexión. Escribe tu reporte y envíalo cuando tengas señal.",
  errorSave: "No se pudo guardar. Intenta de nuevo.",
} as const;
