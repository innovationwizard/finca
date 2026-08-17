"use client";

// =============================================================================
// src/components/feedback/bug-report-widget.tsx — "Reportar" launcher + modal.
//
// THE ORDER ON CLICK IS THE WHOLE POINT: capture the screen FIRST, then open the
// dialog. Capturing at submit time would photograph the dialog covering the very
// number the user is reporting.
//
// The dialog is a native <dialog> + showModal(), not a div overlay: focus
// trapping, Escape-to-close, top-layer stacking and aria-modal semantics come for
// free, and a hand-rolled overlay gets at least one of them wrong.
//
// Every node here carries data-bug-report-widget so the capture excludes the
// widget from its own screenshot.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquareWarning, X } from "lucide-react";
import { FEEDBACK_COPY } from "@/lib/feedback/copy";
import {
  captureScreenshot,
  collectMetadata,
  WIDGET_EXCLUDE_ATTR,
} from "@/lib/feedback/capture";
import {
  isBugReportDraftComplete,
  type BugReportKindValue,
  type BugReportMeta,
} from "@/lib/validators/bug-report";
import { useSyncStatus } from "@/hooks/use-sync-status";

type Step = "choose" | "form" | "done";
type ShotState = "capturing" | "included" | "unavailable";

const EMPTY_DRAFT = {
  donde: "",
  appDice: "",
  appDeberiaDecir: "",
  queFalta: "",
};

/** How long the success state stays up before the dialog closes itself. */
const AUTO_CLOSE_MS = 1800;

