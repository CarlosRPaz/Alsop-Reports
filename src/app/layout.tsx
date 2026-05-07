import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

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
      <body className={`${inter.className} flex min-h-screen bg-slate-50 text-slate-900`}>
        <Sidebar />
        <div className="flex-1 overflow-x-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
