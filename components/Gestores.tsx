"use client";

import { useEffect, useMemo, useState } from "react";
import { useDadosPainel } from "@/lib/useDadosPainel";
import { montarPainel } from "@/lib/painel";
import { janelaMesFechado, mesesDisponiveis, coberturaMes, ymdParaBR } from "@/lib/periodo";
import { brl, brlDec, num } from "@/lib/format";
import { TEMA } from "@/lib/brand";
import IndicadorFrescor from "./IndicadorFrescor";
import DeltaChip from "./DeltaChip";

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const RED = TEMA.negativo;
const AMBAR = TEMA.atencao;

// Uma conta entra na contagem de "mês incompleto" quando falta o começo do mês
// ANALISADO ou do mês de COMPARAÇÃO — nos dois casos a evolução dela é enganosa.
const TOOLTIP_INCOMPLETO =
  "Contas cuja série de dados começa depois do dia 1 do mês analisado ou do mês de "
  + "comparação. O total do mês delas fica subestimado, então a evolução não é "
  + "confiável. O detalhe conta a conta vem na próxima etapa desta tela.";

export default function Gestores() {
  const { dados, erro } = useDadosPainel();

  // Regra única da casa: conta pausada fica FORA de tudo.
  const contasAtivas = useMemo(() => (dados ? dados.contas.filter((c) => !c.pausado) : []), [dados]);
  const daily = dados?.daily ?? [];

  // Meses fechados que a retenção alcança. Só é OFERECIDO o mês que tem o anterior
  // inteiro na janela — sem ele não há comparação, só número solto.
  const meses = useMemo(() => mesesDisponiveis(daily, contasAtivas), [daily, contasAtivas]);
  const comparaveis = useMemo(() => meses.filter((m) => m.cobreMesAnterior), [meses]);

  const [sel, setSel] = useState<{ ano: number; mes: number } | null>(null);
  useEffect(() => {
    if (sel || !comparaveis.length) return;
    setSel({ ano: comparaveis[0].ano, mes: comparaveis[0].mes }); // mês fechado mais recente
  }, [comparaveis, sel]);

  const janela = useMemo(
    () => (sel ? janelaMesFechado(daily, contasAtivas, sel.ano, sel.mes) : null),
    [daily, contasAtivas, sel]
  );

  const painel = useMemo(
    () => (janela ? montarPainel(daily, contasAtivas, janela.D, janela.espec) : null),
    [daily, contasAtivas, janela]
  );

  // Contagem de contas com mês incompleto, POR GESTOR. Aparece já nesta etapa: sem
  // isso alguém bate o olho no comparativo e tira conclusão de base incompleta.
  const incompletasPorGestor = useMemo(() => {
    const mapa = new Map<string, { total: number; incompletas: number; nomes: string[] }>();
    if (!sel) return mapa;
    const ant = sel.mes === 1 ? { ano: sel.ano - 1, mes: 12 } : { ano: sel.ano, mes: sel.mes - 1 };
    for (const c of contasAtivas) {
      const a = coberturaMes(daily, c.accountId, sel.ano, sel.mes);
      const b = coberturaMes(daily, c.accountId, ant.ano, ant.mes);
      const semDadoNenhum = a.primeiroDiaSerie === null;
      const incompleta = !semDadoNenhum && (!a.completo || !b.completo);
      const reg = mapa.get(c.gestor) ?? { total: 0, incompletas: 0, nomes: [] };
      reg.total++;
      if (incompleta) { reg.incompletas++; reg.nomes.push(c.cliente); }
      mapa.set(c.gestor, reg);
    }
    return mapa;
  }, [daily, contasAtivas, sel]);

  const carregando = !dados && !erro;
  const mesSelecionado = sel ? meses.find((m) => m.ano === sel.ano && m.mes === sel.mes) : null;
  // Meses fechados que existem mas NÃO podem ser comparados (mês anterior fora da janela).
  const semComparacao = meses.filter((m) => !m.cobreMesAnterior);

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-brand-ink">Análise de Gestores</h1>
          <p className="text-[13px]" style={{ color: MUTED }}>
            Mês fechado contra mês fechado — o recorte usado para avaliar o mês do gestor.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <IndicadorFrescor ultimaSync={dados?.ultimaSync ?? null} />
          {comparaveis.length > 0 && sel && (
            <select
              value={`${sel.ano}-${sel.mes}`}
              onChange={(e) => {
                const [a, m] = e.target.value.split("-").map(Number);
                setSel({ ano: a, mes: m });
              }}
              className="rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: CARD, color: TEMA.texto, border: `1px solid ${LINE}` }}
            >
              {comparaveis.map((m) => (
                <option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>{m.label}</option>
              ))}
              {/* Meses sem comparação aparecem DESABILITADOS e com o motivo: melhor
                  mostrar que existem e por que não servem do que sumir sem explicação. */}
              {semComparacao.map((m) => (
                <option key={`x-${m.ano}-${m.mes}`} disabled value="">
                  {m.label} — sem mês anterior na janela
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {erro ? (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.erroFundo, color: RED }}>
          {erro}
        </div>
      ) : carregando ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse motion-reduce:animate-none"
              style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }} />
          ))}
        </div>
      ) : !comparaveis.length || !janela || !painel ? (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.limiteFundo, color: AMBAR }}>
          Ainda não há dois meses fechados completos na janela de dados (~95 dias).
          A comparação fica disponível quando o histórico alcançar o mês anterior inteiro.
        </div>
      ) : (
        <>
          {/* Avisos honestos da janela ativa */}
          <div className="mb-5 flex flex-wrap gap-2">
            <span className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: TEMA.chip, color: MUTED }}>
              {painel.periodoLabel}
            </span>
            {janela.parcial && (
              <span className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: TEMA.limiteFundo, color: AMBAR }}
                title="A série disponível não cobre um dos meses inteiro. Os totais podem estar subestimados.">
                ⚠ janela parcial — série não cobre os dois meses inteiros
              </span>
            )}
            {mesSelecionado && !mesSelecionado.cobreInicio && (
              <span className="rounded-lg px-3 py-1.5 text-[12px]" style={{ background: TEMA.limiteFundo, color: AMBAR }}>
                ⚠ o mês analisado começa antes do histórico disponível
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl" style={{ background: CARD, boxShadow: TEMA.sombraCard }}>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr style={{ color: MUTED }} className="text-left">
                  <th className="px-4 py-3 font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Gestor</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Gasto</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Conversões</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>CPL</th>
                  <th className="px-4 py-3 text-right font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>
                    <span className="inline-flex items-center gap-1">
                      Δ CPL
                      <span title="Variação contra o mês anterior. CPL caindo é BOM (verde)."
                        style={{ cursor: "help", color: MUTED }} className="text-[11px]">ⓘ</span>
                    </span>
                  </th>
                  <th className="px-4 py-3 font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Carteira</th>
                </tr>
              </thead>
              <tbody>
                {painel.gestores.map((g, i) => {
                  const cob = incompletasPorGestor.get(g.nome);
                  return (
                    <tr key={g.nome} style={i % 2 === 1 ? { background: TEMA.zebra } : undefined}>
                      <td className="px-4 py-3 font-medium" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>
                        {g.nome}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>
                        {brl(g.gasto)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>
                        {num(g.conversas)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>
                        {g.conversas > 0 ? brlDec(g.cpl) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ borderBottom: `1px solid ${LINE}` }}>
                        {/* menorMelhor: CPL caindo é bom → verde */}
                        <DeltaChip delta={g.conversas > 0 ? g.cplVar : null} menorMelhor
                          motivo={g.conversas > 0 ? null : "sem conversões no mês — CPL indefinido"} />
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom: `1px solid ${LINE}`, color: MUTED }}>
                        <span className="tabular-nums">{cob?.total ?? 0}</span> contas
                        {!!cob?.incompletas && (
                          <span className="ml-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                            style={{ background: TEMA.limiteFundo, color: AMBAR, cursor: "help" }}
                            title={`${TOOLTIP_INCOMPLETO}\n\n${cob.nomes.join(", ")}`}>
                            {cob.incompletas} com mês incompleto
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[12px]" style={{ color: MUTED }}>
            Detalhe por conta, destaques calculados e criativos do mês entram nas próximas etapas desta tela.
            {dados?.ultimaSync && ` Dados até ${ymdParaBR(dados.ultimaSync.slice(0, 10))}.`}
          </p>
        </>
      )}
    </div>
  );
}