export function BugReportWidget() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { isOnline } = useSyncStatus();

  const [step, setStep] = useState<Step>("choose");
  const [kind, setKind] = useState<BugReportKindValue | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [shotState, setShotState] = useState<ShotState>("capturing");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Captured at launcher-click and held until submit.
  const screenshotRef = useRef<string | null>(null);
  const metaRef = useRef<BugReportMeta | null>(null);
  const urlRef = useRef<string>("");

  const reset = useCallback(() => {
    setStep("choose");
    setKind(null);
    setDraft(EMPTY_DRAFT);
    setShotState("capturing");
    setSubmitting(false);
    setError(null);
    screenshotRef.current = null;
    metaRef.current = null;
    urlRef.current = "";
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  // Escape closes a native dialog without going through close(), so the reset
  // hangs off the dialog's own close event rather than off the button.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => reset();
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [reset]);

  const open = useCallback(async () => {
    // 1 ─ Context first, while the screen still shows what the user is reporting.
    urlRef.current = window.location.href;
    metaRef.current = collectMetadata();
    setShotState("capturing");
    const shot = captureScreenshot();

    // 2 ─ Then the dialog. The capture is already running against the clean view.
    dialogRef.current?.showModal();

    const b64 = await shot;
    screenshotRef.current = b64;
    setShotState(b64 ? "included" : "unavailable");
  }, []);

  const chooseKind = useCallback((next: BugReportKindValue) => {
    setKind(next);
    setStep("form");
    setError(null);
  }, []);

  const complete = isBugReportDraftComplete({ kind, ...draft });
  const canSubmit = complete && !submitting && isOnline;

  const submit = useCallback(async () => {
    if (!kind || submitting) return;
    setSubmitting(true);
    setError(null);

    const payload =
      kind === "DATO_INCORRECTO"
        ? {
            kind,
            donde: draft.donde,
            appDice: draft.appDice,
            appDeberiaDecir: draft.appDeberiaDecir,
          }
        : { kind, queFalta: draft.queFalta };

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          url: urlRef.current,
          meta: metaRef.current,
          screenshot: screenshotRef.current,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? FEEDBACK_COPY.errorSave);
        setSubmitting(false);
        return;
      }

      setStep("done");
      setSubmitting(false);
      setTimeout(() => dialogRef.current?.close(), AUTO_CLOSE_MS);
    } catch {
      // Network failure mid-flight: the form stays intact and retryable.
      setError(FEEDBACK_COPY.errorSave);
      setSubmitting(false);
    }
  }, [draft, kind, submitting]);

  const shotMessage =
    shotState === "capturing"
      ? FEEDBACK_COPY.screenshotCapturing
      : shotState === "included"
        ? FEEDBACK_COPY.screenshotIncluded
        : FEEDBACK_COPY.screenshotUnavailable;

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    autoFocus = false,
  ) => (
    <label className="block">
      <span className="text-sm font-medium text-finca-800">{label}</span>
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-2 text-base text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-200"
      />
    </label>
  );

  return (
    <>
      <button
        type="button"
        {...{ [WIDGET_EXCLUDE_ATTR]: "" }}
        onClick={open}
        aria-label={FEEDBACK_COPY.launcherAriaLabel}
        className="fixed bottom-24 right-4 z-50 flex items-center gap-2 rounded-full bg-finca-900 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-finca-800 lg:bottom-6 lg:right-6"
      >
        <MessageSquareWarning className="h-4 w-4" />
        {FEEDBACK_COPY.launcher}
      </button>

      <dialog
        ref={dialogRef}
        {...{ [WIDGET_EXCLUDE_ATTR]: "" }}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-2xl p-0 backdrop:bg-black/40"
      >
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-base font-semibold text-finca-900">
              {step === "done" ? FEEDBACK_COPY.success : FEEDBACK_COPY.chooseTitle}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={FEEDBACK_COPY.close}
              className="rounded-lg p-1 text-finca-400 transition-colors hover:bg-finca-50 hover:text-finca-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {step === "choose" && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => chooseKind("DATO_INCORRECTO")}
                className="w-full rounded-xl border border-finca-200 px-4 py-3 text-left text-sm font-medium text-finca-900 transition-colors hover:border-finca-400 hover:bg-finca-50"
              >
                {FEEDBACK_COPY.kindDatoIncorrecto}
              </button>
              <button
                type="button"
                onClick={() => chooseKind("FALTA_ALGO")}
                className="w-full rounded-xl border border-finca-200 px-4 py-3 text-left text-sm font-medium text-finca-900 transition-colors hover:border-finca-400 hover:bg-finca-50"
              >
                {FEEDBACK_COPY.kindFaltaAlgo}
              </button>
            </div>
          )}

          {step === "form" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) void submit();
              }}
              className="space-y-3"
            >
              {kind === "DATO_INCORRECTO" ? (
                <>
                  {field(
                    FEEDBACK_COPY.labelDonde,
                    draft.donde,
                    (v) => setDraft((d) => ({ ...d, donde: v })),
                    true,
                  )}
                  {field(FEEDBACK_COPY.labelAppDice, draft.appDice, (v) =>
                    setDraft((d) => ({ ...d, appDice: v })),
                  )}
                  {field(
                    FEEDBACK_COPY.labelAppDeberiaDecir,
                    draft.appDeberiaDecir,
                    (v) => setDraft((d) => ({ ...d, appDeberiaDecir: v })),
                  )}
                </>
              ) : (
                <label className="block">
                  <span className="text-sm font-medium text-finca-800">
                    {FEEDBACK_COPY.labelQueFalta}
                  </span>
                  <textarea
                    value={draft.queFalta}
                    autoFocus
                    rows={4}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, queFalta: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-2 text-base text-finca-900 outline-none focus:border-finca-500 focus:ring-2 focus:ring-finca-200"
                  />
                </label>
              )}

              <p className="text-xs text-finca-500">{shotMessage}</p>

              {!isOnline && (
                <p className="rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-800">
                  {FEEDBACK_COPY.offline}
                </p>
              )}

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep("choose");
                    setKind(null);
                    setError(null);
                  }}
                  className="text-sm text-finca-500 transition-colors hover:text-finca-800"
                >
                  {FEEDBACK_COPY.back}
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="rounded-lg bg-finca-700 px-5 py-2.5 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-finca-800 disabled:cursor-not-allowed disabled:bg-finca-200 disabled:text-finca-400"
                >
                  {submitting ? FEEDBACK_COPY.submitting : FEEDBACK_COPY.submit}
                </button>
              </div>
            </form>
          )}

          {step === "done" && (
            <p className="text-sm text-finca-600">
              {FEEDBACK_COPY.screenshotIncluded === shotMessage
                ? "Se envió con la foto de la pantalla."
                : "Se envió sin foto de la pantalla."}
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
