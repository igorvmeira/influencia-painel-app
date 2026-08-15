"use client";

import { TEMA } from "@/lib/brand";
import NumeroAnimado from "./NumeroAnimado";

/**
 * KPI com a sparkline ATRÁS do número (versão B, escolhida pelo Igor em 16/08).
 *
 * ⚠️ A CONDIÇÃO QUE A APROVOU, e que qualquer alteração aqui precisa refazer:
 * a sparkline é DADO, então a LINHA vai em `dadoNeutro` cheio (3,19:1, o piso da
 * WCAG 1.4.11); a ÁREA embaixo dela é decoração e fica a 18%, o que deixa o
 * número por cima em 12,75:1. Subir a área "para aparecer mais" derruba a
 * leitura do número; baixar a linha derruba a leitura do dado. As duas coisas
 * só cabem juntas porque têm papéis separados.
 *
 * ⚠️ O NÚMERO NÃO CONTA NA ENTRADA. O `NumeroAnimado` anima só na MUDANÇA de
 * valor — número contando é ilegível enquanto conta, e a regra da casa é que
 * animação nunca faz esperar para ler.
 */
export default function KpiCard({
  rotulo, valor, formatar, serie, delta, menorMelhor = false, anterior, info, base, secundario,
}: {
  rotulo: string;
  valor: number;
  formatar: (n: number) => string;
  /** Série da mini-linha. Menos de 2 pontos: a sparkline some, o card fica. */
  serie?: number[];
  /**
   * Variação em %. `null` = há comparação, mas não foi possível calcular (mostra
   * "—"). **Omitir** = a métrica não tem comparação nenhuma, e aí o chip nem
   * aparece — um "—" permanente vira ruído que ninguém mais lê.
   */
  delta?: number | null;
  /** Ex.: CPL — subir é RUIM. A cor segue o SIGNIFICADO, nunca o sinal. */
  menorMelhor?: boolean;
  /** Valor do período anterior, já formatado. */
  anterior?: string;
  info?: string;
  /**
   * ⚠️ SOBRE O QUE O NÚMERO É. Existe porque compactar em card faz a BASE sumir,
   * e dois cards lado a lado parecem comparáveis mesmo quando contam coisas
   * diferentes — "vendas marcadas" e "pessoas na etapa" não somam nem se
   * comparam. Quando duas métricas vizinhas têm bases distintas, isto é
   * obrigatório nas duas.
   */
  base?: string;
  /** Segunda dimensão da mesma métrica (ex.: o MRR ao lado da contagem). */
  secundario?: string;
}) {
  const pontos = serie && serie.length >= 2 ? serie : null;
  const bom = delta == null ? null : menorMelhor ? delta < 0 : delta > 0;
  const corDelta = delta == null || delta === 0 ? TEMA.muted : bom ? TEMA.positivo : TEMA.negativo;
  const fundoDelta =
    delta == null || delta === 0 ? TEMA.neutroFundo : bom ? TEMA.positivoFundo : TEMA.negativoFundo;

  return (
    <div
      className="relative overflow-hidden p-5"
      style={{
        background: TEMA.card,
        border: `1px solid ${TEMA.borda}`,
        borderRadius: TEMA.raioCard,
        boxShadow: TEMA.sombraCard,
      }}
      title={info}
    >
      {pontos && <SerieDeFundo pontos={pontos} />}

      <div className="relative">
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: TEMA.muted }}
        >
          {rotulo}
        </div>

        <NumeroAnimado
          valor={valor}
          formatar={formatar}
          className="mt-2.5 block text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums"
          style={{ color: TEMA.texto }}
        />

        {secundario && (
          <div className="mt-1 text-[13px] font-medium tabular-nums" style={{ color: TEMA.destaque }}>
            {secundario}
          </div>
        )}

        {(delta !== undefined || anterior) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
              style={{ background: fundoDelta, color: corDelta }}
            >
              {delta == null ? "—" : (
                <>
                  <span style={{ fontSize: 9 }}>{delta > 0 ? "▲" : delta < 0 ? "▼" : "•"}</span>
                  {delta > 0 ? "+" : ""}{delta}%
                </>
              )}
            </span>
            {anterior && (
              <span className="text-[11.5px] tabular-nums" style={{ color: TEMA.muted }}>
                ant. {anterior}
              </span>
            )}
          </div>
        )}

        {/* A BASE fica DENTRO do card, colada no número que ela qualifica —
            não num rodapé comum aos dois. Rodapé compartilhado se lê como
            ressalva geral; aqui cada número carrega a sua. */}
        {base && (
          <div className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: TEMA.muted }}>
            {base}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ⚠️ NÃO é o `components/Sparkline.tsx`, que desenha uma mini-linha solta de
 * tamanho fixo. Esta sangra até as bordas do card e tem área — nome diferente
 * de propósito, para não parecer que uma substitui a outra.
 *
 * A mini-série, sangrando até as bordas do card no rodapé.
 * `preserveAspectRatio="none"` estica no eixo X; `vector-effect` mantém a
 * espessura da linha constante apesar do esticamento — sem isso a linha
 * engrossaria em cards largos e afinaria nos estreitos.
 */
function SerieDeFundo({ pontos }: { pontos: number[] }) {
  const max = Math.max(...pontos);
  const min = Math.min(...pontos);
  const span = max - min || 1;
  const L = 300, A = 60;
  const xy = pontos.map((v, i) => {
    const x = (i / (pontos.length - 1)) * L;
    const y = A - ((v - min) / span) * (A * 0.8) - A * 0.1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linha = `M${xy.join(" L")}`;
  const area = `${linha} L${L},${A} L0,${A} Z`;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${L} ${A}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0"
      style={{ height: "46%" }}
    >
      <path d={area} fill={TEMA.dadoNeutro} opacity={0.18} />
      <path
        d={linha}
        fill="none"
        stroke={TEMA.dadoNeutro}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
