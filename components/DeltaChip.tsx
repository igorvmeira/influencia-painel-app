"use client";

import { TEMA } from "@/lib/brand";

// Chip de variação percentual — mesma linguagem visual do Dashboard: fundo tingido,
// texto na cor semântica, seta.
//
// SEMÂNTICA, não sinal: o que decide a cor é se a variação é BOA ou RUIM, não se o
// número é positivo. Com `menorMelhor` (caso do CPL), "+8%" é vermelho e "−12%" é
// verde — CPL subindo é ruim.
//
// NOTA: o Dashboard tem hoje um DeltaBadge local com esta mesma lógica. Não unifiquei
// agora para não mexer numa tela já validada durante outra entrega; quando o Dashboard
// for tocado de novo, ele deve passar a usar ESTE componente e o local sai.
export default function DeltaChip({
  delta,
  menorMelhor = false,
  motivo,
}: {
  delta: number | null;
  menorMelhor?: boolean;
  motivo?: string | null;
}) {
  const base = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums";

  if (delta === null) {
    return (
      <span
        className={base}
        style={{ background: TEMA.neutroFundo, color: TEMA.muted, cursor: motivo ? "help" : undefined }}
        title={motivo ?? "sem período anterior comparável"}
      >
        —
      </span>
    );
  }

  const bom = menorMelhor ? delta < 0 : delta > 0;
  const cor = delta === 0 ? TEMA.muted : bom ? TEMA.positivo : TEMA.negativo;
  const fundo = delta === 0 ? TEMA.neutroFundo : bom ? TEMA.positivoFundo : TEMA.negativoFundo;
  const seta = delta > 0 ? "▲" : delta < 0 ? "▼" : "•";

  return (
    <span className={base} style={{ background: fundo, color: cor }} title={motivo ?? undefined}>
      <span style={{ fontSize: 9 }}>{seta}</span>
      {delta > 0 ? "+" : ""}{delta}%
    </span>
  );
}
