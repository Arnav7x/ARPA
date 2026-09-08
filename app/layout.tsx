import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Research Paper Accelerator",
  description: "Web-based pipeline for literature ingestion, drafting, analysis, and academic paper assembly."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
