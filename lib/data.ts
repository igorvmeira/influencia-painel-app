import { getDb } from "./firebaseAdmin";
import { mockDiario, mockLimites, mockContas } from "./mock";
import { COL_AGREGADAS, cutoffRetencao, janelaDeLeitura } from "./agregadas";
// ⚠️ Este arquivo LÊ o doc que app/api/sync-meta ESCREVE. Os dois diziam "sync" à mão:
// um erro de digitação em qualquer um dos lados não daria erro — criaria um documento
// novo, o outro leria vazio, e o painel passaria a dizer que nunca sincronizou.
import { COL_LIMITES, COL_SISTEMA, DOC_SYNC_META } from "./colecoes";
import { ContaMap, JanelaLeitura, LimiteConta, MetricaDiaria } from "./types";
import { MARCA } from "./brand";
import { diaParcialDe } from "./periodo";

// Cache no servidor: os dados só mudam 1x/dia (após o sync). Segura leituras do
// Firestore. Instância quente reusa. (item 3: a série vem pré-agregada, ~95 docs.)
const TTL_MS = 10 * 60 * 1000;

export interface DadosDiarios {
  /** Série diária JÁ SEM o dia parcial — ver `separarDiaParcial`. */
  daily: MetricaDiaria[];
  contas: ContaMap[];
  fonte: "firestore" | "mock";
  // ISO do último sync (gravado por sync-meta); null quando ainda não houve.
  ultimaSync: string | null;
  // Teto/gasto por conta (para o alerta de limite); vazio quando não há dados.
  limites: LimiteConta[];
  /** Último dia que ENTRA nos números (YYYY-MM-DD) — a âncora de todas as telas. null sem dado. */
  ultimoDiaCompleto: string | null;
  /** O dia que ficou DE FORA por estar incompleto (YYYY-MM-DD), ou null. Diz na estrutura até onde o número vale. */
  diaParcial: string | null;
  /**
   * Primeiro dia que a janela do agregado GARANTE para toda conta que a última sync reescreveu
   * (YYYY-MM-DD) — `cutoffRetencao` aplicado ao instante da sync, a mesma conta que o sync faz
   * ao podar. null sem sync.
   * ⚠️ NÃO é a menor data dos dados: doc que o sync não reescreve guarda dias mais antigos
   * (a ISP4 guardava 31/05 com as outras 82 contas começando em 11/06, medido em 15/09/2026).
   */
  inicioJanela: string | null;
  /**
   * De que dia a que dia o painel LEU cada conta (accountId → janela), tirado do doc agregado
   * (`janelaDeLeitura`, lib/agregadas.ts). É o insumo da régua de mês incompleto
   * (`coberturaMes`). Conta sem doc agregado não aparece — e sai como "sem registro de leitura".
   * ⚠️ Não se deduz do `daily`: dia sem linha é dia sem entrega, e só a janela separa isso de
   * dia que o painel não leu.
   */
  leituraPorConta: Record<string, JanelaLeitura>;
}

// De-para indexado por accountId (chave única). Ignora docs repetidos do mesmo
// accountId na leitura (não apaga nada no Firestore).
function dedupContas(docs: FirebaseFirestore.QueryDocumentSnapshot[]): ContaMap[] {
  const out: ContaMap[] = [];
  const vistos = new Set<string>();
  for (const d of docs) {
    const c = d.data() as ContaMap;
    if (!c.accountId || vistos.has(c.accountId)) continue;
    vistos.add(c.accountId);
    out.push(c);
  }
  return out;
}

const maiorData = (daily: MetricaDiaria[]): string | null => {
  let max = "";
  for (const m of daily) if (m.data > max) max = m.data;
  return max || null;
};

/**
 * 🛑 O DIA DA SINCRONIZAÇÃO É PARCIAL, E SAI DOS NÚMEROS AQUI — NA FONTE, UMA VEZ.
 *
 * O sync-meta grava o dia em que roda, então o último dia com dado está sempre pela
 * metade. Medido em 14/09/2026: o 12/09, gravado às 12:46 UTC do próprio dia, tinha
 * R$ 1.385,74 e 100 conversões; o sync seguinte o regravou com R$ 6.186,67 e 531. Com ele
 * dentro, o modo Mês comparava o dia 12 pela metade com o dia 12 inteiro de agosto e
 * mostrava conversões −2,7% onde houve +3,7% — o sinal invertido. O aviso que existia na
 * tela não mudava número nenhum, e só aparecia quando o último dia era HOJE pelo relógio:
 * com o sync caído, o dia parcial era "ontem" e o aviso sumia.
 *
 * ⚠️ POR QUE AQUI E NÃO NAS TELAS. Dashboard, Início, /gestores, Análise de Conta, IA e
 * criativos ancoram todos no último dia com dado. Tirando o dia da série na fonte, TODOS
 * passam a ancorar no último dia completo sem nenhum aprender a regra — a tela recebe a
 * decisão. Pôr a regra em cada tela seria seis cópias, e a sétima tela nasceria errada.
 *
 * ⚠️ O dado continua inteiro no Firestore; só não entra na conta. E o dia que saiu vai
 * dito na estrutura (`diaParcial`), para a tela escrever até onde o número vale.
 */
