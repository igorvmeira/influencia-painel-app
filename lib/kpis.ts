import { ContaMap, MetricaDiaria } from "./types";
import { brl, num } from "./format";
import { JanelaMes } from "./periodo";

// Camada de APRESENTAÇÃO dos KPIs. Não recalcula métrica de negócio: usa os
// mesmos registros diários e a MESMA janela do painel (âncora + [0..N-1] atual
// vs [N..2N-1] anterior), então os números batem com os agregados atuais.

const DIA_MS = 86400000;

export interface KpiCard {
  valor: number;
  delta: number | null; // % vs período anterior; null = sem base suficiente (mostra "—")
  serie: number[];       // série diária do período (mais antigo → mais recente)
}
export interface Kpis {
  gasto: KpiCard;
  leads: KpiCard;        // leadsForm (formulário)
  conversas: KpiCard;    // convWhats (WhatsApp)
  cpl: KpiCard & { base: number }; // CPL total = gasto ÷ (leadsForm+convWhats); base = total de resultados
}

// Dia mais recente presente nos registros, em ms (cai para hoje se não houver).
function ancoraDe(registros: MetricaDiaria[]): number {
  let max = "";
  for (const m of registros) if (m.data > max) max = m.data;
  return max ? Date.parse(max + "T00:00:00Z") : Date.now();
}

// Δ% arredondado; null quando não há base anterior (nunca inventa número).
const deltaPct = (atual: number, anterior: number): number | null =>
  anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : null;

type Cel = { g: number; l: number; w: number };

// Agrega gasto/leads/whats por offset (dias atrás da âncora) até maxOff.
function agregarPorDia(reg: MetricaDiaria[], ancoraMs: number, maxOff: number): Map<number, Cel> {
  const porDia = new Map<number, Cel>();
  for (const m of reg) {
    const d = Math.round((ancoraMs - Date.parse(m.data + "T00:00:00Z")) / DIA_MS);
    if (d < 0 || d > maxOff) continue;
    const a = porDia.get(d) ?? { g: 0, l: 0, w: 0 };
    a.g += m.gasto; a.l += m.leadsForm; a.w += m.convWhats;
    porDia.set(d, a);
  }
  return porDia;
}

// Núcleo dos KPIs: janela atual [aIni..aFim] vs anterior [pIni..pFim] e os offsets
// da série (mais antigo → mais recente). Compartilhado pelos modos dia e mês.
function calcKpis(
  porDia: Map<number, Cel>,
  aIni: number, aFim: number, pIni: number, pFim: number,
  offsetsSerie: number[]
): Kpis {
  const soma = (ini: number, fim: number, sel: (a: Cel) => number) => {
    let s = 0;
    for (let d = ini; d <= fim; d++) { const a = porDia.get(d); if (a) s += sel(a); }
    return s;
  };
  const serie = (sel: (a: Cel) => number) => offsetsSerie.map((d) => { const a = porDia.get(d); return a ? sel(a) : 0; });

  const gA = soma(aIni, aFim, (a) => a.g), gP = soma(pIni, pFim, (a) => a.g);
  const lA = soma(aIni, aFim, (a) => a.l), lP = soma(pIni, pFim, (a) => a.l);
  const wA = soma(aIni, aFim, (a) => a.w), wP = soma(pIni, pFim, (a) => a.w);
  const rA = lA + wA, rP = lP + wP; // resultados totais (base do CPL)
  const cA = rA > 0 ? gA / rA : 0, cP = rP > 0 ? gP / rP : 0;

  return {
    gasto: { valor: gA, delta: deltaPct(gA, gP), serie: serie((a) => a.g) },
    leads: { valor: lA, delta: deltaPct(lA, lP), serie: serie((a) => a.l) },
    conversas: { valor: wA, delta: deltaPct(wA, wP), serie: serie((a) => a.w) },
    cpl: {
      valor: cA,
      // CPL sobre o TOTAL (não muda a base). null quando não há CPL anterior.
      delta: cP > 0 ? Math.round(((cA - cP) / cP) * 100) : null,
      base: rA,
      serie: offsetsSerie.map((d) => { const a = porDia.get(d); return a && a.l + a.w > 0 ? a.g / (a.l + a.w) : 0; }),
    },
  };
}

// Modo dia (7/15/30): janela atual [0..N-1] vs anterior [N..2N-1] — inalterado.
export function montarKpis(daily: MetricaDiaria[], contas: ContaMap[], periodoDias: number): Kpis {
  const N = periodoDias;
  const contasSet = new Set(contas.map((c) => c.accountId));
  const reg = daily.filter((m) => contasSet.has(m.accountId));
  const ancoraMs = ancoraDe(reg);
  const porDia = agregarPorDia(reg, ancoraMs, 2 * N - 1);
  const offsetsSerie = Array.from({ length: N }, (_, k) => N - 1 - k); // N-1 … 0
  return calcKpis(porDia, 0, N - 1, N, 2 * N - 1, offsetsSerie);
}

