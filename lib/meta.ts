import { ContaMap, Criativo, GrupoDia, MetricaConjunto, MetricaDiaria } from "./types";

const API = process.env.META_API_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";

// ===========================================================================
// ⚠️ LIÇÃO DOS APELIDOS — LEIA ANTES DE ADICIONAR QUALQUER action_type AQUI
// ===========================================================================
//
// A Meta devolve o MESMO evento sob VÁRIOS nomes (apelidos da mesma família).
// Levantamento real da carteira em 20–26/07/2026:
//   • complete_registration ... 4 apelidos (complete_registration,
//     omni_complete_registration, offsite_conversion.fb_pixel_complete_registration,
//     offsite_complete_registration_add_20_s_calls) — todos com o MESMO valor (12).
//   • purchase ................ 8 apelidos, todos com o mesmo valor (1).
//   • add_to_cart ............. 6 apelidos, todos com o mesmo valor (15).
//
// SOMAR APELIDOS FOI EXATAMENTE O QUE CAUSOU O BUG que esta lista corrige: o painel
// contava cada conversão DUAS vezes (fator 2,07 na carteira), e o CPL exibido ficava
// pela METADE do real — justamente o número que a agência usa para avaliar gestor.
//
// REGRA PERMANENTE: escolha UM representante por família. Nunca some dois nomes que
// possam descrever o mesmo evento. Na dúvida, rode o levantamento de action_types
// e confira se dois candidatos têm valores idênticos/proporcionais — se tiverem,
// são apelidos, não eventos distintos. Confirme sempre contra a Business Manager.

// Formulário: "lead" é o AGREGADO canônico da Meta — já inclui os leads de formulário
// (onsite_conversion.lead_grouped) e os de pixel/site (offsite_conversion.fb_pixel_lead).
// Conferido na carteira: lead (306) = lead_grouped (273) + fb_pixel_lead (33).
// Por isso é UM item só: somar os filhos junto com o pai duplicaria a contagem.
const FORM_LEAD_ACTIONS = ["lead"];

// WhatsApp: conversas iniciadas. É o que a Business Manager exibe como "Resultados"
// (conferido: HELLO NET = 12, AURA = 108 — ambos batem com este action_type sozinho).
// NÃO somar onsite_conversion.total_messaging_connection: é um apelido/superset do
// mesmo evento (era ele o responsável pela contagem em dobro).
const WHATS_ACTIONS = ["onsite_conversion.messaging_conversation_started_7d"];

// LIMITAÇÃO CONHECIDA (trabalho separado, fora desta correção): a BM mostra como
// "Resultado" o evento que CADA CAMPANHA otimiza (adset.optimization_goal /
// promoted_object.custom_event_type). Contas com campanhas otimizadas para outros
// eventos — ex.: ISP4, com uma campanha em COMPLETE_REGISTRATION — vão divergir do
// total da BM mesmo com a regra acima correta. Modelar isso exige ler o objetivo por
// conjunto no sync; foi decidido tratar como etapa própria.

export interface ResultadoConta {
  accountId: string;
  gasto: number;
  leadsForm: number;
  convWhats: number;
}

interface MetaAction { action_type: string; value: string }

function somaActions(actions: MetaAction[] | undefined, tipos: string[]): number {
  if (!actions) return 0;
  return actions
    .filter((a) => tipos.includes(a.action_type))
    .reduce((acc, a) => acc + Number(a.value || 0), 0);
}

export interface LimiteMeta {
  spendCap: number;    // em R$ (convertido de centavos)
  amountSpent: number; // em R$ (convertido de centavos)
  isPrepay: boolean;
  currency: string | null;
}

// Consulta o nó da conta para o teto de gasto (spend_cap) e o gasto acumulado
// (amount_spent). A Marketing API devolve ambos em CENTAVOS → dividimos por 100.
// spend_cap = "0" significa "sem teto".
export async function buscarLimiteConta(accountId: string): Promise<LimiteMeta> {
  const params = new URLSearchParams({
    fields: "spend_cap,amount_spent,is_prepay_account,currency",
    access_token: TOKEN,
  });
  const url = `https://graph.facebook.com/${API}/${accountId}?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status} (limite) para ${accountId}: ${body}`);
  }
  const j = await res.json();
  return {
    spendCap: Number(j?.spend_cap || 0) / 100,
    amountSpent: Number(j?.amount_spent || 0) / 100,
    isPrepay: Boolean(j?.is_prepay_account),
    currency: j?.currency ?? null,
  };
}

