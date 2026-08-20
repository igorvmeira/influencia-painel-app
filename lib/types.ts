// ⚠️ `import type`, NÃO import de valor. `./semaforo` importa `TEMA` de `./brand`, e
// este arquivo é importado por praticamente toda tela — import de valor arrastaria a
// cadeia inteira. `import type` é apagado na compilação; o vínculo fica só no tipo.
import type { Semaforo } from "./semaforo";

// A união estava reescrita à mão aqui. `SEMAFOROS` já é a fonte
// (`type Semaforo = (typeof SEMAFOROS)[number]`), e a cópia literal significava que
// acrescentar uma cor lá deixaria este campo para trás — sem erro de compilação,
// porque as duas uniões eram independentes.
export type Tipo = "B2B" | "B2C";

// Orientação gerencial de uma conta (feature de escrita). "em" em ISO no cliente.
export interface EntradaOrientacao {
  texto: string;
  autor: string; // e-mail do usuário (extraído do ID token no servidor)
  em: string;    // ISO
  /**
   * Julgamento de desempenho de quem escreveu (ver lib/semaforo.ts).
   * AUSENTE/null = não classificado (cinza) — é o caso de toda orientação
   * escrita antes deste campo. Não há migração: ausente já resolve.
   */
  semaforo?: Semaforo | null;
}
export interface Orientacao {
  accountId: string;
  atual: EntradaOrientacao | null;
  historico?: EntradaOrientacao[]; // só vem no GET por conta (sob demanda)
}

// Participante de uma reunião do Google Agenda.
export interface Participante {
  nome: string;
  email: string | null;
  resposta: string | null; // accepted | declined | tentative | needsAction
}

// Reunião normalizada (Google Calendar → nossos campos). Só leitura.
export interface Reuniao {
  id: string;
  titulo: string;
  inicio: string;   // ISO (dateTime) ou "YYYY-MM-DD" se dia todo
  fim: string;      // idem
  diaTodo: boolean;
  participantes: Participante[];
  linkMeet: string | null;
  linkAgenda: string | null;
  status: string;   // confirmed | tentative
  recorrente: boolean;
}

// Um registro datado da atribuição de gestor de uma conta (histórico append-only).
// "desde: null" = "desde sempre" (registro semente do gestor atual, na 1ª edição).
export interface EntradaGestor {
  gestor: string;
  desde: string | null; // ISO de quando passou a valer; null = desde o início do histórico
  por: string;          // e-mail do autor (extraído do ID token no servidor) ou "sistema" (semente)
  em: string;           // ISO de quando o registro foi gravado
}

export interface ContaMap {
  accountId: string;
  cliente: string;
  gestor: string;
  tipo: Tipo;
  nicho?: string;    // segmento do cliente; ausente => "Sem nicho"
  pausado?: boolean; // true => fora da operação (não entra em rankings/médias/alertas)
  // Edição de gestor pela /carteira (formato datado). Campos ausentes até a 1ª edição.
  gestorHistorico?: EntradaGestor[]; // append-only, mais recente primeiro (teto defensivo)
  gestorEditadoEm?: string;          // carimbo: houve edição pela tela (import passa a pular gestor)
  gestorEditadoPor?: string;         // e-mail de quem fez a última edição
}

/** Métrica de uma conta em um único dia (granularidade do sync diário). */
export interface MetricaDiaria {
  accountId: string;
  data: string; // YYYY-MM-DD
  gasto: number;
  leadsForm: number; // leads de formulário (split B2B)
  convWhats: number; // conversas de WhatsApp (split B2C)
  conversas?: number; // leadsForm + convWhats (redundante, gravado por conveniência)
  // Coletados daqui pra frente; ausência (dias antigos) = campo não presente.
  // null = a API não retornou no dia (nunca 0, que é valor real).
  reach?: number | null;       // alcance do dia
  impressions?: number | null; // impressões do dia
}

/**
 * Uma linha CONJUNTO-DIA — a granularidade nova, trazida por `level=adset`.
 *
 * ⚠️ COLEÇÃO PRÓPRIA (`metricasConjuntos`), nunca dentro de `metricasDiarias`. Duas
 * granularidades na mesma coleção fariam qualquer varredura existente contar cada
 * gasto duas vezes — a conta-dia e os conjuntos que a compõem. Coleção separada é o
 * que garante que nada que já existe muda de comportamento.
 *
 * ⚠️ SEM `reach`/`impressions` de propósito: `reach` é métrica DEDUPLICADA e somar
 * conjuntos empilharia uma segunda camada de dupla contagem sobre a que já existe
 * (ver a ressalva em LinhaCliente). Guardar um número que ninguém pode somar é pior
 * que não guardar.
 */
