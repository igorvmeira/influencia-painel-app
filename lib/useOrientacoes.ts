"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { EntradaOrientacao, Orientacao } from "./types";

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
      const token = await tokenAtual();
      const r = await fetch("/api/orientacoes", { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
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
export async function salvarOrientacao(accountId: string, texto: string): Promise<EntradaOrientacao> {
  const token = await tokenAtual();
  const r = await fetch("/api/orientacoes", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accountId, texto }),
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  return j.atual as EntradaOrientacao;
}

// Histórico de uma conta (sob demanda).
export async function buscarHistorico(accountId: string): Promise<EntradaOrientacao[]> {
  const token = await tokenAtual();
  const r = await fetch(`/api/orientacoes?accountId=${encodeURIComponent(accountId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  return (j.historico ?? []) as EntradaOrientacao[];
}
