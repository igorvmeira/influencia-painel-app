"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { ContaMap, LinhaCliente, MetricaDiaria } from "@/lib/types";
import { montarNichos, montarPainel } from "@/lib/painel";
import { brl, brlDec, num, pct } from "@/lib/format";
import NichosSection from "./NichosSection";
import CriativosSection from "./CriativosSection";
import { auth } from "@/lib/firebaseClient";

const INK = "#141414";
const CARD = "#1F1F1F";
const YELLOW = "#F6E003";
const LINE = "#2A2A2A";
const MUTED = "#9A968F";
const GREEN = "#4ECB8F";
const RED = "#FF6B5E";

// Limiar do alerta de CPL alto, em R$. Fácil de ajustar aqui no topo.
const CPL_ALERTA = 15;

function corVar(v: number, menorMelhor = false) {
  if (v === 0) return MUTED;
  const bom = menorMelhor ? v < 0 : v > 0;
  return bom ? GREEN : RED;
}

/** Seta + variação colorida. menorMelhor inverte a noção de "bom" (ex.: CPL). */
function Trend({ v, menorMelhor = false }: { v: number; menorMelhor?: boolean }) {
  const cor = corVar(v, menorMelhor);
  const seta = v > 0 ? "▲" : v < 0 ? "▼" : "•";
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: cor }}>
      <span style={{ fontSize: 9 }}>{seta}</span>
      {pct(v)}
    </span>
  );
}

