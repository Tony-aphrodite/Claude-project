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
  // Browser tab title. `template` lets per-page metadata read "Dashboard · DPM"
  // etc. while the default fallback for pages that don't set their own title
  // stays the brand-short form.
  title: {
    default: "DPM Panel",
    template: "%s · DPM",
  },
  description: "Internal monitoring panel for the Claude integration",
  // Next.js auto-detects icon.png in this directory and emits <link rel="icon">.
  // Declaring it here too is redundant but documents the intent + lets future
  // contributors swap in additional sizes (apple-icon, etc) without surprise.
  icons: {
    icon: "/icon.png",
  },
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
