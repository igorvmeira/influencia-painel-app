/**
 * TAXONOMIA DE "SITUAÇÃO ATUAL" DA PLANILHA DE MONITORAMENTO — sem I/O.
 *
 * ⚠️⚠️ O PREFIXO NUMÉRICO NÃO É ESTÁVEL, E ISSO FOI MEDIDO, NÃO SUPOSTO. Em
 * 10/09/2026, lendo as LISTAS DE VALIDAÇÃO da própria planilha (o menu que o gerente
 * escolhe, não o texto que ele já escolheu):
 *
 *   abas de gestor      →  `1 - A INICIAR`            e  `0 - PAUSADO`
 *   aba CLIENTES PAUSADOS →  `1 - CLIENTE INSATISFEITO` e  `4 - PAUSADO`
 *
 * **O número `1` significa duas coisas diferentes na mesma planilha, e `PAUSADO` tem
 * dois números.** Chavear pelo prefixo produziria um agrupamento errado no dia em que
 * alguém escolhesse `1 - CLIENTE INSATISFEITO` — e ninguém veria, porque o número
 * continuaria "batendo".
 *
 * 🔑 E REPARE DE ONDE VEIO A PROVA: os dois rótulos conflitantes **não estão em uso
 * hoje**. Eles estão no MENU, esperando alguém clicar. Uma varredura dos valores
 * escritos teria dito que o prefixo é estável — a instabilidade só aparece lendo o que
 * a planilha PERMITE, não o que ela contém. É a mesma família de *"que respostas
 * diferentes eu consigo provocar?"*: o estado de hoje não descreve o espaço de estados.
 *
 * ⚠️ POR ISSO O CRU É GRAVADO JUNTO, SEMPRE. O conceito serve para agrupar; o texto
 * exato é o que o gerente vê na tela dele e o que resolve discussão. Guardar só o
 * normalizado apagaria a diferença entre `5 - ESCALANDO` e `5 - ESCALANDO ORÇAMENTO`
 * no dia em que ela importar.
 */

/**
 * Os conceitos. São 9 — não 8.
 *
 * ⚠️ A ÚNICA FUSÃO QUE EU FIZ foi `ESCALANDO` + `ESCALANDO ORÇAMENTO` no mesmo
 * conceito, e é JULGAMENTO, não consequência do dado: as duas variantes vivem em
 * listas de validação diferentes e nunca aparecem na mesma. Se um dia alguém precisar
 * separá-las, o texto cru está gravado e a separação é possível sem reprocessar nada.
 * Nenhuma outra fusão foi feita: `PAUSADO` e `CANCELADO` continuam distintos, porque
 * pedem conversas comerciais diferentes.
 */
export type ConceitoSituacao =
  | "aIniciar"
  | "resultadoRuim"
  | "resultadoBom"
  | "escalando"
  | "pausado"
  | "precisaAtencao"
  | "campanhasNoAr"
  | "clienteInsatisfeito"
  | "cancelado";

/**
 * Vocabulário FECHADO, com a chave já sem prefixo e em caixa alta.
 *
 * ⚠️ Ele saiu das listas de validação da planilha em 10/09/2026, não de um levantamento
 * dos valores escritos. Rótulo que não estiver aqui **não vira "outro"**: vira pendência
 * com o texto exato, para o vocabulário crescer por decisão de alguém e não por
 * acidente de digitação. "Outro" é o balde onde um typo mora para sempre.
 */
const VOCABULARIO: Record<string, ConceitoSituacao> = {
  "A INICIAR": "aIniciar",
  "RESULTADO RUIM": "resultadoRuim",
  "RESULTADO BOM": "resultadoBom",
  "ESCALANDO": "escalando",
  "ESCALANDO ORÇAMENTO": "escalando",
  "PAUSADO": "pausado",
  "PRECISA DE ATENÇÃO": "precisaAtencao",
  "CAMPANHAS NO AR": "campanhasNoAr",
  "CLIENTE INSATISFEITO": "clienteInsatisfeito",
  "CANCELADO": "cancelado",
};

/** Rótulo de tela para cada conceito. A tela recebe a decisão, não a recalcula. */
export const ROTULO_SITUACAO: Record<ConceitoSituacao, string> = {
  aIniciar: "A iniciar",
  resultadoRuim: "Resultado ruim",
  resultadoBom: "Resultado bom",
  escalando: "Escalando",
  pausado: "Pausado (planilha)",
  precisaAtencao: "Precisa de atenção",
  campanhasNoAr: "Campanhas no ar",
  clienteInsatisfeito: "Cliente insatisfeito",
  cancelado: "Cancelado",
};

/** Todos os rótulos que o detector de coluna aceita, em caixa alta, COM e SEM prefixo. */
export const ROTULOS_ACEITOS: ReadonlySet<string> = new Set(
  Object.keys(VOCABULARIO).flatMap((k) => [k, ...["0", "1", "2", "3", "4", "5", "6", "7"].map((n) => `${n} - ${k}`)])
);

/**
 * Tira o prefixo numérico, normaliza espaço e caixa. NÃO decide nada — só limpa.
 *
 * ⚠️ O prefixo é DESCARTADO, nunca lido. Ver o cabeçalho deste arquivo.
 */
export function chaveSituacao(cru: string): string {
  return String(cru || "")
    .replace(/^\s*\d+\s*[-–—]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export interface Situacao {
  /** Exatamente o que está na célula. É isto que o gerente vê. */
  cru: string;
  /** `null` quando o rótulo é desconhecido — e aí a linha gera pendência. */
  conceito: ConceitoSituacao | null;
}

/**
 * ⚠️ CÉLULA VAZIA DEVOLVE `{ cru: "", conceito: null }`, e quem chama precisa separar
 * isso de "rótulo desconhecido". São coisas diferentes: vazio é o gerente não ter
 * preenchido; desconhecido é ele ter escrito algo que a gente não entende. A primeira
 * é lacuna dele, a segunda é lacuna nossa — e as ações são opostas.
 */
export function interpretarSituacao(cru: string): Situacao {
  const texto = String(cru || "").trim();
  if (!texto) return { cru: "", conceito: null };
  return { cru: texto, conceito: VOCABULARIO[chaveSituacao(texto)] ?? null };
}

/** Rótulo desconhecido = tem texto e não tem conceito. */
export function ehSituacaoDesconhecida(s: Situacao): boolean {
  return s.cru !== "" && s.conceito === null;
}
