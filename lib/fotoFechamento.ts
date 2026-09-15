import type { ContaMap, JanelaLeitura, LinhaCliente, MetricaDiaria } from "./types";
import {
  coberturaMes, faltaDaLeitura, janelaMesFechado, mesesDisponiveis, momentoSync, rotuloFaltaCobertura, rotuloMes, ymdParaBR,
} from "./periodo";
import { montarPainel } from "./painel";
import { calcularDestaques, elegibilidadeDestaque, escolherPremiado, linhasDeEvolucao, type RankingEvolucao } from "./destaques";
import { cplDe, variacaoPct } from "./cpl";
import { RETENCAO_DIAS } from "./agregadas";
import { brl } from "./format";
import { MARCA } from "./brand";

// ===========================================================================
// FOTO DO FECHAMENTO DE MÊS — a regra, pura (servidor e tela usam a mesma)
// ===========================================================================
//
// 🛑 POR QUE EXISTE (CLAUDE.md, *MÊS PAGO NÃO É MÊS EXIBIDO*). A tela é o estado atual do cálculo:
// troca de gestor, correção de régua e a janela de retenção reescrevem mês fechado sem ninguém abrir
// aquele mês. Em uma semana (setembro/2026), um mês pago apareceu três vezes com número diferente —
// agosto em 08/09, agosto em 15/09 e julho em 15/09 —, e em nenhuma dava para dizer o que a tela
// mostrava quando o mês foi pago. A foto é o resultado do mês gravado UMA vez e nunca recalculado.
//
// O QUE GUARDA (desenho aprovado pelo Igor em 15/09/2026): o resultado por gestor e a composição
// conta a conta — totais do mês e do anterior, gestor, janela de leitura e "incompleta". SEM série
// diária: medido com agosto, 31,9 kB contra 453,8 kB, e a composição já basta para separar a causa
// de uma divergência. O dado bruto segue no granular.
//
// ⚠️ Toda a conta sai de `resultadoDaCarteira`, que monta o selo a partir das CONTAS: é a mesma
// função que grava a foto e que reaplica a régua de hoje aos insumos gravados. Duas funções aqui
// divergiriam na primeira mudança — e a divergência apareceria como "a régua mudou".

const DIA_MS = 86400000;
const pad = (n: number) => String(n).padStart(2, "0");
const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const anteriorDe = (ano: number, mes: number) => (mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 });
const ultimoDia = (ano: number, mes: number) => `${ano}-${pad(mes)}-${pad(diasNoMes(ano, mes))}`;

/** "2026-09". */
export const chaveMes = (ano: number, mes: number) => `${ano}-${pad(mes)}`;

/**
 * Primeiro mês com fechamento. ⚠️ Julho e agosto de 2026 foram PAGOS SEM FOTO: fotografá-los agora
 * gravaria o cálculo de 15/09 com cara de registro do pagamento — exatamente o engano que a foto
 * existe para impedir.
 */
export const PRIMEIRO_MES_COM_FECHAMENTO = { ano: 2026, mes: 9 } as const;

export type ValorDaFoto = "registro" | "pagamento";

/**
 * 🔑 O VALOR DE TODA FOTO NOVA — e a decisão do Thiago mora nesta linha. Em 15/09/2026 ele ainda não
 * decidiu se a foto vale para a bonificação; até lá ela é REGISTRO. Se decidir que vale, muda aqui
 * para "pagamento" — o texto da tela sai de `textoDoValor`, e nada mais precisa mudar.
 * ⚠️ Foto já gravada guarda o valor com que nasceu. Promover as antigas é outra decisão.
 */
export const VALOR_DA_FOTO_NOVA: ValorDaFoto = "registro";

/**
 * A versão da régua que decide o selo. ⚠️ Muda JUNTO com qualquer mudança em `coberturaMes`,
 * `elegibilidadeDestaque`, `escolherPremiado` ou `calcularDestaques` — é o que a foto grava e a
 * linha de divergência cita. Esquecer de mudar não quebra a conta (a divergência compara
 * resultados, não este texto); só deixa o texto dizendo que a régua é a mesma.
 */
export const VERSAO_REGUA_SELO = "2026-09-15 · base incompleta pela janela de leitura";

