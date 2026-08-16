import { ContaMap, LinhaCliente, MetricaDiaria } from "./types";
import { JanelaMes, coberturaMes, janelaMesFechado, mesesDisponiveis } from "./periodo";
import { montarPainel } from "./painel";

// ===========================================================================
// DESTAQUES CALCULADOS POR REGRA — Análise de Gestores
// ===========================================================================
//
// Módulo ÚNICO das regras de "por que o CPL mudou". Nada de IA nesta versão:
// tudo aqui é aritmética explicável, que qualquer pessoa pode conferir na mão.
// Consumido só pela tela /gestores — se outra tela precisar, importa daqui.
//
// Só usa o que o agregado já tem (gasto, leadsForm, convWhats por dia/conta).
// Nenhum dado novo, nenhuma leitura adicional.

/** Piso de conversões para uma conta entrar nos destaques narrativos. */
// Conta com 1 ou 2 conversões produz variação percentual gigante e sem
// significado. Ela continua no total (o gasto é real), mas não vira "destaque".
export const PISO_CONVERSOES_DESTAQUE = 5;

/** Piso de conversões para um GESTOR concorrer ao selo de melhor evolução. */
// Calibrado com a distribuição real de julho/2026: o menor gestor tinha 5
// conversões no mês inteiro e o penúltimo tinha 919 — qualquer corte entre 10 e
// 900 separava os dois, e 100 é redondo sem excluir ninguém legítimo.
// REVER se entrar gestor novo com carteira pequena porém legítima: hoje o piso
// existe para barrar ruído estatístico, não para punir carteira enxuta.
export const PISO_CONVERSOES_GESTOR = 100;

export interface ContribuicaoConta {
  accountId: string;
  cliente: string;
  gastoAtual: number;
  gastoAnterior: number;
  convAtual: number;
  convAnterior: number;
  cplAtual: number | null;
  cplAnterior: number | null;
  /** Quanto ESTA conta moveu o CPL do gestor, em R$. Soma exata = ΔCPL total. */
  contribuicao: number;
  /** % que esta conta representa do movimento total (em módulo). */
  pesoPct: number;
  entrou: boolean;        // não gastava no mês anterior, gasta agora
  saiu: boolean;          // gastava, parou
  semVeiculacao: boolean; // zero nos dois meses
  incompleta: boolean;    // cobertura de mês quebrada (vem de fora)
  relevante: boolean;     // passa do piso de conversões
}

export interface Destaques {
  cplAtual: number | null;
  cplAnterior: number | null;
  deltaCpl: number | null;   // em R$
  deltaPct: number | null;   // em %
  melhorou: boolean;         // CPL caiu (menor é melhor)
  contribuicoes: ContribuicaoConta[]; // ordenadas por |contribuição| desc
  /** As que empurraram NA MESMA direção do resultado (explicam a variação). */
  aFavor: ContribuicaoConta[];
  /** As que empurraram na direção CONTRÁRIA (seguraram o resultado). */
  contrarias: ContribuicaoConta[];
  /** Quantas contas explicam 80% do movimento — medida de concentração. */
  contasPara80Pct: number;
  entradas: ContribuicaoConta[];
  saidas: ContribuicaoConta[];
  semVeiculacao: ContribuicaoConta[];
  /** Sanidade: a soma das contribuições bate com o ΔCPL (deve ser sempre true). */
  somaConfere: boolean;
}

const cplDe = (gasto: number, conv: number): number | null => (conv > 0 ? gasto / conv : null);

const DIA_MS = 86400000;

/**
 * Série do CPL DIÁRIO de um gestor no mês — forma da tendência para o sparkline.
 *
 * Duas decisões de honestidade, ambas visíveis no tooltip do card:
 *
 * 1. DIAS SEM CONVERSÃO SAEM DA SÉRIE. CPL de um dia sem conversão não é zero,
 *    é indefinido — desenhar zero criaria um mergulho que não aconteceu.
 * 2. PICOS SUAVIZADOS no percentil 90. Um dia com 1 conversão e R$ 200 de gasto
 *    vira um CPL de R$ 200 que achata todo o resto da linha. O clamp preserva a
 *    FORMA da tendência, que é o que o sparkline comunica; o número exibido no
 *    card continua sendo o CPL real do mês, sem suavização nenhuma.
 */
