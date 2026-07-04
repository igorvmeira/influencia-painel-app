import { getDb } from "./firebaseAdmin";
import { mockDiario } from "./mock";
import { ContaMap, MetricaDiaria } from "./types";

const DIA_MS = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export interface DadosDiarios {
  daily: MetricaDiaria[];
  contas: ContaMap[];
  fonte: "firestore" | "mock";
  // ISO do último sync (gravado por sync-meta); null quando ainda não houve.
  ultimaSync: string | null;
}

// Lê o de-para de contas e as métricas diárias dos últimos ~90 dias do Firestore.
// Cai no mock se o Firebase não estiver configurado ou ainda não houver dados.
export async function getDadosDiarios(): Promise<DadosDiarios> {
  const db = getDb();
  if (db) {
    try {
      const cutoff = ymd(new Date(Date.now() - 95 * DIA_MS));
      const [contasSnap, diariasSnap, syncSnap] = await Promise.all([
        db.collection("contas").get(),
        db.collection("metricasDiarias").where("data", ">=", cutoff).get(),
        db.collection("sistema").doc("sync").get(),
      ]);
      const contas = contasSnap.docs.map((d) => d.data() as ContaMap);
      const daily = diariasSnap.docs.map((d) => d.data() as MetricaDiaria);
      const ultimaSync =
        (syncSnap.exists ? (syncSnap.data()?.atualizadoEm as string | undefined) : undefined) ?? null;
      if (contas.length && daily.length) {
        return { daily, contas, fonte: "firestore", ultimaSync };
      }
    } catch {
      // cai no mock abaixo
    }
  }
  return { ...mockDiario(), fonte: "mock", ultimaSync: null };
}
