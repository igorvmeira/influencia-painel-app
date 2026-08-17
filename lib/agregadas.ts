import { GrupoDia, MetricaDiaria } from "./types";

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

/** Granularidade nova: um doc por conjunto-dia. Coleção PRÓPRIA — ver MetricaConjunto. */
export const COL_CONJUNTOS = "metricasConjuntos";

export interface DocAgregado {
  accountId: string;
  dias: MetricaDiaria[];
  atualizadoEm: string; // ISO
  /**
   * ⚠️ CAMPO NOVO, PARALELO — `dias` não é tocado.
   *
   * A quebra por grupo de otimização entra como array próprio em vez de virar uma
   * chave dentro de cada elemento de `dias`. O motivo é o requisito do dono: os
   * campos conta-dia ficam byte a byte iguais, para o Dashboard, a /gestores e a
   * Início continuarem lendo exatamente o que leem hoje, sem migração de leitura.
   *
   * Tamanho medido em 16/08/2026: pior caso real (PLIQ, 3 grupos num dia) dá ~34,5 kB
   * em 95 dias, contra o limite de 1.024 kB por documento. 30x de folga.
   *
   * ⚠️ COBRE UM DIA MENOS QUE `dias`, de propósito. O dia mais recente é parcial e as
   * duas fontes (level=account e level=adset) são amostradas em instantes diferentes:
   * medido em 17/08/2026, a PLIQ voltou 0 formulários numa e 2 na outra. Gravar esse
   * dia deixaria a quebra contradizendo o próprio total no banco. Ver `porGrupoAte`.
   */
  porGrupo?: GrupoDia[];
  /**
   * Último dia coberto por `porGrupo` — quem consome a quebra ROTULA a janela por
   * este campo. Assumir que ela cobre o mesmo período de `dias` produziria uma
   * comparação entre janelas diferentes, que é o erro que a casa já pagou uma vez
   * ("nunca compare dois números em frames de data diferentes").
   */
  porGrupoAte?: string | null;
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

/**
 * O mesmo merge, para a quebra por grupo — a chave é o PAR {data, grupo}.
 *
 * ⚠️ MERGE POR PAR, e não por data: um dia tem várias linhas (uma por grupo), e
 * mesclar só por data faria o último grupo do dia apagar os outros. A janela fresca
 * substitui o dia INTEIRO, porque um grupo pode ter deixado de existir — e nesse caso
 * a linha antiga dele precisa sair, não sobreviver por não ter sido sobrescrita.
 *
 * ⚠️⚠️ `excluirDesde` EXISTE POR UM BUG QUE ESTE MERGE CRIOU. O sync não grava o dia
 * mais recente na quebra (ele é parcial e não é conferido — ver `conferir` no
 * sync-meta). Só que "não vem nos frescos" aqui significava "preserva o antigo": a
 * linha daquele dia, escrita antes da regra existir, ficava IMORTAL — nunca mais
 * reescrita e contradizendo o total para sempre.
 *
 * Medido: a PLIQ ficou com 17/08 dizendo 2 formulários na quebra e 0 no total.
 *
 * A regra que fecha: o dado FRESCO define o teto. Linha antiga em `data >=
 * excluirDesde` é resíduo de uma execução anterior e SAI. Assim vale o invariante
 * simples de enunciar — **o que não é conferido não é gravado** — e o dia volta
 * sozinho na execução seguinte, quando deixa de ser o mais recente.
 */
export function mesclarGrupos(
  antigos: GrupoDia[],
  frescos: GrupoDia[],
  cutoff: string,
  excluirDesde: string | null
): GrupoDia[] {
  // Datas cobertas pela busca fresca: nelas, o fresco manda por inteiro.
  const diasFrescos = new Set(frescos.map((g) => g.data));
  const out: GrupoDia[] = [];
  for (const g of antigos) {
    if (!g?.data || diasFrescos.has(g.data)) continue; // dia refeito abaixo
    // Teto: só quando há um dia de referência. Sem `registros` nem conjuntos,
    // `excluirDesde` vem null e o histórico é preservado inteiro em vez de zerado.
    if (excluirDesde && g.data >= excluirDesde) continue;
    out.push(g);
  }
  out.push(...frescos.filter((g) => g?.data));
  return out
    .filter((g) => g.data >= cutoff)
    .sort((a, b) => a.data.localeCompare(b.data) || a.grupo.localeCompare(b.grupo));
}
