"use client";

import { useEffect, useState } from "react";
import { buscarJson } from "./buscaAutenticada";
import { Reuniao } from "./types";

// Busca autenticada de /api/agenda (ID token do Firebase). Reusado pela tela
// Reuniões e pelo card do Início.
export function useAgenda(): { reunioes: Reuniao[] | null; erro: string | null } {
  const [reunioes, setReunioes] = useState<Reuniao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    // Teto de espera via `buscarJson` — ver o porquê em lib/buscaAutenticada.ts.
    buscarJson<{ reunioes: Reuniao[] }>("/api/agenda", { oQue: "a agenda" })
      .then((j) => { if (!cancelado) setReunioes(j.reunioes); })
      .catch((e) => { if (!cancelado) setErro(e.message); });
    return () => { cancelado = true; };
  }, []);

  return { reunioes, erro };
}
