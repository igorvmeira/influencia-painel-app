import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import { TEMA } from "@/lib/brand";

// Poppins self-hospedada pelo next/font (baixada no build, servida do próprio
// domínio): zero request ao Google em runtime e sem layout shift (size-adjust).
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Painel · Influência",
  description: "Acompanhamento de tráfego pago por gestor e cliente.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      {/* Fundo e texto vêm do TEMA (fonte única) — não de vars soltas no CSS. */}
      <body style={{ background: TEMA.fundo, color: TEMA.texto }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
