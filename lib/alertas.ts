import { ContaMap, LimiteConta, MetricaDiaria } from "./types";
import { montarPainel } from "./painel";

// Regra ÚNICA dos alertas — usada pela faixa "Precisa de atenção" do Dashboard e
// pelo resumo da tela Início. Não duplicar limiares/lógica em outro lugar.

// Limiar do alerta de CPL alto, em R$.
// PROVISÓRIO — subiu de 15 para 31 no MESMO commit da correção da contagem dobrada.
// Motivo: o CPL exibido estava pela METADE do real (o sync contava cada conversão duas
// vezes, fator ~2,07). Ao corrigir o dado, todo CPL dobra; dobrar o teto junto preserva
// o comportamento atual dos alertas, para que uma correção de DADO não mude sozinha o
// que o painel sinaliza. O valor DEFINITIVO virá da agência, com base nos benchmarks
// oficiais por nicho — agora que a régua (o CPL) está correta.
export const CPL_ALERTA = 31;
// Uso do teto (amount_spent / spend_cap) a partir do qual entra em ATENÇÃO/CRÍTICO.
export const LIMITE_ATENCAO = 0.8; // >= 80% usado
export const LIMITE_CRITICO = 0.9; // >= 90% usado

// Uma conta perto do teto de gasto, já com o percentual usado e o restante em R$.
export interface AlertaLimite {
  accountId: string;
  cliente: string;
  gestor: string;
  spendCap: number;
  amountSpent: number;
  usoPct: number;   // 0..1+
  restante: number; // R$ que faltam até o teto (nunca negativo)
  critico: boolean;
}

// Contas com teto (spend_cap > 0) e uso >= LIMITE_ATENCAO, da mais crítica p/ menos.
export function contasPertoDoLimite(contas: ContaMap[], limites: LimiteConta[]): AlertaLimite[] {
  const mapaLim = new Map(limites.map((l) => [l.accountId, l]));
  const out: AlertaLimite[] = [];
  for (const c of contas) {
    const l = mapaLim.get(c.accountId);
    if (!l || l.spendCap <= 0) continue; // sem teto → ignora
    const usoPct = l.amountSpent / l.spendCap;
    if (usoPct < LIMITE_ATENCAO) continue;
    out.push({
      accountId: c.accountId,
      cliente: c.cliente,
      gestor: c.gestor,
      spendCap: l.spendCap,
      amountSpent: l.amountSpent,
      usoPct,
      restante: Math.max(0, l.spendCap - l.amountSpent),
      critico: usoPct >= LIMITE_CRITICO,
    });
  }
  return out.sort((a, b) => b.usoPct - a.usoPct);
}

// ===========================================================================
// A SEGUNDA RÉGUA — "pede ação" (tela Início)
// ===========================================================================
//
// ⚠️ SÃO DUAS RÉGUAS DE PROPÓSITO, e apagar uma para "unificar" quebra a outra:
//
//     `contasPertoDoLimite`  →  ESTADO. Quantas contas estão perto do teto.
//                               É o que o Dashboard mostra, e está aprovado.
//     `limitesQuePedemAcao`  →  AÇÃO.   Quais exigem alguém fazer algo hoje.
//
// O motivo é medido, não estético. Em 16/08/2026 a carteira tinha **42 de 51
// contas com teto em ≥90%** — 82%. Como estado isso é uma descrição correta; como
// alerta é a regra do alarme que dispara todo dia e vira ruído que ninguém lê.
// Um número que quase sempre está aceso não distingue o dia em que algo mudou.
//
// O que separa as duas é o RITMO: uma conta a 92% com R$ 40 mil de folga e gasto
// baixo não vai estourar tão cedo; outra a 99% com R$ 25 de sobra estoura amanhã.
// A régua de ação é `restante ÷ gasto por dia` — dias até bater —, e ela reduziu
// as 42 a 10 já paradas + 11 na semana.
//
// ⚠️ A ORDEM IMPORTA NA LEITURA: quem já bateu não "vai estourar", já estourou —
// a veiculação está parada AGORA e a ação é outra (subir o teto, não vigiar).
// Misturar os dois grupos esconde o urgente dentro do iminente.

/** Dias até bater no teto abaixo do qual a conta entra em "estoura esta semana". */
export const DIAS_ESTOURO_URGENTE = 7;

export interface AlertaLimiteAcao extends AlertaLimite {
  /** Gasto médio por dia na janela observada — o ritmo que define a urgência. */
  ritmoDia: number;
  /**
   * Dias até zerar o restante nesse ritmo. `null` = não gastou nada na janela, e
   * então NÃO vai estourar: sem ritmo não há previsão, e chutar "infinito" ou
   * "zero" seria inventar. Conta sem ritmo fica fora dos dois grupos.
   */
  diasAteEstourar: number | null;
}

/**
 * Os limites que pedem ação hoje, separados pelo que a pessoa precisa FAZER.
 *
 * @param gastoPorConta gasto por accountId na janela (vem do painel já montado —
 *   nenhuma leitura nova, e a definição de janela continua sendo a de lib/painel).
 * @param diasDaJanela tamanho da janela desse gasto, para virar ritmo diário.
 */
