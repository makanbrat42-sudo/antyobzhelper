import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: { default: "AntyObzhelp", template: "%s · AntyObzhelp" },
  description: "Система кадрового подразделения AntyObzhelp",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#09090F", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${mono.variable} dark h-full`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
