/**
 * CPL — A REGRA NUM LUGAR SÓ, para o servidor e para a tela.
 *
 * ⚠️ MÓDULO NEUTRO: o único import é `./format`, que também não importa nada. É lido por
 * lib/painel.ts e lib/kpis.ts (que rodam nos dois lados) e por componentes — um import de
 * valor com dependência pesada aqui arrastaria a cadeia para o bundle do cliente.
 *
 * 🛑 CPL INDEFINIDO É `null`, NUNCA 0. Zero é o MENOR CPL possível: numa lista ordenada do
 * menor para o maior, a conta que gastou e não converteu subia ao topo como "a mais
 * barata". Medido em 14/09/2026, janela de 15 dias: 2 contas que gastaram sem converter e
 * mais 10 sem veiculação nenhuma apareciam com CPL R$ 0,00 na tabela do Dashboard. É a
 * mesma família da ARP TELECOM no ranking de nichos (5 conversões, gasto zero, 1º lugar).
 *
 * TRÊS CASOS SEM CPL, e a tela diz qual é — as ações são diferentes:
 *   · sem conversão, com gasto ... o dinheiro saiu e nada voltou (o pior dos três);
 *   · sem gasto nem conversão .... a conta não veiculou no período;
 *   · conversões sem gasto ....... custo zero não é CPL (decisão do Igor, 14/09/2026).
 */
import { brlDec } from "./format";

export function cplDe(gasto: number, conversas: number): number | null {
  return conversas > 0 && gasto > 0 ? gasto / conversas : null;
}

export type MotivoSemCpl = "semConversao" | "semVeiculacao" | "semGasto";

export function motivoSemCpl(gasto: number, conversas: number): MotivoSemCpl | null {
  if (conversas > 0 && gasto > 0) return null;
  if (conversas <= 0 && gasto <= 0) return "semVeiculacao";
  return conversas <= 0 ? "semConversao" : "semGasto";
}

const ROTULO: Record<MotivoSemCpl, string> = {
  semConversao: "sem conversão",
  semVeiculacao: "sem veiculação",
  semGasto: "conversões sem gasto",
};

/** Rótulo CURTO, para ir escrito ao lado do "—" numa célula. */
export function rotuloSemCpl(gasto: number, conversas: number): string | null {
  const m = motivoSemCpl(gasto, conversas);
  return m ? ROTULO[m] : null;
}

/** A frase inteira, para tooltip e para o contexto da IA. */
export function explicaSemCpl(gasto: number, conversas: number): string | null {
  switch (motivoSemCpl(gasto, conversas)) {
    case "semConversao":
      return `gastou ${brlDec(gasto)} e não teve conversão — sem conversão o CPL é indefinido, não é zero`;
    case "semVeiculacao":
      return "sem gasto e sem conversão no período — a conta não veiculou";
    case "semGasto":
      return `${conversas} ${conversas === 1 ? "conversão" : "conversões"} sem gasto no período — custo zero não é CPL`;
    default:
      return null;
  }
}

/**
 * Variação percentual ARREDONDADA. `null` quando qualquer lado não existe ou quando não há
 * base (anterior ≤ 0).
 *
 * ⚠️ AS DUAS AUSÊNCIAS MENTIAM, cada uma para um lado. Sem CPL no período ATUAL, o 0 contra
 * qualquer anterior dava −100% — o piso da escala, em verde: "melhorou tudo". Sem CPL no
 * ANTERIOR a conta daria infinito, e o código antigo trocava por 0% — "estável".
 * Medido em 14/09/2026, antes do conserto: 52 variações de −100% (38 no desvio contra a média
 * do nicho, 14 no card de CPL da Análise da Conta — ex.: CDL, R$ 904,76 em 30 dias sem
 * conversão) e 45 de 0% sem base. No ranking de evolução dos gestores, nenhuma: ele já exigia
 * conversão.
 */
export function variacaoPct(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || !(anterior > 0)) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/**
 * A ORDEM DE CPL, a mesma em toda tela: INDEFINIDO SEMPRE NO FIM, nas duas direções, e
 * entre eles o de MAIOR GASTO primeiro — o dinheiro que saiu sem voltar é o que precisa
 * ser visto primeiro dentro do grupo.
 *
 * ⚠️ "No fim nas duas direções" é de propósito: se o indefinido virasse o maior valor, ele
 * lideraria a ordem decrescente e a lista "pior CPL" abriria com contas que nem têm CPL.
 */
export function compararCpl(
  a: { cpl: number | null; gasto: number },
  b: { cpl: number | null; gasto: number },
  direcao: "asc" | "desc" = "asc"
): number {
  if (a.cpl === null && b.cpl === null) return b.gasto - a.gasto;
  if (a.cpl === null) return 1;
  if (b.cpl === null) return -1;
  return direcao === "asc" ? a.cpl - b.cpl : b.cpl - a.cpl;
}

/** A ordem de VARIAÇÃO: sem variação (`null`) sempre no fim; a menor primeiro. */
export function compararVariacao(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}
