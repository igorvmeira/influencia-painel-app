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
 * Grotesk — o eixo óptico é outro, e a Space Grotesk tem contraste de haste maior. A
 * /tipografia existe para essa comparação lado a lado, e a CALIBRAÇÃO (qual peso novo
 * substitui qual peso antigo) é decisão à parte, ainda não tomada.
 *
 * 🛑 AS QUATRO FACES SÃO CARREGADAS, E ISSO NÃO É PRECAUÇÃO — É CORREÇÃO.
 * A primeira versão deste arquivo trazia 400/500/700 "até alguém medir se o 600 é
 * necessário". O `next/font` gera faces DISCRETAS (medido no CSS servido: três
 * @font-face, não uma faixa variável), e pela regra de casamento do CSS um peso pedido
 * ACIMA de 500 procura primeiro para CIMA. Resultado: os 76 lugares escritos como 600
 * passaram a renderizar 700 — sem erro, sem aviso, e o painel inteiro ficou mais pesado
 * do que está escrito no código.
 *
 * A lição: **não carregar uma face não deixa o peso de fora, deixa o navegador escolher
 * outro.** Omitir peso só é seguro depois de trocar quem o usa; antes disso, omitir é
 * mudar silenciosamente 76 lugares. Ver a nota datada no README.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-titulo",
});

/**
 * INCONSOLATA — apoio, legendas e DADOS TÉCNICOS, por atribuição do manual.
 *
 * ⚠️ É MONOESPAÇADA, e é por isso que ela entra nos números: dígito de mesma largura
 * resolve o alinhamento de coluna por natureza, sem depender do `tabular-nums`.
 *
 * ⚠️ A RÉGUA DE ONDE ELA ENTRA — três casos, fechada em 18/08/2026 (commit 1c).
 * A pergunta não é "é número?", é **o que está ao lado dele**:
 *
 *   1. NÚMERO EM COLUNA  → Inconsolata.
 *      Tabela, eixo de gráfico, lista de valores, ranking. Ali o número tem um VIZINHO
 *      VERTICAL, e o alinhamento dos dígitos É a informação: a monoespaçada resolve por
 *      natureza, sem depender do `tabular-nums`.
 *
 *   2. NÚMERO EM FRASE   → acompanha a frase (Space Grotesk).
 *      "111 das 210 que entraram ainda estão no funil." O vizinho é TEXTO. Um número
 *      dentro de uma frase não é dado técnico, é prosa — e trocar de família no meio da
 *      linha cria um solavanco de leitura a cada número.
 *
 *   3. NÚMERO SOZINHO EM CARD → Space Grotesk.
 *      KpiCard e equivalentes. Não há vizinho: não há coluna para alinhar nem frase para
 *      acompanhar. O card fala a língua do TÍTULO — rótulo, número e delta são uma
 *      unidade tipográfica só, e enfiar uma segunda família ali quebraria a unidade em
 *      troca de um alinhamento que ninguém pode ver, porque não há segundo número.
 *      Quem segura os dígitos aqui é o `tabular-nums`, e ele basta: o problema real do
 *      KPI é a largura MUDAR quando o valor muda (a animação de count-up), não a
 *      comparação com um vizinho.
 *
 * ⚠️ O CASO 3 EXISTE PORQUE A RÉGUA DE DOIS CASOS ERRAVA. A versão anterior deste
 * comentário listava "KPI" como coluna — e KPI não é coluna: é um número solto num card.
 * Seguir aquela versão colocaria Inconsolata no número herói de 34px, que é justamente
 * onde a família de TÍTULO tem que estar.
 *
 * ⚠️ A APLICAÇÃO DESSA RÉGUA NÃO É DESTE COMMIT. Aqui as duas fontes só passam a
 * existir; trocar coluna por coluna acontece nos commits de tela, com a paleta já nova.
 *
 * 🛑 SEM A FACE 600 — E O MOTIVO É MEDIDO, NÃO ESQUECIMENTO.
 * Conferido em 18/08/2026: `font-mono` aparece em UM lugar no projeto inteiro (o bloco 5
 * da /tipografia), e nada ali pede 600 — os números herdam 400. Não existe hoje nenhum
 * elemento que combine a família de dado com peso 600, então carregar a face seria peso
 * morto em toda visita.
 *
 * ⚠️ QUEM CRIAR ESSA COMBINAÇÃO PRECISA ADICIONAR A FACE AQUI, e a razão é a armadilha
 * que este mesmo commit acabou de consertar do outro lado: com 400/500/700 carregados, um
 * `font-mono font-semibold` NÃO renderiza 600 — a regra de casamento do CSS procura para
 * cima e ele sai em **700**, sem erro e sem aviso. É o mesmo defeito que deslocou 76
 * lugares da Space Grotesk, esperando a segunda família.
 *
 * Como confirmar antes de mexer:  git grep -n "font-mono" -- app components
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