/**
 * ⚠️ O LOGIN DO PAINEL É COMPARTILHADO (CLAUDE.md, *Login*): o e-mail do token identifica a CONTA,
 * não a pessoa. A foto grava isso junto do e-mail, e a tela diz. Quando existirem contas por
 * pessoa, vira true — e as fotos anteriores continuam dizendo false: autoria não se reconstrói.
 */
export const LOGIN_IDENTIFICA_PESSOA = false;

/** Refechar exige motivo — curto demais vira "ajuste", que não explica nada a quem ler depois. */
export const MOTIVO_MINIMO_CARACTERES = 20;

/** Texto do 403 — a tela decide o desenho (painel neutro) pelo texto. Constante nos dois lados. */
export const MSG_FECHAMENTO_RESTRITO = "Acesso restrito — fechar o mês é só para quem administra a carteira.";

export interface GestorNaFoto {
  gestor: string;
  gasto: number;
  conversas: number;
  gastoAnterior: number;
  conversasAnterior: number;
  cplAtual: number | null;
  cplAnterior: number | null;
  /** A variação da TELA (a que ordena a fila do selo, `variacaoPct`). */
  cplVar: number | null;
  /** A variação exata da decomposição (`calcularDestaques`). */
  variacaoPct: number | null;
  elegivel: boolean;
  motivoInelegivel: string | null;
}

export interface ContaNaFoto {
  accountId: string;
  cliente: string;
  /** O gestor da conta NO FECHAMENTO. */
  gestor: string;
  gasto: number;
  conversas: number;
  gastoAnterior: number;
  conversasAnterior: number;
  /** A série da conta tem algum dia (a condição de `coberturaMes` para julgar a cobertura). */
  temDado: boolean;
  leitura: JanelaLeitura | null;
  incompleta: boolean;
  rotuloIncompleta: string | null;
}

export interface ConteudoFoto {
  mes: string;
  mesAnterior: string;
  regua: string;
  dado: { ultimaSync: string | null; ultimoDiaCompleto: string | null; inicioJanela: string | null };
  selo: string | null;
  gestores: GestorNaFoto[];
  contas: ContaNaFoto[];
}

export interface FotoFechamento extends ConteudoFoto {
  id: string;
  versao: number;
  valor: ValorDaFoto;
  /** sha256 do conteúdo — o que a pessoa viu na prévia é o que foi gravado. */
  assinatura: string;
  fechadoEm: string;
  fechadoPor: { email: string; identificaPessoa: boolean };
  motivo: string | null;
  /** Id da versão que esta substitui (refechamento), ou null. */
  substitui: string | null;
}

export interface ResumoFechamentos {
  meses: Record<string, { versao: number; id: string; fechadoEm: string; valor: ValorDaFoto }>;
}

/** O que a foto precisa do painel — tudo já vem em `/api/painel` (lib/data.ts). */
export interface InsumosFoto {
  daily: MetricaDiaria[];
  contas: ContaMap[];
  leituraPorConta: Record<string, JanelaLeitura>;
  inicioJanela: string | null;
  ultimaSync: string | null;
  ultimoDiaCompleto: string | null;
}

type ContaParaResultado = Pick<ContaNaFoto, "accountId" | "cliente" | "gestor" | "gasto" | "conversas" | "gastoAnterior" | "conversasAnterior" | "incompleta">;

/**
 * Selo e resultado por gestor a partir das CONTAS — a mesma conta da /gestores, sem a série.
 * ⚠️ Ordena por gasto decrescente antes da fila do selo, como `montarPainel`: a fila desempata pela
 * ordem de chegada, e outra ordem daria outro premiado num empate.
 */
