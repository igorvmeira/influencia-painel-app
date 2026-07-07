import { ContaMap, MetricaDiaria } from "./types";
import { brl, num } from "./format";

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

export function montarKpis(daily: MetricaDiaria[], contas: ContaMap[], periodoDias: number): Kpis {
  const N = periodoDias;
  const contasSet = new Set(contas.map((c) => c.accountId));
  const reg = daily.filter((m) => contasSet.has(m.accountId));
  const ancoraMs = ancoraDe(reg);
  const offset = (data: string) => Math.round((ancoraMs - Date.parse(data + "T00:00:00Z")) / DIA_MS);

  // Agrega por dia (chave = dias atrás da âncora) dentro das duas janelas.
  const porDia = new Map<number, { g: number; l: number; w: number }>();
  for (const m of reg) {
    const d = offset(m.data);
    if (d < 0 || d > 2 * N - 1) continue;
    const a = porDia.get(d) ?? { g: 0, l: 0, w: 0 };
    a.g += m.gasto; a.l += m.leadsForm; a.w += m.convWhats;
    porDia.set(d, a);
  }

  const soma = (ini: number, fim: number, sel: (a: { g: number; l: number; w: number }) => number) => {
    let s = 0;
    for (let d = ini; d <= fim; d++) { const a = porDia.get(d); if (a) s += sel(a); }
    return s;
  };
  // Série da janela ATUAL, mais antigo (d=N-1) → mais recente (d=0).
  const serie = (sel: (a: { g: number; l: number; w: number }) => number) => {
    const out: number[] = [];
    for (let k = 0; k < N; k++) { const a = porDia.get(N - 1 - k); out.push(a ? sel(a) : 0); }
    return out;
  };

  const gAtual = soma(0, N - 1, (a) => a.g), gAnt = soma(N, 2 * N - 1, (a) => a.g);
  const lAtual = soma(0, N - 1, (a) => a.l), lAnt = soma(N, 2 * N - 1, (a) => a.l);
  const wAtual = soma(0, N - 1, (a) => a.w), wAnt = soma(N, 2 * N - 1, (a) => a.w);
  const rAtual = lAtual + wAtual, rAnt = lAnt + wAnt; // resultados totais (base do CPL)
  const cplAtual = rAtual > 0 ? gAtual / rAtual : 0;
  const cplAnt = rAnt > 0 ? gAnt / rAnt : 0;

  return {
    gasto: { valor: gAtual, delta: deltaPct(gAtual, gAnt), serie: serie((a) => a.g) },
    leads: { valor: lAtual, delta: deltaPct(lAtual, lAnt), serie: serie((a) => a.l) },
    conversas: { valor: wAtual, delta: deltaPct(wAtual, wAnt), serie: serie((a) => a.w) },
    cpl: {
      valor: cplAtual,
      // CPL sobre o TOTAL (não muda a base). null quando não há CPL anterior.
      delta: cplAnt > 0 ? Math.round(((cplAtual - cplAnt) / cplAnt) * 100) : null,
      base: rAtual,
      serie: (() => {
        const out: number[] = [];
        for (let k = 0; k < N; k++) {
          const a = porDia.get(N - 1 - k);
          out.push(a && a.l + a.w > 0 ? a.g / (a.l + a.w) : 0);
        }
        return out;
      })(),
    },
  };
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

// ---- Formatação para os cards (compacto no card, valor completo no tooltip) ----
const fmtMoedaCompacta = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1,
});
const fmtNumCompacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

// Moeda: compacta a partir de R$ 10 mil (ex.: "R$ 42,3 mil"); abaixo disso, completa.
export const moedaCard = (n: number): string => (n >= 10000 ? fmtMoedaCompacta.format(n) : brl(n));
// Contagem: compacta a partir de 100 mil; abaixo disso, completa (ex.: "3.184").
export const numCard = (n: number): string => (n >= 100000 ? fmtNumCompacto.format(n) : num(n));
