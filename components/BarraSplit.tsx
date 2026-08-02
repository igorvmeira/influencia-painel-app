"use client";

import { TEMA } from "@/lib/brand";
import { num } from "@/lib/format";

// Split formulário / WhatsApp como barra empilhada horizontal. CSS puro: são duas
// fatias, não vale carregar biblioteca de gráfico. Sem pizza — o pedido é
// comparar duas partes de um todo, e barra lê melhor que setor circular.
export default function BarraSplit({ b2b, b2c }: { b2b: number; b2c: number }) {
  const total = b2b + b2c;
  if (total === 0) {
    return <p className="text-[12px]" style={{ color: TEMA.muted }}>Sem conversões no período.</p>;
  }
  const pctB2B = (b2b / total) * 100;
  const pctB2C = 100 - pctB2B;

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: TEMA.chip }}>
        {b2b > 0 && <div style={{ width: `${pctB2B}%`, background: TEMA.navFundo }} title={`Formulário: ${num(b2b)}`} />}
        {b2c > 0 && <div style={{ width: `${pctB2C}%`, background: TEMA.destaque }} title={`WhatsApp: ${num(b2c)}`} />}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: TEMA.muted }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: TEMA.navFundo }} />
          Formulário <span className="tabular-nums" style={{ color: TEMA.texto }}>{num(b2b)}</span>
          <span className="tabular-nums">({pctB2B.toFixed(0)}%)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: TEMA.destaque }} />
          WhatsApp <span className="tabular-nums" style={{ color: TEMA.texto }}>{num(b2c)}</span>
          <span className="tabular-nums">({pctB2C.toFixed(0)}%)</span>
        </span>
      </div>
    </div>
  );
}
