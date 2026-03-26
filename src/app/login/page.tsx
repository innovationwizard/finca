"use client";

// =============================================================================
// src/app/login/page.tsx — Login with Supabase Auth
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sprout } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createBrowserSupabaseClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "Credenciales inválidas"
          : authError.message,
      );
      setLoading(false);
      return;
    }

    router.push("/planilla");
    router.refresh();
  };

  return (
    <div className="flex min-h-dvh">
      {/* Left panel — brand (desktop) */}
      <div className="relative hidden flex-1 items-center justify-center bg-finca-900 lg:flex">
        <div className="absolute inset-0 opacity-10">
          <div
            className="h-full w-full"
            style={{
              backgroundImage:
                "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)",
              backgroundSize: "32px 32px",
            }}
          />
        </div>
        <div className="relative z-10 px-12 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-finca-800 shadow-lg">
            <Sprout className="h-10 w-10 text-finca-100" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Finca Danilandia
          </h1>
          <p className="mt-2 text-finca-300">
            Sistema de Gestión Agrícola
          </p>
          <p className="mt-1 text-sm text-finca-400">
            Grupo Orión
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-finca-800">
              <Sprout className="h-7 w-7 text-finca-100" />
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-finca-900">
              Iniciar sesión
            </h2>
            <p className="mt-1 text-sm text-finca-500">
              Ingresa tus credenciales para continuar
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
                className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 outline-none transition-all placeholder:text-finca-300 focus:border-earth-400 focus:ring-2 focus:ring-earth-100"
                placeholder="tu@email.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-finca-700"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-finca-200 bg-white px-4 py-2.5 text-sm text-finca-900 outline-none transition-all placeholder:text-finca-300 focus:border-earth-400 focus:ring-2 focus:ring-earth-100"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-finca-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-finca-800 disabled:opacity-50"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-finca-400">
            <a
              href="/recuperar"
              className="font-medium text-finca-600 transition-colors hover:text-finca-800"
            >
              ¿Olvidaste tu contraseña?
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