export function resultadoDaCarteira(contas: ContaParaResultado[]): { gestores: GestorNaFoto[]; selo: string | null } {
  const porGestor = new Map<string, ContaParaResultado[]>();
  for (const c of contas) {
    if (!porGestor.has(c.gestor)) porGestor.set(c.gestor, []);
    porGestor.get(c.gestor)!.push(c);
  }
  const gestores: GestorNaFoto[] = [];
  for (const [gestor, lista] of porGestor) {
    let gasto = 0, conversas = 0, gastoAnterior = 0, conversasAnterior = 0;
    for (const c of lista) { gasto += c.gasto; conversas += c.conversas; gastoAnterior += c.gastoAnterior; conversasAnterior += c.conversasAnterior; }
    const atuais = lista.map((c) => ({ accountId: c.accountId, cliente: c.cliente, gasto: c.gasto, conversas: c.conversas }) as LinhaCliente);
    const anteriores = new Map(lista.map((c) => [c.accountId, { gasto: c.gastoAnterior, conversas: c.conversasAnterior }]));
    const incompletas = new Set(lista.filter((c) => c.incompleta).map((c) => c.accountId));
    const dd = calcularDestaques(atuais, anteriores, incompletas);
    const el = elegibilidadeDestaque(conversas, dd);
    const cplAtual = cplDe(gasto, conversas), cplAnterior = cplDe(gastoAnterior, conversasAnterior);
    gestores.push({
      gestor, gasto, conversas, gastoAnterior, conversasAnterior, cplAtual, cplAnterior,
      cplVar: variacaoPct(cplAtual, cplAnterior),
      variacaoPct: dd?.deltaPct ?? null,
      elegivel: el.elegivel,
      motivoInelegivel: el.motivo,
    });
  }
  gestores.sort((a, b) => b.gasto - a.gasto);
  const elegivel = new Map(gestores.map((g) => [g.gestor, g.elegivel]));
  const selo = escolherPremiado(gestores.map((g) => ({ nome: g.gestor, conversas: g.conversas, cplVar: g.cplVar })), (n) => !!elegivel.get(n));
  return { gestores, selo };
}

/** A foto de um mês com o dado de agora. null quando o mês não tem janela montável. */
export function montarConteudoFoto(ins: InsumosFoto, ano: number, mes: number): ConteudoFoto | null {
  const ativas = ins.contas.filter((c) => !c.pausado);
  const ant = anteriorDe(ano, mes);
  const j = janelaMesFechado(ins.daily, ativas, ano, mes, ins.inicioJanela);
  const ja = janelaMesFechado(ins.daily, ativas, ant.ano, ant.mes, ins.inicioJanela);
  if (!j || !ja) return null;
  const p = montarPainel(ins.daily, ativas, j.D, j.espec);
  const pa = montarPainel(ins.daily, ativas, ja.D, ja.espec);
  const linhas = (painel: typeof p) => new Map(painel.detalhes.flatMap((d) => d.clientes.map((c) => [c.accountId, c] as const)));
  const atual = linhas(p), anterior = linhas(pa);

  const contas: ContaNaFoto[] = ativas.map((c) => {
    const l = ins.leituraPorConta[c.accountId] ?? null;
    const a = coberturaMes(ins.daily, c.accountId, ano, mes, l);
    const b = coberturaMes(ins.daily, c.accountId, ant.ano, ant.mes, l);
    const incompleta = a.primeiroDiaSerie !== null && (!a.completo || !b.completo);
    return {
      accountId: c.accountId,
      cliente: c.cliente,
      gestor: c.gestor,
      gasto: atual.get(c.accountId)?.gasto ?? 0,
      conversas: atual.get(c.accountId)?.conversas ?? 0,
      gastoAnterior: anterior.get(c.accountId)?.gasto ?? 0,
      conversasAnterior: anterior.get(c.accountId)?.conversas ?? 0,
      temDado: a.primeiroDiaSerie !== null,
      leitura: l,
      incompleta,
      rotuloIncompleta: incompleta ? (rotuloFaltaCobertura(a) ?? rotuloFaltaCobertura(b)) : null,
    };
  }).sort((x, y) => x.accountId.localeCompare(y.accountId));

  const { gestores, selo } = resultadoDaCarteira(contas);
  return {
    mes: chaveMes(ano, mes),
    mesAnterior: chaveMes(ant.ano, ant.mes),
    regua: VERSAO_REGUA_SELO,
    dado: { ultimaSync: ins.ultimaSync, ultimoDiaCompleto: ins.ultimoDiaCompleto, inicioJanela: ins.inicioJanela },
    selo,
    gestores,
    contas,
  };
}

