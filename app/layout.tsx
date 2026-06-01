import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Clave — Plataforma de Gestão de Marketing Digital",
  description: "Centralize em um único lugar todos os processos de um negócio digital: da concepção do produto até a análise financeira de lançamentos.",
};

export default function RootLayout({
  children,
  className,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${dmMono.variable} h-full`}
    >
      <body className="h-full bg-bg text-text-custom font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
