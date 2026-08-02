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
    if (p.tipo === "inicio") return TEMA.navFundo;
    if (p.tipo === "fim") return TEMA.destaque;
    if (p.tipo === "outras") return TEMA.barraNeutra;
    // Semântica: contribuição negativa puxou o CPL para BAIXO = bom = verde.
    return p.contribuicao < 0 ? TEMA.positivo : TEMA.negativo;
  };

  function Dica({ active, payload }: { active?: boolean; payload?: { payload: Passo }[] }) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded-lg px-3 py-2 text-[12px]"
        style={{ background: TEMA.card, border: `1px solid ${TEMA.borda}`, color: TEMA.texto, boxShadow: TEMA.sombraCard }}>
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
          <Tooltip content={<Dica />} cursor={{ fill: "rgba(28,27,23,0.04)" }} />
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
