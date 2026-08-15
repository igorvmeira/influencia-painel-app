"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { buscarJson } from "./buscaAutenticada";
import { EntradaOrientacao, Orientacao } from "./types";
import type { Semaforo } from "./semaforo";

/**
 * ⚠️ AINDA USADO PELOS POSTS, e de propósito.
 *
 * O teto de espera do `buscarJson` cobre LEITURA. Em ESCRITA ele seria perigoso:
 * abortar o cliente não cancela o que o servidor já gravou, então quem visse o
 * erro poderia salvar de novo. Em `salvarGestor` isso é inofensivo (grava o mesmo
 * campo), mas `salvarOrientacao` EMPILHA no histórico — a retentativa duplicaria
 * o registro.
 *
 * Regra: teto em GET sempre; em POST, só com escrita idempotente.
 */
async function tokenAtual(): Promise<string> {
  const u = auth?.currentUser;
  if (!u) throw new Error("Sessão expirada. Faça login novamente.");
  return u.getIdToken();
}

// Lista: só a orientação ATUAL de cada conta (leve). accountId → atual|null.
export function useOrientacoes(): {
  mapa: Record<string, EntradaOrientacao | null> | null;
  erro: string | null;
  recarregar: () => Promise<void>;
} {
  const [mapa, setMapa] = useState<Record<string, EntradaOrientacao | null> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      // Teto de espera via `buscarJson` — ver lib/buscaAutenticada.ts.
      const j = await buscarJson<{ orientacoes: { accountId: string; atual: EntradaOrientacao | null }[] }>(
        "/api/orientacoes", { oQue: "as orientações" }
      );
      const m: Record<string, EntradaOrientacao | null> = {};
      for (const o of j.orientacoes as Orientacao[]) m[o.accountId] = o.atual;
      setMapa(m);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { mapa, erro, recarregar };
}

// Salva uma orientação (POST). Retorna a atual gravada.
// `semaforo` é OPCIONAL: null = não classificado (cinza). Ver lib/semaforo.ts.
export async function salvarOrientacao(
  accountId: string, texto: string, semaforo: Semaforo | null = null
): Promise<EntradaOrientacao> {
  const token = await tokenAtual();
  const r = await fetch("/api/orientacoes", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accountId, texto, semaforo }),
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  return j.atual as EntradaOrientacao;
}

// Histórico de uma conta (sob demanda).
export async function buscarHistorico(accountId: string): Promise<EntradaOrientacao[]> {
  const j = await buscarJson<{ historico?: EntradaOrientacao[] }>(
    `/api/orientacoes?accountId=${encodeURIComponent(accountId)}`,
    { oQue: "o histórico da conta" }
  );
  return j.historico ?? [];
}
