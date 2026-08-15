"use client";

import { useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { mensagemErro } from "./erros";
import { buscarJson } from "./buscaAutenticada";
import { ContaMap } from "./types";

// Cache de sessão do de-para (leve). Usado pela /orientacoes (só precisa das contas).
let cache: ContaMap[] | null = null;
let emVoo: Promise<ContaMap[]> | null = null;

// Teto de espera via `buscarJson` — ver o porquê em lib/buscaAutenticada.ts.
async function buscar(): Promise<ContaMap[]> {
  const j = await buscarJson<{ contas: ContaMap[] }>("/api/contas", { oQue: "a carteira de contas" });
  return j.contas;
}

// Atualiza o cache de sessão do de-para (in-place, novo array) após uma escrita, para
// que /carteira e /orientacoes reflitam a mudança na hora, sem esperar o TTL do servidor.
export function atualizarContaNoCache(accountId: string, patch: Partial<ContaMap>): void {
  if (!cache) return;
  cache = cache.map((c) => (c.accountId === accountId ? { ...c, ...patch } : c));
}

// Salva o gestor de uma conta (POST /api/contas). Autor vem do token no servidor.
// Retorna o gestor gravado e já atualiza o cache de sessão.
export async function salvarGestor(accountId: string, gestor: string): Promise<{ gestor: string }> {
  const usuario = auth?.currentUser;
  if (!usuario) throw new Error("Sessão expirada. Faça login novamente.");
  const token = await usuario.getIdToken();
  const r = await fetch("/api/contas", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accountId, gestor }),
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  atualizarContaNoCache(accountId, {
    gestor: j.gestor as string,
    gestorEditadoPor: (j.por as string) ?? undefined,
    gestorEditadoEm: (j.em as string) ?? undefined,
  });
  return { gestor: j.gestor as string };
}

export function useContas(): { contas: ContaMap[] | null; erro: string | null } {
  const [contas, setContas] = useState<ContaMap[] | null>(cache);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (cache) { setContas(cache); return; }
    if (!emVoo) emVoo = buscar();
    emVoo
      .then((c) => { cache = c; if (vivo) setContas(c); })
      .catch((e) => { emVoo = null; if (vivo) setErro(mensagemErro((e as Error).message)); });
    return () => { vivo = false; };
  }, []);

  return { contas, erro };
}
