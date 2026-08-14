import { TEMA } from "./brand";

/**
 * SEMÁFORO DE DESEMPENHO — o julgamento do Roberto sobre o cliente.
 *
 * ⚠️ NÃO É O ALERTA DE CPL, E NÃO PODE SER CONFUNDIDO COM ELE. São duas
 * informações diferentes, sobre a mesma conta, que podem discordar:
 *
 *   ALERTA (lib/alertas.ts)  = CÁLCULO. CPL acima de CPL_ALERTA, medido da série.
 *                              Muda sozinho a cada sync, sem ninguém tocar.
 *   SEMÁFORO (este módulo)   = JULGAMENTO. O Roberto olhou a conta e classificou.
 *                              Só muda quando alguém escreve uma orientação nova.
 *
 * Conta com CPL ótimo pode ser vermelha (cliente reclamando, verba caindo,
 * criativo saturado) e conta com CPL estourado pode ser verde (mês atípico já
 * explicado). Por isso a tela precisa mostrar as duas SEPARADAS e rotuladas —
 * empilhar as duas cores no mesmo lugar faria o gestor achar que uma contradiz
 * a outra, quando na verdade respondem perguntas diferentes.
 *
 * ⚠️ AUSENTE É "NÃO CLASSIFICADO", NUNCA UMA COR. As orientações escritas antes
 * deste campo não têm semáforo, e inventar uma cor para elas seria atribuir ao
 * Roberto um julgamento que ele não fez. Cinza é o estado honesto — e é também
 * o que revela quantas contas ainda faltam classificar.
 * Consequência prática: NÃO HÁ MIGRAÇÃO. Campo ausente já cai em cinza.
 */
export const SEMAFOROS = ["verde", "amarelo", "vermelho"] as const;
export type Semaforo = (typeof SEMAFOROS)[number];

/** `null`/ausente/valor estranho → null (cinza). Nunca lança, nunca chuta cor. */
export function ehSemaforoValido(v: unknown): v is Semaforo {
  return typeof v === "string" && (SEMAFOROS as readonly string[]).includes(v);
}
export const normalizarSemaforo = (v: unknown): Semaforo | null =>
  (ehSemaforoValido(v) ? v : null);

export interface EstiloSemaforo {
  /** Rótulo curto, para selo. */
  rotulo: string;
  /** Frase completa — vai no `title`, para a cor nunca ser a única informação. */
  descricao: string;
  cor: string;
  fundo: string;
}

/**
 * ⚠️ CORES SÓ DOS TOKENS (lib/brand.ts), nunca hex solto — e a semântica é a
 * mesma do resto do painel: `positivo` é bom, `negativo` é ruim. Nada de verde
 * decorativo aqui; a cor afirma desempenho.
 *
 * ⚠️ TODO ESTADO TEM RÓTULO EM TEXTO. Cor sozinha não é acessível (daltonismo) e
 * não sobrevive a print em preto e branco — os dois casos acontecem em reunião.
 */
export const ESTILO_SEMAFORO: Record<Semaforo | "neutro", EstiloSemaforo> = {
  verde: {
    rotulo: "Bom",
    descricao: "Desempenho bom — classificado por quem escreveu a orientação.",
    cor: TEMA.positivo,
    fundo: TEMA.positivoFundo,
  },
  amarelo: {
    rotulo: "Mediano",
    descricao: "Desempenho mediano — classificado por quem escreveu a orientação.",
    cor: TEMA.atencao,
    fundo: TEMA.limiteFundo,
  },
  vermelho: {
    rotulo: "Ruim",
    descricao: "Desempenho ruim — classificado por quem escreveu a orientação.",
    cor: TEMA.negativo,
    fundo: TEMA.negativoFundo,
  },
  neutro: {
    rotulo: "Sem classificação",
    descricao:
      "Ainda não classificado. Orientações escritas antes do semáforo não têm cor — "
      + "cinza significa 'ninguém julgou', não 'desempenho neutro'.",
    cor: TEMA.muted,
    fundo: TEMA.neutroFundo,
  },
};

export const estiloDe = (s: Semaforo | null | undefined): EstiloSemaforo =>
  ESTILO_SEMAFORO[s ?? "neutro"];