// Modo mês: mês corrente (1..D) vs mês anterior (1..D), faixas vindas de janelaMes.
export function montarKpisMes(daily: MetricaDiaria[], contas: ContaMap[], jm: JanelaMes): Kpis {
  const contasSet = new Set(contas.map((c) => c.accountId));
  const reg = daily.filter((m) => contasSet.has(m.accountId));
  const maxOff = Math.max(jm.espec.atualFim, jm.espec.antFim);
  const porDia = agregarPorDia(reg, jm.ancoraMs, maxOff);
  return calcKpis(porDia, jm.espec.atualIni, jm.espec.atualFim, jm.espec.antIni, jm.espec.antFim, jm.offsetsAtual);
}

// Ponto diário do gráfico-herói. Valores null = dia sem registro (lacuna honesta).
export interface PontoGrafico {
  data: string;              // rótulo "dd/mm"
  gasto: number | null;      // R$ (barras)
  leadsForm: number | null;  // formulário
  convWhats: number | null;  // WhatsApp
  total: number | null;      // leadsForm + convWhats (linha destaque)
  cpl: number | null;        // gasto / total
  temDados: boolean;
  ghost?: number | null;     // modo mês: leads totais do mesmo dia no mês anterior
}

// Série diária do período (mais antigo → mais recente), somando todas as contas por
// dia. Usa a MESMA janela/âncora dos KPIs, então os totais batem. Dias sem registro
// entram como null (o gráfico mostra buraco; connectNulls=false).
export function serieGrafico(daily: MetricaDiaria[], contas: ContaMap[], periodoDias: number): PontoGrafico[] {
  const N = periodoDias;
  const contasSet = new Set(contas.map((c) => c.accountId));
  const reg = daily.filter((m) => contasSet.has(m.accountId));
  const ancoraMs = ancoraDe(reg);
  const offset = (data: string) => Math.round((ancoraMs - Date.parse(data + "T00:00:00Z")) / DIA_MS);

  const porDia = new Map<number, { g: number; l: number; w: number }>();
  for (const m of reg) {
    const d = offset(m.data);
    if (d < 0 || d > N - 1) continue; // só a janela atual
    const a = porDia.get(d) ?? { g: 0, l: 0, w: 0 };
    a.g += m.gasto; a.l += m.leadsForm; a.w += m.convWhats;
    porDia.set(d, a);
  }

  const out: PontoGrafico[] = [];
  for (let k = 0; k < N; k++) {
    const d = N - 1 - k; // do mais antigo ao mais recente
    const dt = new Date(ancoraMs - d * DIA_MS);
    const rot = `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    const a = porDia.get(d);
    if (!a) {
      out.push({ data: rot, gasto: null, leadsForm: null, convWhats: null, total: null, cpl: null, temDados: false });
      continue;
    }
    const total = a.l + a.w;
    out.push({ data: rot, gasto: a.g, leadsForm: a.l, convWhats: a.w, total, cpl: total > 0 ? a.g / total : null, temDados: true });
  }
  return out;
}

// Modo mês: série diária do mês corrente (dias 1..D) + fantasma (leads totais do
// mesmo dia no mês anterior, alinhado por dia do mês). Lacunas honestas (null).
export function serieGraficoMes(daily: MetricaDiaria[], contas: ContaMap[], jm: JanelaMes): PontoGrafico[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const contasSet = new Set(contas.map((c) => c.accountId));
  const reg = daily.filter((m) => contasSet.has(m.accountId));
  const porDia = agregarPorDia(reg, jm.ancoraMs, jm.espec.antFim);

  const out: PontoGrafico[] = [];
  for (let i = 0; i < jm.D; i++) {
    const off = jm.offsetsAtual[i];
    const dt = new Date(jm.ancoraMs - off * DIA_MS);
    const rot = `${pad(dt.getUTCDate())}/${pad(dt.getUTCMonth() + 1)}`;
    const a = porDia.get(off);
    const gOff = jm.offsetsAnterior[i];
    const ga = gOff != null ? porDia.get(gOff) : undefined;
    const ghost = ga ? ga.l + ga.w : null;
    if (!a) {
      out.push({ data: rot, gasto: null, leadsForm: null, convWhats: null, total: null, cpl: null, temDados: false, ghost });
      continue;
    }
    const total = a.l + a.w;
    out.push({ data: rot, gasto: a.g, leadsForm: a.l, convWhats: a.w, total, cpl: total > 0 ? a.g / total : null, temDados: true, ghost });
  }
  return out;
}

// ---- Formatação para os cards (compacto no card, valor completo no tooltip) ----
const fmtMoedaCompacta = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1,
});
const fmtNumCompacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

// Moeda: compacta a partir de R$ 10 mil (ex.: "R$ 42,3 mil"); abaixo disso, completa.
export const moedaCard = (n: number): string => (n >= 10000 ? fmtMoedaCompacta.format(n) : brl(n));
// Contagem: compacta a partir de 100 mil; abaixo disso, completa (ex.: "3.184").
export const numCard = (n: number): string => (n >= 100000 ? fmtNumCompacto.format(n) : num(n));
