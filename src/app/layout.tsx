import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LayoutShell } from "@/components/layout/LayoutShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DSR Command Center",
  description: "Live dashboard for agent performance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} flex flex-col md:flex-row min-h-screen bg-slate-50 text-slate-900`}>
        <LayoutShell>
          {children}
        </LayoutShell>
      </body>
    </html>
  );
}

// Updated workspace identity trigger\n// Verified PAT Trigger