export async function buscarInsights(
  accountId: string,
  since: string,
  until: string
): Promise<ResultadoConta> {
  const params = new URLSearchParams({
    fields: "spend,actions",
    time_range: JSON.stringify({ since, until }),
    level: "account",
    access_token: TOKEN,
  });
  const url = `https://graph.facebook.com/${API}/${accountId}/insights?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status} para ${accountId}: ${body}`);
  }
  const json = await res.json();
  const row = json?.data?.[0];
  return {
    accountId,
    gasto: Number(row?.spend || 0),
    leadsForm: somaActions(row?.actions, FORM_LEAD_ACTIONS),
    convWhats: somaActions(row?.actions, WHATS_ACTIONS),
  };
}

// Busca insights de uma conta quebrados POR DIA (time_increment=1) nos últimos
// `dias` dias, seguindo a paginação do "next" para trazer todos os dias.
export async function buscarDiario(accountId: string, dias = 30): Promise<MetricaDiaria[]> {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - (dias - 1));
  const params = new URLSearchParams({
    // reach/impressions adicionados na MESMA chamada (sem custo/chamada extra).
    fields: "spend,actions,reach,impressions",
    time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }),
    time_increment: "1",
    level: "account",
    limit: "500",
    access_token: TOKEN,
  });
  let url: string | undefined = `https://graph.facebook.com/${API}/${accountId}/insights?${params}`;
  const out: MetricaDiaria[] = [];

  while (url) {
    const res: Response = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Meta API ${res.status} (diário) para ${accountId}: ${await res.text()}`);
    }
    const json = await res.json();
    for (const r of (json?.data ?? []) as any[]) {
      const leadsForm = somaActions(r.actions, FORM_LEAD_ACTIONS);
      const convWhats = somaActions(r.actions, WHATS_ACTIONS);
      out.push({
        accountId,
        data: r.date_start,
        gasto: Number(r.spend || 0),
        leadsForm,
        convWhats,
        conversas: leadsForm + convWhats,
        // Ausente na resposta → null (nunca 0). "0" real é preservado como número.
        reach: r.reach != null ? Number(r.reach) : null,
        impressions: r.impressions != null ? Number(r.impressions) : null,
      });
    }
    url = json?.paging?.next;
  }
  return out;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * O MESMO diário, quebrado por CONJUNTO DE ANÚNCIOS (`level=adset`).
 *
 * ⚠️ É UMA CHAMADA A MAIS, não a mesma com outro parâmetro — e o motivo é o `reach`.
 * A ideia original era trocar `level=account` por `level=adset` e derivar a linha da
 * conta somando os conjuntos, a custo zero de requisição. Isso funciona para gasto,
 * formulário e WhatsApp (provado: 115 de 115 contas bateram exatamente), e NÃO
 * funciona para `reach`, que é métrica deduplicada — a mesma pessoa alcançada por
 * dois conjuntos contaria duas vezes. O `reach` já é somado por DIA e já fica ~69%
 * acima da BM; empilhar uma segunda dupla contagem degradaria em silêncio um campo
 * gravado há meses.
 *
 * Então `buscarDiario` (level=account) continua sendo a fonte da linha conta-dia,
 * intocada, e esta função ACRESCENTA a quebra. O ganho é maior que a chamada extra:
 * as duas fontes são INDEPENDENTES, e comparar uma com a outra vira conferência de
 * verdade a cada execução — em vez de uma soma comparada consigo mesma.
 *
 * ⚠️ SEM `reach`/`impressions` nos campos pedidos: ver MetricaConjunto em types.
 * ⚠️ A REGRA DOS APELIDOS VALE IGUAL AQUI — um representante por família. Conferido
 * em 16/08/2026: com os mesmos FORM_LEAD_ACTIONS/WHATS_ACTIONS, a soma dos conjuntos
 * bateu com o total da conta nas 115 contas legíveis. Se houvesse apelido duplicado
 * neste nível, a soma estouraria o total.
 */
export async function buscarDiarioPorConjunto(
  accountId: string,
  dias = 30
): Promise<MetricaConjunto[]> {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - (dias - 1));
  const params = new URLSearchParams({
    fields: [
      "adset_id", "adset_name", "campaign_id", "campaign_name",
      "objective", "optimization_goal", "spend", "actions",
    ].join(","),
    time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }),
    time_increment: "1",
    level: "adset",
    limit: "500",
    access_token: TOKEN,
  });
  let url: string | undefined = `https://graph.facebook.com/${API}/${accountId}/insights?${params}`;
  const out: MetricaConjunto[] = [];
  // ⚠️ AQUI A PAGINAÇÃO ACONTECE DE VERDADE, ao contrário do level=account. Uma
  // conta com 20 conjuntos e janela de 95 dias dá ~1.900 linhas = 4 páginas. É por
  // isso que MAX_NOVAS_POR_CHAMADA caiu para 1 no sync.
  let paginas = 0;
  while (url) {
    const res: Response = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Meta API ${res.status} (conjunto) para ${accountId}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json();
    for (const r of (json?.data ?? []) as any[]) {
      out.push({
        accountId,
        data: r.date_start,
        adsetId: String(r.adset_id ?? ""),
        adsetNome: r.adset_name ?? "",
        campanhaId: String(r.campaign_id ?? ""),
        campanhaNome: r.campaign_name ?? "",
        // Ausente vira rótulo explícito, nunca string vazia: "(sem grupo)" aparece na
        // tela como o que é, e string vazia viraria um grupo invisível.
        grupo: r.optimization_goal ?? "(sem grupo)",
        objetivoCampanha: r.objective ?? "(sem objetivo)",
        gasto: Number(r.spend || 0),
        leadsForm: somaActions(r.actions, FORM_LEAD_ACTIONS),
        convWhats: somaActions(r.actions, WHATS_ACTIONS),
      });
    }
    url = json?.paging?.next;
    if (++paginas > 30) break; // trava: 30 páginas × 500 = 15 mil linhas
  }
  return out;
}

