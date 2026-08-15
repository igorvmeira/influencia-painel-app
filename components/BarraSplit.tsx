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
      {/* ⚠️ A fatia de Formulário era `navFundo` — quase-preto, que sobre o card
          BRANCO do tema claro fazia par forte com o dourado. No escuro dá 1,15:1:
          metade da barra desapareceria, e uma barra dividida com uma fatia
          invisível vira uma barra cheia mentindo a proporção.
          `texto` (off-white) é o mesmo par que o gráfico-herói já usa com o
          dourado — as duas fatias prominentes e inconfundíveis entre si.
          O sulco passou de `chip` para `barraNeutra`, que é o token de trilho. */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: TEMA.barraNeutra }}>
        {b2b > 0 && <div style={{ width: `${pctB2B}%`, background: TEMA.texto }} title={`Formulário: ${num(b2b)}`} />}
        {b2c > 0 && <div style={{ width: `${pctB2C}%`, background: TEMA.destaque }} title={`WhatsApp: ${num(b2c)}`} />}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: TEMA.muted }}>
        <span className="inline-flex items-center gap-1.5">
          {/* O selo da legenda IDENTIFICA a fatia — se ele não bater com a barra,
              a legenda deixa de legendar. Anda junto, sempre. */}
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: TEMA.texto }} />
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