export const antesDoPrimeiroFechamento = (ano: number, mes: number) =>
  ano * 12 + mes < PRIMEIRO_MES_COM_FECHAMENTO.ano * 12 + PRIMEIRO_MES_COM_FECHAMENTO.mes;

/**
 * O botão de fechar libera?
 *
 * 🔑 LIBERA NO DIA 1 — por medição, não por pressa. Medido em 15/09/2026: de uma sincronização para
 * a seguinte, nenhuma conversão mudou nos 30 dias mais recentes (83 contas) e o gasto mudou 0,03%
 * só nos 7 mais recentes; depois dos 30 dias do sync, zero diferença em 1.730 dias-conta contra a
 * Meta. O dia que muda de verdade é o do próprio sync, e ele já sai dos dados (`separarDiaParcial`).
 *
 * O que trava, cada um com o motivo que a tela mostra:
 *  · mês antes do primeiro com fechamento (julho e agosto de 2026, pagos sem foto);
 *  · o último dia do mês ainda não está completo nos dados (sync do dia 1 não rodou);
 *  · o mês não é comparável (sem o anterior inteiro na janela);
 *  · alguma conta ATIVA com dado não foi lida até o fim do mês — a foto registraria mês incompleto
 *    como fechado. Conta que só começou no meio do mês NÃO trava: dia sem entrega é dado.
 */
export function liberacaoFechamento(ins: InsumosFoto, ano: number, mes: number): { pode: boolean; motivo: string | null } {
  const rotulo = rotuloMes(ano, mes);
  if (antesDoPrimeiroFechamento(ano, mes)) {
    return { pode: false, motivo: `${rotulo} foi pago sem foto do fechamento. Fotografar agora gravaria o cálculo de hoje com cara de registro do pagamento.` };
  }
  const fim = ultimoDia(ano, mes);
  if (!ins.ultimoDiaCompleto || ins.ultimoDiaCompleto < fim) {
    return {
      pode: false,
      motivo: `${rotulo} ainda não fechou nos dados: o último dia completo é ${ins.ultimoDiaCompleto ? ymdParaBR(ins.ultimoDiaCompleto) : "—"}. Libera quando a sincronização trouxer ${ymdParaBR(fim)} inteiro.`,
    };
  }
  const ativas = ins.contas.filter((c) => !c.pausado);
  const comparavel = mesesDisponiveis(ins.daily, ativas, ins.inicioJanela).some((m) => m.ano === ano && m.mes === mes && m.cobreMesAnterior);
  if (!comparavel) return { pode: false, motivo: `${rotulo} não tem o mês anterior inteiro na janela do painel — não há comparação para registrar.` };
  const paradas = ativas.filter((c) => {
    const cob = coberturaMes(ins.daily, c.accountId, ano, mes, ins.leituraPorConta[c.accountId] ?? null);
    return cob.primeiroDiaSerie !== null && (cob.falta === "fim" || cob.falta === "semLeitura");
  });
  if (paradas.length) {
    return {
      pode: false,
      motivo: `O painel não leu ${paradas.length} conta(s) ativa(s) até o fim de ${rotulo}: ${paradas.map((c) => c.cliente).join(", ")}. Fotografar agora registraria um mês incompleto como fechado.`,
    };
  }
  return { pode: true, motivo: null };
}

/**
 * Quando o mês deixa de ser comparável na /gestores: a sincronização em que o dia 1 do mês ANTERIOR
 * sai da janela. Com 122 dias, agosto/2026 sai na de 01/11/2026 e setembro na de 02/12/2026.
 */
export function saidaDaJanela(ano: number, mes: number, hojeYmd: string): { data: string; dias: number } {
  const ant = anteriorDe(ano, mes);
  const s = Date.UTC(ant.ano, ant.mes - 1, 1) + (RETENCAO_DIAS + 1) * DIA_MS;
  return { data: new Date(s).toISOString().slice(0, 10), dias: Math.round((s - Date.parse(hojeYmd + "T00:00:00Z")) / DIA_MS) };
}