function LeadCard({ label, valor, varV, menorMelhor = false, destaque = false, sub }: {
  label: string; valor: string; varV?: number; menorMelhor?: boolean; destaque?: boolean; sub?: string;
}) {
  return (
    <div className="rounded-xl p-5" style={{ background: CARD }}>
      <p className="text-[13px]" style={{ color: MUTED }}>{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight" style={{ color: destaque ? YELLOW : "#fff" }}>
        {valor}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {typeof varV === "number" && <Trend v={varV} menorMelhor={menorMelhor} />}
        <span className="text-[11px]" style={{ color: MUTED }}>{sub ?? "vs período anterior"}</span>
      </div>
    </div>
  );
}

const PERIODOS = ["7 dias", "15 dias", "30 dias"] as const;
type Periodo = (typeof PERIODOS)[number];
const DIAS_POR_PERIODO: Record<Periodo, number> = { "7 dias": 7, "15 dias": 15, "30 dias": 30 };

type ColCliente = "cliente" | "tipo" | "gasto" | "conversas" | "cplSemanal";

export default function Dashboard(
  { daily, contas, fonte }:
  { daily: MetricaDiaria[]; contas: ContaMap[]; fonte: "firestore" | "mock" }
) {
  // Seletor de período: agora filtra de verdade, recomputando o painel a partir
  // dos registros diários para a janela selecionada.
  const [periodo, setPeriodo] = useState<Periodo>("15 dias");

  const data = useMemo(
    () => montarPainel(daily, contas, DIAS_POR_PERIODO[periodo]),
    [daily, contas, periodo]
  );
  const t = data.totais;

  // Ranking de gestores por CPL (menor = melhor).
  const ranking = useMemo(
    () => [...data.gestores].sort((a, b) => a.cpl - b.cpl),
    [data.gestores]
  );
  const maxCpl = Math.max(1, ...ranking.map((g) => g.cpl));
  const subindo = data.gestores.filter((g) => g.cplVar > 0);
  // Gestores com CPL absoluto acima do limiar (em R$).
  const cplAlto = data.gestores.filter((g) => g.cpl >= CPL_ALERTA);

  // Nº de clientes por gestor (a partir do de-para).
  const clientesPorGestor = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contas) m.set(c.gestor, (m.get(c.gestor) ?? 0) + 1);
    return m;
  }, [contas]);

  // Aba do ranking: por gestor, por nicho ou criativos (ao vivo).
  const [aba, setAba] = useState<"gestores" | "nichos" | "criativos">("gestores");
  const nichos = useMemo(
    () => montarNichos(daily, contas, DIAS_POR_PERIODO[periodo]),
    [daily, contas, periodo]
  );

  const detalhes = data.detalhes ?? [];
  const [gestorSel, setGestorSel] = useState(detalhes[0]?.gestor ?? "");
  const det = detalhes.find((d) => d.gestor === gestorSel) ?? detalhes[0];

  // Ordenação + busca da tabela de clientes.
  const [busca, setBusca] = useState("");
  const [ordCol, setOrdCol] = useState<ColCliente>("gasto");
  const [ordDir, setOrdDir] = useState<"asc" | "desc">("desc");

  const clientes = useMemo(() => {
    const base = (det?.clientes ?? []).filter((c) =>
      c.cliente.toLowerCase().includes(busca.trim().toLowerCase())
    );
    const dir = ordDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = a[ordCol], vb = b[ordCol];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [det, busca, ordCol, ordDir]);

  function ordenar(col: ColCliente) {
    if (col === ordCol) setOrdDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setOrdCol(col); setOrdDir(col === "cliente" || col === "tipo" ? "asc" : "desc"); }
  }

  const seta = (col: ColCliente) => (ordCol === col ? (ordDir === "asc" ? " ↑" : " ↓") : "");

  const router = useRouter();
  async function sair() {
    if (auth) await signOut(auth);
    router.replace("/login");
  }

  return (
    <div>
      {/* Topo: logo + seletor de período */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <NodeMark />
          <span className="text-lg font-semibold text-white">Influência</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full p-1" style={{ background: CARD }}>
            {PERIODOS.map((p) => {
              const ativo = p === periodo;
              return (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
                  style={ativo
                    ? { background: YELLOW, color: INK }
                    : { background: "transparent", color: MUTED }}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <button
            onClick={sair}
            className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
            style={{ background: CARD, color: MUTED }}
          >
            Sair
          </button>
        </div>
      </header>

      {fonte === "mock" && (
        <div className="mb-5 rounded-xl px-4 py-3 text-[13px]" style={{ background: "#2a2607", color: YELLOW }}>
          Exibindo dados de exemplo. Configure o Firebase e rode o sync do Meta para ver os números reais.
        </div>
      )}

      {/* Visão de Liderança */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>Visão de liderança</p>
        <span className="text-[11px]" style={{ color: MUTED }}>{data.periodoLabel}</span>
      </div>
      <div className="mb-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <LeadCard label="Investido" valor={brl(t.gasto)} varV={t.gastoVar} />
        <LeadCard label="Conversas" valor={num(t.conversas)} varV={t.conversasVar} />
        <LeadCard label="CPL geral" valor={brlDec(t.cpl)} varV={t.cplVar} menorMelhor destaque />
        <LeadCard label="Split B2B / B2C" valor={`${num(t.b2b)} / ${num(t.b2c)}`} sub="formulário / WhatsApp" />
      </div>

      {/* Faixa de alerta */}
      {subindo.length > 0 && (
        <div
          className="mb-8 flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-[13px]"
          style={{ background: "#2a2607", color: YELLOW }}
        >
          <span style={{ fontSize: 11 }}>▲</span>
          <span className="font-medium">
            {subindo.length} {subindo.length === 1 ? "gestor com" : "gestores com"} CPL subindo:
          </span>
          <span style={{ color: "#d9cf6b" }}>
            {subindo.map((g) => `${g.nome} (${pct(g.cplVar)})`).join(" · ")}
          </span>
        </div>
      )}

      {/* Faixa de alerta — CPL alto (acima do limiar em R$) */}
      {cplAlto.length > 0 && (
        <div
          className="mb-8 flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-[13px]"
          style={{ background: "#2a0707", color: RED }}
        >
          <span style={{ fontSize: 11 }}>▲</span>
          <span className="font-medium">
            {cplAlto.length} {cplAlto.length === 1 ? "gestor com" : "gestores com"} CPL acima de {brlDec(CPL_ALERTA)}:
          </span>
          <span style={{ color: "#e59a92" }}>
            {cplAlto.map((g) => `${g.nome} (${brlDec(g.cpl)})`).join(" · ")}
          </span>
        </div>
      )}

      {/* Toggle Gestores / Nichos / Criativos — ranking por CPL */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["gestores", "nichos", "criativos"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
            style={aba === a ? { background: YELLOW, color: INK } : { background: CARD, color: MUTED }}
          >
            {a === "gestores" ? "Gestores" : a === "nichos" ? "Nichos" : "Criativos"}
          </button>
        ))}
        <span className="ml-1 text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>· ranking por CPL</span>
      </div>

      {aba === "criativos" ? (
        <div className="mb-10">
          <CriativosSection contas={contas} diasInicial={DIAS_POR_PERIODO[periodo]} />
        </div>
      ) : aba === "gestores" ? (
        <div className="mb-10 rounded-xl p-5" style={{ background: CARD }}>
          <div className="flex flex-col gap-4">
            {ranking.map((g, i) => {
              const melhor = i === 0;
              const largura = Math.max(6, (g.cpl / maxCpl) * 100);
              return (
                <div key={g.nome} className="flex items-center gap-4">
                  <div className="flex w-40 shrink-0 items-center gap-2">
                    <span className="truncate text-sm" style={{ color: "#fff" }}>{g.nome}</span>
                    {melhor && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ background: YELLOW, color: INK }}
                      >
                        melhor
                      </span>
                    )}
                  </div>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "#2a2a2a" }}>
                    <div className="h-full rounded-full" style={{ width: `${largura}%`, background: YELLOW }} />
                  </div>
                  <div className="flex w-52 shrink-0 flex-col items-end">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums" style={{ color: "#fff" }}>{brlDec(g.cpl)}</span>
                      <Trend v={g.cplVar} menorMelhor />
                    </div>
                    <span className="text-[11px]" style={{ color: MUTED }}>
                      {brl(g.gasto)} · {num(g.conversas)} conv · {clientesPorGestor.get(g.nome) ?? 0} clientes
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mb-10">
          <NichosSection nichos={nichos} />
        </div>
      )}

      {/* Detalhe por gestor */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>Detalhe por gestor</p>
        {det && <span className="text-xs" style={{ color: MUTED }}>{det.contasCount} contas</span>}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {detalhes.map((d) => {
          const ativo = d.gestor === det?.gestor;
          return (
            <button
              key={d.gestor}
              onClick={() => setGestorSel(d.gestor)}
              className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
              style={ativo
                ? { background: YELLOW, color: INK }
                : { background: CARD, color: MUTED }}
            >
              {d.gestor}
            </button>
          );
        })}
      </div>

      {!det ? (
        <div className="mb-6 rounded-xl px-4 py-3 text-[13px]" style={{ background: CARD, color: MUTED }}>
          Sem detalhe de gestor disponível.
        </div>
      ) : (
        <>
          {det.cplSemanal.length > 0 ? (
            <div className="mb-8 rounded-xl p-5" style={{ background: CARD }}>
              <div className="mb-3 flex flex-wrap gap-4">
                <span className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: YELLOW }} />
                  CPL atual
                </span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
                  <span className="inline-block w-3.5" style={{ borderTop: `2px dashed ${MUTED}` }} />2 meses atrás
                </span>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={det.cplSemanal} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke={LINE} vertical={false} />
                    <XAxis dataKey="semana" tick={{ fontSize: 12, fill: MUTED }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} tickFormatter={(v) => "R$ " + v} />
                    <Tooltip
                      formatter={(v: number) => brlDec(v)}
                      contentStyle={{ background: INK, border: `1px solid ${LINE}`, borderRadius: 8, color: "#fff" }}
                      labelStyle={{ color: MUTED }}
                    />
                    <Line type="monotone" dataKey="atual" name="CPL atual" stroke={YELLOW} strokeWidth={2.5} dot={{ r: 3, fill: YELLOW }} />
                    <Line type="monotone" dataKey="doisMesesAtras" name="2 meses atrás" stroke={MUTED} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="mb-8 rounded-xl px-4 py-3 text-[13px]" style={{ background: CARD, color: MUTED }}>
              Série de CPL semanal vai aparecer aqui no próximo sync com histórico.
            </div>
          )}

          {/* Busca por cliente */}
          <div className="mb-4">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-[#6b675f] sm:w-72"
              style={{ background: CARD, color: "#fff", border: `1px solid ${LINE}` }}
            />
          </div>

          <div className="overflow-x-auto rounded-xl" style={{ background: CARD }}>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr style={{ color: MUTED }} className="text-left">
                  <Th onClick={() => ordenar("cliente")}>Cliente{seta("cliente")}</Th>
                  <Th onClick={() => ordenar("tipo")}>Tipo{seta("tipo")}</Th>
                  <Th right onClick={() => ordenar("gasto")}>Gasto{seta("gasto")}</Th>
                  <Th right onClick={() => ordenar("conversas")}>Conv.{seta("conversas")}</Th>
                  <Th right onClick={() => ordenar("cplSemanal")}>CPL{seta("cplSemanal")}</Th>
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center" style={{ color: MUTED }}>
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  clientes.map((c) => <LinhaClienteRow key={c.cliente} c={c} />)
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Th({ children, right, onClick }: { children: React.ReactNode; right?: boolean; onClick: () => void }) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none px-4 py-3 font-medium hover:text-white ${right ? "text-right" : ""}`}
      style={{ borderBottom: `1px solid ${LINE}` }}
    >
      {children}
    </th>
  );
}

function LinhaClienteRow({ c }: { c: LinhaCliente }) {
  return (
    <tr>
      <td className="px-4 py-3" style={{ borderBottom: `1px solid ${LINE}`, color: "#fff" }}>{c.cliente}</td>
      <td className="px-4 py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
        <span
          className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
          style={c.tipo === "B2B"
            ? { background: "#2a2a2a", color: "#cfcbc3" }
            : { background: "#2a2607", color: YELLOW }}
        >
          {c.tipo}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: "#fff" }}>{brl(c.gasto)}</td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: "#fff" }}>{num(c.conversas)}</td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: "#fff" }}>{brlDec(c.cplSemanal)}</td>
    </tr>
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
