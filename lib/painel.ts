import {
  ContaMap, Detalhe, LinhaCliente, LinhaGestor, MetricaDiaria,
  Painel, PontoCpl, Tipo, Totais,
} from "./types";

const DIA_MS = 86400000;

const cpl = (gasto: number, conversas: number) => (conversas > 0 ? gasto / conversas : 0);
const variacao = (atual: number, anterior: number) =>
  anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : 0;

const conversasDe = (m: MetricaDiaria) => m.leadsForm + m.convWhats;

interface Soma { gasto: number; leadsForm: number; convWhats: number; conversas: number }
const somaZero = (): Soma => ({ gasto: 0, leadsForm: 0, convWhats: 0, conversas: 0 });
function acumular(s: Soma, m: MetricaDiaria) {
  s.gasto += m.gasto;
  s.leadsForm += m.leadsForm;
  s.convWhats += m.convWhats;
  s.conversas += conversasDe(m);
}

/**
 * Monta o Painel a partir dos registros diários e do de-para de contas, para uma
 * janela de `periodoDias` dias. As variações comparam contra o período anterior de
 * mesmo tamanho. O gráfico semanal compara contra ~2 meses atrás (offset de 56 dias).
 * Função pura (sem I/O), usada tanto no servidor quanto no client.
 */
export function montarPainel(
  daily: MetricaDiaria[],
  contas: ContaMap[],
  periodoDias: number
): Painel {
  const mapaConta = new Map(contas.map((c) => [c.accountId, c]));

  // Considera apenas registros de contas presentes no de-para.
  const registros = daily.filter((m) => mapaConta.has(m.accountId));

  // Âncora = dia mais recente que temos (cai para hoje se não houver dados).
  const datas = registros.map((m) => m.data).sort();
  const ancoraMs = datas.length
    ? Date.parse(datas[datas.length - 1] + "T00:00:00Z")
    : Date.now();

  // diasAtras de cada registro em relação à âncora.
  const diasAtras = (data: string) =>
    Math.round((ancoraMs - Date.parse(data + "T00:00:00Z")) / DIA_MS);

  const N = periodoDias;
  const noIntervalo = (d: number, ini: number, fim: number) => d >= ini && d <= fim;

  // Somas por conta para a janela atual e a anterior.
  const atualPorConta = new Map<string, Soma>();
  const antPorConta = new Map<string, Soma>();
  for (const m of registros) {
    const d = diasAtras(m.data);
    if (noIntervalo(d, 0, N - 1)) {
      const s = atualPorConta.get(m.accountId) ?? somaZero();
      acumular(s, m);
      atualPorConta.set(m.accountId, s);
    } else if (noIntervalo(d, N, 2 * N - 1)) {
      const s = antPorConta.get(m.accountId) ?? somaZero();
      acumular(s, m);
      antPorConta.set(m.accountId, s);
    }
  }
  const somaConta = (mapa: Map<string, Soma>, id: string) => mapa.get(id) ?? somaZero();

  // Totais e agregação por gestor.
  const porGestor = new Map<string, LinhaGestor>();
  const porGestorAnt = new Map<string, { gasto: number; conversas: number }>();
  let gasto = 0, b2b = 0, b2c = 0;
  let gastoAnt = 0, convAnt = 0;

  for (const c of contas) {
    const a = somaConta(atualPorConta, c.accountId);
    gasto += a.gasto; b2b += a.leadsForm; b2c += a.convWhats;

    const g = porGestor.get(c.gestor)
      ?? { nome: c.gestor, gasto: 0, conversas: 0, b2b: 0, b2c: 0, cpl: 0, cplVar: 0 };
    g.gasto += a.gasto; g.b2b += a.leadsForm; g.b2c += a.convWhats; g.conversas += a.conversas;
    porGestor.set(c.gestor, g);

    const p = somaConta(antPorConta, c.accountId);
    gastoAnt += p.gasto; convAnt += p.conversas;
    const ga = porGestorAnt.get(c.gestor) ?? { gasto: 0, conversas: 0 };
    ga.gasto += p.gasto; ga.conversas += p.conversas;
    porGestorAnt.set(c.gestor, ga);
  }

  const gestores: LinhaGestor[] = [...porGestor.values()].map((g) => {
    const ant = porGestorAnt.get(g.nome)!;
    return {
      ...g,
      cpl: cpl(g.gasto, g.conversas),
      cplVar: variacao(cpl(g.gasto, g.conversas), cpl(ant.gasto, ant.conversas)),
    };
  }).sort((x, y) => y.gasto - x.gasto);

  const conversas = b2b + b2c;
  const totais: Totais = {
    gasto, conversas, cpl: cpl(gasto, conversas), b2b, b2c,
    gastoVar: variacao(gasto, gastoAnt),
    conversasVar: variacao(conversas, convAnt),
    cplVar: variacao(cpl(gasto, conversas), cpl(gastoAnt, convAnt)),
  };

  // Detalhe por gestor: clientes (janela atual) + série semanal de CPL.
  const semanas = Math.max(1, Math.round(N / 7)); // 7d→1, 15d→2, 30d→4
  const detalhes: Detalhe[] = gestores.map((g) => {
    const contasGestor = contas.filter((c) => c.gestor === g.nome);

    const clientes: LinhaCliente[] = contasGestor.map((c) => {
      const a = somaConta(atualPorConta, c.accountId);
      return {
        cliente: c.cliente,
        tipo: c.tipo as Tipo,
        gasto: a.gasto,
        conversas: a.conversas,
        cplSemanal: cpl(a.gasto, a.conversas),
      };
    }).sort((x, y) => y.gasto - x.gasto);

    const ids = new Set(contasGestor.map((c) => c.accountId));
    const cplSemanal: PontoCpl[] = [];
    for (let p = 1; p <= semanas; p++) {
      const semFim = (semanas - p) * 7; // 0 = semana mais recente
      const atual = janelaCpl(registros, ids, diasAtras, semFim, semFim + 6);
      const dois = janelaCpl(registros, ids, diasAtras, semFim + 56, semFim + 6 + 56);
      cplSemanal.push({
        semana: `Sem ${p}`,
        atual: Math.round(atual * 100) / 100,
        doisMesesAtras: Math.round(dois * 100) / 100,
      });
    }

    return { gestor: g.nome, contasCount: contasGestor.length, cplSemanal, clientes };
  });

  return {
    periodoLabel: `Últimos ${N} dias`,
    atualizadoEm: datas.length ? datas[datas.length - 1] : new Date().toISOString(),
    totais,
    gestores,
    detalhes,
  };
}

// CPL agregado de um conjunto de contas dentro de uma faixa de dias (inclusive).
function janelaCpl(
  registros: MetricaDiaria[],
  ids: Set<string>,
  diasAtras: (data: string) => number,
  dMin: number,
  dMax: number
): number {
  let gasto = 0, conversas = 0;
  for (const m of registros) {
    if (!ids.has(m.accountId)) continue;
    const d = diasAtras(m.data);
    if (d >= dMin && d <= dMax) { gasto += m.gasto; conversas += conversasDe(m); }
  }
  return cpl(gasto, conversas);
}
