// =============================================================================
// src/app/layout.tsx — Root layout
// =============================================================================

import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "Finca Danilandia",
    template: "%s — Finca Danilandia",
  },
  description: "Sistema de gestión agrícola para Finca Danilandia y Anexos, S.A.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Finca Danilandia",
    description: "Sistema de gestión agrícola — Grupo Orión",
    url: "/",
    siteName: "Finca Danilandia",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Finca Danilandia — Sistema de Gestión Agrícola" }],
    locale: "es_GT",
    type: "website",
  },
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
      className={GeistSans.variable}
    >
      <head>
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body className="font-sans antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
