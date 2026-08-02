"use client";

import { TEMA } from "@/lib/brand";
import { brlDec } from "@/lib/format";

export interface PontoSlope {
  nome: string;
  cplAnterior: number;
  cplAtual: number;
  /** Fora do piso de conversões: não entra (ruído distorceria a escala). */
  elegivelNaEscala: boolean;
}

// SVG próprio em vez de recharts: com 8 gestores os rótulos da ponta direita
// colidem (em julho/2026, VINÍCIUS 14,87 e ISMAIL 15,45 ficam a meio ponto), e
// recharts não faz dodging de rótulo — eu teria que posicionar por cima dele
// de qualquer forma. Aqui o empurrão vertical é 12 linhas e fica controlável.
const ALTURA = 260;
const PAD_TOPO = 18;
const PAD_BASE = 26;
const LARG_ROTULO = 132; // espaço reservado para "NOME R$ 00,00" à direita
const MIN_GAP = 15;      // distância mínima entre rótulos empilhados

export default function SlopeCpl({
  pontos, labelAnterior, labelAtual,
}: {
  pontos: PontoSlope[];
  labelAnterior: string;
  labelAtual: string;
}) {
  const dados = pontos.filter((p) => p.elegivelNaEscala && p.cplAnterior > 0 && p.cplAtual > 0);
  if (dados.length < 2) {
    return (
      <p className="text-[12px]" style={{ color: TEMA.muted }}>
        Dados insuficientes para o comparativo de evolução.
      </p>
    );
  }

  const valores = dados.flatMap((p) => [p.cplAnterior, p.cplAtual]);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const span = max - min || 1;
  const alturaUtil = ALTURA - PAD_TOPO - PAD_BASE;
  const y = (v: number) => PAD_TOPO + (1 - (v - min) / span) * alturaUtil;

  // Rótulos à direita, com dodging: ordena por posição e empurra para baixo
  // quem ficaria colado no anterior.
  const rotulos = dados
    .map((p) => ({ p, yIdeal: y(p.cplAtual), yFinal: y(p.cplAtual) }))
    .sort((a, b) => a.yIdeal - b.yIdeal);
  for (let i = 1; i < rotulos.length; i++) {
    const anterior = rotulos[i - 1].yFinal;
    if (rotulos[i].yFinal - anterior < MIN_GAP) rotulos[i].yFinal = anterior + MIN_GAP;
  }

  const X0 = 8;   // coluna do mês anterior
  const X1 = 100; // coluna do mês atual (em % da área do gráfico)

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: 420 }}>
        <svg
          width="100%"
          height={ALTURA}
          viewBox={`0 0 ${100 + LARG_ROTULO} ${ALTURA}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Evolução do CPL por gestor de ${labelAnterior} para ${labelAtual}`}
        >
          {/* Eixos verticais dos dois meses */}
          <line x1={X0} y1={PAD_TOPO - 8} x2={X0} y2={ALTURA - PAD_BASE + 4} stroke={TEMA.borda} strokeWidth={1} />
          <line x1={X1} y1={PAD_TOPO - 8} x2={X1} y2={ALTURA - PAD_BASE + 4} stroke={TEMA.borda} strokeWidth={1} />

          {dados.map((p) => {
            const yA = y(p.cplAnterior);
            const yB = y(p.cplAtual);
            // Semântica: CPL caindo é BOM (verde), subindo é ruim (vermelho).
            const caiu = p.cplAtual < p.cplAnterior;
            const cor = caiu ? TEMA.positivo : p.cplAtual > p.cplAnterior ? TEMA.negativo : TEMA.muted;
            return (
              <g key={p.nome}>
                <line x1={X0} y1={yA} x2={X1} y2={yB} stroke={cor} strokeWidth={1.75} opacity={0.85} />
                <circle cx={X0} cy={yA} r={2.5} fill={cor} />
                <circle cx={X1} cy={yB} r={2.5} fill={cor} />
              </g>
            );
          })}

          {/* Rótulos à direita, já com dodging aplicado */}
          {rotulos.map(({ p, yFinal, yIdeal }) => {
            const caiu = p.cplAtual < p.cplAnterior;
            const cor = caiu ? TEMA.positivo : p.cplAtual > p.cplAnterior ? TEMA.negativo : TEMA.muted;
            return (
              <g key={"r" + p.nome}>
                {/* Linha-guia quando o rótulo foi empurrado da posição real */}
                {Math.abs(yFinal - yIdeal) > 1 && (
                  <line x1={X1} y1={yIdeal} x2={X1 + 6} y2={yFinal} stroke={TEMA.borda} strokeWidth={0.75} />
                )}
                <text x={X1 + 8} y={yFinal + 3} fontSize={8} fill={TEMA.texto} style={{ fontWeight: 500 }}>
                  {p.nome}
                </text>
                <text x={X1 + 8 + 60} y={yFinal + 3} fontSize={8} fill={cor} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {brlDec(p.cplAtual)}
                </text>
              </g>
            );
          })}

          {/* Rótulos dos meses */}
          <text x={X0} y={ALTURA - 8} fontSize={8} fill={TEMA.muted} textAnchor="start">{labelAnterior}</text>
          <text x={X1} y={ALTURA - 8} fontSize={8} fill={TEMA.muted} textAnchor="middle">{labelAtual}</text>
        </svg>
      </div>
    </div>
  );
}