/** Soma as linhas conjunto-dia em grupo-dia — o que entra no doc agregado. */
export function somarPorGrupoDia(linhas: MetricaConjunto[]): GrupoDia[] {
  const m = new Map<string, GrupoDia>();
  for (const l of linhas) {
    const k = `${l.data}|${l.grupo}`;
    const g = m.get(k) ?? { data: l.data, grupo: l.grupo, gasto: 0, leadsForm: 0, convWhats: 0 };
    g.gasto += l.gasto;
    g.leadsForm += l.leadsForm;
    g.convWhats += l.convWhats;
    m.set(k, g);
  }
  // Arredonda o gasto no fim, não a cada soma: somar valores já arredondados acumula
  // erro e a conferência de identidade passaria a falhar por centavos.
  for (const g of m.values()) g.gasto = Math.round(g.gasto * 100) / 100;
  return [...m.values()].sort((a, b) => a.data.localeCompare(b.data) || a.grupo.localeCompare(b.grupo));
}

/** Soma as linhas conjunto-dia por DIA — usado só pela conferência de identidade. */
export function somarPorDia(linhas: MetricaConjunto[]): Map<string, { gasto: number; leadsForm: number; convWhats: number }> {
  const m = new Map<string, { gasto: number; leadsForm: number; convWhats: number }>();
  for (const l of linhas) {
    const a = m.get(l.data) ?? { gasto: 0, leadsForm: 0, convWhats: 0 };
    a.gasto += l.gasto;
    a.leadsForm += l.leadsForm;
    a.convWhats += l.convWhats;
    m.set(l.data, a);
  }
  return m;
}

