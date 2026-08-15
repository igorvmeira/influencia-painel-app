"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TEMA } from "@/lib/brand";
import { brlDec } from "@/lib/format";
import { ContribuicaoConta, PISO_CONVERSOES_DESTAQUE } from "@/lib/destaques";

// Waterfall em recharts pela técnica convencional: uma série "base" TRANSPARENTE
// que empurra a barra visível até a altura acumulada. Recharts não tem waterfall
// nativo, mas o empilhamento resolve sem gambiarra de posicionamento.
interface Passo {
  nome: string;
  base: number;      // invisível — só posiciona
  valor: number;     // altura da barra visível
  tipo: "inicio" | "conta" | "outras" | "fim";
  contribuicao: number;
  incompleta: boolean;
}

export default function Waterfall({
  cplAnterior, cplAtual, contribuicoes, labelAnterior, labelAtual,
}: {
  cplAnterior: number;
  cplAtual: number;
  contribuicoes: ContribuicaoConta[];
  labelAnterior: string;
  labelAtual: string;
}) {
  // Contas abaixo do piso de conversões viram uma barra "outras": individualmente
  // são ruído, mas a soma delas precisa aparecer para o waterfall FECHAR — do CPL
  // anterior ao atual, sem sobra.
  const relevantes = contribuicoes.filter((c) => c.relevante && Math.abs(c.contribuicao) > 0.0001);
  const resto = contribuicoes.filter((c) => !relevantes.includes(c));
  const somaResto = resto.reduce((s, c) => s + c.contribuicao, 0);

  // Maiores movimentos primeiro (em módulo) — a leitura começa pelo que importa.
  const ordenadas = [...relevantes].sort((a, b) => Math.abs(b.contribuicao) - Math.abs(a.contribuicao)).slice(0, 8);
  const fora = relevantes.length - ordenadas.length;
  const somaFora = relevantes
    .filter((c) => !ordenadas.includes(c))
    .reduce((s, c) => s + c.contribuicao, 0);
  const somaOutras = somaResto + somaFora;

  const passos: Passo[] = [];
  passos.push({ nome: labelAnterior, base: 0, valor: cplAnterior, tipo: "inicio", contribuicao: 0, incompleta: false });

  let acum = cplAnterior;
  for (const c of ordenadas) {
    const de = acum;
    acum += c.contribuicao;
    passos.push({
      nome: c.cliente,
      base: Math.min(de, acum),
      valor: Math.abs(c.contribuicao),
      tipo: "conta",
      contribuicao: c.contribuicao,
      incompleta: c.incompleta,
    });
  }
  if (Math.abs(somaOutras) > 0.0001) {
    const de = acum;
    acum += somaOutras;
    passos.push({
      nome: `outras (${resto.length + fora})`,
      base: Math.min(de, acum),
      valor: Math.abs(somaOutras),
      tipo: "outras",
      contribuicao: somaOutras,
      incompleta: false,
    });
  }
  passos.push({ nome: labelAtual, base: 0, valor: cplAtual, tipo: "fim", contribuicao: 0, incompleta: false });

  const corDe = (p: Passo) => {
    // ⚠️ Era `navFundo` — quase-preto, que sobre o card BRANCO do tema claro era a
    // barra de maior contraste do gráfico. No escuro virou preto sobre quase-preto:
    // a barra de referência do waterfall SUMIA, e um waterfall sem o ponto de
    // partida não fecha visualmente. `muted` é neutro (não é bom nem ruim, é o
    // ponto de origem) e dá 5,92:1 sobre o card.
    if (p.tipo === "inicio") return TEMA.muted;
    if (p.tipo === "fim") return TEMA.destaque;
    // ⚠️ `barraNeutra` é trilho (1,47:1) — aqui é BARRA, e a soma das contas fora do
    // piso precisa aparecer para o waterfall fechar. `sparkline` dá os 3:1 de dado.
    if (p.tipo === "outras") return TEMA.dadoNeutro;
    // Semântica: contribuição negativa puxou o CPL para BAIXO = bom = verde.
    return p.contribuicao < 0 ? TEMA.positivo : TEMA.negativo;
  };

  function Dica({ active, payload }: { active?: boolean; payload?: { payload: Passo }[] }) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded-lg px-3 py-2 text-[12px]"
        /* Mesmo motivo do tooltip do HeroChart: flutua sobre o card, então precisa
           do degrau acima (`flutuante`) e de borda que leia contra ele. */
        style={{ background: TEMA.flutuante, border: `1px solid ${TEMA.bordaForte}`, color: TEMA.texto, boxShadow: TEMA.sombraCard }}>
        <div className="font-medium">{p.nome}</div>
        {p.tipo === "inicio" || p.tipo === "fim" ? (
          <div className="tabular-nums" style={{ color: TEMA.muted }}>CPL {brlDec(p.valor)}</div>
        ) : (
          <div className="tabular-nums" style={{ color: p.contribuicao < 0 ? TEMA.positivo : TEMA.negativo }}>
            {p.contribuicao < 0 ? "−" : "+"}{brlDec(Math.abs(p.contribuicao))} no CPL
          </div>
        )}
        {p.incompleta && <div style={{ color: TEMA.atencao }}>⚠ mês incompleto</div>}
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={passos} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <XAxis
            dataKey="nome"
            tick={{ fontSize: 9, fill: TEMA.muted }}
            tickLine={false}
            axisLine={{ stroke: TEMA.borda }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={62}
          />
          <YAxis
            tick={{ fontSize: 10, fill: TEMA.muted }}
            tickLine={false}
            axisLine={{ stroke: TEMA.borda }}
            tickFormatter={(v: number) => brlDec(v)}
            width={56}
          />
          {/* Realce CLARO — ver o comentário gêmeo no HeroChart. */}
          <Tooltip content={<Dica />} cursor={{ fill: TEMA.realceGrafico }} />
          {/* Base invisível: posiciona a barra visível na altura acumulada. */}
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="valor" stackId="w" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {passos.map((p, i) => (
              <Cell key={i} fill={corDe(p)} stroke={p.incompleta ? TEMA.atencao : undefined} strokeWidth={p.incompleta ? 1.5 : 0} strokeDasharray={p.incompleta ? "3 2" : undefined} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export { PISO_CONVERSOES_DESTAQUE };
