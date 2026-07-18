import { MetricaDiaria } from "./types";

// Item 3 — projeção read-otimizada: 1 doc por conta na coleção `metricasAgregadas`,
// com a série diária daquela conta. Derivado de `metricasDiarias` (fonte granular,
// intacta). Reduz a leitura do painel de ~4.6k docs para ~85 (um por conta).
export const COL_AGREGADAS = "metricasAgregadas";

// Dias retidos no doc agregado. O painel olha até ~83 dias atrás (offset de 56 na
// comparação "2 meses atrás", lib/painel.ts) — 95 dá margem, igual ao cutoff do getDadosDiarios.
export const RETENCAO_DIAS = 95;

const DIA_MS = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export interface DocAgregado {
  accountId: string;
  dias: MetricaDiaria[];
  atualizadoEm: string; // ISO
}

// Data-limite (YYYY-MM-DD) da retenção: dias anteriores são descartados do agregado.
export function cutoffRetencao(agora: number = Date.now()): string {
  return ymd(new Date(agora - RETENCAO_DIAS * DIA_MS));
}

// Mescla dias frescos sobre os antigos (upsert por data — fresco vence), descarta o
// que ficou fora da retenção e ordena por data ascendente.
export function mesclarDias(
  antigos: MetricaDiaria[],
  frescos: MetricaDiaria[],
  cutoff: string
): MetricaDiaria[] {
  const porData = new Map<string, MetricaDiaria>();
  for (const m of antigos) if (m?.data) porData.set(m.data, m);
  for (const m of frescos) if (m?.data) porData.set(m.data, m);
  return [...porData.values()]
    .filter((m) => m.data >= cutoff)
    .sort((a, b) => a.data.localeCompare(b.data));
}
