import { getDb } from "./firebaseAdmin";
import { mockDiario, mockLimites } from "./mock";
import { ContaMap, LimiteConta, MetricaDiaria } from "./types";

const DIA_MS = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export interface DadosDiarios {
  daily: MetricaDiaria[];
  contas: ContaMap[];
  fonte: "firestore" | "mock";
  // ISO do último sync (gravado por sync-meta); null quando ainda não houve.
  ultimaSync: string | null;
  // Teto/gasto por conta (para o alerta de limite); vazio quando não há dados.
  limites: LimiteConta[];
}

// Lê o de-para de contas e as métricas diárias dos últimos ~90 dias do Firestore.
// Cai no mock se o Firebase não estiver configurado ou ainda não houver dados.
export async function getDadosDiarios(): Promise<DadosDiarios> {
  const db = getDb();
  if (db) {
    try {
      const cutoff = ymd(new Date(Date.now() - 95 * DIA_MS));
      const [contasSnap, diariasSnap, syncSnap, limitesSnap] = await Promise.all([
        db.collection("contas").get(),
        db.collection("metricasDiarias").where("data", ">=", cutoff).get(),
        db.collection("sistema").doc("sync").get(),
        db.collection("limitesConta").get(),
      ]);
      // Proteção: o de-para é indexado por accountId (chave única). Se a coleção
      // tiver docs repetidos para o mesmo accountId, a conta entraria mais de uma
      // vez (inflando rankings/gestores). Mantém a 1ª ocorrência de cada accountId.
      // Não apaga nada no Firestore — só ignora o excedente na leitura.
      const contas: ContaMap[] = [];
      const vistosAccountId = new Set<string>();
      for (const d of contasSnap.docs) {
        const c = d.data() as ContaMap;
        if (!c.accountId || vistosAccountId.has(c.accountId)) continue;
        vistosAccountId.add(c.accountId);
        contas.push(c);
      }
      const daily = diariasSnap.docs.map((d) => d.data() as MetricaDiaria);
      const ultimaSync =
        (syncSnap.exists ? (syncSnap.data()?.atualizadoEm as string | undefined) : undefined) ?? null;
      const limites = limitesSnap.docs.map((d) => d.data() as LimiteConta);
      if (contas.length && daily.length) {
        return { daily, contas, fonte: "firestore", ultimaSync, limites };
      }
    } catch {
      // cai no mock abaixo
    }
  }
  return { ...mockDiario(), fonte: "mock", ultimaSync: null, limites: mockLimites };
}
