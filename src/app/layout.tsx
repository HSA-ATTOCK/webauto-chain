import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ServiceWorkerManager } from "@/components/pwa/service-worker-manager";
import { IOSInstallPrompt } from "@/components/pwa/ios-install-prompt";
import { PushManagerComponent } from "@/components/pwa/push-manager";

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
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icons/icon-192.png",
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
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
            <PushManagerComponent />
            <IOSInstallPrompt />
            {children}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
