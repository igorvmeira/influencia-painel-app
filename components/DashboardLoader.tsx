"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import Dashboard from "./Dashboard";
import { ContaMap, MetricaDiaria } from "@/lib/types";

interface Dados { daily: MetricaDiaria[]; contas: ContaMap[]; fonte: "firestore" | "mock"; ultimaSync: string | null }

// Carrega os dados do painel no client, já autenticado (via /api/painel com ID token).
// Assim os dados nunca vão para o HTML de quem não está logado.
export default function DashboardLoader() {
  const [dados, setDados] = useState<Dados | null>(null);
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
      return j as Dados;
    })()
      .then((d) => { if (!cancelado) setDados(d); })
      .catch((e) => { if (!cancelado) setErro(e.message); });
    return () => { cancelado = true; };
  }, []);

  if (erro) {
    return (
      <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "#2a1414", color: "#FF6B5E" }}>
        Erro ao carregar o painel: {erro}
      </div>
    );
  }
  if (!dados) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm" style={{ color: "#9A968F" }}>
        Carregando painel…
      </div>
    );
  }
  return <Dashboard daily={dados.daily} contas={dados.contas} fonte={dados.fonte} ultimaSync={dados.ultimaSync} />;
}
