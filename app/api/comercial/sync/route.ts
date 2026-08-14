/**
 * SYNC GRANULAR DO COMERCIAL — Etapa A.
 *
 * Lê o Xmax e grava as duas coleções granulares: `comercial_oportunidades` e
 * `comercial_pessoas`. NADA de tela ainda, e nenhum pré-agregado — esse é a
 * Etapa C. Aqui o objetivo é o dado bruto conferível.
 *
 *   GET /api/comercial/sync?key=<CRON_SECRET>            → PRÉVIA (não grava)
 *   GET /api/comercial/sync?key=<CRON_SECRET>&aplicar=1  → grava
 *
 * ⚠️ PRÉVIA POR PADRÃO, regra da casa. E a prévia devolve os números de
 * conferência contra o diagnóstico de 15/08/2026 — se algum divergir, é para
 * PARAR e entender antes de aplicar, não para aplicar e ver no que dá.
 *
 * ⚠️ ETAPA A SÓ ENXERGA AS ABERTAS. `getPipeOpportunities` não devolve encerrada
 * (a API não tem endpoint para isso), então as pessoas montadas aqui refletem só
 * o que está aberto. O histórico de fechamentos entra na Etapa B, por varredura
 * de ID — e o desenho já prevê isso: o sync FUNDE o que busca com o que já está
 * gravado, então quando o backfill trouxer as encerradas, as pessoas se
 * recompõem sozinhas sem este código mudar.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { checarCronSecret } from "@/lib/cronAuth";
import {
  lerConfigXmax, chamarXmax, ConfigXmax, OportunidadeXmax,
  nomeOrigem, semOrigem, centavosParaReais,
} from "@/lib/xmax";
import {
  FUNIL_CAPTACAO, FUNIL_DESQUALIFICADOS, ordemDeEtapas, normalizarOportunidade,
  agruparPessoas, ehRecuperacao, ehNegociacao, ehEncerrada, OportunidadeGravada,
} from "@/lib/comercial";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const COL_OP = "comercial_oportunidades";
const COL_PESSOA = "comercial_pessoas";
const COL_CONFIG = "comercial_config";
/** Abaixo do limite de 500 operações por batch do Firestore. */
const LOTE = 450;

interface Etapa { id: number; name?: string }
interface Funil { id: number; name?: string; stageorders?: number[]; stages?: Etapa[] }

/**
 * Números do diagnóstico de 15/08/2026. A prévia compara contra eles e ACUSA a
 * divergência — não corrige, não silencia.
 *
 * ⚠️ TODOS OS CINCO SÃO SOBRE **ABERTAS**, e isso passou a importar depois da
 * Etapa B. Quando foram medidos, abertas era tudo que existia: a API não lista
 * encerrada, então "oportunidades do funil 4" e "abertas do funil 4" eram o mesmo
 * número e o rótulo não distinguia. O backfill trouxe 2.873 encerradas e separou
 * as duas coisas — comparar o universo (4.529) contra uma referência de abertas
 * (1.656) acusaria divergência todo dia, por construção, e uma conferência que
 * está sempre vermelha para de ser lida.
 *
 * ⚠️ Divergir NÃO é necessariamente defeito: a base é viva e o Marcos mexe nela
 * todo dia. O que a conferência protege é outra coisa — divergência GRANDE ou em
 * direção estranha (pessoas > oportunidades, negociação triplicando) significa
 * que a REGRA mudou de comportamento, e aí é bug. Por isso o retorno mostra o
 * esperado, o obtido e a diferença, e deixa o julgamento com quem lê.
 */
const REFERENCIA = {
  oportunidades: 1656,
  pessoas: 1455,
  captacao: 629,
  recuperacao: 838,
  negociacao: 225,
  medidoEm: "2026-08-15",
  escopo: "abertas do funil de captação",
};

