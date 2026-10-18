import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/header";
import { AppProviders } from "@/components/providers";
import "./globals.css";

const sans = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "InvTracker",
  description: "CS2 inventory, cijene i P&L",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <AppProviders>
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