export function serieCplDiaria(
  daily: MetricaDiaria[],
  contasDoGestor: ContaMap[],
  janela: JanelaMes
): number[] {
  const ids = new Set(contasDoGestor.map((c) => c.accountId));
  const porData = new Map<string, { g: number; c: number }>();
  for (const m of daily) {
    if (!ids.has(m.accountId) || !m.data) continue;
    const a = porData.get(m.data) ?? { g: 0, c: 0 };
    a.g += Number(m.gasto || 0);
    a.c += Number(m.leadsForm || 0) + Number(m.convWhats || 0);
    porData.set(m.data, a);
  }

  const serie: number[] = [];
  for (const off of janela.offsetsAtual) {
    const ymd = new Date(janela.ancoraMs - off * DIA_MS).toISOString().slice(0, 10);
    const a = porData.get(ymd);
    if (!a || a.c === 0) continue; // dia sem conversão: CPL indefinido, não é zero
    serie.push(a.g / a.c);
  }
  if (serie.length < 3) return serie; // curta demais para valer o clamp

  // Clamp no percentil 90 (só para o desenho).
  const ord = [...serie].sort((x, y) => x - y);
  const p90 = ord[Math.min(ord.length - 1, Math.floor(ord.length * 0.9))];
  return serie.map((v) => Math.min(v, p90));
}

/** Resultado da checagem de elegibilidade ao selo de melhor evolução. */
export interface Elegibilidade {
  elegivel: boolean;
  motivo: string | null; // preenchido só quando inelegível
}

/**
 * O gestor pode receber o selo "melhor evolução"?
 *
 * O troféu não pode ir para quem tem base furada — numa tela que embasa
 * bonificação, premiar evolução calculada sobre mês incompleto seria pior que
 * não premiar ninguém. Duas barreiras:
 *
 * 1. VOLUME: abaixo de PISO_CONVERSOES_GESTOR a variação é ruído.
 * 2. BASE ÍNTEGRA: nenhuma conta com mês incompleto pode estar PESANDO na
 *    variação. Ter conta incompleta irrelevante (abaixo do piso de conversões)
 *    não desqualifica — ela não move o número.
 *
 * Quando o 1º em evolução é inelegível, o selo passa para o próximo elegível e
 * ele exibe o aviso âmbar no lugar (a tela cuida dessa parte).
 */
export function elegibilidadeDestaque(
  conversoesDoGestor: number,
  destaques: Destaques | null
): Elegibilidade {
  if (conversoesDoGestor < PISO_CONVERSOES_GESTOR) {
    return {
      elegivel: false,
      motivo: `Volume baixo no mês (${conversoesDoGestor} conversões) — variação sem significado estatístico.`,
    };
  }
  const furadas = (destaques?.contribuicoes ?? []).filter((c) => c.incompleta && c.relevante);
  if (furadas.length) {
    const nomes = furadas.slice(0, 3).map((c) => c.cliente).join(", ");
    return {
      elegivel: false,
      motivo: `Base de comparação incompleta em ${furadas.length} conta(s) que pesam na variação: ${nomes}.`,
    };
  }
  return { elegivel: true, motivo: null };
}

/** Uma linha do ranking de evolução mensal de CPL, já com a elegibilidade resolvida. */
export interface EvolucaoGestor {
  gestor: string;
  cplAtual: number;
  cplAnterior: number;
  /** Negativo = CPL caiu = melhorou. */
  variacaoPct: number;
  conversoes: number;
  elegivel: boolean;
  motivoInelegivel: string | null;
}

export interface RankingEvolucao {
  /** Mês analisado e mês de comparação, prontos para rótulo (ex.: "07/2026"). */
  mes: { ano: number; mes: number };
  mesAnterior: { ano: number; mes: number };
  /** Ordenado da MAIOR queda de CPL para a maior alta. Inclui inelegíveis. */
  linhas: EvolucaoGestor[];
}

/**
 * O ranking de evolução de CPL entre dois meses FECHADOS.
 *
 * ⚠️ MORA AQUI, e não na tela, porque duas telas o consomem: a /gestores (que
 * mostra a decomposição conta a conta) e a Início (que mostra só o pódio). Se cada
 * uma escolhesse o mês e aplicasse a elegibilidade do seu jeito, as duas exibiriam
 * pódios diferentes para a mesma pergunta — e divergiriam em silêncio, porque os
 * dois números pareceriam plausíveis. A regra do selo é `elegibilidadeDestaque`, e
 * há uma só.
 *
 * ⚠️ O MÊS É O MAIS RECENTE QUE TEM O ANTERIOR INTEIRO NA JANELA — sem o mês de
 * comparação completo não há evolução, só número solto. Devolve `null` quando a
 * retenção ainda não alcança dois meses fechados.
 *
 * Custo: zero leituras. Opera sobre o `daily` que a sessão já carregou.
 */
