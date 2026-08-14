// ===========================================================================
// DIAGNÓSTICO TEMPORÁRIO da integração com o Xmax — REMOVER APÓS O USO
// ===========================================================================
// Mesmo padrão do /api/diag-janelas, que já usamos e apagamos: somente leitura,
// protegido por CRON_SECRET, existe para responder perguntas ANTES de qualquer
// feature ser escrita. Nenhuma coleção é criada, nada é gravado no Firestore, e
// nenhuma escrita é feita no Xmax.
//
// Regra de ouro da casa: confirmar que o dado existe e é acessível ANTES de
// prometer a integração. Este endpoint é esse primeiro passo.
//
// Responde seis perguntas (data/xmax-integracao.md):
//   1. Quais funis e etapas existem — nomes e IDs reais
//   2. Distribuição das oportunidades abertas por ORIGEM
//   3. A VARREDURA DE ID FUNCIONA? (a mais importante — decide se há backfill
//      retroativo dos fechamentos, ou se só temos o que as datas já entregam)
//   4. Quantas GANHAS têm closerecurrentvalue preenchido (o risco do MRR vazio)
//   5. Os IDs de tags batem com getTags? (achar a etiqueta "sem perfil")
//   6. Amostra dos campos CRUS, para modelar sobre o que realmente vem
//
// Cada etapa falha de forma isolada: uma que der erro não derruba o relatório
// inteiro, porque o valor aqui é justamente descobrir O QUE não funciona.

import { NextResponse } from "next/server";
import { checarCronSecret } from "@/lib/cronAuth";
import {
  lerConfigXmax, chamarXmax, ORIGENS, nomeOrigem, categoriaOrigem,
  nomeStatus, centavosParaReais, OportunidadeXmax, ConfigXmax,
  fechadaEm, naEtapaDesde, criadaEm, semOrigem,
} from "@/lib/xmax";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Quantos IDs sondar na varredura. O objetivo é PROVAR o conceito, não baixar a
// base: uma escada curta já mostra se ID encerrado responde.
const SONDAS_VARREDURA = 24;
// Sondas simultâneas — o suporte pediu "bom senso no intervalo", então nada de
// centenas em paralelo.
const LOTE = 4;
// Quantas oportunidades cruas aparecem na amostra.
const AMOSTRA_CRUA = 4;

interface Etapa { id: number; name?: string; winprobability?: number; color?: string }
interface Funil {
  id: number; name?: string; stageorders?: number[]; stages?: Etapa[];
  winautomation?: number; loseautomation?: number;
}
interface Etiqueta { id: number; name?: string }

const lotes = <T,>(a: T[], n: number): T[][] =>
  a.reduce<T[][]>((acc, _, i) => (i % n ? acc : [...acc, a.slice(i, i + n)]), []);

// Escada de IDs entre 1 e o maior ID aberto observado. Determinística (sem random,
// para duas execuções serem comparáveis) e enviesada para BAIXO, porque é lá que
// moram as oportunidades antigas — as que já fecharam.
function escadaDeIds(maxId: number, quantos: number, jaAbertos: Set<number>): number[] {
  const out = new Set<number>();
  for (const n of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]) if (n <= maxId) out.add(n);
  const passo = Math.max(1, Math.floor(maxId / Math.max(1, quantos - out.size)));
  for (let i = passo; i < maxId && out.size < quantos; i += passo) out.add(i);
  // IDs que já sabemos estar ABERTOS não provam nada sobre encerradas.
  return [...out].filter((i) => !jaAbertos.has(i)).slice(0, quantos).sort((a, b) => a - b);
}

