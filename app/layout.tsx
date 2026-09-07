import { THEME_INIT } from "@/components/surf-editorial/theme-init";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import "./sports.css";
import "@/components/surf-editorial/surf-editorial.css";

const manrope = Manrope({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Surf — Every line. Every angle.",
  description:
    "Real lines. Different opinions. One clearer picture. Sports-market perspective by Surf.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      suppressHydrationWarning
      lang="en"
      className={`${manrope.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
