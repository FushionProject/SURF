import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { SURF_THEME_INIT_SCRIPT, SurfThemeProvider } from "@/components/surf/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Surf",
  description: "An NFL-first companion that translates the sports market.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the pre-paint script below sets data-theme on
    // <html> before React hydrates, so the server markup intentionally differs.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script
          id="surf-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: SURF_THEME_INIT_SCRIPT }}
        />
        <SurfThemeProvider>{children}</SurfThemeProvider>
      </body>
    </html>
  );
}
