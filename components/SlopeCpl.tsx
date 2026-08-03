"use client";

import { TEMA } from "@/lib/brand";
import { brlDec } from "@/lib/format";

export interface PontoSlope {
  nome: string;
  cplAnterior: number;
  cplAtual: number;
  /** Abaixo do piso de conversões: entra no gráfico, mas marcado. */
  volumeBaixo: boolean;
  conversas: number;
}

// SVG próprio em vez de recharts: com 8 gestores os rótulos da ponta direita
// colidem (em julho/2026, VINÍCIUS 14,87 e ISMAIL 15,45 ficam a meio ponto), e
// recharts não faz dodging de rótulo — eu teria que posicionar por cima dele
// de qualquer forma. Aqui o empurrão vertical é 12 linhas e fica controlável.
const ALTURA = 280;
const PAD_TOPO = 22;
const PAD_BASE = 26;
const LARG_ROTULO = 140;
const MIN_GAP = 15;

export default function SlopeCpl({
  pontos, labelAnterior, labelAtual,
}: {
  pontos: PontoSlope[];
  labelAnterior: string;
  labelAtual: string;
}) {
  const dados = pontos.filter((p) => p.cplAnterior > 0 && p.cplAtual > 0);
  if (dados.length < 2) {
    return (
      <p className="text-[12px]" style={{ color: TEMA.muted }}>
        Dados insuficientes para o comparativo de evolução.
      </p>
    );
  }

  // ESCALA LOGARÍTMICA. Todos os gestores entram no gráfico, inclusive os de volume
  // baixo — e o CPL deles pode ser uma ordem de grandeza maior (em julho/2026,
  // R$ 99 contra R$ 7–18 dos demais). Em escala linear as 7 linhas normais ficariam
  // espremidas nos 11% de baixo, ilegíveis.
  //
  // Log não é só um truque de espaço: CPL é uma razão, e num slope em log a
  // INCLINAÇÃO passa a representar a variação PROPORCIONAL. Uma queda de 20% tem a
  // mesma inclinação em qualquer patamar — que é exatamente a leitura que o bônus
  // usa (evolução percentual), e não a diferença em reais.
  const valores = dados.flatMap((p) => [p.cplAnterior, p.cplAtual]);
  const lmin = Math.log(Math.min(...valores));
  const lmax = Math.log(Math.max(...valores));
  const span = lmax - lmin || 1;
  const alturaUtil = ALTURA - PAD_TOPO - PAD_BASE;
  const y = (v: number) => PAD_TOPO + (1 - (Math.log(v) - lmin) / span) * alturaUtil;

  const rotulos = dados
    .map((p) => ({ p, yIdeal: y(p.cplAtual), yFinal: y(p.cplAtual) }))
    .sort((a, b) => a.yIdeal - b.yIdeal);
  for (let i = 1; i < rotulos.length; i++) {
    const anterior = rotulos[i - 1].yFinal;
    if (rotulos[i].yFinal - anterior < MIN_GAP) rotulos[i].yFinal = anterior + MIN_GAP;
  }

  const X0 = 8;
  const X1 = 100;
  const corDe = (p: PontoSlope) =>
    p.cplAtual < p.cplAnterior ? TEMA.positivo : p.cplAtual > p.cplAnterior ? TEMA.negativo : TEMA.muted;

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: 440 }}>
        <svg
          width="100%"
          height={ALTURA}
          viewBox={`0 0 ${100 + LARG_ROTULO} ${ALTURA}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Evolução do CPL por gestor de ${labelAnterior} para ${labelAtual}, escala logarítmica`}
        >
          <line x1={X0} y1={PAD_TOPO - 10} x2={X0} y2={ALTURA - PAD_BASE + 4} stroke={TEMA.borda} strokeWidth={1} />
          <line x1={X1} y1={PAD_TOPO - 10} x2={X1} y2={ALTURA - PAD_BASE + 4} stroke={TEMA.borda} strokeWidth={1} />

          {dados.map((p) => {
            const yA = y(p.cplAnterior);
            const yB = y(p.cplAtual);
            const cor = corDe(p);
            // Volume baixo: linha tracejada e mais apagada. O número existe e a
            // direção é real, mas com poucas conversões ela não sustenta conclusão.
            return (
              <g key={p.nome} opacity={p.volumeBaixo ? 0.45 : 1}>
                <title>
                  {p.volumeBaixo
                    ? `${p.nome}: volume baixo (${p.conversas} conversões no mês) — variação sem significado estatístico.`
                    : `${p.nome}: ${brlDec(p.cplAnterior)} → ${brlDec(p.cplAtual)}`}
                </title>
                <line
                  x1={X0} y1={yA} x2={X1} y2={yB}
                  stroke={cor}
                  strokeWidth={p.volumeBaixo ? 1.25 : 1.75}
                  strokeDasharray={p.volumeBaixo ? "4 3" : undefined}
                />
                <circle cx={X0} cy={yA} r={2.5} fill={cor} />
                <circle cx={X1} cy={yB} r={2.5} fill={cor} />
              </g>
            );
          })}

          {rotulos.map(({ p, yFinal, yIdeal }) => {
            const cor = corDe(p);
            return (
              <g key={"r" + p.nome} opacity={p.volumeBaixo ? 0.6 : 1}>
                <title>
                  {p.volumeBaixo
                    ? `${p.nome}: volume baixo (${p.conversas} conversões no mês) — variação sem significado estatístico.`
                    : `${p.nome}: ${brlDec(p.cplAnterior)} → ${brlDec(p.cplAtual)}`}
                </title>
                {Math.abs(yFinal - yIdeal) > 1 && (
                  <line x1={X1} y1={yIdeal} x2={X1 + 6} y2={yFinal} stroke={TEMA.borda} strokeWidth={0.75} />
                )}
                <text x={X1 + 8} y={yFinal + 3} fontSize={8} fill={TEMA.texto} style={{ fontWeight: 500 }}>
                  {p.volumeBaixo ? "⚠ " : ""}{p.nome}
                </text>
                <text x={X1 + 8 + 64} y={yFinal + 3} fontSize={8} fill={cor} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {brlDec(p.cplAtual)}
                </text>
              </g>
            );
          })}

          <text x={X0} y={ALTURA - 8} fontSize={8} fill={TEMA.muted} textAnchor="start">{labelAnterior}</text>
          <text x={X1} y={ALTURA - 8} fontSize={8} fill={TEMA.muted} textAnchor="middle">{labelAtual}</text>
        </svg>
      </div>
    </div>
  );
}
