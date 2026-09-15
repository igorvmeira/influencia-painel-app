import { GrupoDia, JanelaLeitura, MetricaDiaria } from "./types";

// Item 3 — projeção read-otimizada: 1 doc por conta na coleção `metricasAgregadas`,
// com a série diária daquela conta. Derivado de `metricasDiarias` (fonte granular,
// intacta). Reduz a leitura do painel de ~4.6k docs para ~85 (um por conta).
export const COL_AGREGADAS = "metricasAgregadas";

const DIA_MS = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * O que cada tela pede da janela. Mudar uma tela obriga a mudar aqui — e o build confere
 * (`retencaoExigidaDias`, logo abaixo).
 */
export const EXIGENCIAS_DA_TELA = {
  /** /gestores: meses fechados comparáveis oferecidos — cada um exige o anterior INTEIRO. */
  mesesFechadosComparaveis: 2,
  /** Dashboard e Análise da Conta: o maior período comparado com o anterior de mesmo tamanho. */
  maiorPeriodoDias: 60,
} as const;

/**
 * Dias retidos no doc agregado — a exigência das telas no pior dia do calendário.
 *
 * Até 15/09/2026 eram 95, de uma conta que só olhava o ÚLTIMO mês fechado (piso de 91). A
 * /gestores oferece dois, e o Dashboard compara 60 dias contra os 60 anteriores: com 95, o
 * segundo mês dependia de sorte e o 60d nunca teve comparação. Medido em 15/09/2026 (dia a dia
 * de 2026 a 2030): dois meses exigem 122, o 60d exige 120.
 *
 * ⚠️ JANELA MAIOR NÃO SEGURA MÊS PAGO NA TELA — só adia. Com 122, agosto/2026 sai da /gestores
 * na sincronização de 01/11/2026 (com 95 era 05/10). Manter mês pago à vista é outra obra:
 * ver CLAUDE.md, *MÊS PAGO NÃO É MÊS EXIBIDO*.
 *
 * Custo (medido em 15/09/2026): leituras por carga iguais, um doc por conta; a série enviada à
 * tela vai de ~1,02 MB a ~1,31 MB quando os docs encherem; o maior doc, de ~34,8 kB a ~44 kB.
 * ⚠️ Os docs NÃO foram estendidos para trás: crescem um dia por sincronização desde 12/06/2026
 * e chegam aos 122 dias em 12/10/2026. Estender traria julho de volta à /gestores — mês pago —
 * e é decisão à parte.
 */
export const RETENCAO_DIAS = 122;

/**
 * A retenção com que foram podados os docs que ainda não têm `lidoDesde` (todo doc gravado
 * antes de 15/09/2026). ⚠️ NÃO troque por RETENCAO_DIAS: deduzir a leitura desses docs pela
 * janela nova afirmaria 27 dias que nenhum sync leu — o furo exato que o `lidoDesde` fecha.
 */
export const RETENCAO_LEGADO_DIAS = 95;
const cutoffLegado = (agora: number) => ymd(new Date(agora - RETENCAO_LEGADO_DIAS * DIA_MS));

/**
 * Pior caso do calendário (2026–2030), em dias entre a sincronização e o primeiro dia que
 * precisa estar retido. A âncora é a VÉSPERA da sincronização: o dia em que ela roda é parcial
 * e sai dos dados.
 */
export function retencaoExigidaDias(): number {
  const diasNoMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
  // N dias contra os N anteriores: da sincronização até âncora − (2N − 1) são 2N dias.
  let pior = 2 * EXIGENCIAS_DA_TELA.maiorPeriodoDias;
  for (let s = Date.UTC(2026, 0, 1); s < Date.UTC(2031, 0, 1); s += DIA_MS) {
    const anc = new Date(s - DIA_MS);
    let a = anc.getUTCFullYear();
    let m = anc.getUTCMonth() + 1;
    // Último mês fechado: o da âncora só quando ela é o último dia dele.
    if (anc.getUTCDate() !== diasNoMes(a, m)) { m -= 1; if (m === 0) { m = 12; a -= 1; } }
    // O mais antigo oferecido é o N-ésimo mês fechado, e ele exige o anterior inteiro.
    m -= EXIGENCIAS_DA_TELA.mesesFechadosComparaveis;
    while (m <= 0) { m += 12; a -= 1; }
    const dias = Math.round((s - Date.UTC(a, m - 1, 1)) / DIA_MS);
    if (dias > pior) pior = dias;
  }
  return pior;
}

