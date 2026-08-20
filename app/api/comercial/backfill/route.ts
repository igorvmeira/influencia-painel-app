/**
 * BACKFILL RETROATIVO DO COMERCIAL — Etapa B.
 *
 * A API do Xmax NÃO tem endpoint que liste oportunidades encerradas: o
 * `getPipeOpportunities` devolve só as abertas, e é literal no summary. Mas o
 * `getOpportunity` aceita QUALQUER id e devolve a encerrada — o diagnóstico de
 * 15/08/2026 provou com ids de 2024 voltando ganhas e perdidas.
 *
 * Então o histórico de fechamentos só existe de um jeito: varrer o espaço de IDs.
 *
 *   ?key=<CRON_SECRET>&amostra=200          → PRÉVIA: sonda IDs espalhados, não grava
 *   ?key=<CRON_SECRET>&aplicar=1[&bloco=N]  → um bloco, grava e avança o cursor
 *   ?key=<CRON_SECRET>&reiniciar=1          → zera o cursor (recomeça do id 1)
 *
 * ⚠️ RETOMÁVEL POR CONSTRUÇÃO. O cursor avança DEPOIS do commit do bloco: se a
 * chamada cair no meio, a próxima REFAZ o bloco. Refazer é seguro (docId
 * determinístico + gravação só do que mudou); pular não seria. Melhor repetir 400
 * chamadas do que perder 400 oportunidades em silêncio.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { checarCronSecret } from "@/lib/cronAuth";
// ⚠️ DOC_SYNC_COMERCIAL era `const DOC_SYNC` PRIVADO aqui e literal "sync_comercial"
// na rota de sync. As duas escrevem o MESMO documento e nada ligava as duas.
import { COL_SISTEMA, DOC_SYNC_COMERCIAL } from "@/lib/colecoes";
import {
  lerConfigXmax, chamarXmax, ConfigXmax, OportunidadeXmax, centavosParaReais,
} from "@/lib/xmax";
import {
  FUNIL_CAPTACAO, FUNIL_DESQUALIFICADOS, normalizarOportunidade, OportunidadeGravada,
} from "@/lib/comercial";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const COL_OP = "comercial_oportunidades";
// DOC_SYNC_COMERCIAL vem de @/lib/colecoes.
const LOTE_FIRESTORE = 450;

/** IDs por chamada. 400 × ~60ms efetivos ≈ 25s, dentro do maxDuration de 60. */
const BLOCO_PADRAO = 400;
const BLOCO_MAX = 1000;
/** Sondas simultâneas. O suporte pediu "bom senso no intervalo" — 5 é modesto. */
const PARALELO = 5;
/** Os dois funis que o painel comercial cobre. O resto é contado e ignorado. */
const FUNIS_NO_ESCOPO = [FUNIL_CAPTACAO, FUNIL_DESQUALIFICADOS];

interface Sonda {
  id: number;
  achou: boolean;
  op: OportunidadeXmax | null;
  /** true = OPP_002, o id não existe. NÃO é erro: conta como verificado. */
  apagada: boolean;
  erro: string | null;
}

const lotes = <T,>(a: T[], n: number): T[][] =>
  a.reduce<T[][]>((acc, _, i) => (i % n ? acc : [...acc, a.slice(i, i + n)]), []);

async function sondar(c: ConfigXmax, id: number): Promise<Sonda> {
  const r = await chamarXmax<OportunidadeXmax>(c, "getOpportunity", "fila", { id });
  if (r.ok && r.dados && Number(r.dados.id) > 0) {
    return { id, achou: true, op: r.dados, apagada: false, erro: null };
  }
  // OPP_002 = id inexistente. Esperado na MAIORIA dos ids (a numeração é global
  // e esparsa), então nunca trava a varredura nem entra em `erros`.
  const apagada = /OPP_002/i.test(String(r.erro ?? ""));
  return { id, achou: false, op: null, apagada, erro: apagada ? null : r.erro };
}

async function sondarMuitos(c: ConfigXmax, ids: number[]): Promise<Sonda[]> {
  const out: Sonda[] = [];
  for (const bloco of lotes(ids, PARALELO)) {
    out.push(...(await Promise.all(bloco.map((id) => sondar(c, id)))));
  }
  return out;
}

