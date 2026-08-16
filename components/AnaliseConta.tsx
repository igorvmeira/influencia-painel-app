"use client";

import { useMemo, useState } from "react";
import { useDadosPainel } from "@/lib/useDadosPainel";
import { analiseDaConta, montarNichos } from "@/lib/painel";
import { coberturaMes } from "@/lib/periodo";
import { brl, brlDec, num } from "@/lib/format";
import { TEMA } from "@/lib/brand";
import { ContaMap } from "@/lib/types";
import KpiCard from "./KpiCard";
import DeltaChip from "./DeltaChip";
import SecaoHeader from "./SecaoHeader";
import CriativosDaConta from "./CriativosDaConta";

const MUTED = TEMA.muted;
const AMBER = TEMA.atencao;

/** Os mesmos degraus do Dashboard — mudar aqui e lá seria duas verdades. */
const PERIODOS = [7, 15, 30, 60] as const;

/**
 * A análise de UMA conta, para o modal — o que o Roberto listou que olha quando
 * quer entender um cliente.
 *
 * ⚠️ CUSTO: quase tudo sai do `/api/painel`, que a sessão já carrega uma vez e
 * reusa. Comparação de período, CPL, gasto e desvio do nicho são cálculo em cima
 * de dado que já está na memória — zero leitura por abertura.
 * O ÚNICO custo é criativo, e por isso ele fica atrás de um clique próprio.
 */
