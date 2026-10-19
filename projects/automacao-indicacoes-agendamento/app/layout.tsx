import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--fonte-principal",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:4318",
  ),
  title: "Programa de Indicações",
  description:
    "Formulário de indicação de clientes e agendamento comercial.",
  openGraph: {
    title: "Programa de Indicações",
    description: "Formulário do programa de indicações.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Programa de Indicações",
    description: "Formulário do programa de indicações.",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function LayoutRaiz({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
