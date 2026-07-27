"use client";

import Dashboard from "./Dashboard";
import DashboardSkeleton from "./DashboardSkeleton";
import { useDadosPainel } from "@/lib/useDadosPainel";
import { TEMA } from "@/lib/brand";

// Carrega os dados do painel no client, já autenticado (via /api/painel com ID token).
// Assim os dados nunca vão para o HTML de quem não está logado.
export default function DashboardLoader() {
  const { dados, erro } = useDadosPainel();

  if (erro) {
    return (
      <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.erroFundo, color: TEMA.negativo }}>
        {erro}
      </div>
    );
  }
  if (!dados) return <DashboardSkeleton />;

  return <Dashboard daily={dados.daily} contas={dados.contas} fonte={dados.fonte} ultimaSync={dados.ultimaSync} limites={dados.limites} />;
}
