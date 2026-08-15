"use client";

import { useEffect, useState } from "react";
import { mensagemErro } from "./erros";
import { buscarJson } from "./buscaAutenticada";
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

// ⚠️ Teto de espera via `buscarJson` — sem ele, um servidor que aceita a conexão
// e não responde deixa o Dashboard em "Carregando…" para sempre. É a tela que a
// agência mais usa, e ali isso passaria por "hoje está lento".
const buscar = () => buscarJson<DadosPainel>("/api/painel", { oQue: "os dados do painel" });

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
