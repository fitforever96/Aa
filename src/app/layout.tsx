import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { withBase } from "@/lib/base";

export const metadata: Metadata = {
  title: "Orkin Proposal Studio",
  description: "Commercial pest-management estimating, pricing and proposal generation for Orkin Commercial.",
  applicationName: "Proposal Studio",
  appleWebApp: { capable: true, title: "Proposal Studio", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { icon: withBase("/icons/icon-192.png"), apple: withBase("/icons/apple-touch-icon.png") },
  manifest: withBase("/manifest.webmanifest"),
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Dark mode only.
  themeColor: "#0A0A0C",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
