import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Painel · Influência 4.0",
  description: "Acompanhamento de tráfego pago por gestor e cliente.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
