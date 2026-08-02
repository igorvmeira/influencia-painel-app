import { LinhaCliente } from "./types";

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
