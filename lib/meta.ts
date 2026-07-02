import { ContaMap, Criativo, MetricaDiaria } from "./types";

const API = process.env.META_API_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";

const FORM_LEAD_ACTIONS = ["lead", "leadgen_grouped", "onsite_conversion.lead_grouped"];
const WHATS_ACTIONS = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
];

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
    fields: "spend,actions",
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
      });
    }
    url = json?.paging?.next;
  }
  return out;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

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

  // 2) Miniaturas por ad_id (best-effort; falha aqui não derruba o ranking).
  const thumbs = new Map<string, string>();
  try {
    const pAds = new URLSearchParams({
      fields: "creative{thumbnail_url}",
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
      }
    }
  } catch (e) {
    console.error(e);
  }

  return rows.slice(0, 100).map((r) => {
    const gasto = Number(r.spend || 0);
    const conversas =
      somaActions(r.actions, FORM_LEAD_ACTIONS) + somaActions(r.actions, WHATS_ACTIONS);
    return {
      adId: r.ad_id,
      adName: r.ad_name || r.ad_id,
      gasto,
      conversas,
      cpl: conversas > 0 ? gasto / conversas : 0,
      thumbnailUrl: thumbs.get(r.ad_id) ?? null,
    };
  });
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
