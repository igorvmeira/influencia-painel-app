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

// Rótulo do intervalo de datas de uma janela de N dias, ancorada no último dia COM
// DADO (nunca no relógio). Ex.: "21–27/07" — ou "28/06–27/07" quando cruza o mês.
// Regra da casa: o intervalo comparado fica explícito na tela (evita confusão ao
// conferir com a BM). Retorna null quando ainda não há nenhum dado.
export function intervaloLabel(
  daily: MetricaDiaria[],
  contas: ContaMap[],
  periodoDias: number,
  // Quantos dias recuar a janela inteira. 0 = o período atual; `periodoDias` = o
  // período anterior de mesmo tamanho. Existe para a tela poder escrever os DOIS
  // intervalos que um Δ compara, sem uma segunda cópia desta conta de datas.
  deslocamentoDias = 0
): string | null {
  const set = new Set(contas.map((c) => c.accountId));
  let max = "";
  for (const m of daily) if (set.has(m.accountId) && m.data > max) max = m.data;
  if (!max) return null;

  const fimMs = Date.parse(max + "T00:00:00Z") - deslocamentoDias * DIA_MS;
  const iniMs = fimMs - (periodoDias - 1) * DIA_MS;
  const dd = (ms: number) => String(new Date(ms).getUTCDate()).padStart(2, "0");
  const mm = (ms: number) => String(new Date(ms).getUTCMonth() + 1).padStart(2, "0");

  // Mesmo mês: "21–27/07". Meses diferentes: "28/06–27/07".
  return mm(iniMs) === mm(fimMs)
    ? `${dd(iniMs)}–${dd(fimMs)}/${mm(fimMs)}`
    : `${dd(iniMs)}/${mm(iniMs)}–${dd(fimMs)}/${mm(fimMs)}`;
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

// ===========================================================================
// PERÍODO PERSONALIZADO (datas exatas) — e a trava de disponibilidade
// ===========================================================================
//
// LIMITE DO HISTÓRICO: o painel lê `metricasAgregadas`, que é uma projeção com
// JANELA MÓVEL de RETENCAO_DIAS (95) — ver lib/agregadas.ts. Não há dado mais
// antigo que isso para a tela. Por isso o seletor de data TRAVA na primeira data
// disponível e a tela diz qual é ("dados disponíveis a partir de DD/MM/AAAA").
//
// SAÍDA DE EMERGÊNCIA (se um dia precisarem de período anterior à janela):
// a coleção `metricasDiarias` guarda o histórico COMPLETO (desde 02/04) e nunca
// é podada — ela é a fonte granular. O agregado é derivado e RECONSTRUÍVEL a
// partir dela: basta reprocessar `metricasDiarias` → `metricasAgregadas` com um
// RETENCAO_DIAS maior. Nada se perde; é só custo de leitura.
//
// ACHADO DE CAMPO (não é bug, não consertar): existem dias órfãos bem antes do
// cutoff (na inspeção de 27/07/2026: 14–22/04) pertencentes a UMA conta PAUSADA.
// Motivo: a poda de retenção só acontece quando o sync REESCREVE o doc daquela
// conta (mesclarDias filtra pelo cutoff na hora de gravar). Conta parada nunca é
// reescrita, então seus dias antigos ficam congelados no agregado. Isso é inócuo:
// pausadas são filtradas de rankings, médias, KPIs e alertas. Mas cuidado ao
// calcular "primeira data disponível" pelo mínimo GLOBAL — daria uma data que só
// uma conta pausada tem. Por isso primeiroDiaDisponivel() olha só contas ATIVAS.

// Primeira data (YYYY-MM-DD) com dado entre as contas informadas — passe as contas
// ATIVAS. É a trava mínima do seletor. null quando não há dado nenhum.
export function primeiroDiaDisponivel(daily: MetricaDiaria[], contas: ContaMap[]): string | null {
  const set = new Set(contas.map((c) => c.accountId));
  let min = "";
  for (const m of daily) {
    if (!set.has(m.accountId)) continue;
    if (min === "" || m.data < min) min = m.data;
  }
  return min || null;
}

// Último dia COM DADO (YYYY-MM-DD) — a âncora, e o teto do seletor.
export function ultimoDiaDisponivel(daily: MetricaDiaria[], contas: ContaMap[]): string | null {
  const set = new Set(contas.map((c) => c.accountId));
  let max = "";
  for (const m of daily) {
    if (!set.has(m.accountId)) continue;
    if (m.data > max) max = m.data;
  }
  return max || null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const ddmm = (ms: number) => `${pad2(new Date(ms).getUTCDate())}/${pad2(new Date(ms).getUTCMonth() + 1)}`;

// "20–26/07" (mesmo mês) ou "28/06–04/07" (cruzando o mês).
function faixaLabel(iniMs: number, fimMs: number): string {
  const mIni = new Date(iniMs).getUTCMonth(), mFim = new Date(fimMs).getUTCMonth();
  return mIni === mFim
    ? `${pad2(new Date(iniMs).getUTCDate())}–${ddmm(fimMs)}`
    : `${ddmm(iniMs)}–${ddmm(fimMs)}`;
}

/**
 * Janela de DATAS EXATAS (período personalizado). Devolve o MESMO formato do modo
 * mês (JanelaMes), para reaproveitar montarPainel/montarKpisMes/serieGraficoMes —
 * sem criar um caminho de cálculo paralelo.
 *
 * DOIS MODOS DE COMPARAÇÃO:
 *
 * - AUTOMÁTICO (compIniYmd/compFimYmd ausentes): o intervalo EQUIVALENTE
 *   imediatamente anterior, de mesmo tamanho (ex.: 20–26/07 compara com 13–19/07).
 *   É o comportamento original e continua sendo o padrão.
 *
 * - EXPLÍCITO (os dois informados): o usuário escolhe os DOIS lados da comparação
 *   (pedido do Roberto, 05/08/2026 — ex.: julho inteiro contra junho inteiro).
 *   Os dois parâmetros são OPCIONAIS de propósito: sem eles o caminho de código é
 *   exatamente o de antes, então quem não usa o segundo período não muda de
 *   comportamento por construção, não por sorte.
 *
 * TAMANHOS DIFERENTES são permitidos (junho tem 30 dias, julho 31). O fantasma
 * alinha PELO INÍCIO — dia 1 do período atual com dia 1 do de comparação — e vira
 * null quando o de comparação acaba antes (o dia 31 de julho não tem par em junho).
 * É o mesmo tratamento que janelaMesFechado já dá ao mês curto.
 * ATENÇÃO ao ler os números: o CPL é RAZÃO e continua justo entre tamanhos
 * diferentes; gasto e conversões são SOMAS e carregam o dia a mais. Por isso o
 * periodoLabel leva o tamanho de cada lado — ver o "(Nd)" abaixo — e o Dashboard
 * levanta um aviso quando diferem. Não normalizamos por dia: mudaria em silêncio
 * o significado do número na tela.
 *
 * `parcial` = algum dos dois intervalos começa antes do primeiro dia disponível;
 * nesse caso o Dashboard mostra "—" no delta em vez de número subestimado.
 */
export function janelaPersonalizada(
  daily: MetricaDiaria[],
  contas: ContaMap[],
  inicioYmd: string,
  fimYmd: string,
  compIniYmd?: string,
  compFimYmd?: string
): JanelaMes | null {
  const { ancoraMs } = ancoraMin(daily, contas);
  const primeiro = primeiroDiaDisponivel(daily, contas);
  if (!inicioYmd || !fimYmd) return null;

  let iniMs = Date.parse(inicioYmd + "T00:00:00Z");
  let fimMs = Date.parse(fimYmd + "T00:00:00Z");
  if (Number.isNaN(iniMs) || Number.isNaN(fimMs)) return null;
  if (iniMs > fimMs) [iniMs, fimMs] = [fimMs, iniMs]; // tolera inversão
  fimMs = Math.min(fimMs, ancoraMs);                  // nunca além do último dia com dado
  if (fimMs < iniMs) return null;

  const N = Math.round((fimMs - iniMs) / DIA_MS) + 1;
  const off = (ms: number) => Math.round((ancoraMs - ms) / DIA_MS);

  // Intervalo de comparação: o escolhido, ou o equivalente imediatamente anterior.
  let iniAntMs: number;
  let fimAntMs: number;
  const explicito = !!compIniYmd && !!compFimYmd;
  if (explicito) {
    let a = Date.parse(compIniYmd + "T00:00:00Z");
    let b = Date.parse(compFimYmd + "T00:00:00Z");
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    if (a > b) [a, b] = [b, a];                       // tolera inversão, igual ao atual
    b = Math.min(b, ancoraMs);
    if (b < a) return null;
    iniAntMs = a;
    fimAntMs = b;
  } else {
    fimAntMs = iniMs - DIA_MS;                        // termina 1 dia antes do início
    iniAntMs = iniMs - N * DIA_MS;                    // mesmo tamanho
  }
  const Nprev = Math.round((fimAntMs - iniAntMs) / DIA_MS) + 1;

  const offsetsAtual: number[] = [];
  const offsetsAnterior: (number | null)[] = [];
  for (let i = 0; i < N; i++) {
    offsetsAtual.push(off(iniMs + i * DIA_MS));       // mais antigo → mais recente
    // Alinhado pelo início; null quando o período de comparação já acabou.
    // Com Nprev === N (modo automático) nenhum vira null — idêntico ao original.
    offsetsAnterior.push(i < Nprev ? off(iniAntMs + i * DIA_MS) : null);
  }

  const labelAtual = faixaLabel(iniMs, fimMs);
  const labelAnterior = faixaLabel(iniAntMs, fimAntMs);

  const espec: EspecJanela = {
    atualIni: off(fimMs),   // offset do dia MAIS RECENTE da janela
    atualFim: off(iniMs),   // offset do dia MAIS ANTIGO
    antIni: off(fimAntMs),
    antFim: off(iniAntMs),
    semanas: Math.max(1, Math.round(N / 7)),
    // O tamanho de cada lado entra no rótulo que a tela inteira já exibe (cabeçalho
    // da visão de liderança e legenda do gráfico). Sem elemento novo: com tamanhos
    // diferentes, quem lê o Δ de gasto precisa saber que um lado tem um dia a mais.
    periodoLabel: `${labelAtual} (${N}d) vs ${labelAnterior} (${Nprev}d)`,
  };

  // Algum dos dois intervalos começa antes do histórico disponível?
  const primeiroMs = primeiro != null ? Date.parse(primeiro + "T00:00:00Z") : null;
  const parcial = primeiroMs != null && (iniAntMs < primeiroMs || iniMs < primeiroMs);

  return { espec, ancoraMs, D: N, Dprev: Nprev, offsetsAtual, offsetsAnterior, labelAtual, labelAnterior, parcial };
}

/**
 * Dias em que dois intervalos [iniA,fimA] e [iniB,fimB] se sobrepõem (0 = disjuntos).
 *
 * Sobreposição é PERMITIDA no período personalizado — só avisada. É o padrão da
 * casa (dia parcial, mês incompleto e comparação indisponível também avisam em vez
 * de bloquear), e existe leitura legítima para intervalos que se cruzam. Mas os
 * dias em comum contam dos DOIS lados do Δ, e isso precisa estar na tela.
 *
 * Só faz sentido no modo de comparação EXPLÍCITO: no automático o intervalo
 * anterior termina um dia antes do início, então nunca há sobreposição.
 */
export function diasSobrepostos(
  iniA: string, fimA: string, iniB: string, fimB: string
): number {
  const p = (s: string) => Date.parse(s + "T00:00:00Z");
  const [a0, a1] = [p(iniA), p(fimA)].sort((x, y) => x - y);
  const [b0, b1] = [p(iniB), p(fimB)].sort((x, y) => x - y);
  if ([a0, a1, b0, b1].some(Number.isNaN)) return 0;
  const ini = Math.max(a0, b0);
  const fim = Math.min(a1, b1);
  return fim < ini ? 0 : Math.round((fim - ini) / DIA_MS) + 1;
}

/**
 * A comparação de uma janela de N dias cabe no histórico disponível?
 * Devolve a data (YYYY-MM-DD) que seria exigida quando NÃO cabe; null quando cabe.
 * Usado no modo dia (7/15/30/60): a janela anterior é [N..2N-1] antes da âncora.
 */
export function comparacaoExigeDesde(
  daily: MetricaDiaria[],
  contas: ContaMap[],
  periodoDias: number
): string | null {
  const { ancoraMs } = ancoraMin(daily, contas);
  const primeiro = primeiroDiaDisponivel(daily, contas);
  if (!primeiro) return null;
  const exigidoMs = ancoraMs - (2 * periodoDias - 1) * DIA_MS;
  if (exigidoMs >= Date.parse(primeiro + "T00:00:00Z")) return null; // cabe
  return new Date(exigidoMs).toISOString().slice(0, 10);
}

// "DD/MM/AAAA" a partir de "YYYY-MM-DD" (pt-BR, sem depender de fuso local).
export function ymdParaBR(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

// ===========================================================================
// MÊS FECHADO vs MÊS FECHADO — base da tela "Análise de Gestores"
// ===========================================================================
//
// Diferente do Modo Mês (janelaMes), que compara 1..D vs 1..D ancorado no último
// dia COM DADO — bom para acompanhar o mês corrente em andamento. Aqui os dois
// meses estão FECHADOS e são comparados INTEIROS (ex.: julho 1–31 vs junho 1–30),
// que é o recorte usado para avaliar o mês do gestor.
//
// As duas convivem: janelaMes segue intacta e continua servindo o botão "Mês" do
// Dashboard. Tudo o que consome JanelaMes (montarPainel, montarKpisMes,
// serieGraficoMes) é genérico sobre offsets e funciona com as duas sem alteração.

// Dias de um mês (mes = 1..12). O dia 0 do mês seguinte é o último do mês pedido.
const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
// Mês anterior a (ano, mes), tratando a virada de ano.
const mesAnteriorDe = (ano: number, mes: number) => (mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 });
/** "julho/2026". Exportado porque a /gestores precisa rotular um mês que NÃO está
 *  na lista de disponíveis — o que ela recebeu e teve que aparar. */
export const rotuloMes = (ano: number, mes: number) => `${MESES[mes - 1]}/${ano}`;

/**
 * Janela de um mês FECHADO inteiro vs o mês fechado anterior inteiro.
 * `mes` é 1..12. Devolve o MESMO formato do modo mês (JanelaMes), então
 * montarPainel/montarKpisMes/serieGraficoMes funcionam sem nenhuma mudança.
 *
 * Meses de tamanhos diferentes são tratados: o fantasma alinha POR DIA DO MÊS e
 * vira null quando o dia não existe no mês anterior (ex.: 31 de julho vs junho).
 *
 * `parcial` = a série disponível não cobre o mês anterior inteiro OU o mês pedido
 * ainda não terminou de ser sincronizado. A tela deve avisar em vez de mostrar
 * número limpo — a cobertura fina, por conta, sai de coberturaMes().
 */
export function janelaMesFechado(
  daily: MetricaDiaria[],
  contas: ContaMap[],
  ano: number,
  mes: number
): JanelaMes | null {
  if (!(mes >= 1 && mes <= 12)) return null;
  const { ancoraMs, minMs } = ancoraMin(daily, contas);
  if (minMs === null) return null;

  const D = diasNoMes(ano, mes);
  const ant = mesAnteriorDe(ano, mes);
  const Dprev = diasNoMes(ant.ano, ant.mes);

  const primeiroAtualMs = Date.UTC(ano, mes - 1, 1);
  const ultimoAtualMs = Date.UTC(ano, mes - 1, D);
  const primeiroAntMs = Date.UTC(ant.ano, ant.mes - 1, 1);
  const ultimoAntMs = Date.UTC(ant.ano, ant.mes - 1, Dprev);

  const off = (ms: number) => Math.round((ancoraMs - ms) / DIA_MS);

  const offsetsAtual: number[] = [];
  const offsetsAnterior: (number | null)[] = [];
  for (let dia = 1; dia <= D; dia++) {
    offsetsAtual.push(off(Date.UTC(ano, mes - 1, dia)));
    // Alinhamento por dia do mês; null quando o mês anterior não tem esse dia.
    offsetsAnterior.push(dia <= Dprev ? off(Date.UTC(ant.ano, ant.mes - 1, dia)) : null);
  }

  const labelAtual = rotuloMes(ano, mes);
  const labelAnterior = rotuloMes(ant.ano, ant.mes);

  const espec: EspecJanela = {
    atualIni: off(ultimoAtualMs),   // offset do dia MAIS RECENTE da janela
    atualFim: off(primeiroAtualMs), // offset do dia MAIS ANTIGO
    antIni: off(ultimoAntMs),
    antFim: off(primeiroAntMs),
    semanas: Math.max(1, Math.round(D / 7)),
    periodoLabel: `${labelAtual} vs ${labelAnterior}`,
  };

  // Parcial se a série começa depois do dia 1 do mês anterior, ou se ainda não há
  // dado até o último dia do mês analisado (mês não fechou / sync atrasado).
  const parcial = primeiroAntMs < minMs || ultimoAtualMs > ancoraMs;

  return { espec, ancoraMs, D, Dprev, offsetsAtual, offsetsAnterior, labelAtual, labelAnterior, parcial };
}

/** Cobertura de UMA conta num mês — o detector de "mês incompleto". */
export interface CoberturaMes {
  completo: boolean;        // a série da conta alcança o dia 1 do mês?
  primeiroDiaSerie: string | null; // primeiro dia COM DADO da conta (série inteira)
  primeiroDiaMes: string;   // "YYYY-MM-01"
  diasComDado: number;      // dias do mês com registro
  diasNoMes: number;
}

/**
 * A conta tem o mês INTEIRO disponível, ou a série dela começa no meio dele?
 *
 * O teste é contra o primeiro dia da série INTEIRA da conta, não contra a presença
 * do dia 1: dia sem registro pode ser simplesmente dia sem veiculação (a API não
 * devolve linha para dia sem entrega), o que é um dado legítimo. Já uma série que
 * COMEÇA depois do dia 1 significa que não temos o começo do mês — aí o total do
 * mês fica subestimado e não pode ser apresentado como fechado.
 *
 * Caso real medido em 02/08/2026: 9 contas com série começando em 05/06 ou 19/06,
 * que apareceriam com "junho completo" falso.
 */
export function coberturaMes(
  daily: MetricaDiaria[],
  accountId: string,
  ano: number,
  mes: number
): CoberturaMes {
  const D = diasNoMes(ano, mes);
  const pad = (n: number) => String(n).padStart(2, "0");
  const primeiroDiaMes = `${ano}-${pad(mes)}-01`;
  const ultimoDiaMes = `${ano}-${pad(mes)}-${pad(D)}`;

  let primeiroDaSerie = "";
  let diasComDado = 0;
  for (const m of daily) {
    if (m.accountId !== accountId || !m.data) continue;
    if (primeiroDaSerie === "" || m.data < primeiroDaSerie) primeiroDaSerie = m.data;
    if (m.data >= primeiroDiaMes && m.data <= ultimoDiaMes) diasComDado++;
  }

  return {
    completo: primeiroDaSerie !== "" && primeiroDaSerie <= primeiroDiaMes,
    primeiroDiaSerie: primeiroDaSerie || null,
    primeiroDiaMes,
    diasComDado,
    diasNoMes: D,
  };
}

/** Um mês fechado que a janela de retenção alcança. */
export interface MesDisponivel {
  ano: number;
  mes: number;               // 1..12
  label: string;             // "Julho/2026"
  cobreInicio: boolean;      // a série alcança o dia 1 deste mês?
  cobreMesAnterior: boolean; // ...e o dia 1 do mês ANTERIOR (necessário p/ comparar)?
}

/**
 * Meses FECHADOS que dá para analisar hoje, do mais recente para o mais antigo.
 * "Fechado" = o mês já terminou em relação ao último dia com dado (âncora).
 *
 * `cobreMesAnterior` é o que a tela precisa olhar antes de oferecer o mês no
 * seletor: sem o mês anterior inteiro não há comparação, só número solto.
 * Com RETENCAO_DIAS = 95 isso sempre cabe (pior caso do calendário = 91 dias),
 * mas a folga é de 4 dias — ver o piso em lib/agregadas.ts.
 */
export function mesesDisponiveis(daily: MetricaDiaria[], contas: ContaMap[]): MesDisponivel[] {
  const { ancoraMs, minMs } = ancoraMin(daily, contas);
  if (minMs === null) return [];

  const A = new Date(ancoraMs);
  // Último mês FECHADO em relação à âncora: se a âncora ainda está dentro do mês,
  // o mês corrente não conta.
  let ano = A.getUTCFullYear();
  let mes = A.getUTCMonth() + 1;
  const ultimoDoMesDaAncora = Date.UTC(ano, mes - 1, diasNoMes(ano, mes));
  if (ancoraMs < ultimoDoMesDaAncora) ({ ano, mes } = mesAnteriorDe(ano, mes));

  const out: MesDisponivel[] = [];
  // Limite de 6 iterações: a retenção nunca alcança mais que ~3 meses fechados.
  for (let i = 0; i < 6; i++) {
    const primeiroMs = Date.UTC(ano, mes - 1, 1);
    if (primeiroMs < minMs) break; // o mês nem começa dentro da série
    const ant = mesAnteriorDe(ano, mes);
    out.push({
      ano, mes,
      label: rotuloMes(ano, mes),
      cobreInicio: primeiroMs >= minMs,
      cobreMesAnterior: Date.UTC(ant.ano, ant.mes - 1, 1) >= minMs,
    });
    ({ ano, mes } = ant);
  }
  return out;
}
