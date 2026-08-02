"use client";

import { auth } from "./firebaseClient";
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
  const usuario = auth?.currentUser;
  if (!usuario) throw new Error("Sessão expirada. Faça login novamente.");
  const token = await usuario.getIdToken();

  const resultados = await Promise.allSettled(
    contas.map(async (c) => {
      const r = await fetch(
        `/api/criativos-mes?accountId=${encodeURIComponent(c.accountId)}&ano=${ano}&mes=${mes}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
      return {
        deCache: !!j.doCache,
        criativos: (j.criativos as Criativo[]).map((cr) => ({
          ...cr,
          accountId: c.accountId,
          cliente: c.cliente,
        })),
      };
    })
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