/** Meses comparáveis a partir do primeiro com fechamento que ainda não têm foto — o aviso da /gestores. */
export function mesesSemFechamento(ins: InsumosFoto, resumo: ResumoFechamentos, hojeYmd: string) {
  const ativas = ins.contas.filter((c) => !c.pausado);
  return mesesDisponiveis(ins.daily, ativas, ins.inicioJanela)
    .filter((m) => m.cobreMesAnterior && !antesDoPrimeiroFechamento(m.ano, m.mes) && !resumo.meses[chaveMes(m.ano, m.mes)])
    .map((m) => ({ ano: m.ano, mes: m.mes, rotulo: m.label, saida: saidaDaJanela(m.ano, m.mes, hojeYmd) }));
}

/**
 * O que a foto É. Frase e rótulo curto moram juntos, e são os únicos pontos das telas (/gestores e
 * Início) que mudam se o Thiago decidir que ela vale.
 */
export function textoDoValor(valor: ValorDaFoto): string {
  return valor === "pagamento"
    ? "Fechamento: é este registro que vale para a bonificação do mês."
    : "Registro do fechamento: o que o painel calculou quando o mês foi fechado. Não decide pagamento — a decisão, quando houve, fica registrada fora do painel.";
}

export const rotuloDoValor = (valor: ValorDaFoto) => (valor === "pagamento" ? "Fechamento" : "Registro do fechamento");

/**
 * O PÓDIO DA INÍCIO A PARTIR DA FOTO — no formato de `rankingEvolucaoGestores`, e pela mesma regra de
 * quem entra e em que ordem (`linhasDeEvolucao`). Nenhuma conta é refeita: CPL, variação e
 * elegibilidade são os gravados. Conferido em 15/09/2026 com agosto real e setembro plantado: a foto
 * montada com o dado do dia dá os mesmos gestores, ordem, elegibilidade e motivos do cálculo de hoje.
 * ⚠️ Os NÚMEROS diferem em até 5e-15 (relativo): a foto soma as contas em ordem de id, o cálculo na
 * ordem do painel. Nenhuma casa exibida muda, e a divergência não compara esses números — mas quem
 * conferir foto × cálculo com igualdade exata vai ver "diferente" onde não há diferença.
 */
export function rankingDaFoto(foto: ConteudoFoto): RankingEvolucao {
  const [ano, mes] = foto.mes.split("-").map(Number);
  const [anoA, mesA] = foto.mesAnterior.split("-").map(Number);
  return {
    mes: { ano, mes },
    mesAnterior: { ano: anoA, mes: mesA },
    linhas: linhasDeEvolucao(foto.gestores.map((g) => ({
      gestor: g.gestor, cplAtual: g.cplAtual, cplAnterior: g.cplAnterior, variacaoPct: g.variacaoPct,
      conversoes: g.conversas, elegivel: g.elegivel, motivoInelegivel: g.motivoInelegivel,
    }))),
  };
}

export interface CausaDivergencia {
  /** Uma frase: o que mudou. */
  resumo: string;
  /** Qual dos dois vale para quê — ou que nenhum está errado. Nunca "a foto está errada". */
  explicacao: string;
  itens: string[];
}

export interface Divergencias {
  regua: CausaDivergencia | null;
  carteira: CausaDivergencia | null;
  dado: CausaDivergencia | null;
  /** Quando o dado do mês já saiu da janela: a comparação de dado não existe, e isso se diz. */
  dadoIndisponivel: string | null;
}

/**
 * A régua de HOJE reaplicada a uma conta da foto: "incompleta" pela janela de leitura GRAVADA, com a
 * mesma função de `coberturaMes` (`faltaDaLeitura`) — sem uma segunda cópia da regra.
 */
export function incompletaPelaReguaDeHoje(c: ContaNaFoto, ano: number, mes: number, ultimoDiaCompleto: string | null): boolean {
  if (!c.temDado) return false;
  const ant = anteriorDe(ano, mes);
  const fimExigido = (a: number, m: number) => {
    const u = ultimoDia(a, m);
    return ultimoDiaCompleto && ultimoDiaCompleto < u ? ultimoDiaCompleto : u;
  };
  return faltaDaLeitura(c.leitura, `${ano}-${pad(mes)}-01`, fimExigido(ano, mes)) !== null
    || faltaDaLeitura(c.leitura, `${ant.ano}-${pad(ant.mes)}-01`, fimExigido(ant.ano, ant.mes)) !== null;
}

