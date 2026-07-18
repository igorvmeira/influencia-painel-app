"use client";

import { useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { ContaMap, LimiteConta, MetricaDiaria } from "./types";

export interface DadosPainel {
  daily: MetricaDiaria[];
  contas: ContaMap[];
  fonte: "firestore" | "mock";
  ultimaSync: string | null;
  limites: LimiteConta[];
}

// Busca autenticada de /api/painel (mesma do dashboard). Reusado por DashboardLoader
// e pela tela Início — evita duplicar o fetch. Não altera a API.
export function useDadosPainel(): { dados: DadosPainel | null; erro: string | null } {
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const usuario = auth?.currentUser;
      if (!usuario) throw new Error("Sessão expirada. Faça login novamente.");
      const token = await usuario.getIdToken();
      const r = await fetch("/api/painel", { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
      return j as DadosPainel;
    })()
      .then((d) => { if (!cancelado) setDados(d); })
      .catch((e) => { if (!cancelado) setErro(e.message); });
    return () => { cancelado = true; };
  }, []);

  return { dados, erro };
}
