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
// Retorna o gestor E a flag `pausado` que o servidor gravou (estacionar grava os dois) e
// já atualiza o cache de sessão.
//
// ⚠️ `pausado: null` = o servidor não disse. A tela NÃO deduz a flag do gestor: a regra
// mora em `pausadoPara`, no servidor, e uma resposta sem o campo (deploy antigo ainda
// respondendo) mantém o que a tela já mostrava em vez de inventar.
export async function salvarGestor(
  accountId: string, gestor: string
): Promise<{ gestor: string; pausado: boolean | null }> {
  const usuario = auth?.currentUser;
  if (!usuario) throw new Error("Sessão expirada. Faça login novamente.");
  const token = await usuario.getIdToken();
  const r = await fetch("/api/contas", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accountId, gestor }),
  });
  const j = await r.json();
  // ⚠️ O 409 CARREGA `detalhe`, e ele é a metade que importa: explica a CORRIDA — a tela
  // carregou antes de a conciliação marcar a conta, e o clique veio depois. Sem isso, a
  // pessoa lê "o gestor vem da planilha" numa tela que acabou de lhe oferecer o seletor,
  // e conclui que a tela quebrou. Mesmo defeito do veredito que morre tarde demais.
  if (r.status === 409 && j?.erro) {
    throw new Error(j.detalhe ? `${j.erro} ${j.detalhe}` : j.erro);
  }
  if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  const pausado = typeof j.pausado === "boolean" ? (j.pausado as boolean) : null;
  atualizarContaNoCache(accountId, {
    gestor: j.gestor as string,
    ...(pausado !== null ? { pausado } : {}),
    gestorEditadoPor: (j.por as string) ?? undefined,
    gestorEditadoEm: (j.em as string) ?? undefined,
  });
  return { gestor: j.gestor as string, pausado };
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