export async function GET(req: Request) {
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  const cfg = lerConfigXmax();
  if ("faltando" in cfg) {
    return NextResponse.json(
      { ok: false, erro: "configuração do Xmax incompleta", faltando: cfg.faltando },
      { status: 500 }
    );
  }
  const c: ConfigXmax = cfg.config;
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "Firebase não configurado" }, { status: 500 });

  const aplicar = new URL(req.url).searchParams.get("aplicar") === "1";

  // ---------------------------------------------------------------------
  // 1) A ORDEM DAS ETAPAS — lida do funil, reportada sempre
  // ---------------------------------------------------------------------
  const rFunis = await chamarXmax<Funil[]>(c, "getAllPipelines", "global");
  if (!rFunis.ok || !Array.isArray(rFunis.dados)) {
    return NextResponse.json(
      { ok: false, erro: "getAllPipelines falhou", detalhe: rFunis.erro }, { status: 502 }
    );
  }
  const funil = rFunis.dados.find((f) => Number(f.id) === FUNIL_CAPTACAO);
  if (!funil) {
    return NextResponse.json(
      { ok: false, erro: `funil ${FUNIL_CAPTACAO} não existe mais na instância` }, { status: 502 }
    );
  }
  const ordem = ordemDeEtapas(funil);
  const nomeEtapa = new Map((funil.stages ?? []).map((e) => [Number(e.id), String(e.name ?? "")]));

  // ---------------------------------------------------------------------
  // 2) BUSCA — captação + desqualificados da era antiga
  // ---------------------------------------------------------------------
  const buscar = async (pipelineId: number) => {
    const r = await chamarXmax<OportunidadeXmax[]>(c, "getPipeOpportunities", "fila", { pipelineId });
    return { lista: Array.isArray(r.dados) ? r.dados : [], erro: r.erro };
  };
  const cap = await buscar(FUNIL_CAPTACAO);
  const desq = await buscar(FUNIL_DESQUALIFICADOS);
  if (cap.erro) {
    return NextResponse.json(
      { ok: false, erro: "getPipeOpportunities do funil de captação falhou", detalhe: cap.erro },
      { status: 502 }
    );
  }

  const frescas = [...cap.lista, ...desq.lista].map(normalizarOportunidade);

  // ---------------------------------------------------------------------
  // 3) FUNDE com o que já está gravado
  // ---------------------------------------------------------------------
  // ⚠️ Sem esta união, a Etapa B (backfill das encerradas) seria desfeita no
  // primeiro sync diário: as pessoas voltariam a ser montadas só com as abertas.
  const snapExistente = await db.collection(COL_OP).get();
  const porId = new Map<number, OportunidadeGravada>();
  snapExistente.docs.forEach((d) => {
    const x = d.data() as OportunidadeGravada;
    if (Number.isFinite(Number(x?.id))) porId.set(Number(x.id), x);
  });
  const idsFrescos = new Set(frescas.map((o) => o.id));
  frescas.forEach((o) => porId.set(o.id, o));
  const universo = [...porId.values()];

  const pessoas = agruparPessoas(universo, ordem);

  // ---------------------------------------------------------------------
  // 4) OS NÚMEROS DE CONFERÊNCIA
  // ---------------------------------------------------------------------
  const doFunil4 = universo.filter((o) => o.pipelineId === FUNIL_CAPTACAO);
  const pessoasDoFunil4 = pessoas.filter((p) =>
    p.oportunidadeIds.some((id) => porId.get(id)?.pipelineId === FUNIL_CAPTACAO));

  // ⚠️ A CONFERÊNCIA COMPARA ABERTA COM ABERTA. Ver o comentário de REFERENCIA:
  // depois do backfill, `doFunil4` é histórico (4.529) e a referência é foto do
  // funil (1.656). Medir um contra o outro não diz nada.
  const abertasFunil4 = doFunil4.filter((o) => !ehEncerrada(o.status));
  const idsAbertos = new Set(abertasFunil4.map((o) => o.id));
  const pessoasComAberta = pessoasDoFunil4.filter((p) => p.oportunidadeIds.some((id) => idsAbertos.has(id)));

  const emCaptacao = pessoasDoFunil4.filter((p) => p.etapaNaCaptacao !== null).length;
  const emRecuperacao = pessoasDoFunil4.filter((p) => p.emRecuperacao).length;
  const emNegociacao = pessoasDoFunil4.filter((p) => p.emNegociacao).length;

  const obtido = {
    oportunidades: abertasFunil4.length,
    pessoas: pessoasComAberta.length,
    captacao: emCaptacao,
    recuperacao: emRecuperacao,
    negociacao: emNegociacao,
  };
  // Só as chaves NUMÉRICAS entram na comparação — `medidoEm` e `escopo` são
  // rótulos. Filtrar por nome já deixou o `escopo` virar uma linha com
  // `diferenca: null`, que sozinha derrubava o `tudoBate`.
  const conferencia = Object.entries(REFERENCIA)
    .filter(([, v]) => typeof v === "number")
    .map(([k, esperado]) => {
      const v = obtido[k as keyof typeof obtido];
      return { metrica: k, esperado, obtido: v, diferenca: v - Number(esperado) };
    });
  const divergentes = conferencia.filter((x) => x.diferenca !== 0);

  // Foto por etapa, nas duas visões — é o que a Etapa C vai pré-agregar.
  const porEtapa = ordem.map((id) => {
    const ops = doFunil4.filter((o) => o.stageId === id).length;
    const pessoasNaEtapa = pessoasDoFunil4.filter((p) => p.etapaMaisAvancada === id).length;
    const naCaptacao = ehRecuperacao(id)
      ? null
      : pessoasDoFunil4.filter((p) => p.etapaNaCaptacao === id).length;
    return {
      etapaId: id,
      nome: nomeEtapa.get(id) ?? `(etapa ${id})`,
      oportunidades: ops,
      pessoasVarianteA: pessoasNaEtapa,
      pessoasCaptacao: naCaptacao,
      recuperacao: ehRecuperacao(id),
      negociacao: ehNegociacao(id),
    };
  });

  // ---------------------------------------------------------------------
  // 5) O QUE MUDARIA — campo a campo, não "seria reescrito"
  // ---------------------------------------------------------------------
  /**
   * ⚠️ CRIADA / ALTERADA / INALTERADA, como no /api/import-contas.
   *
   * Uma prévia que diz "1.989 seriam atualizadas" toda vez não prova nada: é o
   * total, não a mudança. O que responde "rodar de novo é seguro?" é o campo a
   * campo — e é ele que deixa o segundo apply devolver ZERO alterada.
   *
   * De quebra, só o que MUDOU é gravado: num dia parado o sync escreve ~nada em
   * vez de 3.768 docs, e escrita no Firestore custa dinheiro.
   */
  const semCarimbo = (x: Record<string, unknown>) => {
    const { atualizadoEm, ...resto } = x;
    void atualizadoEm;
    return resto;
  };
  /** Serialização canônica: chave ordenada, para a comparação não depender da ordem. */
  const canonico = (v: unknown): string => JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as object).sort(([a], [b]) => a.localeCompare(b)))
      : val);
  const mudou = (novo: Record<string, unknown>, atual: Record<string, unknown> | undefined) =>
    !atual || canonico(semCarimbo(novo)) !== canonico(semCarimbo(atual));

  const opGravadas = new Map(snapExistente.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const opCriadas = frescas.filter((o) => !opGravadas.has(String(o.id)));
  const opAlteradas = frescas.filter((o) => opGravadas.has(String(o.id))
    && mudou(o as unknown as Record<string, unknown>, opGravadas.get(String(o.id))));
  const opInalteradas = frescas.length - opCriadas.length - opAlteradas.length;

  const snapPessoas = await db.collection(COL_PESSOA).get();
  const pesGravadas = new Map(snapPessoas.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const pesCriadas = pessoas.filter((p) => !pesGravadas.has(p.id));
  const pesAlteradas = pessoas.filter((p) => pesGravadas.has(p.id)
    && mudou(p as unknown as Record<string, unknown>, pesGravadas.get(p.id)));
  const pesInalteradas = pessoas.length - pesCriadas.length - pesAlteradas.length;

  /** Só o que mudou vai para o batch. */
  const opParaGravar = [...opCriadas, ...opAlteradas];
  const pesParaGravar = [...pesCriadas, ...pesAlteradas];

  const resposta: Record<string, unknown> = {
    ok: true,
    modo: aplicar ? "aplicar" : "previa",
    avisoEtapaA:
      "Etapa A enxerga só as oportunidades ABERTAS — a API não lista encerradas. "
      + "O histórico de fechamentos entra na Etapa B (varredura de ID), e as pessoas "
      + "se recompõem sozinhas porque este sync funde o buscado com o já gravado.",

    // ⚠️ SEMPRE no retorno: se a agência reordenar as etapas no Xmax, a ordem muda
    // sozinha e com ela a definição de "etapa mais avançada" — a foto inteira do
    // funil. É a coisa que muda embaixo sem ninguém avisar.
    ordemDasEtapas: {
      origem: Array.isArray(funil.stageorders) && funil.stageorders.length
        ? "stageorders do funil"
        : "ordem do array stages (stageorders veio vazio)",
      ordem: ordem.map((id, i) => ({ posicao: i + 1, etapaId: id, nome: nomeEtapa.get(id) ?? null })),
      etapasComOportunidadeForaDaOrdem: [...new Set(doFunil4.map((o) => o.stageId))]
        .filter((id) => id !== null && !ordem.includes(Number(id))),
    },

    conferencia: {
      referencia: `diagnóstico de ${REFERENCIA.medidoEm}`,
      escopo: REFERENCIA.escopo,
      nota:
        "Divergência não é automaticamente defeito — a base é viva. Preocupa o que for "
        + "grande ou de direção estranha (pessoas > oportunidades, negociação triplicando): "
        + "aí a regra mudou de comportamento.",
      linhas: conferencia,
      tudoBate: divergentes.length === 0,
    },

    funil: {
      id: FUNIL_CAPTACAO,
      nome: funil.name ?? null,
      porEtapa,
      /**
       * ⚠️ DUAS CONTAGENS, SEMPRE ROTULADAS. `abertas` é a foto (quem está no
       * funil agora); `historico` inclui as encerradas que a Etapa B trouxe. Um
       * número solto aqui viraria "oportunidades" na tela e ninguém saberia qual
       * dos dois está lendo — o mesmo erro que já custou o 631 vs 629.
       */
      totais: {
        abertas: abertasFunil4.length,
        pessoasComAberta: pessoasComAberta.length,
        historico: doFunil4.length,
        pessoasNoHistorico: pessoasDoFunil4.length,
        encerradas: doFunil4.length - abertasFunil4.length,
        semTelefone: pessoasDoFunil4.filter((p) => !p.temTelefone).length,
      },
    },

    desqualificacao: {
      funil23: desq.lista.length,
      erroFunil23: desq.erro,
      porEtiqueta38: universo.filter((o) => o.desqualificada && o.pipelineId === FUNIL_CAPTACAO).length,
      pessoasDesqualificadas: pessoas.filter((p) => p.desqualificada).length,
      nota: "As DUAS formas contam: funil 23 (era antiga) e etiqueta [38] (hoje).",
    },

    origens: [...new Set(doFunil4.map((o) => o.origem))]
      .map((id) => ({
        origemId: id,
        nome: nomeOrigem(id),
        semOrigem: semOrigem(id),
        oportunidades: doFunil4.filter((o) => o.origem === id).length,
      }))
      .sort((a, b) => b.oportunidades - a.oportunidades),

    mrr: {
      pessoasQueGanharam: pessoas.filter((p) => p.ganhou).length,
      mrrSomadoReais: centavosParaReais(pessoas.reduce((t, p) => t + p.mrrFechadoCent, 0)),
      fechamentosSemValor: pessoas.reduce((t, p) => t + p.fechamentosSemValor, 0),
      nota:
        "Fechamento sem valor NÃO entra como zero na soma — é contado à parte. "
        + "A tela dirá 'N sem valor informado — o total real é maior'.",
    },

    gravacao: {
      nota:
        "Criada/alterada/inalterada é campo a campo, não 'seria reescrita'. Rodar "
        + "de novo sem nada ter mudado no Xmax deve dar 0 criada e 0 alterada — é o "
        + "teste de idempotência. Só o que mudou é gravado.",
      oportunidades: {
        naFonte: frescas.length,
        criadas: opCriadas.length,
        alteradas: opAlteradas.length,
        inalteradas: opInalteradas,
      },
      pessoas: {
        calculadas: pessoas.length,
        criadas: pesCriadas.length,
        alteradas: pesAlteradas.length,
        inalteradas: pesInalteradas,
      },
      // Gravadas antes e ausentes agora: nunca apagadas, só listadas.
      jaGravadasQueNaoVieramAgora: universo.length - idsFrescos.size,
      idempotente: opCriadas.length === 0 && opAlteradas.length === 0
        && pesCriadas.length === 0 && pesAlteradas.length === 0,
      gravadas: 0,
    },
    consultadoEm: new Date().toISOString(),
  };

  if (!aplicar) return NextResponse.json(resposta);

  // ---------------------------------------------------------------------
  // 6) APLICAR — merge, nunca sobrescrita cega; nada é apagado
  // ---------------------------------------------------------------------
  let gravadas = 0;
  const escrever = async <T extends { }>(col: string, itens: T[], idDe: (x: T) => string) => {
    for (let i = 0; i < itens.length; i += LOTE) {
      const batch = db.batch();
      for (const x of itens.slice(i, i + LOTE)) {
        batch.set(db.collection(col).doc(idDe(x)), { ...x, atualizadoEm: new Date().toISOString() }, { merge: true });
      }
      await batch.commit();
      gravadas += Math.min(LOTE, itens.length - i);
    }
  };

  try {
    await escrever(COL_OP, opParaGravar, (o) => String(o.id));
    await escrever(COL_PESSOA, pesParaGravar, (p) => p.id);
    // Mapas que a API não devolve, para a tela não depender de constante do código.
    await db.collection(COL_CONFIG).doc("etapas").set({
      funilId: FUNIL_CAPTACAO,
      ordem,
      nomes: Object.fromEntries([...nomeEtapa.entries()]),
      atualizadoEm: new Date().toISOString(),
    }, { merge: true });
    await db.collection("sistema").doc("sync_comercial").set({
      ultimaExecucao: new Date().toISOString(),
      oportunidadesAbertas: frescas.length,
      pessoas: pessoas.length,
    }, { merge: true });
  } catch (e) {
    return NextResponse.json({
      ok: false, erro: "falha ao gravar — parte pode ter sido escrita",
      detalhe: String(e).slice(0, 300), gravadasAteFalhar: gravadas,
    }, { status: 500 });
  }

  return NextResponse.json({ ...resposta, gravacao: { ...(resposta.gravacao as object), gravadas } });
}
