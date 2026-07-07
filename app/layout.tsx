import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import Toast from "@/components/Toast";

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
  icons: {
    icon: "/favicon.svg",
  },
};

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem('clave_theme') || 'dark';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${dmMono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-full bg-bg text-text-custom font-sans antialiased">
        {children}
        <Toast />
      </body>
    </html>
  );
}