/**
 * FOTO × CÁLCULO DE HOJE, COM A CAUSA SEPARADA — aprovado pelo Igor em 15/09/2026.
 *
 * 🛑 O TEXTO DIZ QUAL DOS DOIS VALE PARA QUÊ, ou que nenhum está errado. "A régua de hoje daria
 * outro resultado" é diferente de "a foto está errada": a foto registra o que foi decidido; a régua
 * nova é o que se sabe agora. As duas podem estar certas. Por isso nenhuma frase aqui diz "erro".
 *
 * As três causas são independentes, e cada comparação isola uma:
 *  · RÉGUA — o código de hoje sobre os insumos GRAVADOS na foto (contas, gestores, leitura). Carteira
 *    e dado ficam como estavam; se o resultado muda, só pode ser a régua;
 *  · CARTEIRA — o gestor de cada conta na foto contra o de hoje (e quem entrou ou saiu da operação),
 *    só para contas com movimento no mês;
 *  · DADO — os totais de cada conta na foto contra os de hoje, na série atual.
 */
export function divergenciasDaFoto(foto: FotoFechamento, ins: InsumosFoto): Divergencias {
  const [ano, mes] = foto.mes.split("-").map(Number);
  const ant = anteriorDe(ano, mes);
  const quandoFoto = momentoSync(foto.fechadoEm, MARCA.fuso) ?? foto.fechadoEm;

  // RÉGUA
  const reaplicada = resultadoDaCarteira(foto.contas.map((c) => ({ ...c, incompleta: incompletaPelaReguaDeHoje(c, ano, mes, foto.dado.ultimoDiaCompleto) })));
  const itensRegua: string[] = [];
  if (reaplicada.selo !== foto.selo) itensRegua.push(`Selo: ${foto.selo ?? "ninguém"} na foto → ${reaplicada.selo ?? "ninguém"} com a régua de hoje.`);
  for (const g of reaplicada.gestores) {
    const f = foto.gestores.find((x) => x.gestor === g.gestor);
    if (f && f.elegivel !== g.elegivel) {
      itensRegua.push(`${g.gestor}: ${f.elegivel ? "elegível" : "inelegível"} na foto → ${g.elegivel ? "elegível" : `inelegível hoje (${g.motivoInelegivel})`}.`);
    }
  }
  const regua: CausaDivergencia | null = itensRegua.length
    ? {
        resumo: reaplicada.selo !== foto.selo
          ? `A régua de hoje daria o selo a ${reaplicada.selo ?? "ninguém"}; a foto registrou ${foto.selo ?? "ninguém"}.`
          : `A régua de hoje mudaria a elegibilidade de ${itensRegua.length} gestor(es), sem mudar o selo.`,
        explicacao: `Isso não quer dizer que a foto está errada. A foto registra o que foi decidido em ${quandoFoto}, com a régua daquele dia (${foto.regua}); a régua de hoje (${VERSAO_REGUA_SELO}) é o que se sabe agora. As duas estão certas sobre o que medem.`,
        itens: itensRegua,
      }
    : null;

  // CARTEIRA
  const porId = new Map(ins.contas.map((c) => [c.accountId, c]));
  const naFoto = new Set(foto.contas.map((c) => c.accountId));
  const totais = new Map<string, { g: number; c: number; ga: number; ca: number }>();
  const iniA = `${ano}-${pad(mes)}-01`, fimA = ultimoDia(ano, mes);
  const iniP = `${ant.ano}-${pad(ant.mes)}-01`, fimP = ultimoDia(ant.ano, ant.mes);
  for (const m of ins.daily) {
    const dentroA = m.data >= iniA && m.data <= fimA, dentroP = m.data >= iniP && m.data <= fimP;
    if (!dentroA && !dentroP) continue;
    const t = totais.get(m.accountId) ?? { g: 0, c: 0, ga: 0, ca: 0 };
    const conv = Number(m.leadsForm || 0) + Number(m.convWhats || 0);
    if (dentroA) { t.g += Number(m.gasto || 0); t.c += conv; } else { t.ga += Number(m.gasto || 0); t.ca += conv; }
    totais.set(m.accountId, t);
  }
  const itensCarteira: string[] = [];
  for (const c of foto.contas) {
    if (!(c.gasto > 0 || c.conversas > 0 || c.gastoAnterior > 0 || c.conversasAnterior > 0)) continue;
    const hoje = porId.get(c.accountId);
    if (!hoje || hoje.pausado) itensCarteira.push(`${c.cliente}: de ${c.gestor} na foto; hoje fora da operação.`);
    else if (hoje.gestor !== c.gestor) itensCarteira.push(`${c.cliente}: de ${c.gestor} na foto; hoje de ${hoje.gestor}.`);
  }
  for (const c of ins.contas) {
    if (c.pausado || naFoto.has(c.accountId)) continue;
    const t = totais.get(c.accountId);
    if (t && (t.g > 0 || t.c > 0 || t.ga > 0 || t.ca > 0)) itensCarteira.push(`${c.cliente}: fora da operação na foto; hoje de ${c.gestor}.`);
  }
  const carteira: CausaDivergencia | null = itensCarteira.length
    ? {
        resumo: `Desde a foto, ${itensCarteira.length} conta(s) com movimento no mês mudaram de gestor, entraram ou saíram da operação.`,
        explicacao: `O cálculo de hoje soma cada conta no gestor que ela tem hoje; a foto guarda de quem ela era em ${quandoFoto}. Nenhum dos dois está errado: respondem de quem a conta era em datas diferentes. Para o que foi decidido, vale a foto.`,
        itens: itensCarteira,
      }
    : null;

  // DADO
  const cobre = ins.inicioJanela !== null && ins.inicioJanela <= iniP && !!ins.ultimoDiaCompleto && ins.ultimoDiaCompleto >= fimA;
  let dado: CausaDivergencia | null = null;
  let dadoIndisponivel: string | null = null;
  if (!cobre) {
    dadoIndisponivel = "O dado deste mês já não está inteiro na janela do painel: daqui não dá para dizer se a Meta mudou os números depois da foto.";
  } else {
    const itensDado: string[] = [];
    for (const c of foto.contas) {
      const t = totais.get(c.accountId) ?? { g: 0, c: 0, ga: 0, ca: 0 };
      const mudouA = Math.abs(t.g - c.gasto) > 0.01 || t.c !== c.conversas;
      const mudouP = Math.abs(t.ga - c.gastoAnterior) > 0.01 || t.ca !== c.conversasAnterior;
      if (mudouA) itensDado.push(`${c.cliente}, ${rotuloMes(ano, mes)}: gasto ${brl(c.gasto)} → ${brl(t.g)} · conversões ${c.conversas} → ${t.c}.`);
      if (mudouP) itensDado.push(`${c.cliente}, ${rotuloMes(ant.ano, ant.mes)}: gasto ${brl(c.gastoAnterior)} → ${brl(t.ga)} · conversões ${c.conversasAnterior} → ${t.ca}.`);
    }
    if (itensDado.length) {
      const quandoDado = momentoSync(foto.dado.ultimaSync, MARCA.fuso) ?? "da foto";
      dado = {
        resumo: `A Meta devolve hoje números diferentes dos da foto em ${itensDado.length} conta-mês.`,
        explicacao: `A foto guarda o dado da sincronização de ${quandoDado}; o de hoje inclui o que a Meta reprocessou depois. Nenhum dos dois está errado: para saber o que aconteceu no mês, vale o de hoje; para saber o que foi decidido, vale a foto.`,
        itens: itensDado,
      };
    }
  }

  return { regua, carteira, dado, dadoIndisponivel };
}

/** As causas presentes, com o nome que as telas mostram — a mesma lista na /gestores e na Início. */
export function causasDaDivergencia(d: Divergencias): { nome: string; causa: CausaDivergencia }[] {
  const todas: [string, CausaDivergencia | null][] = [["régua", d.regua], ["carteira", d.carteira], ["dado", d.dado]];
  return todas.filter((x): x is [string, CausaDivergencia] => x[1] !== null).map(([nome, causa]) => ({ nome, causa }));
}
