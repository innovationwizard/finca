"use client";

// =============================================================================
// src/app/recuperar/page.tsx — Request password reset email
// =============================================================================

import { useState } from "react";
import { Sprout, ArrowLeft, Mail } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createBrowserSupabaseClient();

    const redirectUrl = `${window.location.origin}/reset-password`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: redirectUrl },
    );

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
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

        {sent ? (
          /* Success state */
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Mail className="h-6 w-6 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-finca-900">
              Correo enviado
            </h2>
            <p className="mt-2 text-sm text-finca-500">
              Revisa tu bandeja de entrada en <strong className="text-finca-700">{email}</strong>.
              Haz clic en el enlace del correo para restablecer tu contraseña.
            </p>
            <p className="mt-4 text-xs text-finca-400">
              Si no recibes el correo, revisa tu carpeta de spam.
            </p>
            <a
              href="/login"
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-finca-600 transition-colors hover:text-finca-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a iniciar sesión
            </a>
          </div>
        ) : (
          /* Form state */
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-finca-900">
                Recuperar contraseña
              </h2>
              <p className="mt-1 text-sm text-finca-500">
                Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
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
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-finca-700"
                >
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 outline-none transition-all placeholder:text-finca-300 focus:border-finca-500 focus:ring-2 focus:ring-finca-100"
                  placeholder="tu@email.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-finca-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
              >
                {loading ? "Enviando..." : "Enviar enlace de recuperación"}
              </button>
            </form>

            <p className="mt-4 text-center">
              <a
                href="/login"
                className="inline-flex items-center gap-1 text-sm font-medium text-finca-600 transition-colors hover:text-finca-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver a iniciar sesión
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
