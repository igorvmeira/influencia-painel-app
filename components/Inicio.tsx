"use client";

import Link from "next/link";
import { useDadosPainel } from "@/lib/useDadosPainel";
import { useOrientacoes } from "@/lib/useOrientacoes";
import { resumoAtencao, CPL_ALERTA } from "@/lib/alertas";
import { haQuanto } from "@/lib/tempo";
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

// Identidade por card: chip de ícone em tint quente + ícone na cor escura do par.
// Os pares (fundo/cor) vêm dos tokens e já foram conferidos em contraste (≥6:1).
// Terra e oliva são PROVISÓRIOS — ver a nota em lib/brand.ts.
function ChipIcone({ fundo, cor, children }: { fundo: string; cor: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[15px] leading-none"
      style={{ background: fundo, color: cor }}
    >
      {children}
    </span>
  );
}

export default function Inicio() {
  const { dados, erro } = useDadosPainel();
  const { mapa: orientacoes, erro: erroOri } = useOrientacoes();

  // Pausadas ficam FORA de tudo, igual ao Dashboard.
  const contasAtivas = dados ? dados.contas.filter((c) => !c.pausado) : [];

  // Resumo das orientações: contas ativas sem orientação + última atualização.
  let resumoOri: string | null = null;
  if (orientacoes && dados) {
    const sem = contasAtivas.filter((c) => !orientacoes[c.accountId]).length;
    let ultima = "";
    for (const k in orientacoes) {
      const a = orientacoes[k];
      if (a?.em && (ultima === "" || a.em > ultima)) ultima = a.em;
    }
    resumoOri =
      `${sem} ${sem === 1 ? "conta sem orientação" : "contas sem orientação"}` +
      (ultima ? ` · última atualização ${haQuanto(ultima)}` : "");
  }
  const resumo = dados ? resumoAtencao(dados.daily, contasAtivas, dados.limites, DIAS_RESUMO) : null;
  const tudoOk = resumo ? resumo.cplAltoCount === 0 && resumo.pertoCount === 0 : false;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-brand-ink">Início</h1>
          <p className="text-[13px]" style={{ color: MUTED }}>O que precisa da sua atenção hoje.</p>
        </div>
        <IndicadorFrescor ultimaSync={dados?.ultimaSync ?? null} />
      </div>

      {erro && (
        <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.erroFundo, color: RED }}>
          {erro}
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {/* Card do Dashboard — resumo real de atenção */}
        <Link
          href="/dashboard"
          className="block p-5 transition-colors hover:bg-brand-hover"
          style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2.5">
              <ChipIcone fundo={TEMA.chipDourado} cor={TEMA.ouroTexto}>◧</ChipIcone>
              <span className="text-sm font-medium text-brand-ink">Dashboard de Tráfego</span>
            </span>
            <span className="text-[11px]" style={{ color: MUTED }}>últimos {DIAS_RESUMO} dias →</span>
          </div>

          {erro ? (
            <p className="mt-3 text-[13px]" style={{ color: MUTED }}>Indisponível no momento.</p>
          ) : !dados ? (
            <div className="mt-3 h-4 w-40 animate-pulse rounded motion-reduce:animate-none" style={{ background: LINE }} />
          ) : tudoOk ? (
            <div className="mt-3 flex items-center gap-2 text-[13px]">
              <span style={{ color: GREEN }}>✓</span>
              <span style={{ color: MUTED }}>Tudo sob controle nos últimos {DIAS_RESUMO} dias.</span>
            </div>
          ) : (
            <div className="mt-3 space-y-1.5 text-[13px]">
              {resumo!.cplAltoCount > 0 && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {/* Número em cor semântica e peso forte: o sinal está no próprio
                      dado, não num pontinho decorativo ao lado. */}
                  <span style={{ color: TEMA.texto }}>
                    <strong className="font-semibold tabular-nums" style={{ color: RED }}>{resumo!.cplAltoCount}</strong>
                    {" "}{resumo!.cplAltoCount === 1 ? "gestor" : "gestores"} com CPL acima de {brlDec(CPL_ALERTA)}
                  </span>
                  {resumo!.piorCplNome && (
                    <span style={{ color: MUTED }}>· pior: {resumo!.piorCplNome} ({brlDec(resumo!.piorCplValor ?? 0)})</span>
                  )}
                </div>
              )}
              {resumo!.pertoCount > 0 && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span style={{ color: TEMA.texto }}>
                    <strong className="font-semibold tabular-nums" style={{ color: AMBAR }}>{resumo!.pertoCount}</strong>
                    {" "}{resumo!.pertoCount === 1 ? "conta perto" : "contas perto"} do limite de gasto
                  </span>
                  {resumo!.piorLimiteCliente && (
                    <span style={{ color: MUTED }}>· mais crítica: {resumo!.piorLimiteCliente} ({resumo!.piorLimitePct}%)</span>
                  )}
                </div>
              )}
            </div>
          )}
        </Link>

        {/* ESCONDIDO a pedido do Roberto (05/08/2026): o card de "Pautas e Reuniões"
            saiu daqui e do menu (ver lib/menu.ts) porque a /reunioes mostra a agenda
            pessoal do Thiago, não a da equipe. Nada do Google Agenda foi mexido: a
            rota, o componente, /api/agenda e as envs GOOGLE_* seguem funcionando, e
            /reunioes abre para quem souber a URL.

            REEXIBIR = devolver o <Link href="/reunioes"> com o ChipIcone terra (▤) e
            o resumo da agenda, mais o hook useAgenda() e os helpers de formatAgenda
            (chaveDia, hhmm, chavesHojeAmanha) que vinham com ele. O commit que
            escondeu tem o bloco inteiro. Com o card fora, a Início deixou de chamar
            /api/agenda — uma ida ao Google a menos por carregamento. */}

        {/* Card de Orientações — resumo real */}
        <Link
          href="/orientacoes"
          className="block p-5 transition-colors hover:bg-brand-hover"
          style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2.5">
              <ChipIcone fundo={TEMA.chipOliva} cor={TEMA.olivaTexto}>✎</ChipIcone>
              <span className="text-sm font-medium text-brand-ink">Orientações Gerenciais</span>
            </span>
            <span className="text-[11px]" style={{ color: MUTED }}>gerenciar →</span>
          </div>
          {erro ? (
            <p className="mt-3 text-[13px]" style={{ color: MUTED }}>Indisponível no momento.</p>
          ) : erroOri ? (
            <p className="mt-3 text-[13px]" style={{ color: MUTED }}>Não foi possível carregar as orientações.</p>
          ) : !orientacoes || !dados ? (
            <div className="mt-3 h-4 w-52 animate-pulse rounded motion-reduce:animate-none" style={{ background: LINE }} />
          ) : (
            <p className="mt-3 text-[13px]" style={{ color: TEMA.texto }}>{resumoOri}</p>
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