export async function GET(req: Request) {
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  // FALHA FECHADO: sem env completa, nada roda — e o retorno diz exatamente o que
  // falta, para não virar caça ao tesouro.
  const cfg = lerConfigXmax();
  if ("faltando" in cfg) {
    return NextResponse.json(
      {
        ok: false,
        erro: "configuração do Xmax incompleta",
        faltando: cfg.faltando,
        comoResolver: "Adicione as variáveis no .env.local (local) e na Vercel (produção), e redeploy.",
      },
      { status: 500 }
    );
  }
  const c: ConfigXmax = cfg.config;
  const relatorio: Record<string, unknown> = {
    ok: true,
    apenasLeitura: true,
    aviso: "Endpoint TEMPORÁRIO de descoberta. Não grava nada. Remover após o uso.",
    instancia: c.baseUrl,
    queueId: c.queueId,
    consultadoEm: new Date().toISOString(),
  };

  // -------------------------------------------------------------------------
  // 1) FUNIS E ETAPAS (chave GLOBAL)
  // -------------------------------------------------------------------------
  const rFunis = await chamarXmax<Funil[]>(c, "getAllPipelines", "global");
  const funis = Array.isArray(rFunis.dados) ? rFunis.dados : [];
  relatorio["1_funis"] = rFunis.ok
    ? {
        total: funis.length,
        funis: funis.map((f) => ({
          id: f.id,
          nome: f.name ?? null,
          etapas: (f.stages ?? []).map((e) => ({
            id: e.id, nome: e.name ?? null, probabilidadeGanho: e.winprobability ?? null,
          })),
          // Os IDs de automação dizem se JÁ existe alguma configurada. 0/ausente =
          // ninguém configurou ainda, e o histórico de etapas não vai começar.
          automacoes: { ganhar: f.winautomation ?? null, perder: f.loseautomation ?? null },
        })),
      }
    : { erro: rFunis.erro, status: rFunis.status };

  // Sem funil não há o que perguntar adiante — devolve o que tem, com o motivo.
  if (!rFunis.ok || funis.length === 0) {
    relatorio["parouAqui"] =
      "getAllPipelines não respondeu (ou veio vazio). Confira XMAX_API_KEY_GLOBAL — "
      + "este endpoint EXIGE a chave global; a chave da fila é rejeitada com AUTH_018.";
    return NextResponse.json(relatorio);
  }

  // -------------------------------------------------------------------------
  // 2) OPORTUNIDADES ABERTAS POR ORIGEM (chave da FILA + queueId)
  // -------------------------------------------------------------------------
  // getPipeOpportunities não pagina: devolve todas as abertas do funil de uma vez.
  const abertasPorFunil: { funil: number; nome: string | null; total: number; erro: string | null }[] = [];
  const abertas: OportunidadeXmax[] = [];
  for (const f of funis) {
    const r = await chamarXmax<OportunidadeXmax[]>(
      c, "getPipeOpportunities", "fila", { pipelineId: f.id }
    );
    const lista = Array.isArray(r.dados) ? r.dados : [];
    abertasPorFunil.push({ funil: f.id, nome: f.name ?? null, total: lista.length, erro: r.erro });
    abertas.push(...lista);
  }

  const porOrigem = new Map<number, number>();
  for (const o of abertas) porOrigem.set(Number(o.origin ?? 0), (porOrigem.get(Number(o.origin ?? 0)) ?? 0) + 1);
  const origensDesconhecidas = [...porOrigem.keys()].filter((id) => id > 0 && !(id in ORIGENS));

  relatorio["2_origens"] = {
    totalAbertas: abertas.length,
    porFunil: abertasPorFunil,
    distribuicao: [...porOrigem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, qtd]) => ({
        origemId: id,
        nome: nomeOrigem(id),
        categoria: categoriaOrigem(id),
        quantidade: qtd,
        pct: abertas.length ? Math.round((qtd / abertas.length) * 1000) / 10 : 0,
      })),
    // Origem que a agência criou depois do mapa não pode sumir num balde "outros".
    origensDesconhecidas: origensDesconhecidas.length
      ? { ids: origensDesconhecidas, acao: "pedir o nome à agência e acrescentar em lib/xmax.ts" }
      : null,
    nota:
      "Nenhuma das 6 origens é 'prospecção de lista'. As marcadas como 'a_confirmar' "
      + "(INOVA SUMMIT, Leads ABRINT) são a hipótese a validar com o Marcos.",
  };

  // -------------------------------------------------------------------------
  // 3) A VARREDURA DE ID FUNCIONA?  ← a pergunta mais importante
  // -------------------------------------------------------------------------
  // Se getOpportunity devolver oportunidade ENCERRADA, dá para recuperar todo o
  // histórico de fechamentos varrendo o espaço de IDs. Se só devolver abertas (ou
  // 404 nas encerradas), o retroativo se limita ao que as datas de cada oportunidade
  // já entregam, e o histórico de fechados começa no dia em que o sync ligar.
  const idsAbertos = new Set(abertas.map((o) => Number(o.id)));
  const maxIdAberto = abertas.length ? Math.max(...idsAbertos) : 0;
  const alvos = escadaDeIds(maxIdAberto || 2000, SONDAS_VARREDURA, idsAbertos);

  const sondas: {
    id: number; encontrou: boolean; status: number | null; statusNome: string | null;
    fechadaEm: string | null; criadaEm: string | null; erro: string | null;
  }[] = [];
  for (const bloco of lotes(alvos, LOTE)) {
    const res = await Promise.all(bloco.map(async (id) => {
      const r = await chamarXmax<OportunidadeXmax>(c, "getOpportunity", "fila", { id });
      const o = r.dados;
      const achou = r.ok && !!o && Number(o.id) > 0;
      return {
        id,
        encontrou: achou,
        status: achou ? Number(o!.status ?? -1) : null,
        statusNome: achou ? nomeStatus(o!.status) : null,
        // ⚠️ pelos conversores: closedat é EPOCH, não ISO (ver lib/xmax.ts).
        fechadaEm: achou ? fechadaEm(o!) : null,
        criadaEm: achou ? criadaEm(o!) : null,
        naEtapaDesde: achou ? naEtapaDesde(o!) : null,
        erro: r.ok ? null : r.erro,
      };
    }));
    sondas.push(...res);
  }

  const encerradasAchadas = sondas.filter((s) => s.encontrou && (s.status === 1 || s.status === 2));
  relatorio["3_varreduraDeId"] = {
    perguntaChave: "getOpportunity devolve oportunidade JÁ ENCERRADA?",
    veredito: encerradasAchadas.length > 0
      ? "SIM — a varredura funciona. Dá para backfill de TODO o histórico de fechamentos."
      : "NÃO comprovado nesta amostra. Ver 'comoInterpretar' antes de concluir.",
    maiorIdAbertoObservado: maxIdAberto,
    idsSondados: alvos.length,
    encontrados: sondas.filter((s) => s.encontrou).length,
    encerradasEncontradas: encerradasAchadas.length,
    porStatus: [0, 1, 2].map((st) => ({
      status: st, nome: nomeStatus(st), qtd: sondas.filter((s) => s.status === st).length,
    })),
    comoInterpretar:
      "Amostra pequena e enviesada para IDs baixos. 'Não comprovado' pode significar "
      + "(a) IDs esparsos e a escada caiu em buracos, (b) as encerradas são mesmo "
      + "inacessíveis, ou (c) a base é nova e quase tudo ainda está aberto. Se vier "
      + "'NÃO', rodar de novo com outra faixa antes de descartar o backfill.",
    sondas,
  };

  // -------------------------------------------------------------------------
  // 4) O RISCO DO MRR VAZIO
  // -------------------------------------------------------------------------
  // closerecurrentvalue é OPCIONAL no winOpportunity. Se o comercial fecha sem
  // preencher, o número de manchete do Thiago vem ZERO — e o painel não teria como
  // saber que está faltando. Medir ANTES de prometer a tela.
  const ganhas = sondas.filter((s) => s.status === 1).map((s) => s.id);
  const detalheGanhas = await Promise.all(
    ganhas.slice(0, 12).map(async (id) => {
      const r = await chamarXmax<OportunidadeXmax>(c, "getOpportunity", "fila", { id });
      const o = r.dados;
      return {
        id,
        closerecurrentvalue: o?.closerecurrentvalue ?? null,
        emReais: centavosParaReais(o?.closerecurrentvalue),
        closevalue: o?.closevalue ?? null,
        recurrentvalue: o?.recurrentvalue ?? null,
      };
    })
  );
  const comMrr = detalheGanhas.filter((g) => Number(g.closerecurrentvalue) > 0).length;
  relatorio["4_riscoMrrVazio"] = {
    ganhasNaAmostra: detalheGanhas.length,
    comCloseRecurrentValuePreenchido: comMrr,
    semPreenchimento: detalheGanhas.length - comMrr,
    veredito: detalheGanhas.length === 0
      ? "sem ganhas na amostra — inconclusivo, repetir depois de resolver a varredura"
      : comMrr === detalheGanhas.length
        ? "todas preenchidas nesta amostra — bom sinal"
        : "HÁ GANHAS SEM MRR. A tela de MRR mostraria menos do que a realidade.",
    lembrete: "Valores são inteiros × 100. 10050 = R$ 100,50.",
    amostra: detalheGanhas,
  };

  // -------------------------------------------------------------------------
  // 5) ETIQUETAS — achar a "sem perfil"
  // -------------------------------------------------------------------------
  // getTags está sob a tag *Contatos* e diz "etiquetas de contatos". Pode ser outro
  // namespace do que o array `tags` da oportunidade. É isto que se testa aqui.
  const rTags = await chamarXmax<Etiqueta[]>(c, "getTags", "fila");
  const tags = Array.isArray(rTags.dados) ? rTags.dados : [];
  const idsTagsUsados = new Set<number>();
  for (const o of abertas) for (const t of o.tags ?? []) idsTagsUsados.add(Number(t));
  const idsConhecidos = new Set(tags.map((t) => Number(t.id)));
  const naoResolvidos = [...idsTagsUsados].filter((id) => !idsConhecidos.has(id));

  relatorio["5_etiquetas"] = rTags.ok
    ? {
        totalNoGetTags: tags.length,
        usadasNasOportunidades: idsTagsUsados.size,
        naoResolvidasPeloGetTags: naoResolvidos,
        mesmoNamespace: idsTagsUsados.size > 0 && naoResolvidos.length === 0,
        candidatasSemPerfil: tags.filter((t) => /sem\s*perfil|desqualific/i.test(String(t.name ?? ""))),
        lista: tags.map((t) => ({ id: t.id, nome: t.name ?? null })),
        nota: naoResolvidos.length
          ? "Há IDs de tag nas oportunidades que o getTags não conhece: namespaces diferentes."
          : "Os IDs batem — getTags serve para resolver as etiquetas de oportunidade.",
      }
    : { erro: rTags.erro, status: rTags.status };

  // -------------------------------------------------------------------------
  // 6) AMOSTRA CRUA — modelar sobre o que REALMENTE vem
  // -------------------------------------------------------------------------
  // Objeto inteiro, sem filtro nem renomeação: é para os olhos, não para o código.
  relatorio["6_amostraCrua"] = {
    nota: "Objetos como a API devolveu. Repare nos valores × 100 e nos campos de data.",
    oportunidades: abertas.slice(0, AMOSTRA_CRUA),
    exemploDeConversao: abertas.slice(0, AMOSTRA_CRUA).map((o) => ({
      id: o.id,
      recurrentvalueCru: o.recurrentvalue ?? null,
      recurrentvalueEmReais: centavosParaReais(o.recurrentvalue),
      origem: nomeOrigem(o.origin),
      status: nomeStatus(o.status),
      criadaEm: criadaEm(o),
      etapaDesde: naEtapaDesde(o),
      semOrigem: semOrigem(o.origin),
    })),
  };

  return NextResponse.json(relatorio);
}
