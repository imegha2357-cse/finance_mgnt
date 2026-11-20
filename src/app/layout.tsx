import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AuthProvider } from "@/components/auth-provider";
import { PREFS_BOOT_SCRIPT } from "@/lib/prefs-boot";
import "./globals.css";


export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0d0e11" }, { media: "(prefers-color-scheme: light)", color: "#171721" }],
};

export const metadata: Metadata = {
  title: "Ledgerly · Business finance",
  description: "Banking, bills, GST invoices and live books for Indian businesses",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className="dark" data-density="comfortable" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint, so there is no light flash. */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
