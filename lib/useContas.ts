"use client";

import { useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { mensagemErro } from "./erros";
import { ContaMap } from "./types";

// Cache de sessão do de-para (leve). Usado pela /orientacoes (só precisa das contas).
let cache: ContaMap[] | null = null;
let emVoo: Promise<ContaMap[]> | null = null;

async function buscar(): Promise<ContaMap[]> {
  const usuario = auth?.currentUser;
  if (!usuario) throw new Error("Sessão expirada. Faça login novamente.");
  const token = await usuario.getIdToken();
  const r = await fetch("/api/contas", { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  return j.contas as ContaMap[];
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
