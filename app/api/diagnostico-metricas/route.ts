// TODO REMOVER — rota TEMPORÁRIA de diagnóstico (somente leitura).
// Responde: (1) quais campos existem hoje em metricasDiarias (inclui reach/
// impressions?) e (2) a faixa de datas do histórico (min, max, dias). Não
// escreve, não apaga, não altera nada. Remover após o planejamento.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DIA_MS = 86400000;

// Detecta Firestore Timestamp (tem toDate()).
function ehTimestamp(v: unknown): v is { toDate: () => Date } {
  return !!v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function";
}

function tipoDe(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (ehTimestamp(v)) return "timestamp";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string") return "string";
  if (typeof v === "object") return "object";
  return typeof v;
}

export async function GET(req: Request) {
  // Mesma proteção do sync (reusa CRON_SECRET; não cria env nova).
  const url = new URL(req.url);
  const chaveUrl = url.searchParams.get("key");
  const auth = req.headers.get("authorization");
  const segredo = process.env.CRON_SECRET;
  const autorizado = !segredo || auth === `Bearer ${segredo}` || chaveUrl === segredo;
  if (!autorizado) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  const col = db.collection("metricasDiarias");

  // 1) Amostra de 5 docs → união das chaves com o tipo de cada valor.
  const amostraSnap = await col.limit(5).get();
  const tiposPorCampo: Record<string, string> = {};
  const camposPorDoc: string[][] = [];
  for (const d of amostraSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    camposPorDoc.push(Object.keys(data).sort());
    for (const [k, v] of Object.entries(data)) {
      if (!(k in tiposPorCampo)) tiposPorCampo[k] = tipoDe(v);
    }
  }
  const chaves = Object.keys(tiposPorCampo).sort();
  const temReach = chaves.includes("reach");
  const temImpressions = chaves.includes("impressions");

  // 2) Faixa de datas (campo "data" = "YYYY-MM-DD", ordenação lexicográfica = cronológica).
  let dataMin: string | null = null;
  let dataMax: string | null = null;
  try {
    const [asc, desc] = await Promise.all([
      col.orderBy("data", "asc").limit(1).get(),
      col.orderBy("data", "desc").limit(1).get(),
    ]);
    dataMin = (asc.docs[0]?.get("data") as string) ?? null;
    dataMax = (desc.docs[0]?.get("data") as string) ?? null;
  } catch {
    // se o campo "data" não existir/indexar, deixa null
  }
  const diasDeHistorico =
    dataMin && dataMax
      ? Math.round((Date.parse(dataMax + "T00:00:00Z") - Date.parse(dataMin + "T00:00:00Z")) / DIA_MS) + 1
      : null;

  // Contagem total de documentos (agregação — não carrega os docs).
  let totalDocs: number | null = null;
  try {
    const agg = await col.count().get();
    totalDocs = agg.data().count;
  } catch {
    totalDocs = null;
  }

  return NextResponse.json({
    ok: true,
    apenasLeitura: true,
    colecao: "metricasDiarias",
    campos: {
      lista: chaves.map((c) => ({ campo: c, tipo: tiposPorCampo[c] })),
      reach: temReach,
      impressions: temImpressions,
      aviso:
        !temReach && !temImpressions
          ? "campos reach/impressions NÃO encontrados nos documentos de exemplo"
          : null,
      camposPorDocDeExemplo: camposPorDoc,
      docsAmostrados: amostraSnap.size,
    },
    historico: {
      dataMaisAntiga: dataMin,
      dataMaisRecente: dataMax,
      diasDeHistorico,
      totalDocs,
    },
    consultadoEm: new Date().toISOString(),
  });
}
