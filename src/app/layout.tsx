import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ServiceWorkerManager } from "@/components/pwa/service-worker-manager";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WebAuto Chain",
  applicationName: "WebAuto Chain",
  description:
    "Multi-level credit ledger with verified approvals for the entire supply chain.",
  manifest: "/manifest.webmanifest",
  themeColor: "#2563eb",
  icons: {
    apple: "/icons/logo.png",
    icon: "/icons/logo.png",
  },
  appleWebApp: {
    capable: true,
    title: "WebAuto Chain",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <QueryProvider>
            <ServiceWorkerManager />
            {children}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
