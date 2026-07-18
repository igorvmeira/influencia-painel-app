"use client";

import Link from "next/link";
import { useDadosPainel } from "@/lib/useDadosPainel";
import { resumoAtencao, CPL_ALERTA } from "@/lib/alertas";
import { MENU_EM_BREVE } from "@/lib/menu";
import { brlDec } from "@/lib/format";
import { TEMA } from "@/lib/brand";
import IndicadorFrescor from "./IndicadorFrescor";

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const GREEN = TEMA.positivo;
const RED = TEMA.negativo;
const AMBAR = TEMA.atencao;

// Período fixo do resumo da Início (a tela não tem seletor). Mesmo default do Dashboard.
const DIAS_RESUMO = 15;

export default function Inicio() {
  const { dados, erro } = useDadosPainel();

  // Pausadas ficam FORA de tudo, igual ao Dashboard.
  const contasAtivas = dados ? dados.contas.filter((c) => !c.pausado) : [];
  const resumo = dados ? resumoAtencao(dados.daily, contasAtivas, dados.limites, DIAS_RESUMO) : null;
  const tudoOk = resumo ? resumo.cplAltoCount === 0 && resumo.pertoCount === 0 : false;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Início</h1>
          <p className="text-[13px]" style={{ color: MUTED }}>O que precisa da sua atenção hoje.</p>
        </div>
        <IndicadorFrescor ultimaSync={dados?.ultimaSync ?? null} />
      </div>

      {erro && (
        <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: "#2a1414", color: RED }}>
          Erro ao carregar: {erro}
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {/* Card do Dashboard — resumo real de atenção */}
        <Link
          href="/dashboard"
          className="block p-5 transition-colors hover:bg-[#232323]"
          style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-white">Dashboard de Tráfego</span>
            <span className="text-[11px]" style={{ color: MUTED }}>últimos {DIAS_RESUMO} dias →</span>
          </div>

          {!dados ? (
            <div className="mt-3 h-4 w-40 animate-pulse rounded motion-reduce:animate-none" style={{ background: LINE }} />
          ) : tudoOk ? (
            <div className="mt-3 flex items-center gap-2 text-[13px]">
              <span style={{ color: GREEN }}>✓</span>
              <span style={{ color: MUTED }}>Tudo sob controle nos últimos {DIAS_RESUMO} dias.</span>
            </div>
          ) : (
            <div className="mt-3 space-y-1.5 text-[13px]">
              {resumo!.cplAltoCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: RED }} />
                  <span style={{ color: "#fff" }}>
                    {resumo!.cplAltoCount} {resumo!.cplAltoCount === 1 ? "gestor" : "gestores"} com CPL acima de {brlDec(CPL_ALERTA)}
                  </span>
                  {resumo!.piorCplNome && (
                    <span style={{ color: MUTED }}>· pior: {resumo!.piorCplNome} ({brlDec(resumo!.piorCplValor ?? 0)})</span>
                  )}
                </div>
              )}
              {resumo!.pertoCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: AMBAR }} />
                  <span style={{ color: "#fff" }}>
                    {resumo!.pertoCount} {resumo!.pertoCount === 1 ? "conta perto" : "contas perto"} do limite de gasto
                  </span>
                  {resumo!.piorLimiteCliente && (
                    <span style={{ color: MUTED }}>· mais crítica: {resumo!.piorLimiteCliente} ({resumo!.piorLimitePct}%)</span>
                  )}
                </div>
              )}
            </div>
          )}
        </Link>

        {/* Cards EM BREVE — visíveis, desabilitados */}
        {MENU_EM_BREVE.map((item) => (
          <div
            key={item.rotulo}
            aria-disabled="true"
            className="p-5"
            style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, cursor: "not-allowed" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium" style={{ color: MUTED }}>{item.rotulo}</span>
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase" style={{ background: LINE, color: MUTED }}>
                Em breve
              </span>
            </div>
            <p className="mt-3 text-[13px]" style={{ color: MUTED }}>{item.descricao}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