export async function GET(req: Request) {
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  const cfg = lerConfigXmax();
  if ("faltando" in cfg) {
    return NextResponse.json({ ok: false, erro: "config incompleta", faltando: cfg.faltando }, { status: 500 });
  }
  const c = cfg.config;
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "Firebase não configurado" }, { status: 500 });

  const url = new URL(req.url);
  const aplicar = url.searchParams.get("aplicar") === "1";
  const reiniciar = url.searchParams.get("reiniciar") === "1";
  const amostraN = Number(url.searchParams.get("amostra"));
  const bloco = Math.min(BLOCO_MAX, Math.max(1, Number(url.searchParams.get("bloco")) || BLOCO_PADRAO));

  const refSync = db.collection(COL_SISTEMA).doc(DOC_SYNC_COMERCIAL);

  // -------------------------------------------------------------------------
  // MODO PRÉVIA — amostra espalhada por TODA a faixa
  // -------------------------------------------------------------------------
  // ⚠️ ESPALHADA, não os N primeiros: ids baixos são de 2024 e dariam uma taxa
  // de acerto e uma distribuição enviesadas. A extrapolação sairia errada e
  // parecendo confiável, que é o pior tipo de número.
  if (amostraN > 0) {
    const maxId = await descobrirMaiorId(db);
    const passo = Math.max(1, Math.floor(maxId / amostraN));
    const ids: number[] = [];
    for (let i = 1; i <= maxId && ids.length < amostraN; i += passo) ids.push(i);

    const sondas = await sondarMuitos(c, ids);
    const achadas = sondas.filter((s) => s.achou).map((s) => s.op!);
    const noEscopo = achadas.filter((o) => FUNIS_NO_ESCOPO.includes(Number(o.fkPipeline)));
    const ganhas = achadas.filter((o) => Number(o.status) === 1);
    const comMrr = ganhas.filter((o) => Number(o.closerecurrentvalue) > 0);
    const idsQueResponderam = sondas.filter((s) => s.achou).map((s) => s.id);

    const taxa = sondas.length ? achadas.length / sondas.length : 0;
    const taxaEscopo = sondas.length ? noEscopo.length / sondas.length : 0;

    const porFunil = new Map<number, number>();
    achadas.forEach((o) => porFunil.set(Number(o.fkPipeline), (porFunil.get(Number(o.fkPipeline)) ?? 0) + 1));
    const porStatus = [0, 1, 2].map((st) => ({
      status: st,
      nome: ["aberta", "ganha", "perdida"][st],
      qtd: achadas.filter((o) => Number(o.status) === st).length,
    }));
    const datas = achadas.map((o) => String(o.createdAt ?? "").slice(0, 10)).filter(Boolean).sort();

    return NextResponse.json({
      ok: true,
      modo: "previa",
      aviso: "Amostra ESPALHADA pela faixa inteira. Não grava nada.",
      faixa: {
        maiorIdConhecido: maxId,
        idsSondados: sondas.length,
        passoEntreIds: passo,
        // ⚠️ Pedido do Igor: a faixa REAL que respondeu. Se ela for muito menor
        // que 1..maxId, a extrapolação abaixo muda de tamanho.
        menorIdQueRespondeu: idsQueResponderam.length ? Math.min(...idsQueResponderam) : null,
        maiorIdQueRespondeu: idsQueResponderam.length ? Math.max(...idsQueResponderam) : null,
      },
      encontrados: {
        existem: achadas.length,
        apagados: sondas.filter((s) => s.apagada).length,
        erros: sondas.filter((s) => s.erro).length,
        taxaDeAcerto: Number((taxa * 100).toFixed(1)),
      },
      porFunil: [...porFunil.entries()].sort((a, b) => b[1] - a[1]).map(([id, qtd]) => ({
        funilId: id, qtd, noEscopo: FUNIS_NO_ESCOPO.includes(id),
      })),
      porStatus,
      dataMaisAntiga: datas[0] ?? null,
      dataMaisRecente: datas[datas.length - 1] ?? null,
      mrr: {
        ganhasNaAmostra: ganhas.length,
        comValorPreenchido: comMrr.length,
        semValor: ganhas.length - comMrr.length,
        somaReais: centavosParaReais(ganhas.reduce((t, o) => t + Number(o.closerecurrentvalue ?? 0), 0)),
      },
      extrapolacao: {
        aviso: "ESTIMATIVA, não promessa. Regra de três sobre a amostra.",
        oportunidadesQueExistem: Math.round(maxId * taxa),
        dentroDoEscopo: Math.round(maxId * taxaEscopo),
        jaGravadasHoje: (await db.collection(COL_OP).count().get()).data().count,
        chamadasParaVarrerTudo: maxId,
        blocosDe: bloco,
        chamadasAoEndpoint: Math.ceil(maxId / bloco),
      },
    });
  }

  // -------------------------------------------------------------------------
  // MODO BLOCO — grava e avança o cursor
  // -------------------------------------------------------------------------
  const snapSync = await refSync.get();
  const estado = (snapSync.data()?.backfill ?? null) as Record<string, number | string | boolean | null> | null;

  let cursor = Number(estado?.proximoId ?? 0);
  let maxId = Number(estado?.idMaximo ?? 0);

  if (reiniciar || !estado || !cursor || !maxId) {
    // ⚠️ idMaximo é CONGELADO aqui. Sem isso a varredura persegue alvo móvel: o
    // comercial cria oportunidade enquanto ela roda e o fim nunca chega. As
    // criadas durante a varredura são pegas pelo sync diário, que já funde.
    maxId = await descobrirMaiorId(db);
    cursor = 1;
    if (aplicar) {
      await refSync.set({
        backfill: {
          ativo: true, idMinimo: 1, idMaximo: maxId, proximoId: 1,
          verificados: 0, encontrados: 0, gravadosFunil4: 0, gravadosFunil23: 0,
          outrosFunis: 0, apagados: 0, erros: 0,
          iniciadoEm: new Date().toISOString(), ultimoBlocoEm: null, concluidoEm: null,
        },
      }, { merge: true });
    }
  }

  if (cursor > maxId) {
    return NextResponse.json({
      ok: true, modo: "bloco", concluido: true,
      mensagem: "varredura completa — o cursor passou do maior id",
      estado: (await refSync.get()).data()?.backfill ?? null,
    });
  }

  const fim = Math.min(maxId, cursor + bloco - 1);
  const ids: number[] = [];
  for (let i = cursor; i <= fim; i++) ids.push(i);

  const sondas = await sondarMuitos(c, ids);
  const achadas = sondas.filter((s) => s.achou).map((s) => s.op!);
  const noEscopo = achadas
    .filter((o) => FUNIS_NO_ESCOPO.includes(Number(o.fkPipeline)))
    .map(normalizarOportunidade);
  const outros = achadas.length - noEscopo.length;

  // ⚠️ MERGE, NUNCA DUPLICATA. docId = String(op.id), o MESMO da Etapa A: a
  // varredura reencontra as 1.989 abertas já gravadas e cada uma cai no seu
  // próprio documento. E só grava o que MUDOU — reencontrar uma aberta idêntica
  // não gera escrita nenhuma.
  const idsDoBloco = noEscopo.map((o) => String(o.id));
  const jaGravadas = new Map<string, Record<string, unknown>>();
  for (const parte of lotes(idsDoBloco, 30)) {
    const snaps = await db.getAll(...parte.map((id) => db.collection(COL_OP).doc(id)));
    snaps.forEach((s) => { if (s.exists) jaGravadas.set(s.id, s.data() as Record<string, unknown>); });
  }
  const canonico = (v: unknown): string => JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as object).sort(([a], [b]) => a.localeCompare(b)))
      : val);
  const semCarimbo = (x: Record<string, unknown>) => {
    const { atualizadoEm, ...resto } = x; void atualizadoEm; return resto;
  };
  const paraGravar = noEscopo.filter((o) => {
    const atual = jaGravadas.get(String(o.id));
    return !atual || canonico(semCarimbo(o as unknown as Record<string, unknown>)) !== canonico(semCarimbo(atual));
  });

  const resumoBloco = {
    de: cursor, ate: fim, sondados: sondas.length,
    existem: achadas.length,
    apagados: sondas.filter((s) => s.apagada).length,
    erros: sondas.filter((s) => s.erro).length,
    noEscopo: noEscopo.length,
    outrosFunis: outros,
    seriamGravadas: paraGravar.length,
    jaIdenticas: noEscopo.length - paraGravar.length,
    encerradasNoBloco: noEscopo.filter((o) => o.status === 1 || o.status === 2).length,
  };

  if (!aplicar) {
    return NextResponse.json({
      ok: true, modo: "previa-de-bloco", concluido: false,
      aviso: "Não gravou e NÃO avançou o cursor.",
      bloco: resumoBloco,
      proximoCursorSeAplicasse: fim + 1,
    });
  }

  let gravadas = 0;
  try {
    for (let i = 0; i < paraGravar.length; i += LOTE_FIRESTORE) {
      const batch = db.batch();
      for (const o of paraGravar.slice(i, i + LOTE_FIRESTORE)) {
        batch.set(db.collection(COL_OP).doc(String(o.id)),
          { ...o, atualizadoEm: new Date().toISOString() }, { merge: true });
      }
      await batch.commit();
      gravadas += Math.min(LOTE_FIRESTORE, paraGravar.length - i);
    }
  } catch (e) {
    // Cursor NÃO avança: a próxima chamada refaz este bloco.
    return NextResponse.json({
      ok: false, erro: "falha ao gravar o bloco — cursor NÃO avançou, a próxima chamada refaz",
      detalhe: String(e).slice(0, 300), bloco: resumoBloco,
    }, { status: 500 });
  }

  // ⚠️ SÓ AGORA o cursor avança — depois do commit.
  const anterior = (snapSync.data()?.backfill ?? {}) as Record<string, number>;
  const somar = (k: string, v: number) => Number(anterior[k] ?? 0) + v;
  const concluido = fim >= maxId;
  await refSync.set({
    backfill: {
      ativo: !concluido, idMinimo: 1, idMaximo: maxId,
      proximoId: fim + 1,
      verificados: somar("verificados", sondas.length),
      encontrados: somar("encontrados", achadas.length),
      gravadosFunil4: somar("gravadosFunil4", noEscopo.filter((o) => o.pipelineId === FUNIL_CAPTACAO).length),
      gravadosFunil23: somar("gravadosFunil23", noEscopo.filter((o) => o.pipelineId === FUNIL_DESQUALIFICADOS).length),
      outrosFunis: somar("outrosFunis", outros),
      apagados: somar("apagados", resumoBloco.apagados),
      erros: somar("erros", resumoBloco.erros),
      iniciadoEm: anterior.iniciadoEm ?? new Date().toISOString(),
      ultimoBlocoEm: new Date().toISOString(),
      concluidoEm: concluido ? new Date().toISOString() : null,
    },
  }, { merge: true });

  return NextResponse.json({
    ok: true, modo: "bloco", concluido,
    bloco: { ...resumoBloco, gravadas },
    proximoCursor: fim + 1,
    progresso: `${Math.min(fim, maxId)}/${maxId} (${((fim / maxId) * 100).toFixed(1)}%)`,
    estado: (await refSync.get()).data()?.backfill ?? null,
  });
}

/**
 * O maior id conhecido. Sai do que já está gravado (a Etapa A trouxe as abertas,
 * cujos ids são os mais recentes) com folga para cima — oportunidade criada entre
 * o último sync e agora ficaria fora, e a folga cobre isso sem custar quase nada:
 * id inexistente responde OPP_002 e só consome uma sonda.
 */
async function descobrirMaiorId(db: FirebaseFirestore.Firestore): Promise<number> {
  const snap = await db.collection(COL_OP).orderBy("id", "desc").limit(1).get();
  const maior = snap.empty ? 0 : Number(snap.docs[0].data()?.id ?? 0);
  return Math.max(1000, maior + 500);
}
