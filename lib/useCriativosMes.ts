"use client";

import { buscarJson } from "./buscaAutenticada";
import { Criativo } from "./types";

/** Criativo do mês com a conta de origem (para o card dizer de quem é). */
export interface CriativoMes extends Criativo {
  accountId: string;
  cliente: string;
}

/**
 * Criativos de um mês FECHADO para várias contas (as de um gestor).
 *
 * SOB DEMANDA: só é chamado quando o usuário abre o bloco. São ~9 chamadas para
 * um gestor médio, e a partir da segunda visita o servidor responde do cache
 * permanente (`doCache: true`), sem custar chamada de insights à Meta.
 *
 * Conta que falhar não derruba as outras — o bloco mostra o que conseguiu.
 */
export async function buscarCriativosMes(
  contas: { accountId: string; cliente: string }[],
  ano: number,
  mes: number
): Promise<{ criativos: CriativoMes[]; falhas: number; deCache: number }> {
  /**
   * ⚠️ AQUI O TETO IMPORTA MAIS QUE NOS OUTROS, e o motivo é o `allSettled`:
   * ele espera TODAS as promessas se acomodarem. Uma única conta cuja requisição
   * nunca settla trava o bloco inteiro para sempre — as outras oito já teriam
   * respondido e nada apareceria. O "conta que falhar não derruba as outras" do
   * comentário acima só vale se a falha CHEGAR a acontecer; sem teto, ela fica
   * pendurada e leva o resto junto.
   *
   * Teto maior que o padrão: esta rota consulta a Meta ao vivo na primeira visita
   * do mês, e 20s é apertado para insights de uma conta grande.
   */
  const resultados = await Promise.allSettled(
    contas.map((c) =>
      buscarJson<{ doCache?: boolean; criativos: Criativo[] }>(
        `/api/criativos-mes?accountId=${encodeURIComponent(c.accountId)}&ano=${ano}&mes=${mes}`,
        { tetoMs: 45000, oQue: `os criativos de ${c.cliente}` }
      ).then((j) => ({
        deCache: !!j.doCache,
        criativos: j.criativos.map((cr) => ({
          ...cr,
          accountId: c.accountId,
          cliente: c.cliente,
        })),
      }))
    )
  );

  const criativos: CriativoMes[] = [];
  let falhas = 0, deCache = 0;
  for (const r of resultados) {
    if (r.status === "fulfilled") {
      criativos.push(...r.value.criativos);
      if (r.value.deCache) deCache++;
    } else falhas++;
  }
  return { criativos, falhas, deCache };
}