function separarDiaParcial(
  daily: MetricaDiaria[],
  ultimaSync: string | null
): { daily: MetricaDiaria[]; ultimoDiaCompleto: string | null; diaParcial: string | null } {
  const diaParcial = diaParcialDe(maiorData(daily), ultimaSync, MARCA.fuso);
  if (!diaParcial) return { daily, ultimoDiaCompleto: maiorData(daily), diaParcial: null };
  const completos = daily.filter((m) => m.data < diaParcial);
  return { daily: completos, ultimoDiaCompleto: maiorData(completos), diaParcial };
}

let cacheDados: { dados: DadosDiarios; expira: number } | null = null;

// Dados completos do painel. IMPORTANTE: em produção (Firebase configurado), erro
// de leitura PROPAGA — nunca cai em dados de exemplo (o cliente veria número falso).
// O mock só existe quando o Firebase NÃO está configurado (ambiente de dev).
export async function getDadosDiarios(): Promise<DadosDiarios> {
  const db = getDb();
  if (!db) {
    const mock = mockDiario();
    const sep = separarDiaParcial(mock.daily, null);
    // Mock não tem doc agregado: toda conta é "lida" do primeiro ao último dia gerado.
    const datas = sep.daily.map((m) => m.data).sort();
    const leituraMock: JanelaLeitura | null = datas.length ? { desde: datas[0], ate: datas[datas.length - 1] } : null;
    const leituraPorConta = Object.fromEntries(
      leituraMock ? mock.contas.map((c) => [c.accountId, leituraMock]) : []
    ) as Record<string, JanelaLeitura>;
    return { ...mock, ...sep, fonte: "mock", ultimaSync: null, limites: mockLimites, inicioJanela: null, leituraPorConta };
  }
  if (cacheDados && Date.now() < cacheDados.expira) return cacheDados.dados;

  // Item 3: lê a série já pré-agregada (1 doc por conta, ~95 docs) em vez de varrer
  // a metricasDiarias (~4.6k docs). metricasDiarias segue como fonte granular (sync).
  const [contasSnap, aggSnap, syncSnap, limitesSnap] = await Promise.all([
    db.collection("contas").get(),
    db.collection(COL_AGREGADAS).get(),
    db.collection(COL_SISTEMA).doc(DOC_SYNC_META).get(),
    db.collection(COL_LIMITES).get(),
  ]);

  const contas = dedupContas(contasSnap.docs);
  // Achata os dias de cada conta no mesmo array plano de antes (valores copiados
  // como estão — null continua null, nunca vira 0).
  const todosOsDias = aggSnap.docs.flatMap((d) => (d.data()?.dias as MetricaDiaria[] | undefined) ?? []);
  const ultimaSync =
    (syncSnap.exists ? (syncSnap.data()?.atualizadoEm as string | undefined) : undefined) ?? null;
  const limites = limitesSnap.docs.map((d) => d.data() as LimiteConta);
  const { daily, ultimoDiaCompleto, diaParcial } = separarDiaParcial(todosOsDias, ultimaSync);

  const instanteSync = ultimaSync ? Date.parse(ultimaSync) : NaN;
  const inicioJanela = Number.isNaN(instanteSync) ? null : cutoffRetencao(instanteSync);

  // O doc agregado tem o id da conta (sync-meta grava `doc(c.accountId)`).
  const leituraPorConta: Record<string, JanelaLeitura> = {};
  for (const d of aggSnap.docs) {
    const j = janelaDeLeitura(d.data() as { lidoDesde?: string | null; atualizadoEm?: string | null }, MARCA.fuso);
    if (j) leituraPorConta[d.id] = j;
  }

  const dados: DadosDiarios = { daily, contas, fonte: "firestore", ultimaSync, limites, ultimoDiaCompleto, diaParcial, inicioJanela, leituraPorConta };
  cacheDados = { dados, expira: Date.now() + TTL_MS };
  return dados;
}

let cacheContas: { contas: ContaMap[]; expira: number } | null = null;

// Leitura ENXUTA só do de-para (para telas que precisam apenas das contas, como
// /orientacoes) — evita reler os ~4.6k docs de metricasDiarias. Erro propaga.
export async function getContas(): Promise<ContaMap[]> {
  const db = getDb();
  if (!db) return mockContas; // dev sem Firebase
  if (cacheContas && Date.now() < cacheContas.expira) return cacheContas.contas;
  const snap = await db.collection("contas").get();
  const contas = dedupContas(snap.docs);
  cacheContas = { contas, expira: Date.now() + TTL_MS };
  return contas;
}

// Zera os caches de contas após uma escrita (ex.: edição de gestor pela /carteira),
// para a próxima leitura já refletir o novo valor. cacheDados também guarda `contas`
// (usado no dashboard), então é zerado junto — o próximo load do painel relê a frio.
// BEST-EFFORT: em serverless a escrita pode cair em outra instância que não a do GET;
// por isso a /carteira também atualiza o cache de sessão do cliente (reflexo imediato)
// e, no pior caso, o TTL de 10 min expira sozinho.
export function invalidarCacheContas(): void {
  cacheContas = null;
  cacheDados = null;
}