export function rankingEvolucaoGestores(
  daily: MetricaDiaria[],
  contasAtivas: ContaMap[]
): RankingEvolucao | null {
  const comparaveis = mesesDisponiveis(daily, contasAtivas).filter((m) => m.cobreMesAnterior);
  if (!comparaveis.length) return null;

  const { ano, mes } = comparaveis[0];
  const ant = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };

  const jAtual = janelaMesFechado(daily, contasAtivas, ano, mes);
  const jAnt = janelaMesFechado(daily, contasAtivas, ant.ano, ant.mes);
  if (!jAtual || !jAnt) return null;

  const pAtual = montarPainel(daily, contasAtivas, jAtual.D, jAtual.espec);
  const pAnt = montarPainel(daily, contasAtivas, jAnt.D, jAnt.espec);

  // Cobertura por conta nos DOIS meses — mês quebrado em qualquer um dos lados
  // torna a evolução da conta enganosa, e é o que barra o selo.
  const incompletas = new Set<string>();
  for (const c of contasAtivas) {
    const a = coberturaMes(daily, c.accountId, ano, mes);
    const b = coberturaMes(daily, c.accountId, ant.ano, ant.mes);
    if (a.primeiroDiaSerie !== null && (!a.completo || !b.completo)) incompletas.add(c.accountId);
  }

  const linhas: EvolucaoGestor[] = [];
  for (const g of pAtual.gestores) {
    const atuais = pAtual.detalhes.find((d) => d.gestor === g.nome)?.clientes ?? [];
    const anteriores = new Map<string, { gasto: number; conversas: number }>();
    for (const c of pAnt.detalhes.find((d) => d.gestor === g.nome)?.clientes ?? []) {
      anteriores.set(c.accountId, { gasto: c.gasto, conversas: c.conversas });
    }
    const d = calcularDestaques(atuais, anteriores, incompletas);
    // Sem CPL nos dois meses não há evolução para ranquear — a linha simplesmente
    // não entra (é diferente de "evoluiu 0%", que seria uma afirmação).
    if (!d || d.cplAtual === null || d.cplAnterior === null || d.deltaPct === null) continue;

    const eleg = elegibilidadeDestaque(g.conversas, d);
    linhas.push({
      gestor: g.nome,
      cplAtual: d.cplAtual,
      cplAnterior: d.cplAnterior,
      variacaoPct: d.deltaPct,
      conversoes: g.conversas,
      elegivel: eleg.elegivel,
      motivoInelegivel: eleg.motivo,
    });
  }

  linhas.sort((a, b) => a.variacaoPct - b.variacaoPct); // maior queda primeiro
  return { mes: { ano, mes }, mesAnterior: ant, linhas };
}

/**
 * Decomposição EXATA da variação do CPL do gestor, conta a conta (shift-share).
 *
 * CPL = G / C (gasto total ÷ conversões totais). A variação decompõe assim:
 *
 *     ΔCPL_i = Δg_i / C1  −  G0 · Δc_i / (C0 · C1)
 *
 * onde g,c são gasto e conversões da conta i, e G,C os totais do gestor
 * (0 = mês anterior, 1 = mês atual). Somando sobre todas as contas:
 *
 *     Σ ΔCPL_i = (G1−G0)/C1 − G0(C1−C0)/(C0·C1) = G1/C1 − G0/C0 = ΔCPL
 *
 * A soma é EXATA, não aproximação — por isso a tela pode afirmar "68% da melhora
 * veio da conta X" sem ressalva. `somaConfere` verifica isso em runtime.
 *
 * Os dois termos têm leitura direta: o primeiro é o efeito de gastar mais/menos;
 * o segundo é o efeito de converter mais/menos.
 */