export default function AnaliseConta({ conta }: { conta: ContaMap }) {
  const { dados, erro } = useDadosPainel();
  const [dias, setDias] = useState<number>(30);

  const analise = useMemo(() => {
    if (!dados) return null;
    // ⚠️ O NICHO precisa de TODAS as contas, não só desta: média de um cliente
    // contra ele mesmo não é média.
    const linha = analiseDaConta(dados.daily, dados.contas, conta.accountId, dias);
    const nichos = montarNichos(dados.daily, dados.contas, dias);
    const nicho = nichos.find((n) => n.clientes.some((c) => c.accountId === conta.accountId));
    const noNicho = nicho?.clientes.find((c) => c.accountId === conta.accountId) ?? null;
    return { linha, nicho, noNicho };
  }, [dados, conta.accountId, dias]);

  // Mês incompleto: reusa a MESMA função da /gestores, não uma segunda leitura
  // do que é "completo" — duas definições divergiriam na primeira mudança.
  const cobertura = useMemo(() => {
    if (!dados) return null;
    const hoje = new Date();
    return coberturaMes(dados.daily, conta.accountId, hoje.getFullYear(), hoje.getMonth() + 1);
  }, [dados, conta.accountId]);

  if (erro) {
    return <p className="text-[13px]" style={{ color: TEMA.negativo }}>{erro}</p>;
  }
  if (!dados || !analise) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse motion-reduce:animate-none"
            style={{ background: TEMA.hover, borderRadius: TEMA.raioCard }} />
        ))}
      </div>
    );
  }

  const { linha, nicho, noNicho } = analise;
  const semDado = !linha.temDado;

  return (
    <div>
      {/* ⚠️ O ENQUADRAMENTO VEM ANTES DOS NÚMEROS. "CPL R$ 0,00" sem contexto é o
          que engana; o histórico em si é dado real e continua valendo. */}
      {conta.pausado && (
        <div className="mb-4 rounded-lg px-4 py-3 text-[12.5px] leading-relaxed"
          style={{ background: TEMA.limiteFundo, color: AMBER }}>
          <b>⚠ Conta pausada.</b> Ela não está veiculando, então os números abaixo são o
          histórico do período — não desempenho atual. Comparação de período fica sem cor
          semântica: variação entre dois períodos sem veiculação não afirma nada.
        </div>
      )}

      {cobertura && !cobertura.completo && !conta.pausado && (
        <div className="mb-4 rounded-lg px-4 py-3 text-[12.5px] leading-relaxed"
          style={{ background: TEMA.limiteFundo, color: AMBER }}>
          <b>⚠ Mês incompleto.</b> A série desta conta começa depois do dia 1
          {cobertura.primeiroDiaSerie ? ` (${cobertura.primeiroDiaSerie})` : ""} — o mesmo aviso
          que a Análise de Gestores dá. Comparar contra o mês anterior mede base diferente.
        </div>
      )}

      {/* Seletor de período: o modal não herda o do Dashboard porque a /carteira
          não tem período nenhum — ele precisa perguntar. */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {PERIODOS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDias(d)}
            className="rounded-full px-3.5 py-1.5 text-[12px] font-medium transition hover:brightness-125"
            style={dias === d
              ? { background: TEMA.destaque, color: TEMA.textoSobreDestaque }
              : { background: TEMA.chip, color: MUTED }}
          >
            {d}d
          </button>
        ))}
      </div>

      {semDado ? (
        <p className="rounded-lg px-4 py-3 text-[12.5px]" style={{ background: TEMA.chip, color: MUTED }}>
          Sem gasto nem conversões nos últimos {dias} dias.
        </p>
      ) : (
        <>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
            <KpiCard
              rotulo="CPL"
              valor={linha.cpl}
              formatar={brlDec}
              delta={linha.cplVar}
              menorMelhor
              // ⚠️ Conta pausada: o Δ perde a cor. Variação entre dois períodos sem
              // veiculação é ruído de arredondamento, não desempenho.
              neutralizar={conta.pausado ? "conta pausada — a variação não afirma desempenho" : null}
              rodape={`vs ${dias}d anteriores`}
            />
            <KpiCard
              rotulo="Gasto"
              valor={linha.gasto}
              formatar={brl}
              delta={linha.gastoVar}
              neutralizar={conta.pausado ? "conta pausada" : null}
              rodape={`vs ${dias}d anteriores`}
            />
            <KpiCard
              rotulo="Conversões"
              sub="formulário + WhatsApp"
              valor={linha.conversas}
              formatar={num}
              delta={linha.conversasVar}
              neutralizar={conta.pausado ? "conta pausada" : null}
              rodape={`vs ${dias}d anteriores`}
            />
          </div>

          {/* ================= NICHO ================= */}
          {nicho && noNicho && (
            <>
              <SecaoHeader
                titulo="Contra a média do nicho"
                icone="◇"
                subtitulo={`${nicho.nicho} · ${nicho.clientesCount} ${nicho.clientesCount === 1 ? "cliente" : "clientes"}`}
              />
              <div className="px-5 py-4" style={{ background: TEMA.card, border: `1px solid ${TEMA.borda}`, borderRadius: TEMA.raioCard }}>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.06em]" style={{ color: MUTED }}>CPL desta conta</div>
                    <div className="text-[20px] font-semibold tabular-nums" style={{ color: TEMA.texto }}>{brlDec(noNicho.cpl)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.06em]" style={{ color: MUTED }}>Média do nicho</div>
                    <div className="text-[20px] font-semibold tabular-nums" style={{ color: MUTED }}>{brlDec(nicho.cpl)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* `menorMelhor`: estar ACIMA da média de CPL é ruim. */}
                    <DeltaChip delta={noNicho.desvioPct} menorMelhor
                      contexto={`CPL desta conta contra a média de ${nicho.nicho}`} />
                    <span className="text-[11.5px]" style={{ color: MUTED }}>
                      {noNicho.desvioPct === 0 ? "na média" : noNicho.desvioPct > 0 ? "acima da média" : "abaixo da média"}
                    </span>
                  </div>
                </div>
                {nicho.clientesCount === 1 && (
                  <p className="mt-3 text-[11.5px]" style={{ color: AMBER }}>
                    ⚠ Esta é a única conta do nicho — a &ldquo;média&rdquo; é ela mesma, e o desvio é
                    sempre zero. Só passa a significar algo com outra conta no mesmo nicho.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ================= CRIATIVOS ================= */}
      <SecaoHeader
        titulo="Criativos"
        icone="▣"
        subtitulo="Carregados sob demanda — é a única parte que custa chamada à Meta"
      />
      <CriativosDaConta conta={conta} dias={dias} />
    </div>
  );
}
