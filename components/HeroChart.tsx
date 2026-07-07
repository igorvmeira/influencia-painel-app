"use client";

import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { brl, brlDec, num } from "@/lib/format";
import { PontoGrafico } from "@/lib/kpis";
import { TEMA } from "@/lib/brand";

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const YELLOW = TEMA.destaque;
const RED = TEMA.negativo;
const BARRA = "#3A3A3A"; // barras neutras (mesma família das superfícies)

// Ticks do eixo esquerdo em R$ compacto (ex.: "R$ 12 mil").
const fmtEixoRS = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 0 });
const eixoRS = (v: number) => `R$ ${fmtEixoRS.format(v)}`;
const eixoNum = (v: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 0 }).format(v);

function TooltipGrafico({ active, payload, label }: {
  active?: boolean; payload?: { payload: PontoGrafico }[]; label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: CARD, border: `1px solid ${LINE}`, color: "#fff" }}>
      <div className="mb-1 font-medium">{label}</div>
      {!p.temDados ? (
        <div style={{ color: MUTED }}>Sem dados neste dia</div>
      ) : (
        <div className="space-y-0.5 tabular-nums">
          <div className="flex justify-between gap-4"><span style={{ color: MUTED }}>Gasto</span><span>{brl(p.gasto ?? 0)}</span></div>
          <div className="flex justify-between gap-4"><span style={{ color: MUTED }}>Leads (formulário)</span><span>{num(p.leadsForm ?? 0)}</span></div>
          <div className="flex justify-between gap-4"><span style={{ color: MUTED }}>Conversas (WhatsApp)</span><span>{num(p.convWhats ?? 0)}</span></div>
          <div className="flex justify-between gap-4"><span style={{ color: MUTED }}>CPL do dia</span><span>{p.cpl != null ? brlDec(p.cpl) : "—"}</span></div>
        </div>
      )}
    </div>
  );
}

function ItemLegenda({ cor, tracejado = false, barra = false, texto }: { cor: string; tracejado?: boolean; barra?: boolean; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: MUTED }}>
      {barra
        ? <span style={{ width: 10, height: 10, background: cor, borderRadius: 2, display: "inline-block" }} />
        : <span style={{ width: 14, height: 0, borderTop: `2px ${tracejado ? "dashed" : "solid"} ${cor}`, display: "inline-block" }} />}
      {texto}
    </span>
  );
}

// Gráfico-herói: gasto (barras, eixo R$ à esquerda), leads totais (linha amarela,
// eixo contagem à direita) e CPL (linha vermelha tracejada, eixo oculto próprio).
export default function HeroChart({ pontos, periodoLabel }: { pontos: PontoGrafico[]; periodoLabel: string }) {
  return (
    <div className="mb-10 p-5" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>Tendência do período</p>
        <div className="flex flex-wrap items-center gap-3">
          <ItemLegenda cor={BARRA} barra texto="Gasto (R$, esq.)" />
          <ItemLegenda cor={YELLOW} texto="Leads totais (dir.)" />
          <ItemLegenda cor={RED} tracejado texto="CPL do dia" />
          <span className="text-[11px]" style={{ color: MUTED }}>· {periodoLabel}</span>
        </div>
      </div>

      <div style={{ width: "100%", height: 288 }}>
        <ResponsiveContainer>
          <ComposedChart data={pontos} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="data"
              tick={{ fontSize: 11, fill: MUTED }}
              tickLine={false}
              axisLine={{ stroke: LINE }}
              minTickGap={24}
            />
            {/* Eixo R$ à esquerda (gasto) */}
            <YAxis
              yAxisId="gasto"
              tick={{ fontSize: 11, fill: MUTED }}
              tickLine={false}
              axisLine={{ stroke: LINE }}
              tickFormatter={eixoRS}
              width={56}
              label={{ value: "R$", angle: -90, position: "insideLeft", fontSize: 10, fill: MUTED }}
            />
            {/* Eixo contagem à direita (leads totais) */}
            <YAxis
              yAxisId="leads"
              orientation="right"
              tick={{ fontSize: 11, fill: MUTED }}
              tickLine={false}
              axisLine={{ stroke: LINE }}
              tickFormatter={eixoNum}
              width={44}
              label={{ value: "leads", angle: 90, position: "insideRight", fontSize: 10, fill: MUTED }}
            />
            {/* Eixo oculto só para dar forma à linha de CPL (R$/lead) */}
            <YAxis yAxisId="cpl" hide domain={["auto", "auto"]} />

            <Tooltip content={<TooltipGrafico />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />

            <Bar yAxisId="gasto" dataKey="gasto" name="Gasto" fill={BARRA} radius={[2, 2, 0, 0]} maxBarSize={26} />
            <Line yAxisId="leads" type="monotone" dataKey="total" name="Leads totais" stroke={YELLOW} strokeWidth={2.5} dot={false} connectNulls={false} />
            <Line yAxisId="cpl" type="monotone" dataKey="cpl" name="CPL" stroke={RED} strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
