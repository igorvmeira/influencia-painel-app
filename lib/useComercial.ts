"use client";

import { useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { mensagemErro } from "./erros";
import type { AgregadoComercial } from "./comercialAgregado";

/** Cache de sessão — o agregado só muda quando o sync roda, então trocar de aba
 *  e voltar não refaz a busca. Mesmo padrão do useContas. */
let cache: AgregadoComercial | null = null;
let carregou = false;
let emVoo: Promise<AgregadoComercial | null> | null = null;

async function buscar(): Promise<AgregadoComercial | null> {
  const usuario = auth?.currentUser;
  if (!usuario) throw new Error("Sessão expirada. Faça login novamente.");
  const token = await usuario.getIdToken();
  const r = await fetch("/api/comercial/funil", { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  return (j.agregado ?? null) as AgregadoComercial | null;
}

export function useComercial(): { agregado: AgregadoComercial | null; carregando: boolean; erro: string | null } {
  const [agregado, setAgregado] = useState<AgregadoComercial | null>(cache);
  const [carregando, setCarregando] = useState(!carregou);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (carregou) { setCarregando(false); return; }
    let vivo = true;
    emVoo = emVoo ?? buscar();
    emVoo
      .then((a) => {
        cache = a; carregou = true;
        if (vivo) { setAgregado(a); setCarregando(false); }
      })
      .catch((e) => {
        emVoo = null;
        if (vivo) { setErro(mensagemErro(e)); setCarregando(false); }
      });
    return () => { vivo = false; };
  }, []);

  return { agregado, carregando, erro };
}