// Busca AO VIVO os criativos/anúncios de uma conta (level=ad) nos últimos `dias`,
// calculando gasto, conversas (form + WhatsApp) e CPL por anúncio. As miniaturas
// vêm de /ads?fields=creative{thumbnail_url} (best-effort). Limita a ~100 anúncios.
export async function buscarCriativos(accountId: string, dias: number): Promise<Criativo[]> {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - (dias - 1));
  const timeRange = JSON.stringify({ since: ymd(since), until: ymd(until) });

  // 1) Insights por anúncio.
  const pIns = new URLSearchParams({
    level: "ad",
    fields: "ad_id,ad_name,spend,actions",
    time_range: timeRange,
    limit: "100",
    access_token: TOKEN,
  });
  const urlIns = `https://graph.facebook.com/${API}/${accountId}/insights?${pIns}`;
  const resIns = await fetch(urlIns, { cache: "no-store" });
  if (!resIns.ok) {
    throw new Error(`Meta API ${resIns.status} (criativos) para ${accountId}: ${await resIns.text()}`);
  }
  const jsonIns = await resIns.json();
  const rows: any[] = jsonIns?.data ?? [];

  // 2) Miniaturas E SITUAÇÃO por ad_id (best-effort; falha aqui não derruba o ranking).
  //
  // ⚠️ `effective_status` PEGA CARONA — nenhuma requisição a mais. Esta chamada já
  // existia para as miniaturas; o status é só mais um campo no mesmo `fields`.
  //
  // ⚠️ EFETIVO, NÃO `status`. O `status` é do anúncio isolado: um anúncio ACTIVE
  // dentro de campanha pausada não roda, e apareceria como ativo. O efetivo devolve
  // CAMPAIGN_PAUSED/ADSET_PAUSED nesses casos — é ele que responde "está rodando?".
  //
  // ⚠️ E ISTO É CADASTRO, NÃO ENTREGA. Mesma lição do account_status na carteira:
  // ACTIVE diz que está habilitado, não que entregou. Aqui não distorce, porque o
  // criativo só entra na lista se teve gasto na janela (vem do insights) — mas o
  // rótulo na tela diz "ativo", nunca "entregando".
  const thumbs = new Map<string, string>();
  const statusPorAd = new Map<string, string>();
  try {
    const pAds = new URLSearchParams({
      fields: "creative{thumbnail_url},effective_status",
      limit: "100",
      access_token: TOKEN,
    });
    const urlAds = `https://graph.facebook.com/${API}/${accountId}/ads?${pAds}`;
    const resAds = await fetch(urlAds, { cache: "no-store" });
    if (resAds.ok) {
      const jsonAds = await resAds.json();
      for (const a of (jsonAds?.data ?? []) as any[]) {
        const t = a?.creative?.thumbnail_url;
        if (a?.id && t) thumbs.set(a.id, t);
        if (a?.id && a?.effective_status) statusPorAd.set(a.id, String(a.effective_status));
      }
    }
  } catch (e) {
    console.error(e);
  }

  return rows.slice(0, 100).map((r) => {
    const gasto = Number(r.spend || 0);
    const conversas =
      somaActions(r.actions, FORM_LEAD_ACTIONS) + somaActions(r.actions, WHATS_ACTIONS);
    const bruto = statusPorAd.get(r.ad_id) ?? null;
    return {
      adId: r.ad_id,
      adName: r.ad_name || r.ad_id,
      gasto,
      conversas,
      cpl: conversas > 0 ? gasto / conversas : 0,
      thumbnailUrl: thumbs.get(r.ad_id) ?? null,
      situacao: situacaoDoAnuncio(bruto),
      statusMeta: bruto,
    };
  });
}

/**
 * `effective_status` cru → ativo / pausado / desconhecido.
 *
 * ⚠️ SÓ "ACTIVE" É ATIVO; todo o resto que a Meta souber dizer é pausado —
 * PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, ARCHIVED, DELETED, DISAPPROVED,
 * PENDING_REVIEW. A lista de valores possíveis cresce com a plataforma, então a
 * régua é por igualdade com ACTIVE, nunca por lista de negados: valor novo que
 * ninguém previu cai em "pausado", que é o lado seguro para o ranking —
 * anúncio em revisão não está entregando.
 *
 * ⚠️ AUSENTE VIRA null, NUNCA "pausado". Sem resposta da chamada de /ads (falha,
 * ou o anúncio ficou fora dos 100), não sabemos — e chutar pausa esconderia
 * criativo que está rodando.
 */
export function situacaoDoAnuncio(bruto: string | null | undefined): "ativo" | "pausado" | null {
  if (!bruto) return null;
  return String(bruto).toUpperCase() === "ACTIVE" ? "ativo" : "pausado";
}

/**
 * Criativos de um PERÍODO EXPLÍCITO (mês fechado), SEM miniaturas.
 *
 * Separado de buscarCriativos (que é relativo a hoje e já traz thumbnail) por dois
 * motivos ligados ao cache permanente da Análise de Gestores:
 *
 * 1. O período precisa ser explícito — mês fechado, não "últimos N dias".
 * 2. As miniaturas NÃO entram aqui de propósito. As URLs do Meta são assinadas e
 *    expiram; guardá-las num doc que nunca é reescrito daria imagem quebrada meses
 *    depois, num relatório de bonificação. Elas são buscadas à parte, sob demanda.
 *
 * A API retroage até 37 meses (erro #3018 além disso) — mais que suficiente para
 * uso mensal, e é justamente por esse limite que o resultado vale ser guardado:
 * passado esse prazo, o dado não é mais recuperável.
 */
