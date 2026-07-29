import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { buscarDiario, buscarLimiteConta } from "@/lib/meta";
import { ContaMap, MetricaDiaria } from "@/lib/types";
import { COL_AGREGADAS, RETENCAO_DIAS, cutoffRetencao, mesclarDias } from "@/lib/agregadas";
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

// Janela para conta NOVA (nunca sincronizada). Alinhada com a retenção do agregado:
// puxar mais que RETENCAO_DIAS seria descartado pelo mesclarDias na hora de gravar.
const JANELA_NOVA = RETENCAO_DIAS;

// Quantas contas novas (janela cheia) podem rodar numa MESMA chamada.
// Puxar ~95 dias é bem mais pesado que 30; se muitas contas novas entrarem juntas,
// o bloco arriscaria estourar o tempo da função. As excedentes são ADIADAS —
// deliberadamente NÃO sincronizadas neste bloco, e não sincronizadas com 30 dias.
// Motivo: sincronizar com 30 criaria o doc agregado e a conta ficaria travada como
// "já tem histórico", truncada em definitivo e em silêncio. Pular preserva o estado
// de "nova", então a próxima execução do sync a pega com a janela cheia.
const MAX_NOVAS_POR_CHAMADA = 3;
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

  // Janela de dias desta chamada (?dias=N). Quando ausente, a janela é decidida POR
  // CONTA: cheia se a conta nunca foi sincronizada, JANELA_DIAS se já tem histórico.
  // O cron não passa ?dias, então segue em 30 para a carteira estabelecida.
  const diasParam = Number(url.searchParams.get("dias"));
  const diasExplicito = Number.isFinite(diasParam) && diasParam > 0
    ? Math.min(Math.floor(diasParam), JANELA_MAX)
    : null;

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

  // ---- Pré-passo: quem do bloco é conta NOVA (sem doc agregado)? ----
  // Uma leitura em lote (getAll) resolve o bloco inteiro; o snapshot é reaproveitado
  // dentro de processarConta, então nenhuma conta é lida duas vezes.
  const snapsAgg = bloco.length
    ? await db.getAll(...bloco.map((c) => db!.collection(COL_AGREGADAS).doc(c.accountId)))
    : [];
  const aggPorConta = new Map(bloco.map((c, i) => [c.accountId, snapsAgg[i]]));
  const novasNoBloco = bloco.filter((c) => !aggPorConta.get(c.accountId)?.exists);

  // Aplica o teto: as primeiras rodam com janela cheia, as excedentes são ADIADAS
  // (puladas por inteiro — ver comentário de MAX_NOVAS_POR_CHAMADA).
  const adiadas = diasExplicito === null ? novasNoBloco.slice(MAX_NOVAS_POR_CHAMADA) : [];
  const idsAdiados = new Set(adiadas.map((c) => c.accountId));
  const aProcessar = bloco.filter((c) => !idsAdiados.has(c.accountId));

  // Processa cada conta do bloco e grava logo que termina, para nunca perder
  // o progresso já feito. Em paralelo para caber no tempo limite.
  async function processarConta(c: ContaMap): Promise<{
    accountId: string; cliente: string; registros: number;
    diasNoAgregado: number; maisAntigo: string | null;
    janelaUsada: number; janelaCheia: boolean;
  }> {
    // Snapshot já lido no pré-passo (getAll) — é ele que decide a janela.
    const aggRef = db!.collection(COL_AGREGADAS).doc(c.accountId);
    const aggSnap = aggPorConta.get(c.accountId)!;

    // CONTA NOVA = documento agregado INEXISTENTE. Não é "array vazio": o sync
    // grava o doc mesmo quando a conta não teve nenhum dia com gasto, então uma
    // conta que nunca gastou tem doc com dias:[] e NÃO volta a disparar a janela
    // cheia todo dia. Só entra aqui quem nunca foi sincronizada.
    const semHistorico = !aggSnap.exists;
    // ?dias explícito manda; senão, janela cheia para conta nova, 30 para as demais.
    const janelaDaConta = diasExplicito ?? (semHistorico ? JANELA_NOVA : JANELA_DIAS);

    const registros = await buscarDiario(c.accountId, janelaDaConta);
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
      janelaUsada: janelaDaConta,
      janelaCheia: semHistorico,
    };
  }

  const resultados = await Promise.allSettled(aProcessar.map(processarConta));

  let processadas = 0;
  let registros = 0;
  const sincronizadas: Awaited<ReturnType<typeof processarConta>>[] = [];
  const erros: { accountId: string; erro: string }[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") { processadas++; registros += r.value.registros; sincronizadas.push(r.value); }
    else erros.push({ accountId: aProcessar[i].accountId, erro: String(r.reason) });
  });

  const fim = offset + limite;
  const proximoOffset = fim < total ? fim : null;

  // Registra o horário desta sincronização para o rodapé do painel.
  // Grava a cada chamada (inclusive nas incrementais), então o valor exibido
  // reflete a atividade de sync mais recente.
  const atualizadoEm = new Date().toISOString();
  await db.collection("sistema").doc("sync").set({ atualizadoEm }, { merge: true });

  // Contas novas que receberam janela cheia nesta chamada — visível no retorno,
  // para não passar despercebido que uma conta entrou com histórico completo.
  const comJanelaCheia = sincronizadas.filter((s) => s.janelaCheia);

  return NextResponse.json({
    ok: true,
    janelaPadrao: JANELA_DIAS,
    janelaNova: JANELA_NOVA,
    janelaExplicita: diasExplicito,  // null = decidida por conta
    modoAlvo: alvoParam ? "accountId" : "offset",
    ...(alvoParam ? {} : { offset, limite, proximoOffset }),
    totalContas: total,
    contasNoBloco: bloco.length,
    processadas,
    registros,
    // Log visível da detecção automática.
    novasDetectadas: novasNoBloco.length,
    novasComJanelaCheia: comJanelaCheia.map((s) => ({
      accountId: s.accountId, cliente: s.cliente, janelaUsada: s.janelaUsada,
      diasNoAgregado: s.diasNoAgregado, maisAntigo: s.maisAntigo,
    })),
    // Adiadas: NÃO sincronizadas neste bloco (nem com janela curta). Seguem "novas"
    // e a próxima execução do sync as pega com a janela cheia.
    adiadas: adiadas.map((c) => ({ accountId: c.accountId, cliente: c.cliente ?? "" })),
    sincronizadas,                 // identidade + estado do agregado, por conta
    erros,
    atualizadoEm,
  });
}
