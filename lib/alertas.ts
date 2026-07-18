import { ContaMap, LimiteConta, MetricaDiaria } from "./types";
import { montarPainel } from "./painel";

// Regra ÚNICA dos alertas — usada pela faixa "Precisa de atenção" do Dashboard e
// pelo resumo da tela Início. Não duplicar limiares/lógica em outro lugar.

// Limiar do alerta de CPL alto, em R$.
export const CPL_ALERTA = 15;
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
