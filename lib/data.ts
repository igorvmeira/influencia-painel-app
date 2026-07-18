import { getDb } from "./firebaseAdmin";
import { mockDiario, mockLimites, mockContas } from "./mock";
import { ContaMap, LimiteConta, MetricaDiaria } from "./types";

const DIA_MS = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
// Cache no servidor: os dados só mudam 1x/dia (após o sync). Segura leituras do
// Firestore (evita reler ~4.6k docs a cada carregamento). Instância quente reusa.
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

  const cutoff = ymd(new Date(Date.now() - 95 * DIA_MS));
  const [contasSnap, diariasSnap, syncSnap, limitesSnap] = await Promise.all([
    db.collection("contas").get(),
    db.collection("metricasDiarias").where("data", ">=", cutoff).get(),
    db.collection("sistema").doc("sync").get(),
    db.collection("limitesConta").get(),
  ]);

  const contas = dedupContas(contasSnap.docs);
  const daily = diariasSnap.docs.map((d) => d.data() as MetricaDiaria);
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