export function calcularDestaques(
  atuais: LinhaCliente[],
  anterioresPorConta: Map<string, { gasto: number; conversas: number }>,
  incompletas: Set<string>
): Destaques | null {
  // Universo = contas do gestor no mês atual + as que só existiam no anterior.
  const ids = new Set<string>(atuais.map((c) => c.accountId));
  for (const id of anterioresPorConta.keys()) ids.add(id);
  const nomePorId = new Map(atuais.map((c) => [c.accountId, c.cliente]));

  let G1 = 0, C1 = 0, G0 = 0, C0 = 0;
  for (const c of atuais) { G1 += c.gasto; C1 += c.conversas; }
  for (const id of ids) {
    const a = anterioresPorConta.get(id);
    if (a) { G0 += a.gasto; C0 += a.conversas; }
  }

  const cplAtual = cplDe(G1, C1);
  const cplAnterior = cplDe(G0, C0);
  // Sem CPL nos dois meses não há variação a decompor.
  if (cplAtual === null || cplAnterior === null) {
    return {
      cplAtual, cplAnterior, deltaCpl: null, deltaPct: null, melhorou: false,
      contribuicoes: [], aFavor: [], contrarias: [], contasPara80Pct: 0,
      entradas: [], saidas: [], semVeiculacao: [], somaConfere: true,
    };
  }

  const deltaCpl = cplAtual - cplAnterior;
  const atualPorId = new Map(atuais.map((c) => [c.accountId, c]));

  const contribuicoes: ContribuicaoConta[] = [];
  for (const id of ids) {
    const at = atualPorId.get(id);
    const an = anterioresPorConta.get(id);
    const gA = at?.gasto ?? 0, cA = at?.conversas ?? 0;
    const gB = an?.gasto ?? 0, cB = an?.conversas ?? 0;

    // Os dois termos da decomposição.
    const efeitoGasto = (gA - gB) / C1;
    const efeitoConv = (G0 * (cA - cB)) / (C0 * C1);
    const contribuicao = efeitoGasto - efeitoConv;

    contribuicoes.push({
      accountId: id,
      cliente: nomePorId.get(id) ?? id,
      gastoAtual: gA, gastoAnterior: gB, convAtual: cA, convAnterior: cB,
      cplAtual: cplDe(gA, cA), cplAnterior: cplDe(gB, cB),
      contribuicao,
      pesoPct: 0, // preenchido abaixo
      entrou: gB === 0 && gA > 0,
      saiu: gB > 0 && gA === 0,
      semVeiculacao: gB === 0 && gA === 0,
      incompleta: incompletas.has(id),
      relevante: Math.max(cA, cB) >= PISO_CONVERSOES_DESTAQUE,
    });
  }

  // Peso relativo pelo módulo do movimento total (soma dos |contribuição|).
  const somaAbs = contribuicoes.reduce((s, c) => s + Math.abs(c.contribuicao), 0);
  for (const c of contribuicoes) c.pesoPct = somaAbs > 0 ? (Math.abs(c.contribuicao) / somaAbs) * 100 : 0;

  contribuicoes.sort((a, b) => Math.abs(b.contribuicao) - Math.abs(a.contribuicao));

  // Direção: com CPL, contribuição NEGATIVA é boa (puxou o CPL para baixo).
  const melhorou = deltaCpl < 0;
  const naDirecao = (c: ContribuicaoConta) => (melhorou ? c.contribuicao < 0 : c.contribuicao > 0);

  // Quantas contas explicam 80% do movimento (concentração).
  let acumulado = 0, contasPara80Pct = 0;
  for (const c of contribuicoes) {
    if (acumulado >= 80) break;
    acumulado += c.pesoPct;
    contasPara80Pct++;
  }

  // Sanidade: a decomposição é exata, então a soma tem que bater com o ΔCPL.
  const soma = contribuicoes.reduce((s, c) => s + c.contribuicao, 0);
  const somaConfere = Math.abs(soma - deltaCpl) < 1e-6;

  return {
    cplAtual, cplAnterior, deltaCpl,
    deltaPct: cplAnterior > 0 ? ((cplAtual - cplAnterior) / cplAnterior) * 100 : null,
    melhorou,
    contribuicoes,
    aFavor: contribuicoes.filter((c) => naDirecao(c) && c.relevante && Math.abs(c.contribuicao) > 0),
    contrarias: contribuicoes.filter((c) => !naDirecao(c) && c.relevante && Math.abs(c.contribuicao) > 0),
    contasPara80Pct,
    entradas: contribuicoes.filter((c) => c.entrou && c.relevante),
    saidas: contribuicoes.filter((c) => c.saiu && c.relevante),
    semVeiculacao: contribuicoes.filter((c) => c.semVeiculacao),
    somaConfere,
  };
}
