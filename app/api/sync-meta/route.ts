import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { buscarDiario, buscarLimiteConta } from "@/lib/meta";
import { ContaMap, MetricaDiaria } from "@/lib/types";
import { COL_AGREGADAS, cutoffRetencao, mesclarDias } from "@/lib/agregadas";
import { checarCronSecret } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Janela padrão de dias sincronizados (fácil de mudar).
const JANELA_DIAS = 30;
// Quantas contas processar por chamada (cabe no limite de 10s da Vercel free).
const LIMITE_PADRAO = 20;
// Abaixo do limite de 500 operações por batch do Firestore.
const LOTE = 450;

export async function GET(req: Request) {
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  const url = new URL(req.url);
  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  const contasSnap = await db.collection("contas").get();
  // Ordena por accountId para que o offset seja estável entre chamadas.
  const contas: ContaMap[] = contasSnap.docs
    .map((d) => d.data() as ContaMap)
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
  if (!contas.length) {
    return NextResponse.json({ erro: "nenhuma conta no de-para (coleção 'contas')" }, { status: 400 });
  }

  const total = contas.length;
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limiteParam = Number(url.searchParams.get("limite"));
  const limite = Number.isFinite(limiteParam) && limiteParam > 0 ? limiteParam : LIMITE_PADRAO;
  const bloco = contas.slice(offset, offset + limite);

  const col = db.collection("metricasDiarias");
  const colLimites = db.collection("limitesConta");

  // Processa cada conta do bloco e grava logo que termina, para nunca perder
  // o progresso já feito. Em paralelo para caber no tempo limite.
  async function processarConta(c: ContaMap): Promise<number> {
    const registros = await buscarDiario(c.accountId, JANELA_DIAS);
    for (let i = 0; i < registros.length; i += LOTE) {
      const batch = db!.batch();
      for (const m of registros.slice(i, i + LOTE)) {
        batch.set(col.doc(`${m.accountId}_${m.data}`), m, { merge: true });
      }
      await batch.commit();
    }

    // Item 3 — projeção agregada (1 doc/conta). metricasDiarias acima segue como
    // fonte granular; aqui só derivamos a série pro painel ler ~85 docs, não ~4.6k.
    // Merge dos dias frescos sobre os antigos (read-modify-write; blocos do sync
    // tocam contas distintas, então não há concorrência no mesmo doc).
    const aggRef = db!.collection(COL_AGREGADAS).doc(c.accountId);
    const aggSnap = await aggRef.get();
    const antigos = (aggSnap.exists ? (aggSnap.data()?.dias as MetricaDiaria[] | undefined) : undefined) ?? [];
    const dias = mesclarDias(antigos, registros, cutoffRetencao());
    await aggRef.set({ accountId: c.accountId, dias, atualizadoEm: new Date().toISOString() });

    // Teto de gasto (spend_cap) e gasto acumulado (amount_spent) da conta, para o
    // alerta de limite. É secundário: se falhar, não perde o sync diário acima.
    try {
      const lim = await buscarLimiteConta(c.accountId);
      await colLimites.doc(c.accountId).set(
        {
          accountId: c.accountId,
          spendCap: lim.spendCap,
          amountSpent: lim.amountSpent,
          isPrepay: lim.isPrepay,
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch {
      // ignora: o teto é secundário em relação às métricas diárias
    }

    return registros.length;
  }

  const resultados = await Promise.allSettled(bloco.map(processarConta));

  let processadas = 0;
  let registros = 0;
  const erros: { accountId: string; erro: string }[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") { processadas++; registros += r.value; }
    else erros.push({ accountId: bloco[i].accountId, erro: String(r.reason) });
  });

  const fim = offset + limite;
  const proximoOffset = fim < total ? fim : null;

  // Registra o horário desta sincronização para o rodapé do painel.
  // Grava a cada chamada (inclusive nas incrementais), então o valor exibido
  // reflete a atividade de sync mais recente.
  const atualizadoEm = new Date().toISOString();
  await db.collection("sistema").doc("sync").set({ atualizadoEm }, { merge: true });

  return NextResponse.json({
    ok: true,
    janelaDias: JANELA_DIAS,
    offset,
    limite,
    totalContas: total,
    contasNoBloco: bloco.length,
    processadas,
    registros,
    proximoOffset,
    erros,
    atualizadoEm,
  });
}
