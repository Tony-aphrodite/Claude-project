import type { Metadata } from "next";

import "./globals.css";
import { Sidebar } from "./_components/sidebar";

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
      <body className="min-h-screen font-sans">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <div className="mx-auto w-full max-w-7xl px-6 py-6 space-y-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
