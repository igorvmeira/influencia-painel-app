"use client";

import { useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { Reuniao } from "./types";

// Busca autenticada de /api/agenda (ID token do Firebase). Reusado pela tela
// Reuniões e pelo card do Início.
export function useAgenda(): { reunioes: Reuniao[] | null; erro: string | null } {
  const [reunioes, setReunioes] = useState<Reuniao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const usuario = auth?.currentUser;
      if (!usuario) throw new Error("Sessão expirada. Faça login novamente.");
      const token = await usuario.getIdToken();
      const r = await fetch("/api/agenda", { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
      return j.reunioes as Reuniao[];
    })()
      .then((d) => { if (!cancelado) setReunioes(d); })
      .catch((e) => { if (!cancelado) setErro(e.message); });
    return () => { cancelado = true; };
  }, []);

  return { reunioes, erro };
}
