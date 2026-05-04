// Root layout. Intentionally minimal — only html/body + global styles.
//
// Pages that need the operator sidebar (dashboard, pipeline, conversations,
// etc.) live under the (app) route group and inherit its layout, which adds
// <Sidebar /> + <main>. Pages that render full-bleed without the sidebar
// (login, auth callback) live at the top level and inherit only this minimal
// shell.

import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "DPM Diving — Panel",
  description: "Internal monitoring panel for the Claude integration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