export function limitesQuePedemAcao(
  contasAtivas: ContaMap[],
  limites: LimiteConta[],
  gastoPorConta: Map<string, number>,
  diasDaJanela: number
): { jaBateram: AlertaLimiteAcao[]; estouramEmBreve: AlertaLimiteAcao[] } {
  const enriquecidas: AlertaLimiteAcao[] = contasPertoDoLimite(contasAtivas, limites).map((a) => {
    const ritmoDia = (gastoPorConta.get(a.accountId) ?? 0) / Math.max(1, diasDaJanela);
    return {
      ...a,
      ritmoDia,
      diasAteEstourar: ritmoDia > 0 ? a.restante / ritmoDia : null,
    };
  });

  // JÁ BATERAM: uso >= 100%. Entram mesmo sem ritmo — uma conta parada no teto é
  // justamente a que precisa de ação, e exigir gasto recente a esconderia.
  const jaBateram = enriquecidas
    .filter((a) => a.usoPct >= 1)
    .sort((x, y) => y.amountSpent - x.amountSpent);

  // ESTOURAM EM BREVE: ainda têm folga, e o ritmo atual a consome dentro da semana.
  const estouramEmBreve = enriquecidas
    .filter((a) => a.usoPct < 1 && a.diasAteEstourar !== null && a.diasAteEstourar < DIAS_ESTOURO_URGENTE)
    .sort((x, y) => (x.diasAteEstourar ?? 0) - (y.diasAteEstourar ?? 0));

  return { jaBateram, estouramEmBreve };
}

/** Uma conta ativa com os números da janela — base dos dois alertas por CONTA. */
export interface ContaEmAlerta {
  accountId: string;
  cliente: string;
  gestor: string;
  gasto: number;
  conversas: number;
  /** `null` quando não houve conversa: CPL indefinido, jamais zero. */
  cpl: number | null;
}

/**
 * Contas com CPL acima do teto.
 *
 * ⚠️ POR CONTA, e não por gestor — e a diferença não é de granularidade, é de
 * resultado. Medido em 16/08/2026 na janela de 7 dias: **por gestor, 0 de 8
 * passavam do teto; por conta, 6 passavam.** A média do gestor dilui a conta ruim
 * dentro de uma carteira boa, então a Início dizia "tudo sob controle" enquanto
 * seis contas estouravam. O resumo por gestor continua existindo para o Dashboard,
 * onde a pergunta é outra.
 */
export function contasComCplAlto(linhas: ContaEmAlerta[], teto = CPL_ALERTA): ContaEmAlerta[] {
  return linhas
    .filter((l) => l.cpl !== null && l.cpl >= teto)
    .sort((a, b) => (b.cpl ?? 0) - (a.cpl ?? 0));
}

/**
 * Contas que GASTARAM e não converteram nada na janela.
 *
 * ⚠️ ELAS SOMEM DE QUALQUER ALERTA DE CPL, e são o pior caso possível. CPL sem
 * conversão é **indefinido**, não é um número alto: dividir por zero não dá um
 * valor grande, dá coisa nenhuma — então um filtro `cpl >= 31` nunca as pega, por
 * mais que gastem. É a mesma família do `situacaoDoAnuncio`, que devolve `null` e
 * não "pausado" quando a Meta não responde: **ausência de dado não é evidência de
 * ausência do fato.** Por isso linha própria, com o gasto exposto.
 */
export function contasQueGastaramSemConverter(linhas: ContaEmAlerta[]): ContaEmAlerta[] {
  return linhas
    .filter((l) => l.gasto > 0 && l.conversas === 0)
    .sort((a, b) => b.gasto - a.gasto);
}

export interface ResumoAtencao {
  cplAltoCount: number;      // gestores com CPL >= CPL_ALERTA
  pertoCount: number;        // contas perto do teto
  criticosCount: number;     // contas >= LIMITE_CRITICO
  piorCplNome: string | null;
  piorCplValor: number | null;
  piorLimiteCliente: string | null;
  piorLimitePct: number | null;
}

// Resumo dos alertas para a Início. As contas já devem vir SEM as pausadas
// (mesma regra do Dashboard: pausada fica fora de tudo).
export function resumoAtencao(
  daily: MetricaDiaria[],
  contasAtivas: ContaMap[],
  limites: LimiteConta[],
  periodoDias: number
): ResumoAtencao {
  const painel = montarPainel(daily, contasAtivas, periodoDias);
  const cplAlto = painel.gestores.filter((g) => g.cpl >= CPL_ALERTA);
  const perto = contasPertoDoLimite(contasAtivas, limites);
  const piorCpl = cplAlto.length ? cplAlto.reduce((a, b) => (b.cpl > a.cpl ? b : a)) : null;
  const piorLim = perto.length ? perto[0] : null; // já ordenado da mais crítica

  return {
    cplAltoCount: cplAlto.length,
    pertoCount: perto.length,
    criticosCount: perto.filter((p) => p.critico).length,
    piorCplNome: piorCpl?.nome ?? null,
    piorCplValor: piorCpl?.cpl ?? null,
    piorLimiteCliente: piorLim?.cliente ?? null,
    piorLimitePct: piorLim ? Math.round(piorLim.usoPct * 100) : null,
  };
}
