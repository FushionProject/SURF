import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import "./sports.css";
import "@/components/bestbet/bestbet.css";

const manrope = Manrope({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BestBet — A fresh read on the market",
  description:
    "Real lines. Different opinions. One clearer picture. Sports-market perspective by BestBet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
