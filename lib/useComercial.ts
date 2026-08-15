"use client";

import { useEffect, useState } from "react";
import { mensagemErro } from "./erros";
import { buscarJson } from "./buscaAutenticada";
import type { AgregadoComercial } from "./comercialAgregado";

/** Cache de sessão — o agregado só muda quando o sync roda, então trocar de aba
 *  e voltar não refaz a busca. Mesmo padrão do useContas. */
let cache: AgregadoComercial | null = null;
let carregou = false;
let emVoo: Promise<AgregadoComercial | null> | null = null;

// Teto de espera e tradução do abort vivem em `buscarJson` — ver o porquê lá.
async function buscar(): Promise<AgregadoComercial | null> {
  const j = await buscarJson<{ agregado: AgregadoComercial | null }>(
    "/api/comercial/funil",
    { oQue: "o funil comercial" }
  );
  return j.agregado ?? null;
}

export function useComercial(): {
  agregado: AgregadoComercial | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
} {
  const [agregado, setAgregado] = useState<AgregadoComercial | null>(cache);
  const [carregando, setCarregando] = useState(!carregou);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (carregou) { setCarregando(false); return; }
    let vivo = true;
    setErro(null);
    setCarregando(true);
    emVoo = emVoo ?? buscar();
    emVoo
      .then((a) => {
        cache = a; carregou = true;
        if (vivo) { setAgregado(a); setCarregando(false); }
      })
      .catch((e) => {
        // ⚠️ Zera a promessa compartilhada: sem isso, a falha ficaria memorizada
        // no módulo e o "tentar de novo" reanexaria à MESMA promessa já rejeitada,
        // repetindo o erro sem tocar na rede.
        emVoo = null;
        if (vivo) { setErro(mensagemErro(e)); setCarregando(false); }
      });
    return () => { vivo = false; };
  }, [tentativa]);

  return { agregado, carregando, erro, recarregar: () => setTentativa((t) => t + 1) };
}
