"use client";

import { useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { mensagemErro } from "./erros";
import { ContaMap, LimiteConta, MetricaDiaria } from "./types";

export interface DadosPainel {
  daily: MetricaDiaria[];
  contas: ContaMap[];
  fonte: "firestore" | "mock";
  ultimaSync: string | null;
  limites: LimiteConta[];
}

// Cache de SESSÃO (módulo): busca /api/painel uma vez e reusa entre as telas
// (Início e Dashboard), evitando refetch a cada navegação. Reseta num reload.
let cache: DadosPainel | null = null;
let emVoo: Promise<DadosPainel> | null = null;

async function buscar(): Promise<DadosPainel> {
  const usuario = auth?.currentUser;
  if (!usuario) throw new Error("Sessão expirada. Faça login novamente.");
  const token = await usuario.getIdToken();
  const r = await fetch("/api/painel", { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  return j as DadosPainel;
}

// Busca autenticada de /api/painel (mesma do dashboard). Reusa o cache de sessão.
export function useDadosPainel(): { dados: DadosPainel | null; erro: string | null } {
  const [dados, setDados] = useState<DadosPainel | null>(cache);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (cache) { setDados(cache); return; }
    if (!emVoo) emVoo = buscar();
    emVoo
      .then((d) => { cache = d; if (vivo) setDados(d); })
      .catch((e) => { emVoo = null; if (vivo) setErro(mensagemErro((e as Error).message)); });
    return () => { vivo = false; };
  }, []);

  return { dados, erro };
}
