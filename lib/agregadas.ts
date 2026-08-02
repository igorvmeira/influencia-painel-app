import { MetricaDiaria } from "./types";

// Item 3 — projeção read-otimizada: 1 doc por conta na coleção `metricasAgregadas`,
// com a série diária daquela conta. Derivado de `metricasDiarias` (fonte granular,
// intacta). Reduz a leitura do painel de ~4.6k docs para ~85 (um por conta).
export const COL_AGREGADAS = "metricasAgregadas";

// Dias retidos no doc agregado. O painel olha até ~83 dias atrás (offset de 56 na
// comparação "2 meses atrás", lib/painel.ts) — 95 dá margem, igual ao cutoff do getDadosDiarios.
export const RETENCAO_DIAS = 95;

// ⚠️ PISO DA RETENÇÃO — NÃO BAIXAR DE 91.
// A tela "Análise de Gestores" compara MÊS FECHADO vs MÊS FECHADO, então a janela
// precisa alcançar o dia 1 do mês RETRASADO. Pior caso do calendário (último dia de
// um mês, com dois meses de 31 dias antes): (31-1) + 31 + 30 = 91 dias. Acontece em
// jan, mai, jul, ago, set, out e dez — 7 meses do ano.
// Com RETENCAO_DIAS = 95 a folga é de apenas 4 dias. Baixar para 90 quebraria a
// comparação em silêncio: a tela mostraria um mês retrasado truncado.
// Se precisar mesmo reduzir, ajuste antes a tela (lib/periodo.ts: mesesDisponiveis
// já avisa quando a janela não cobre, mas a comparação simplesmente deixa de existir).
export const RETENCAO_MINIMA = 91;
if (RETENCAO_DIAS < RETENCAO_MINIMA) {
  // Lançar no carregamento do módulo é proposital: quebra o `next build`, que é o
  // lugar mais barato para descobrir. Comentário protege quem lê; isto protege quem não lê.
  throw new Error(
    `RETENCAO_DIAS=${RETENCAO_DIAS} é menor que o piso ${RETENCAO_MINIMA}. ` +
    "A comparação mês-fechado vs mês-fechado da Análise de Gestores exige alcançar " +
    "o dia 1 do mês retrasado (pior caso do calendário = 91 dias). Ver lib/agregadas.ts."
  );
}

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
