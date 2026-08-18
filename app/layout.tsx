import type { Metadata } from "next";
import { Space_Grotesk, Inconsolata } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import { TEMA } from "@/lib/brand";

/**
 * MANUAL DE MARCA 2026 — as duas fontes oficiais da Influência, self-hospedadas pelo
 * next/font (baixadas no build, servidas do próprio domínio): zero request ao Google em
 * runtime e sem layout shift (size-adjust).
 *
 * ⚠️ SUBSTITUEM A POPPINS INTEIRA. Esta troca vem SOZINHA, antes de qualquer mudança de
 * cor, de propósito: fonte e cor são dois eixos, e mexer nos dois juntos torna impossível
 * saber qual deles causou o que ficou estranho. A paleta nova entra no commit seguinte.
 *
 * ⚠️ PESO ÓPTICO NÃO SE CONVERTE POR TABELA. O 600 da Poppins não é o 600 da Space
 * Grotesk — o eixo óptico é outro, e a Space Grotesk tem contraste de haste maior. Por
 * isso carregamos 400/500/700 (o 600 fica de fora até alguém MEDIR na tela que precisa
 * dele) e existe a /tipografia para a comparação lado a lado.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-titulo",
});

/**
 * INCONSOLATA — apoio, legendas e DADOS TÉCNICOS, por atribuição do manual.
 *
 * ⚠️ É MONOESPAÇADA, e é por isso que ela entra nos números: dígito de mesma largura
 * resolve o alinhamento de coluna por natureza, sem depender do `tabular-nums`.
 *
 * ⚠️ A RÉGUA DE ONDE ELA ENTRA — decidida em 18/08/2026:
 *   **número em COLUNA é Inconsolata; número em FRASE acompanha a frase.**
 * Tabela, ranking, KPI e eixo de gráfico são coluna: ali o alinhamento É a informação.
 * Já "111 das 210 que entraram" é PROSA — um número dentro de uma frase não é dado
 * técnico, e trocar de fonte no meio da linha cria um solavanco de leitura a cada
 * número. O `tabular-nums` continua onde a Space Grotesk ficar com números.
 *
 * ⚠️ A APLICAÇÃO DESSA RÉGUA NÃO É DESTE COMMIT. Aqui as duas fontes só passam a
 * existir; trocar coluna por coluna acontece nos commits de tela, com a paleta já nova.
 */
const inconsolata = Inconsolata({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-dado",
});

export const metadata: Metadata = {
  title: "Painel · Influência",
  description: "Acompanhamento de tráfego pago por gestor e cliente.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${spaceGrotesk.variable} ${inconsolata.variable}`}>
      {/* Fundo e texto vêm do TEMA (fonte única) — não de vars soltas no CSS. */}
      <body style={{ background: TEMA.fundo, color: TEMA.texto }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
