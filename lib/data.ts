import { getDb } from "./firebaseAdmin";
import { mockDiario, mockLimites, mockContas } from "./mock";
import { COL_AGREGADAS } from "./agregadas";
// ⚠️ Este arquivo LÊ o doc que app/api/sync-meta ESCREVE. Os dois diziam "sync" à mão:
// um erro de digitação em qualquer um dos lados não daria erro — criaria um documento
// novo, o outro leria vazio, e o painel passaria a dizer que nunca sincronizou.
import { COL_LIMITES, COL_SISTEMA, DOC_SYNC_META } from "./colecoes";
import { ContaMap, LimiteConta, MetricaDiaria } from "./types";

// Cache no servidor: os dados só mudam 1x/dia (após o sync). Segura leituras do
// Firestore. Instância quente reusa. (item 3: a série vem pré-agregada, ~95 docs.)
const TTL_MS = 10 * 60 * 1000;

export interface DadosDiarios {
  daily: MetricaDiaria[];
  contas: ContaMap[];
  fonte: "firestore" | "mock";
  // ISO do último sync (gravado por sync-meta); null quando ainda não houve.
  ultimaSync: string | null;
  // Teto/gasto por conta (para o alerta de limite); vazio quando não há dados.
  limites: LimiteConta[];
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

let cacheDados: { dados: DadosDiarios; expira: number } | null = null;

// Dados completos do painel. IMPORTANTE: em produção (Firebase configurado), erro
// de leitura PROPAGA — nunca cai em dados de exemplo (o cliente veria número falso).
// O mock só existe quando o Firebase NÃO está configurado (ambiente de dev).
export async function getDadosDiarios(): Promise<DadosDiarios> {
  const db = getDb();
  if (!db) {
    return { ...mockDiario(), fonte: "mock", ultimaSync: null, limites: mockLimites };
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
  const daily = aggSnap.docs.flatMap((d) => (d.data()?.dias as MetricaDiaria[] | undefined) ?? []);
  const ultimaSync =
    (syncSnap.exists ? (syncSnap.data()?.atualizadoEm as string | undefined) : undefined) ?? null;
  const limites = limitesSnap.docs.map((d) => d.data() as LimiteConta);

  const dados: DadosDiarios = { daily, contas, fonte: "firestore", ultimaSync, limites };
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
