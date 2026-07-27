import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { checarCronSecret } from "@/lib/cronAuth";
import { ContaMap, MetricaDiaria } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// ===========================================================================
// TODO REMOVER — rota TEMPORÁRIA de uso único (correção da contagem dobrada).
// ===========================================================================
//
// CONTEXTO: o sync soma DOIS action_type que a Meta devolve para o MESMO evento,
// contando cada conversão duas vezes (ver lib/meta.ts):
//   convWhats  = messaging_conversation_started_7d + total_messaging_connection
//   leadsForm  = lead + leadgen_grouped + onsite_conversion.lead_grouped
// Medição de 20–26/07: a carteira mostrava 10.566 conversões contra 5.115 reais
// (fator 2,07) — ou seja, o CPL exibido estava pela METADE do verdadeiro.
//
// PRÉVIA POR PADRÃO: sem &aplicar=1 esta rota NÃO grava nada — só compara o que está
// no Firestore com o que a API do Meta devolve e reporta "de X para Y" por conta/dia.
// Com &aplicar=1 ela regrava metricasDiarias (merge, mesmo docId do sync: idempotente
// e não destrutivo). O agregado NÃO é tocado aqui — depois de aplicar, rode
// /api/rebuild-agregadas (reconstrói do granular) e /api/diff-agregadas (prova paridade).
//
// A REGRA A usa apenas o action_type canônico de cada família — é a que bate com a BM
// nos casos conferidos (HELLO NET 12, AURA 108).
//
// LIMITAÇÃO CONHECIDA (fora desta correção, trabalho separado): a BM mostra como
// "Resultado" o evento que CADA campanha otimiza. Contas com campanhas otimizadas para
// outros eventos (ex.: ISP4, com uma campanha em COMPLETE_REGISTRATION) seguem
// divergindo do total da BM mesmo depois desta correção. Ver comentário em lib/meta.ts.

// Canônicos da REGRA A (o que se pretende passar a usar).
const WHATS_CANONICO = "onsite_conversion.messaging_conversation_started_7d";
const LEAD_CANONICO = "lead";
// Os demais, hoje somados indevidamente (mantidos aqui só para o comparativo).
const WHATS_EXTRA = "onsite_conversion.total_messaging_connection";
const LEAD_GROUPED = "onsite_conversion.lead_grouped";
const LEADGEN_GROUPED = "leadgen_grouped";

// Contas de perfil DIVERGENTE (onde as regras candidatas dão números diferentes).
// A agência confere estes três na BM e a regra fecha sem ambiguidade.
// Join por accountId, nunca por nome (nomes de cliente se repetem).
const CONTAS_COMPARATIVO = [
  "act_1145473760827134", // TAC NET       — lead=13, lead_grouped=0
  "act_1841331226592258", // ISP4          — lead=36, lead_grouped=16
  "act_1427561475356780", // PRO3 ACADEMIA — lead=60, lead_grouped=60
];

// Janela padrão do comparativo: período FECHADO usado na investigação.
const COMP_SINCE = "2026-07-20";
const COMP_UNTIL = "2026-07-26";

const LIMITE_PADRAO = 20; // contas por chamada (cabe no tempo da função)
const LOTE = 450;         // abaixo do limite de 500 operações por batch do Firestore

const API = process.env.META_API_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";

interface MetaAction { action_type: string; value: string }
const valorDe = (acts: MetaAction[] | undefined, tipo: string): number =>
  Number((acts ?? []).find((a) => a.action_type === tipo)?.value ?? 0);

