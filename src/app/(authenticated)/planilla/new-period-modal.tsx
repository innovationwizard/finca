"use client";

// =============================================================================
// src/app/(authenticated)/planilla/new-period-modal.tsx
// Button + modal to create the next pay period. Also used inline (no button)
// when there is no open period at all.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, X } from "lucide-react";
import { CreatePayPeriodWizard } from "./nueva/create-pay-period-wizard";

type Props = {
  // When true: renders the wizard inline with no trigger button (empty-state use)
  inline?: boolean;
  // Day after the last period ended, pre-filled as start date
  suggestedStartDate?: string | null;
};

export function NewPeriodModal({ inline = false, suggestedStartDate }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleCreated() {
    setOpen(false);
    router.refresh();
  }

  // Inline mode: wizard rendered directly, no modal chrome
  if (inline) {
    return (
      <CreatePayPeriodWizard
        onCreated={handleCreated}
        suggestedStartDate={suggestedStartDate ?? undefined}
      />
    );
  }

  // Button + modal mode: used when a period already exists and user wants to create the next one
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm font-medium text-finca-700 transition-colors hover:bg-finca-50 touch-target"
      >
        <CalendarPlus className="h-4 w-4" />
        Nuevo período
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-finca-100 px-5 py-4">
              <h2 className="text-base font-semibold text-finca-900">
                Crear siguiente período de pago
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-finca-400 transition-colors hover:bg-finca-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">
              <CreatePayPeriodWizard
                onCreated={handleCreated}
                suggestedStartDate={suggestedStartDate ?? undefined}
                initialStep={2}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
