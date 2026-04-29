import type { Metadata } from "next";

import "./globals.css";
import { Sidebar } from "./_components/sidebar.js";

export const metadata: Metadata = {
  title: "DPM Diving — Panel",
  description: "Internal monitoring panel for the Claude integration",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen font-sans">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-6 max-w-7xl">{children}</main>
        </div>
      </body>
    </html>
  );
}
