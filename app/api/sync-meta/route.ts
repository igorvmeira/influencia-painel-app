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
// Pode ser sobrescrita por ?dias=N na chamada — útil para conta NOVA, que não tem
// histórico anterior para o mesclarDias acumular: sem isso ela nasceria com apenas
// JANELA_DIAS de série, aparecendo TRUNCADA (e sem aviso) em períodos maiores.
const JANELA_DIAS = 30;
// Teto de segurança da janela: acima da retenção do agregado não há ganho.
const JANELA_MAX = 130;
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

  // Janela de dias desta chamada (?dias=N). Ausente => JANELA_DIAS (cron intacto).
  const diasParam = Number(url.searchParams.get("dias"));
  const janelaDias = Number.isFinite(diasParam) && diasParam > 0
    ? Math.min(Math.floor(diasParam), JANELA_MAX)
    : JANELA_DIAS;

  // Alvo por IDENTIDADE (?accountId=act_1,act_2), não por posição. Offset é frágil:
  // a ordenação muda quando contas entram/saem, e a chamada acertaria OUTRA conta
  // reportando sucesso — deixando a pretendida truncada sem ninguém perceber.
  const alvoParam = (url.searchParams.get("accountId") || "").trim();
  let bloco: ContaMap[];
  if (alvoParam) {
    const pedidos = alvoParam.split(",").map((s) => s.trim()).filter(Boolean);
    const porId = new Map(contas.map((c) => [c.accountId, c]));
    const achados = pedidos.filter((id) => porId.has(id));
    const naoAchados = pedidos.filter((id) => !porId.has(id));
    // FALHA EXPLÍCITA: id inexistente não pode passar como "sucesso".
    if (naoAchados.length) {
      return NextResponse.json(
        { ok: false, erro: "accountId não encontrado no de-para", naoEncontrados: naoAchados },
        { status: 400 }
      );
    }
    bloco = achados.map((id) => porId.get(id)!);
  } else {
    bloco = contas.slice(offset, offset + limite);
  }

  const col = db.collection("metricasDiarias");
  const colLimites = db.collection("limitesConta");

  // Processa cada conta do bloco e grava logo que termina, para nunca perder
  // o progresso já feito. Em paralelo para caber no tempo limite.
  async function processarConta(c: ContaMap): Promise<{ accountId: string; cliente: string; registros: number; diasNoAgregado: number; maisAntigo: string | null }> {
    const registros = await buscarDiario(c.accountId, janelaDias);
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

    // Devolve a IDENTIDADE do que foi sincronizado (nome + accountId) e o estado
    // resultante do agregado — para conferir que a chamada acertou a conta certa.
    return {
      accountId: c.accountId,
      cliente: c.cliente ?? "",
      registros: registros.length,
      diasNoAgregado: dias.length,
      maisAntigo: dias.length ? dias[0].data : null, // mesclarDias devolve ordenado asc
    };
  }

  const resultados = await Promise.allSettled(bloco.map(processarConta));

  let processadas = 0;
  let registros = 0;
  const sincronizadas: Awaited<ReturnType<typeof processarConta>>[] = [];
  const erros: { accountId: string; erro: string }[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") { processadas++; registros += r.value.registros; sincronizadas.push(r.value); }
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
    janelaDias,                    // janela REALMENTE usada nesta chamada
    janelaPadrao: JANELA_DIAS,
    modoAlvo: alvoParam ? "accountId" : "offset",
    ...(alvoParam ? {} : { offset, limite, proximoOffset }),
    totalContas: total,
    contasNoBloco: bloco.length,
    processadas,
    registros,
    sincronizadas,                 // identidade + estado do agregado, por conta
    erros,
    atualizadoEm,
  });
}
