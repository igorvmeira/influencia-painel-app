"use client";

import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { Painel } from "@/lib/types";
import { brl, brlDec, num, pct } from "@/lib/format";

const INK = "#141414";
const YELLOW = "#F6E003";
const GRID = "#ece9e4";
const MUTED = "#6b6670";

function corVar(v: number, menorMelhor = false) {
  if (v === 0) return MUTED;
  const bom = menorMelhor ? v < 0 : v > 0;
  return bom ? "#1d7a4d" : "#b23b3b";
}

function Card({ label, valor, sub, subColor, accent }: {
  label: string; valor: string; sub?: string; subColor?: string; accent: string;
}) {
  return (
    <div className="rounded-lg bg-[var(--card)] p-4" style={{ border: `1px solid ${GRID}`, borderLeft: `3px solid ${accent}` }}>
      <p className="text-[13px]" style={{ color: MUTED }}>{label}</p>
      <p className="mt-1 text-2xl font-medium">{valor}</p>
      {sub && <p className="mt-0.5 text-xs" style={{ color: subColor ?? MUTED }}>{sub}</p>}
    </div>
  );
}

function Swatch({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {children}
    </span>
  );
}

export default function Dashboard({ data, fonte }: { data: Painel; fonte: "firestore" | "mock" }) {
  const t = data.totais;
  const barData = data.gestores.map((g) => ({ nome: g.nome, B2B: g.b2b, B2C: g.b2c }));

  const detalhes = data.detalhes ?? [];
  const [gestorSel, setGestorSel] = useState(detalhes[0]?.gestor ?? "");
  const det = detalhes.find((d) => d.gestor === gestorSel) ?? detalhes[0];

  return (
    <div>
      <header
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4"
        style={{ background: INK }}
      >
        <div className="flex items-center gap-2.5">
          <NodeMark />
          <span className="text-lg font-medium text-white">
            Influência
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md px-3 py-1.5 text-[13px] text-white" style={{ background: "rgba(255,255,255,0.14)" }}>
            {data.periodoLabel}
          </span>
        </div>
      </header>

      {fonte === "mock" && (
        <div className="mb-4 rounded-md px-3 py-2 text-[13px]" style={{ background: "#FCF7C2", color: "#6B5E00" }}>
          Exibindo dados de exemplo. Configure o Firebase e rode o sync do Meta para ver os números reais.
        </div>
      )}

      <p className="mb-2 text-[13px]" style={{ color: MUTED }}>Visão geral</p>
      <div className="mb-6 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Card label="Gasto total" valor={brl(t.gasto)} sub={`${pct(t.gastoVar)} vs anterior`} accent={INK} />
        <Card label="Conversas" valor={num(t.conversas)} sub={`${pct(t.conversasVar)} vs anterior`} subColor={corVar(t.conversasVar)} accent={INK} />
        <Card label="CPL médio" valor={brlDec(t.cpl)} sub={`${pct(t.cplVar)} vs anterior`} subColor={corVar(t.cplVar, true)} accent={YELLOW} />
        <Card label="Split B2B / B2C" valor={`${num(t.b2b)} / ${num(t.b2c)}`} sub="formulário / WhatsApp" accent={YELLOW} />
      </div>

      <div className="mb-2 flex flex-wrap gap-4">
        <Swatch color={INK}>B2B · formulário</Swatch>
        <Swatch color={YELLOW}>B2C · WhatsApp</Swatch>
      </div>
      <div className="mb-8 h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="nome" tick={{ fontSize: 12, fill: MUTED }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => num(v)} cursor={{ fill: "rgba(97,26,119,0.06)" }} />
            <Bar dataKey="B2B" stackId="a" fill={INK} radius={[0, 0, 0, 0]} barSize={30} />
            <Bar dataKey="B2C" stackId="a" fill={YELLOW} radius={[3, 3, 0, 0]} barSize={30} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="mb-10 w-full border-collapse text-[13px]">
        <thead>
          <tr style={{ color: MUTED }} className="text-left">
            <th className="border-b py-2 pr-2 font-medium" style={{ borderColor: GRID }}>Gestor</th>
            <th className="border-b py-2 px-2 text-right font-medium" style={{ borderColor: GRID }}>Gasto</th>
            <th className="border-b py-2 px-2 text-right font-medium" style={{ borderColor: GRID }}>Conversas</th>
            <th className="border-b py-2 px-2 text-right font-medium" style={{ borderColor: GRID }}>CPL</th>
            <th className="border-b py-2 pl-2 text-right font-medium" style={{ borderColor: GRID }}>vs ant.</th>
          </tr>
        </thead>
        <tbody>
          {data.gestores.map((g) => (
            <tr key={g.nome}>
              <td className="border-b py-2.5 pr-2" style={{ borderColor: GRID }}>
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: INK }} />
                {g.nome}
              </td>
              <td className="border-b py-2.5 px-2 text-right" style={{ borderColor: GRID }}>{brl(g.gasto)}</td>
              <td className="border-b py-2.5 px-2 text-right" style={{ borderColor: GRID }}>{num(g.conversas)}</td>
              <td className="border-b py-2.5 px-2 text-right" style={{ borderColor: GRID }}>{brlDec(g.cpl)}</td>
              <td className="border-b py-2.5 pl-2 text-right" style={{ borderColor: GRID, color: corVar(g.cplVar, true) }}>{pct(g.cplVar)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-medium">
          <span className="mr-1.5 align-middle" style={{ color: INK }}>◆</span>
          Detalhe do gestor
        </p>
        {det && <span className="text-xs" style={{ color: MUTED }}>{det.contasCount} contas</span>}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {detalhes.map((d) => {
          const ativo = d.gestor === det?.gestor;
          return (
            <button
              key={d.gestor}
              onClick={() => setGestorSel(d.gestor)}
              className="rounded-md px-3 py-1.5 text-[13px] transition-colors"
              style={ativo
                ? { background: YELLOW, color: INK, border: `1px solid ${YELLOW}` }
                : { background: "transparent", color: "#1f1b24", border: `1px solid ${GRID}` }}
            >
              {d.gestor}
            </button>
          );
        })}
      </div>

      {!det ? (
        <div className="mb-6 rounded-md px-3 py-2 text-[13px]" style={{ background: "#f4f1ec", color: MUTED }}>
          Sem detalhe de gestor disponível.
        </div>
      ) : (
        <>
          {det.cplSemanal.length > 0 ? (
            <>
              <div className="mb-2 flex flex-wrap gap-4">
                <Swatch color={INK}>CPL atual</Swatch>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
                  <span className="inline-block w-3.5" style={{ borderTop: "2px dashed #9c9a93" }} />2 meses atrás
                </span>
              </div>
              <div className="mb-6 h-[190px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={det.cplSemanal} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="semana" tick={{ fontSize: 12, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} tickFormatter={(v) => "R$ " + v} />
                    <Tooltip formatter={(v: number) => brlDec(v)} />
                    <Line type="monotone" dataKey="atual" name="CPL atual" stroke={INK} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="doisMesesAtras" name="2 meses atrás" stroke="#9c9a93" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="mb-6 rounded-md px-3 py-2 text-[13px]" style={{ background: "#f4f1ec", color: MUTED }}>
              Série de CPL semanal vai aparecer aqui no próximo sync com histórico.
            </div>
          )}

          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr style={{ color: MUTED }} className="text-left">
                <th className="border-b py-2 pr-2 font-medium" style={{ borderColor: GRID }}>Cliente</th>
                <th className="border-b py-2 px-2 font-medium" style={{ borderColor: GRID }}>Tipo</th>
                <th className="border-b py-2 px-2 text-right font-medium" style={{ borderColor: GRID }}>Gasto</th>
                <th className="border-b py-2 px-2 text-right font-medium" style={{ borderColor: GRID }}>Conv.</th>
                <th className="border-b py-2 pl-2 text-right font-medium" style={{ borderColor: GRID }}>CPL</th>
              </tr>
            </thead>
            <tbody>
              {det.clientes.map((c) => (
                <tr key={c.cliente}>
                  <td className="border-b py-2.5 pr-2" style={{ borderColor: GRID }}>{c.cliente}</td>
                  <td className="border-b py-2.5 px-2" style={{ borderColor: GRID }}>
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[11px]"
                      style={c.tipo === "B2B"
                        ? { background: "#ECECEC", color: "#141414" }
                        : { background: "#FCF7C2", color: "#6B5E00" }}
                    >
                      {c.tipo}
                    </span>
                  </td>
                  <td className="border-b py-2.5 px-2 text-right" style={{ borderColor: GRID }}>{brl(c.gasto)}</td>
                  <td className="border-b py-2.5 px-2 text-right" style={{ borderColor: GRID }}>{num(c.conversas)}</td>
                  <td className="border-b py-2.5 pl-2 text-right" style={{ borderColor: GRID }}>{brlDec(c.cplSemanal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function NodeMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="5" r="2.4" fill="#F6E003" />
      <circle cx="5.5" cy="16" r="2.4" fill="#F6E003" />
      <circle cx="18.5" cy="16" r="2.4" fill="#F6E003" />
      <path d="M12 6.5 L6.5 14.5 M12 6.5 L17.5 14.5 M7.5 16 L16.5 16" stroke="#F6E003" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
