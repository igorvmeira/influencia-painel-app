export type Tipo = "B2B" | "B2C";

// Orientação gerencial de uma conta (feature de escrita). "em" em ISO no cliente.
export interface EntradaOrientacao {
  texto: string;
  autor: string; // e-mail do usuário (extraído do ID token no servidor)
  em: string;    // ISO
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

export interface ContaMap {
  accountId: string;
  cliente: string;
  gestor: string;
  tipo: Tipo;
  nicho?: string;    // segmento do cliente; ausente => "Sem nicho"
  pausado?: boolean; // true => fora da operação (não entra em rankings/médias/alertas)
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
  reach: number | null;       // soma do alcance diário no período; null = sem dado
  impressions: number | null; // soma das impressões no período; null = sem dado
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
}
