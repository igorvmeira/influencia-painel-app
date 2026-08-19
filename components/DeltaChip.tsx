"use client";

import { TEMA } from "@/lib/brand";
import { pct } from "@/lib/format";

/**
 * Chip de variação percentual — o sinal que se lê de longe num KPI.
 *
 * ⚠️ SEMÂNTICA, NÃO SINAL: o que decide a cor é se a variação é BOA ou RUIM, não
 * se o número é positivo. Com `menorMelhor` (caso do CPL), "+8%" é vermelho e
 * "−12%" é verde — CPL subindo é ruim.
 *
 * ⚠️ A SETA SEGUE O SINAL, A COR SEGUE O SIGNIFICADO. São canais diferentes de
 * propósito: a seta diz para onde o número foi, a cor diz se isso é bom. Num CPL
 * caindo, ▼ e verde dizem coisas distintas e ambas verdadeiras.
 *
 * ⚠️ UNIFICADO COM O `DeltaBadge` LOCAL DO DASHBOARD em 16/08/2026. A versão de
 * lá era a mais completa — nasceu com a comparação de período personalizado — e a
 * união foi feita NA DIREÇÃO DELA: este componente absorveu `contexto`,
 * `neutralizar`, o `cursor: help` condicional e a formatação `pct()`. Nenhum
 * estado foi descartado; a lista de 9 foi conferida item a item antes da troca.
 */
export default function DeltaChip({
  delta,
  menorMelhor = false,
  motivo,
  contexto,
  neutralizar,
}: {
  delta: number | null;
  /** Ex.: CPL — subir é RUIM. Inverte a noção de "bom". */
  menorMelhor?: boolean;
  /** Por que não há comparação. Vira o title do "—". */
  motivo?: string | null;
  /**
   * CONTRA O QUÊ o número está variando (o `periodoLabel`, com o tamanho de cada
   * lado). Sem isso, um Δ entre períodos de tamanhos diferentes é número sem
   * régua — quem passa o mouse precisa ver a régua.
   */
  contexto?: string | null;
  /**
   * ⚠️ TIRA A COR SEMÂNTICA SEM TIRAR O NÚMERO. Usado quando os dois períodos têm
   * tamanhos muito diferentes (ver TOLERANCIA_TAMANHO_PCT no Dashboard): aí boa
   * parte da variação de soma é calendário, e verde/vermelho seria conclusão
   * errada. O texto preenchido vira o tooltip e tem PRECEDÊNCIA sobre `contexto`.
   */
  neutralizar?: string | null;
}) {
  const base = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums";

  if (delta === null) {
    return (
      <span
        className={base}
        style={{ background: TEMA.neutroFundo, color: TEMA.muted, cursor: "help" }}
        title={motivo ?? "sem período anterior comparável"}
      >
        —
      </span>
    );
  }

  const cor = neutralizar
    ? TEMA.muted
    : delta === 0 ? TEMA.muted : (menorMelhor ? delta < 0 : delta > 0) ? TEMA.positivo : TEMA.negativo;
  const fundo = neutralizar
    ? TEMA.neutroFundo
    : cor === TEMA.positivo ? TEMA.positivoFundo
    : cor === TEMA.negativo ? TEMA.negativoFundo
    : TEMA.neutroFundo;
  const seta = delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
  const dica = neutralizar ?? (contexto ? `Variação — ${contexto}` : motivo ?? null);

  return (
    <span
      className={base}
      style={{
        background: fundo,
        color: cor,
        cursor: dica ? "help" : undefined,
        /**
         * ⚠️ CONTORNO SÓ NO ESTADO NEUTRALIZADO. Sem cor semântica e sobre a área
         * da sparkline (também cinza), o chip fica menos destacado justamente
         * quando está dizendo "não confie na cor". A borda AFIRMA que ele existe
         * — é a mesma regra de `bordaForte` do resto do app.
         */
        // ⚠️ `bordaForteElevada`, não `bordaForte`. O chip neutralizado pousa em
        // `neutroFundo`, que é MAIS CLARO que o card — e ali o `bordaForte` dá 2,97:1,
        // abaixo do piso de 3:1. Mesmo número e mesma causa do botão "Sair" da sidebar.
        border: neutralizar ? `1px solid ${TEMA.bordaForteElevada}` : undefined,
      }}
      title={dica ?? undefined}
    >
      <span style={{ fontSize: 9 }}>{seta}</span>
      {pct(delta)}
    </span>
  );
}