export interface MetricaConjunto {
  accountId: string;
  data: string;      // YYYY-MM-DD
  adsetId: string;
  adsetNome: string;
  campanhaId: string;
  campanhaNome: string;
  /**
   * `adset.optimization_goal` CRU, como a Meta devolve.
   *
   * ⚠️ É O QUE O CONJUNTO OTIMIZA, NÃO A FAMÍLIA DO RESULTADO — e a distinção é o
   * achado que definiu este campo. Medido em 16/08/2026: o grupo `REPLIES` produziu
   * 940 linhas de WhatsApp **e 1 de formulário**; `QUALITY_LEAD` produziu 25 de
   * formulário **e 1 de WhatsApp** (14,8% do volume dele). E 43 linhas conjunto-dia
   * tiveram AS DUAS famílias no mesmo conjunto no mesmo dia — nenhum rótulo separa
   * essas.
   *
   * Logo: a tela nomeia o grupo pelo que ele É ("conjuntos que otimizam para
   * REPLIES"), nunca "WhatsApp". Traduzir aqui seria carimbar a mentira no banco.
   * `campaign.objective` foi DESCARTADO como agrupador: é ainda mais ambíguo —
   * WhatsApp aparece sob ENGAGEMENT, SALES, LINK_CLICKS e AWARENESS.
   */
  grupo: string;
  objetivoCampanha: string;
  gasto: number;
  leadsForm: number;
  convWhats: number;
}

/** Um grupo de otimização num dia, já somado — o que vai no doc agregado. */
export interface GrupoDia {
  data: string;
  grupo: string;
  gasto: number;
  leadsForm: number;
  convWhats: number;
}

export interface Totais {
  gasto: number;
  conversas: number;
  cpl: number;
  b2b: number;
  b2c: number;
  gastoVar: number;
  conversasVar: number;
  cplVar: number;
}

export interface LinhaGestor {
  nome: string;
  gasto: number;
  conversas: number;
  b2b: number;
  b2c: number;
  cpl: number;
  cplVar: number;
}

export interface PontoCpl {
  semana: string;
  atual: number;
  doisMesesAtras: number;
}

export interface LinhaCliente {
  accountId: string;
  cliente: string;
  tipo: Tipo;
  gasto: number;
  conversas: number;
  cplSemanal: number;
  // ---------------------------------------------------------------------------
  // NÃO EXIBIDOS na tela desde 29/07/2026 — retirados do Dashboard a pedido do
  // Roberto. O cálculo AQUI e em lib/painel.ts (Soma.reach/reachDias e
  // Soma.impressions/imprDias) continua existindo e está CORRETO: soma só os dias
  // que têm o campo, então ausência vira null e nunca 0.
  //
  // Foram mantidos de propósito: o sync segue coletando reach/impressions na mesma
  // chamada da API (custo zero) e o histórico fica preservado. Para reexibir, basta
  // devolver o <th> no cabeçalho e o <td> em LinhaClienteRow, em Dashboard.tsx —
  // nenhum cálculo precisa ser reescrito.
  //
  // Ressalva se o alcance voltar: `reach` é a SOMA do alcance diário, não o alcance
  // único. A mesma pessoa alcançada em dias diferentes conta mais de uma vez, então
  // o número fica acima do "Alcance" da BM (medido: ~69% acima na HELLO NET).
  // `impressions`, ao contrário, é legitimamente somável e bate com a BM.
  // ---------------------------------------------------------------------------
  reach: number | null;
  impressions: number | null;
}

/** Teto de gasto e consumo de uma conta (valores já em reais). */
export interface LimiteConta {
  accountId: string;
  spendCap: number;    // teto de gasto em R$ (0 = sem teto → ignorar no alerta)
  amountSpent: number; // gasto acumulado em R$
  isPrepay: boolean;   // conta pré-paga
  atualizadoEm?: string;
}

export interface Detalhe {
  gestor: string;
  contasCount: number;
  cplSemanal: PontoCpl[];
  clientes: LinhaCliente[];
}

export interface Painel {
  periodoLabel: string;
  atualizadoEm: string;
  totais: Totais;
  gestores: LinhaGestor[];
  detalhes: Detalhe[];
}

export interface ClienteNicho {
  accountId: string; // chave única (nomes de cliente se repetem entre contas)
  cliente: string;
  gasto: number;
  conversas: number;
  cpl: number;
  desvioPct: number; // vs CPL médio do nicho; positivo = acima (pior)
}

export interface LinhaNicho {
  nicho: string;
  clientesCount: number;
  gasto: number;
  conversas: number;
  cpl: number;
  clientes: ClienteNicho[];
}

export interface Criativo {
  adId: string;
  adName: string;
  gasto: number;
  conversas: number; // lead de formulário + conversa de WhatsApp
  cpl: number;
  thumbnailUrl: string | null;
  cliente?: string; // preenchido no ranking por nicho (de qual cliente é o criativo)
  /**
   * Situação do anúncio na Meta, vinda de `effective_status` (não de `status`):
   * o efetivo considera o pai, então anúncio ligado dentro de campanha pausada
   * aparece como pausado — que é o que "está rodando?" realmente pergunta.
   *
   * `null` = NÃO SABEMOS, e nunca "pausado". A chamada de /ads é best-effort e
   * traz no máximo 100 anúncios; tratar ausência como pausa esconderia criativo
   * ativo de conta grande. Ausente ≠ zero, a regra de sempre.
   */
  situacao?: "ativo" | "pausado" | null;
  /** O valor cru da Meta (ACTIVE, PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED...). */
  statusMeta?: string | null;
}