// GET de insights (leitura pura na API do Meta).
async function buscarInsights(accountId: string, since: string, until: string, porDia: boolean) {
  const params = new URLSearchParams({
    fields: "spend,actions",
    time_range: JSON.stringify({ since, until }),
    level: "account",
    limit: "500",
    access_token: TOKEN,
  });
  if (porDia) params.set("time_increment", "1");
  const res = await fetch(`https://graph.facebook.com/${API}/${accountId}/insights?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Meta API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json())?.data ?? []) as { date_start?: string; spend?: string; actions?: MetaAction[] }[];
}

export async function GET(req: Request) {
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  const url = new URL(req.url);
  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });
  if (!TOKEN) return NextResponse.json({ erro: "META_ACCESS_TOKEN não configurado" }, { status: 500 });

  // PRÉVIA é o padrão. Só grava com &aplicar=1 explícito (regra da casa).
  const aplicar = url.searchParams.get("aplicar") === "1";

  const since = url.searchParams.get("since") || COMP_SINCE;
  const until = url.searchParams.get("until") || COMP_UNTIL;

  const contasSnap = await db.collection("contas").get();
  // Mesma ordenação estável do sync (por accountId) — offset consistente entre chamadas.
  const todas: ContaMap[] = contasSnap.docs
    .map((d) => d.data() as ContaMap)
    .filter((c) => !!c.accountId)
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
  // Pausadas ficam fora de tudo no painel — não faz sentido reportá-las aqui.
  const contas = todas.filter((c) => !c.pausado);

  const total = contas.length;
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limiteParam = Number(url.searchParams.get("limite"));
  const limite = Number.isFinite(limiteParam) && limiteParam > 0 ? limiteParam : LIMITE_PADRAO;
  const bloco = contas.slice(offset, offset + limite);

  // ---- Diagnóstico por conta: o que está GRAVADO x o que a REGRA A produziria ----
  // Compara contra metricasAgregadas (1 doc por conta = leitura barata). O granular
  // metricasDiarias tem exatamente os mesmos valores — é a origem do agregado.
  async function analisar(c: ContaMap) {
    const linhas = await buscarInsights(c.accountId, since, until, true);

    // Compara contra metricasDiarias (GRANULAR), não contra o agregado. Motivo: o
    // agregado só guarda a janela de retenção (~95 dias), então os dias mais antigos
    // (02–22/04) ficariam de fora da correção e permaneceriam DOBRADOS para sempre —
    // justamente no granular, que é a fonte de auditoria e a base da reconstrução.
    // Só igualdade em accountId (sem índice composto) + filtro de data em memória,
    // mesmo padrão da /api/rebuild-agregadas.
    const snap = await db!.collection("metricasDiarias").where("accountId", "==", c.accountId).get();
    const gravados = new Map<string, MetricaDiaria>();
    for (const d of snap.docs) {
      const m = d.data() as MetricaDiaria;
      if (m?.data && m.data >= since && m.data <= until) gravados.set(m.data, m);
    }

    const dias: {
      data: string;
      convWhatsDe: number; convWhatsPara: number;
      leadsFormDe: number; leadsFormPara: number;
      conversasDe: number; conversasPara: number;
    }[] = [];
    let somaDe = 0, somaPara = 0, gasto = 0;
    // Registros corrigidos, prontos para gravar (só usados no modo aplicar).
    const corrigidos: MetricaDiaria[] = [];
    // Fator por mês (para provar que a duplicação é uniforme e não há fronteira de data).
    const porMes: Record<string, { de: number; para: number }> = {};
    // Dias que a API tem mas que NÃO existem no granular: ficam INTOCADOS de propósito.
    // Esta rota CORRIGE o que existe; ela não cria registro novo (não é backfill de lacuna).
    let semRegistro = 0;

    for (const r of linhas) {
      const data = r.date_start ?? "";
      const g = gravados.get(data);
      const wCanon = valorDe(r.actions, WHATS_CANONICO);
      const lCanon = valorDe(r.actions, LEAD_CANONICO);
      const de = g ? Number(g.leadsForm ?? 0) + Number(g.convWhats ?? 0) : 0;
      const para = wCanon + lCanon;
      gasto += Number(r.spend ?? 0);
      if (!g) { semRegistro++; continue; } // não inventa registro
      somaDe += de; somaPara += para;
      const mes = data.slice(0, 7);
      const pm = porMes[mes] ?? { de: 0, para: 0 };
      pm.de += de; pm.para += para;
      porMes[mes] = pm;
      // Só grava (e só reporta) o dia que MUDA: assim o total aplicado bate exatamente
      // com o previsto na prévia, e dia já correto não gera escrita à toa.
      // Preserva reach/impressions já gravados (não são afetados por esta correção;
      // ausente continua null, nunca 0 — regra da casa).
      if (de !== para) {
        corrigidos.push({
          ...g,
          accountId: c.accountId,
          data,
          leadsForm: lCanon,
          convWhats: wCanon,
          conversas: lCanon + wCanon,
        });
        dias.push({
          data,
          convWhatsDe: Number(g.convWhats ?? 0), convWhatsPara: wCanon,
          leadsFormDe: Number(g.leadsForm ?? 0), leadsFormPara: lCanon,
          conversasDe: de, conversasPara: para,
        });
      }
    }

    // GRAVAÇÃO (só com &aplicar=1): merge nos MESMOS docId do sync
    // (`${accountId}_${data}`) — idempotente e não destrutivo. O agregado é
    // reconstruído depois pela /api/rebuild-agregadas, a partir deste granular.
    let gravados_ = 0;
    if (aplicar && corrigidos.length) {
      const col = db!.collection("metricasDiarias");
      for (let i = 0; i < corrigidos.length; i += LOTE) {
        const batch = db!.batch();
        for (const m of corrigidos.slice(i, i + LOTE)) {
          batch.set(col.doc(`${m.accountId}_${m.data}`), m, { merge: true });
        }
        await batch.commit();
        gravados_ += Math.min(LOTE, corrigidos.length - i);
      }
    }

    return {
      gravados: gravados_,
      porMes,
      semRegistro,
      accountId: c.accountId,
      cliente: c.cliente ?? "",
      gestor: c.gestor ?? "",
      gasto: Math.round(gasto * 100) / 100,
      conversasDe: somaDe,
      conversasPara: somaPara,
      removidas: somaDe - somaPara,
      fator: somaPara > 0 ? Math.round((somaDe / somaPara) * 1000) / 1000 : null,
      cplDe: somaDe > 0 ? Math.round((gasto / somaDe) * 100) / 100 : null,
      cplPara: somaPara > 0 ? Math.round((gasto / somaPara) * 100) / 100 : null,
      diasQueMudam: dias.length,
      dias,
    };
  }

  const resultados = await Promise.allSettled(bloco.map(analisar));
  const contasAnalisadas: Awaited<ReturnType<typeof analisar>>[] = [];
  const erros: { accountId: string; erro: string }[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") contasAnalisadas.push(r.value);
    else erros.push({ accountId: bloco[i].accountId, erro: String(r.reason).slice(0, 200) });
  });

  // ---- Comparativo das REGRAS CANDIDATAS (só no primeiro bloco) ----
  // Para as contas de perfil divergente: o que cada regra produziria no período.
  // A agência abre a BM nessas contas e vê qual coluna bate.
  let comparativoRegras: unknown = null;
  if (offset === 0) {
    const mapaNome = new Map(todas.map((c) => [c.accountId, c.cliente ?? ""]));
    const linhas = await Promise.allSettled(
      CONTAS_COMPARATIVO.map(async (accountId) => {
        const [row] = await buscarInsights(accountId, COMP_SINCE, COMP_UNTIL, false);
        const acts = row?.actions;
        const w1 = valorDe(acts, WHATS_CANONICO);
        const w2 = valorDe(acts, WHATS_EXTRA);
        const lead = valorDe(acts, LEAD_CANONICO);
        const leadGrouped = valorDe(acts, LEAD_GROUPED);
        const leadgenGrouped = valorDe(acts, LEADGEN_GROUPED);
        return {
          accountId,
          cliente: mapaNome.get(accountId) ?? "",
          periodo: `${COMP_SINCE} a ${COMP_UNTIL}`,
          gasto: Math.round(Number(row?.spend ?? 0) * 100) / 100,
          valoresCrus: {
            "messaging_conversation_started_7d": w1,
            "total_messaging_connection": w2,
            "lead": lead,
            "onsite_conversion.lead_grouped": leadGrouped,
            "leadgen_grouped": leadgenGrouped,
          },
          // Leads sob cada regra candidata (o que a agência confere na BM).
          leadsPorRegra: {
            "A_so_lead": lead,
            "B_lead_mais_lead_grouped": lead + leadGrouped,
            "C_so_leadgen_grouped": leadgenGrouped,
          },
          whatsPorRegra: {
            "A_so_conversation_started": w1,
            "B_maior_dos_dois": Math.max(w1, w2),
            "HOJE_soma_dos_dois": w1 + w2,
          },
          // Total do período (WhatsApp + leads) sob cada combinação.
          totalPorRegra: {
            "HOJE_no_painel": w1 + w2 + lead + leadGrouped + leadgenGrouped,
            "REGRA_A_canonicos": w1 + lead,
            "REGRA_B_maiores": Math.max(w1, w2) + Math.max(lead, leadGrouped, leadgenGrouped),
            "REGRA_C_leadgen": w1 + leadgenGrouped,
          },
          cplPorRegra: {
            "HOJE_no_painel": null as number | null,
            "REGRA_A_canonicos": null as number | null,
          },
        };
      })
    );
    const ok = linhas.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<any>).value);
    for (const l of ok) {
      const hoje = l.totalPorRegra["HOJE_no_painel"], a = l.totalPorRegra["REGRA_A_canonicos"];
      l.cplPorRegra["HOJE_no_painel"] = hoje > 0 ? Math.round((l.gasto / hoje) * 100) / 100 : null;
      l.cplPorRegra["REGRA_A_canonicos"] = a > 0 ? Math.round((l.gasto / a) * 100) / 100 : null;
    }
    comparativoRegras = {
      instrucao: "Abra a Business Manager nestas contas, no período indicado, e veja qual "
        + "linha de 'leadsPorRegra'/'whatsPorRegra' bate com os Resultados exibidos. "
        + "Nos casos já conferidos (HELLO NET 12, AURA 108) a REGRA A bateu.",
      contas: ok,
      falhas: linhas.filter((r) => r.status === "rejected").length,
    };
  }

  // ---- Resumo do bloco ----
  const mudam = contasAnalisadas.filter((c) => c.conversasDe !== c.conversasPara);
  const somaDe = contasAnalisadas.reduce((s, c) => s + c.conversasDe, 0);
  const somaPara = contasAnalisadas.reduce((s, c) => s + c.conversasPara, 0);
  const gastoBloco = contasAnalisadas.reduce((s, c) => s + c.gasto, 0);

  const fim = offset + limite;
  const proximoOffset = fim < total ? fim : null;

  const gravadasNoBloco = contasAnalisadas.reduce((s, c) => s + c.gravados, 0);

  // Consolida o fator por mês do bloco (some entre blocos para ver a carteira toda).
  const mesesDoBloco: Record<string, { de: number; para: number; fator: number | null }> = {};
  for (const c of contasAnalisadas) {
    for (const [mes, v] of Object.entries(c.porMes)) {
      const m = mesesDoBloco[mes] ?? { de: 0, para: 0, fator: null };
      m.de += v.de; m.para += v.para;
      mesesDoBloco[mes] = m;
    }
  }
  for (const m of Object.values(mesesDoBloco)) {
    m.fator = m.para > 0 ? Math.round((m.de / m.para) * 1000) / 1000 : null;
  }
  const semRegistroBloco = contasAnalisadas.reduce((s, c) => s + c.semRegistro, 0);

  return NextResponse.json({
    ok: true,
    modo: aplicar
      ? "APLICAR — metricasDiarias regravada (merge). Rode /api/rebuild-agregadas depois."
      : "PREVIA — SOMENTE LEITURA (nada foi gravado)",
    ...(aplicar
      ? { proximoPasso: "Ao terminar todos os blocos: /api/rebuild-agregadas e depois /api/diff-agregadas" }
      : {}),
    docsGravados: aplicar ? gravadasNoBloco : 0,
    regraAvaliada: { whatsApp: WHATS_CANONICO, formulario: LEAD_CANONICO },
    periodo: { since, until },
    totalContasAtivas: total,
    offset,
    limite,
    contasNoBloco: bloco.length,
    proximoOffset,
    resumoDoBloco: {
      contasQueMudam: mudam.length,
      contasInalteradas: contasAnalisadas.length - mudam.length,
      conversasDe: somaDe,
      conversasPara: somaPara,
      removidas: somaDe - somaPara,
      fator: somaPara > 0 ? Math.round((somaDe / somaPara) * 1000) / 1000 : null,
      gasto: Math.round(gastoBloco * 100) / 100,
      cplDe: somaDe > 0 ? Math.round((gastoBloco / somaDe) * 100) / 100 : null,
      cplPara: somaPara > 0 ? Math.round((gastoBloco / somaPara) * 100) / 100 : null,
      docsARegravar: contasAnalisadas.reduce((s, c) => s + c.diasQueMudam, 0),
      // Dias com dado na API e SEM registro no granular: nunca criados (conservador).
      diasSemRegistroIntocados: semRegistroBloco,
    },
    fatorPorMes: mesesDoBloco,
    comparativoRegras,
    contas: contasAnalisadas.sort((a, b) => b.removidas - a.removidas),
    erros,
  });
}
