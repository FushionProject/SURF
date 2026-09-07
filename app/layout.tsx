import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./sports.css";
import { SurfThemeProvider } from "@/components/surf/ThemeProvider";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: "Surf",
  description: "Live sportsbook and prediction-market intelligence. Catch the moves that matter.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
  }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SurfThemeProvider>{children}</SurfThemeProvider>
      </body>
    </html>
  );
}
