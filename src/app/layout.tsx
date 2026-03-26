// =============================================================================
// src/app/layout.tsx — Root layout
// =============================================================================

import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Finca Danilandia",
    template: "%s — Finca Danilandia",
  },
  description: "Sistema de gestión para Finca Danilandia y Anexos, S.A.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Finca Danilandia",
  },
};

export const viewport: Viewport = {
  themeColor: "#1B3A2D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Prevents zoom on input focus (mobile)
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es-GT"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="font-sans antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
