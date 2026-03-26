"use client";

// =============================================================================
// src/app/reset-password/page.tsx — Set new password after reset link
// Supabase redirects here with tokens in the URL hash fragment.
// =============================================================================

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sprout, CheckCircle, Loader2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase sends the recovery token via URL hash.
  // The client library picks it up automatically on load.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          setSessionReady(true);
        }
      },
    );

    // Also check if we already have a session (token was processed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);

    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // Redirect to app after 3 seconds
    setTimeout(() => {
      router.push("/planilla");
      router.refresh();
    }, 3000);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-finca-50 px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-finca-800">
            <Sprout className="h-7 w-7 text-finca-100" />
          </div>
        </div>

        {success ? (
          /* Success state */
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-finca-900">
              Contraseña actualizada
            </h2>
            <p className="mt-2 text-sm text-finca-500">
              Tu contraseña ha sido cambiada exitosamente. Redirigiendo...
            </p>
          </div>
        ) : !sessionReady ? (
          /* Waiting for token */
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-finca-400" />
            <p className="mt-4 text-sm text-finca-500">
              Verificando enlace de recuperación...
            </p>
            <p className="mt-2 text-xs text-finca-400">
              Si esto tarda mucho, el enlace puede haber expirado.{" "}
              <a href="/recuperar" className="font-medium text-finca-600 hover:text-finca-800">
                Solicitar uno nuevo
              </a>
            </p>
          </div>
        ) : (
          /* New password form */
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-finca-900">
                Nueva contraseña
              </h2>
              <p className="mt-1 text-sm text-finca-500">
                Ingresa tu nueva contraseña para tu cuenta.
              </p>
            </div>

            {error && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-finca-700"
                >
                  Nueva contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 outline-none transition-all placeholder:text-finca-300 focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm"
                  className="mb-1.5 block text-sm font-medium text-finca-700"
                >
                  Confirmar contraseña
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 outline-none transition-all placeholder:text-finca-300 focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
                  placeholder="Repetir contraseña"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-finca-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
              >
                {loading ? "Guardando..." : "Guardar nueva contraseña"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