export async function buscarCriativosPeriodo(
  accountId: string,
  since: string,
  until: string
): Promise<Criativo[]> {
  const p = new URLSearchParams({
    level: "ad",
    fields: "ad_id,ad_name,spend,actions",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
    access_token: TOKEN,
  });
  const res = await fetch(`https://graph.facebook.com/${API}/${accountId}/insights?${p}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Meta API ${res.status} (criativos do mês) para ${accountId}: ${(await res.text()).slice(0, 200)}`);
  }
  const rows: any[] = (await res.json())?.data ?? [];
  return rows
    .map((r) => {
      const gasto = Number(r.spend || 0);
      const conversas =
        somaActions(r.actions, FORM_LEAD_ACTIONS) + somaActions(r.actions, WHATS_ACTIONS);
      return {
        adId: r.ad_id,
        adName: r.ad_name || r.ad_id,
        gasto: Math.round(gasto * 100) / 100,
        conversas,
        cpl: conversas > 0 ? Math.round((gasto / conversas) * 100) / 100 : 0,
        thumbnailUrl: null, // nunca persistido — ver comentário acima
      };
    })
    .filter((c) => c.gasto > 0);
}

/**
 * Miniaturas por adId — BEST-EFFORT e sempre AO VIVO.
 * Falha aqui nunca derruba o bloco: anúncio excluído depois do mês simplesmente
 * não tem thumbnail, e a tela cai no ícone de reserva.
 */
export async function buscarThumbnails(accountId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const p = new URLSearchParams({ fields: "creative{thumbnail_url}", limit: "200", access_token: TOKEN });
    const res = await fetch(`https://graph.facebook.com/${API}/${accountId}/ads?${p}`, { cache: "no-store" });
    if (!res.ok) return out;
    for (const a of ((await res.json())?.data ?? []) as any[]) {
      const t = a?.creative?.thumbnail_url;
      if (a?.id && t) out[a.id] = t;
    }
  } catch {
    // silencioso de propósito: miniatura é enfeite, não pode quebrar o relatório
  }
  return out;
}

export async function buscarTodas(
  contas: ContaMap[],
  since: string,
  until: string
): Promise<Map<string, ResultadoConta>> {
  const out = new Map<string, ResultadoConta>();
  for (const c of contas) {
    try {
      out.set(c.accountId, await buscarInsights(c.accountId, since, until));
    } catch (e) {
      console.error(e);
      out.set(c.accountId, { accountId: c.accountId, gasto: 0, leadsForm: 0, convWhats: 0 });
    }
  }
  return out;
}

export interface BucketSemana {
  inicio: string;
  gasto: number;
  leadsForm: number;
  convWhats: number;
}

// Busca insights de uma conta em buckets semanais (time_increment=7), em ordem cronológica.
export async function buscarSemanal(
  accountId: string,
  since: string,
  until: string
): Promise<BucketSemana[]> {
  const params = new URLSearchParams({
    fields: "spend,actions",
    time_range: JSON.stringify({ since, until }),
    time_increment: "7",
    level: "account",
    access_token: TOKEN,
  });
  const url = `https://graph.facebook.com/${API}/${accountId}/insights?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Meta API ${res.status} (semanal) para ${accountId}: ${await res.text()}`);
  const json = await res.json();
  const rows: any[] = json?.data ?? [];
  return rows.map((r) => ({
    inicio: r.date_start,
    gasto: Number(r.spend || 0),
    leadsForm: somaActions(r.actions, FORM_LEAD_ACTIONS),
    convWhats: somaActions(r.actions, WHATS_ACTIONS),
  }));
}

// Soma os buckets semanais de várias contas por posição (Sem 1, Sem 2, ...).
export async function buscarSemanalGestor(
  accountIds: string[],
  since: string,
  until: string
): Promise<{ gasto: number; conversas: number }[]> {
  const porConta: BucketSemana[][] = [];
  for (const id of accountIds) {
    try {
      porConta.push(await buscarSemanal(id, since, until));
    } catch (e) {
      console.error(e);
      porConta.push([]);
    }
  }
  const maxSemanas = Math.max(0, ...porConta.map((b) => b.length));
  const out: { gasto: number; conversas: number }[] = [];
  for (let i = 0; i < maxSemanas; i++) {
    let gasto = 0, conversas = 0;
    for (const buckets of porConta) {
      const b = buckets[i];
      if (b) { gasto += b.gasto; conversas += b.leadsForm + b.convWhats; }
    }
    out.push({ gasto, conversas });
  }
  return out;
}
