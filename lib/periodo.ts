import { ContaMap, MetricaDiaria } from "./types";

// Cálculo da janela "mês corrente vs mês anterior" — mesmo intervalo de dias
// (1..D, onde D = dia do último dado). Puro; usado por kpis.ts, painel.ts e o
// Dashboard. Offsets são "dias atrás da âncora" (0 = dia mais recente).

const DIA_MS = 86400000;
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Faixas de offset consumidas por painel.ts/kpis.ts (janela atual vs anterior).
export interface EspecJanela {
  atualIni: number; atualFim: number;
  antIni: number; antFim: number;
  semanas: number;
  periodoLabel: string;
}

export interface JanelaMes {
  espec: EspecJanela;
  ancoraMs: number;
  D: number;                          // dias do mês corrente com dado (1..D)
  Dprev: number;                      // dias comparáveis no mês anterior
  offsetsAtual: number[];            // dia 1..D do mês corrente → offset (série)
  offsetsAnterior: (number | null)[]; // dia 1..D do mês anterior → offset (fantasma)
  labelAtual: string;                 // "Julho (1–7)"
  labelAnterior: string;              // "Junho (1–7)"
  parcial: boolean;                   // algum intervalo entra antes do início do histórico
}

// Âncora (dia mais recente) e menor data, dos registros das contas informadas.
function ancoraMin(daily: MetricaDiaria[], contas: ContaMap[]): { ancoraMs: number; minMs: number | null } {
  const set = new Set(contas.map((c) => c.accountId));
  let max = "", min = "";
  for (const m of daily) {
    if (!set.has(m.accountId)) continue;
    if (m.data > max) max = m.data;
    if (min === "" || m.data < min) min = m.data;
  }
  return {
    ancoraMs: max ? Date.parse(max + "T00:00:00Z") : Date.now(),
    minMs: min ? Date.parse(min + "T00:00:00Z") : null,
  };
}

// Monta a janela do mês corrente (1..D) vs mês anterior (1..D). null se não há dados.
export function janelaMes(daily: MetricaDiaria[], contas: ContaMap[]): JanelaMes | null {
  const { ancoraMs, minMs } = ancoraMin(daily, contas);
  if (minMs === null) return null;

  const A = new Date(ancoraMs);
  const y = A.getUTCFullYear();
  const m = A.getUTCMonth(); // 0..11
  const D = A.getUTCDate();

  const primeiroAtualMs = Date.UTC(y, m, 1);
  const primeiroAntMs = Date.UTC(y, m - 1, 1);           // JS resolve m-1 (jan → dez ano anterior)
  const diasNoAnterior = new Date(Date.UTC(y, m, 0)).getUTCDate(); // último dia do mês anterior
  const Dprev = Math.min(D, diasNoAnterior);

  const off = (ms: number) => Math.round((ancoraMs - ms) / DIA_MS);

  const offsetsAtual: number[] = [];
  const offsetsAnterior: (number | null)[] = [];
  for (let dia = 1; dia <= D; dia++) {
    offsetsAtual.push(off(Date.UTC(y, m, dia)));
    offsetsAnterior.push(dia <= Dprev ? off(Date.UTC(y, m - 1, dia)) : null);
  }

  const mAnt = ((m - 1) % 12 + 12) % 12;
  const labelAtual = `${MESES[m]} (1–${D})`;
  const labelAnterior = `${MESES[mAnt]} (1–${Dprev})`;

  const espec: EspecJanela = {
    atualIni: 0,
    atualFim: D - 1,
    antIni: off(Date.UTC(y, m - 1, Dprev)), // dia Dprev do mês anterior (mais recente)
    antFim: off(primeiroAntMs),             // dia 1 do mês anterior (mais antigo)
    semanas: Math.max(1, Math.round(D / 7)),
    periodoLabel: `${labelAtual} vs ${labelAnterior}`,
  };

  // Parcial: mês corrente OU anterior começa antes do primeiro dado (ex.: abril/02).
  const parcial = primeiroAtualMs < minMs || primeiroAntMs < minMs;

  return { espec, ancoraMs, D, Dprev, offsetsAtual, offsetsAnterior, labelAtual, labelAnterior, parcial };
}
