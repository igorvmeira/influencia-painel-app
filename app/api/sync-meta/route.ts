import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { buscarDiario } from "@/lib/meta";
import { ContaMap, MetricaDiaria } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const LOTE = 450; // abaixo do limite de 500 operações por batch do Firestore

export async function GET(req: Request) {
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

  const contasSnap = await db.collection("contas").get();
  const contas: ContaMap[] = contasSnap.docs.map((d) => d.data() as ContaMap);
  if (!contas.length) {
    return NextResponse.json({ erro: "nenhuma conta no de-para (coleção 'contas')" }, { status: 400 });
  }

  // Busca os últimos 90 dias quebrados por dia, para cada conta.
  const registros: MetricaDiaria[] = [];
  const erros: { accountId: string; erro: string }[] = [];
  for (const c of contas) {
    try {
      registros.push(...(await buscarDiario(c.accountId)));
    } catch (e) {
      console.error(e);
      erros.push({ accountId: c.accountId, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  // Grava 1 documento por conta+dia em "metricasDiarias", com merge (idempotente):
  // rodar de novo no mesmo dia atualiza o registro existente em vez de duplicar.
  const col = db.collection("metricasDiarias");
  let gravados = 0;
  for (let i = 0; i < registros.length; i += LOTE) {
    const batch = db.batch();
    for (const m of registros.slice(i, i + LOTE)) {
      const id = `${m.accountId}_${m.data}`;
      batch.set(col.doc(id), m, { merge: true });
    }
    await batch.commit();
    gravados += Math.min(LOTE, registros.length - i);
  }

  return NextResponse.json({
    ok: true,
    contas: contas.length,
    registros: gravados,
    erros,
    atualizadoEm: new Date().toISOString(),
  });
}
