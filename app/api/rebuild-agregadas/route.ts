import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { ContaMap, MetricaDiaria } from "@/lib/types";
import { COL_AGREGADAS, cutoffRetencao, RETENCAO_DIAS } from "@/lib/agregadas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// TODO REMOVER — backfill de uso ÚNICO (item 3): reconstrói metricasAgregadas a partir
// da metricasDiarias (fonte granular, intacta). NÃO apaga nada. Roda paginado (offset/
// limite) pra caber no tempo da função. Idempotente: reexecutar um bloco só reescreve
// o(s) mesmo(s) doc(s) agregado(s). Depois que o item 3 estabilizar, remover esta rota.

// Quantas contas por chamada (cabe no tempo de execução com folga).
const LIMITE_PADRAO = 20;

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
  // Mesma ordenação estável do sync (por accountId), pra offset ser consistente entre chamadas.
  const contas: ContaMap[] = contasSnap.docs
    .map((d) => d.data() as ContaMap)
    .filter((c) => !!c.accountId)
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
  if (!contas.length) {
    return NextResponse.json({ erro: "nenhuma conta no de-para (coleção 'contas')" }, { status: 400 });
  }

  const total = contas.length;
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limiteParam = Number(url.searchParams.get("limite"));
  const limite = Number.isFinite(limiteParam) && limiteParam > 0 ? limiteParam : LIMITE_PADRAO;
  const bloco = contas.slice(offset, offset + limite);

  const colDiarias = db.collection("metricasDiarias");
  const cutoff = cutoffRetencao();

  // Por conta: lê a diária granular (só igualdade em accountId → sem índice composto),
  // filtra pela retenção em memória, ordena e grava o doc agregado.
  async function reconstruir(c: ContaMap): Promise<{ accountId: string; dias: number }> {
    const snap = await colDiarias.where("accountId", "==", c.accountId).get();
    const dias = snap.docs
      .map((d) => d.data() as MetricaDiaria)
      .filter((m) => m?.data && m.data >= cutoff)
      .sort((a, b) => a.data.localeCompare(b.data));
    await db!.collection(COL_AGREGADAS).doc(c.accountId).set({
      accountId: c.accountId,
      dias,
      atualizadoEm: new Date().toISOString(),
    });
    return { accountId: c.accountId, dias: dias.length };
  }

  const resultados = await Promise.allSettled(bloco.map(reconstruir));

  const contasAgregadas: { accountId: string; dias: number }[] = [];
  const erros: { accountId: string; erro: string }[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") contasAgregadas.push(r.value);
    else erros.push({ accountId: bloco[i].accountId, erro: String(r.reason) });
  });

  const fim = offset + limite;
  const proximoOffset = fim < total ? fim : null;
  const concluido = proximoOffset === null;

  // Só na ÚLTIMA página: releitura de conferência do que existe na coleção agregada,
  // pra você saber sem ambiguidade que terminou (nº de docs + faixa de dias por conta).
  let conferencia: { docsAgregados: number; diasMin: number; diasMax: number } | null = null;
  if (concluido) {
    const aggSnap = await db.collection(COL_AGREGADAS).get();
    const contagens = aggSnap.docs.map((d) => ((d.data()?.dias as unknown[] | undefined)?.length ?? 0));
    conferencia = {
      docsAgregados: aggSnap.size,
      diasMin: contagens.length ? Math.min(...contagens) : 0,
      diasMax: contagens.length ? Math.max(...contagens) : 0,
    };
  }

  const mensagem = concluido
    ? `BACKFILL COMPLETO: ${total} contas processadas. Coleção '${COL_AGREGADAS}' tem ` +
      `${conferencia!.docsAgregados} docs (dias por conta: ${conferencia!.diasMin}–${conferencia!.diasMax}). ` +
      `Pode seguir pro Commit B.`
    : `Bloco ${offset}–${fim} de ${total} concluído. Chame de novo com offset=${proximoOffset}.`;

  return NextResponse.json({
    ok: true,
    concluido,
    mensagem,
    retencaoDias: RETENCAO_DIAS,
    cutoff,
    totalContas: total,
    offset,
    limite,
    contasNoBloco: bloco.length,
    processadas: contasAgregadas.length,
    contasAgregadas,
    proximoOffset,
    conferencia,
    erros,
  });
}