if (RETENCAO_DIAS < retencaoExigidaDias()) {
  // Lançar no carregamento do módulo é proposital: quebra o `next build`, que é o
  // lugar mais barato para descobrir. Comentário protege quem lê; isto protege quem não lê.
  throw new Error(
    `RETENCAO_DIAS=${RETENCAO_DIAS} é menor que a exigência das telas (${retencaoExigidaDias()} dias ` +
    "no pior dia do calendário). Ver EXIGENCIAS_DA_TELA em lib/agregadas.ts."
  );
}

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
   * A janela de `porGrupo`, nos DOIS extremos — quem consome a quebra ROTULA por eles.
   * Assumir que ela cobre o mesmo período de `dias` produziria comparação entre janelas
   * diferentes, que é o erro que a casa já pagou uma vez ("nunca compare dois números em
   * frames de data diferentes").
   *
   * ⚠️ Ela é MENOR que `dias` nos dois lados, por motivos distintos:
   *   · no topo, porque o dia mais recente é parcial e não é conferido;
   *   · na base, porque a retenção guarda um dia a mais do que a busca pede — o dia da fronteira
   *     sobrevive em `dias` e nunca tem quebra. Ele sai sozinho no dia seguinte.
   */
  porGrupoDe?: string | null;
  porGrupoAte?: string | null;
  /**
   * Primeiro dia que este doc GARANTE ter lido da Meta, sem buraco até a última leitura.
   * Gravado pelo sync a partir de 15/09/2026 — ver `lidoDesdeAposSync`. Ausente em doc que
   * ainda não foi reescrito desde então; quem lê cai na retenção (`janelaDeLeitura`).
   */
  lidoDesde?: string | null;
}

// Data-limite (YYYY-MM-DD) da retenção: dias anteriores são descartados do agregado.
export function cutoffRetencao(agora: number = Date.now()): string {
  return ymd(new Date(agora - RETENCAO_DIAS * DIA_MS));
}

/**
 * O primeiro dia que o doc agregado GARANTE ter lido, depois de uma execução do sync.
 *
 * 🛑 POR QUE ESTE CAMPO EXISTE. Em 15/09/2026 a régua de mês incompleto (`coberturaMes`)
 * trocou a pergunta "a série da conta começa no dia 1?" por "o painel leu a conta desde o
 * dia 1?". A antiga chamava de incompleta a conta que só começou a veicular no meio do mês
 * (18 contas ativas em 15/09, e nas 18 a Meta devolve gasto e impressões zero no buraco).
 * Só que a pergunta nova tem um furo que a antiga não tinha: se o doc nasceu TRUNCADO, o
 * buraco do começo parece "não veiculava" e o mês passa por completo — e a régua antiga
 * pegava esse caso de graça. Deduzir a leitura da retenção seria proteção pelo dado: vale
 * enquanto nenhum doc nascer truncado. Este campo é a linha que barra o caso.
 *
 * Os dois jeitos de um doc guardar menos que a retenção:
 *   · conta NOVA sincronizada com `?dias=N` pequeno — o doc nasce com N dias e nunca mais
 *     pede a janela cheia, porque já "tem histórico";
 *   · conta que ficou sem ser lida por mais tempo do que a busca diária cobre — sobra um
 *     buraco, e a leitura contínua recomeça no início da busca nova.
 *
 * ⚠️ DOC SEM O CAMPO usa a retenção LEGADA (95 dias) da última leitura. Não é suposição: medido em
 * 15/09/2026, das 124 contas nenhuma tem série antes desse dia, e nas 18 ativas cuja série
 * começa depois dele a Meta confirma zero no buraco. O campo entra na primeira reescrita.
 */
export function lidoDesdeAposSync(p: {
  docExistia: boolean;
  lidoDesdeAntes: string | null | undefined;
  atualizadoEmAntes: string | null | undefined;
  /** Primeiro dia pedido à Meta nesta execução (YYYY-MM-DD, a aritmética das buscas). */
  inicioBusca: string;
  agora: number;
}): string {
  const piso = cutoffRetencao(p.agora);
  let desde = p.inicioBusca;
  const tAntes = p.atualizadoEmAntes ? Date.parse(p.atualizadoEmAntes) : NaN;
  if (p.docExistia && !Number.isNaN(tAntes)) {
    // Doc sem o campo foi podado com a retenção LEGADA, nunca com a atual (RETENCAO_LEGADO_DIAS).
    const antes = p.lidoDesdeAntes ?? cutoffLegado(tAntes);
    // Contínua quando a busca nova alcança o DIA da leitura anterior: aquele dia foi lido
    // pela metade, então só conta como lido se for relido agora.
    const continua = p.inicioBusca <= ymd(new Date(tAntes));
    if (continua && antes < desde) desde = antes;
  }
  // Sem leitura contínua (doc existia sem data válida, ou buraco), vale só a busca de agora.
  return desde < piso ? piso : desde;
}

/**
 * A janela de leitura de um doc agregado: de `lidoDesde` até a VÉSPERA da última leitura —
 * o dia em que o sync roda é gravado pela metade (ver `separarDiaParcial` em lib/data.ts).
 * null quando o doc não diz quando foi lido; aí ninguém pode afirmar mês completo.
 */
export function janelaDeLeitura(
  doc: { lidoDesde?: string | null; atualizadoEm?: string | null } | undefined,
  fuso: string
): JanelaLeitura | null {
  const t = doc?.atualizadoEm ? Date.parse(doc.atualizadoEm) : NaN;
  if (Number.isNaN(t)) return null;
  const diaDaLeitura = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(t));
  const vespera = ymd(new Date(Date.parse(`${diaDaLeitura}T00:00:00Z`) - DIA_MS));
  // Sem `lidoDesde`: a retenção LEGADA da última leitura — nunca a atual (ver RETENCAO_LEGADO_DIAS).
  return { desde: doc?.lidoDesde ?? cutoffLegado(t), ate: vespera };
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
