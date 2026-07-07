"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { ContaMap, LimiteConta, LinhaCliente, MetricaDiaria } from "@/lib/types";
import { montarNichos, montarPainel } from "@/lib/painel";
import { brl, brlDec, num, pct } from "@/lib/format";
import { montarKpis, moedaCard, numCard } from "@/lib/kpis";
import { TEMA } from "@/lib/brand";
import NichosSection from "./NichosSection";
import CriativosSection from "./CriativosSection";
import Sparkline from "./Sparkline";
import IAChat from "./IAChat";
import { auth } from "@/lib/firebaseClient";

// Cores lidas dos design tokens (fonte única em lib/brand.ts).
const INK = TEMA.fundo;
const CARD = TEMA.card;
const YELLOW = TEMA.destaque;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const GREEN = TEMA.positivo;
const RED = TEMA.negativo;

// Limiar do alerta de CPL alto, em R$. Fácil de ajustar aqui no topo.
const CPL_ALERTA = 15;

// Alerta de limite de gasto: percentual usado (amount_spent / spend_cap) a partir
// do qual a conta entra em ATENÇÃO (âmbar) ou CRÍTICO (vermelho). Fácil de ajustar.
const LIMITE_ATENCAO = 0.8; // >= 80% usado
const LIMITE_CRITICO = 0.9; // >= 90% usado

const AMBAR = TEMA.atencao;

// Uma conta perto do teto de gasto, já com o percentual usado e o restante em R$.
interface AlertaLimite {
  accountId: string;
  cliente: string;
  gestor: string;
  spendCap: number;
  amountSpent: number;
  usoPct: number;   // 0..1+
  restante: number; // R$ que faltam até o teto (nunca negativo)
  critico: boolean;
}

// Deriva a lista de contas perto do limite a partir do de-para + dos limites.
// Só entram contas com teto (spend_cap > 0) e uso >= LIMITE_ATENCAO.
function contasPertoDoLimite(contas: ContaMap[], limites: LimiteConta[]): AlertaLimite[] {
  const mapaLim = new Map(limites.map((l) => [l.accountId, l]));
  const out: AlertaLimite[] = [];
  for (const c of contas) {
    const l = mapaLim.get(c.accountId);
    if (!l || l.spendCap <= 0) continue; // sem teto → ignora
    const usoPct = l.amountSpent / l.spendCap;
    if (usoPct < LIMITE_ATENCAO) continue;
    out.push({
      accountId: c.accountId,
      cliente: c.cliente,
      gestor: c.gestor,
      spendCap: l.spendCap,
      amountSpent: l.amountSpent,
      usoPct,
      restante: Math.max(0, l.spendCap - l.amountSpent),
      critico: usoPct >= LIMITE_CRITICO,
    });
  }
  return out.sort((a, b) => b.usoPct - a.usoPct);
}

// ---- Central de alertas: modelo unificado dos três tipos de alerta ----
type TipoAlerta = "cplSubindo" | "cplAlto" | "limite";
type Severidade = "critico" | "atencao";

const TIPO_ROTULO: Record<TipoAlerta, string> = {
  cplSubindo: "CPL subindo",
  cplAlto: "CPL alto",
  limite: "Perto do limite",
};
// Cores por tipo (pedido): amarelo=subindo, vermelho=CPL alto, âmbar=limite.
const TIPO_COR: Record<TipoAlerta, string> = {
  cplSubindo: YELLOW,
  cplAlto: RED,
  limite: AMBAR,
};
// Ordem de exibição dos tipos dentro de cada severidade.
const TIPO_ORDEM: TipoAlerta[] = ["cplAlto", "limite", "cplSubindo"];

interface AlertaCard {
  id: string;
  tipo: TipoAlerta;
  severidade: Severidade;
  nome: string;        // destaque (gestor p/ CPL, cliente p/ limite)
  gestor?: string;     // secundário (só limite; no CPL o próprio nome já é o gestor)
  accountId?: string;  // limite → para a barrinha de uso
  usoPct?: number;     // limite → %
  restante?: number;   // limite → R$
  cpl?: number;        // CPL → R$
  cplVar?: number;     // CPL → variação %
}

// Formata o horário do último sync no fuso de Brasília (pt-BR).
// Ex.: "04/07/2026 às 06:12". Sem registro → "Sincronização pendente".
function rotuloSync(iso: string | null): string {
  if (!iso) return "Sincronização pendente";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sincronização pendente";
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `Última sincronização: ${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}

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

// Badge de variação para os KPIs. delta null → "—" (sem base suficiente).
function DeltaBadge({ delta, menorMelhor = false }: { delta: number | null; menorMelhor?: boolean }) {
  if (delta === null) return <span className="text-xs font-medium" style={{ color: MUTED }} title="sem período anterior comparável">—</span>;
  const cor = corVar(delta, menorMelhor);
  const seta = delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: cor }}>
      <span style={{ fontSize: 9 }}>{seta}</span>
      {pct(delta)}
    </span>
  );
}

// Card de KPI: rótulo + subtítulo, número grande tabular, delta semântico e sparkline.
function KpiCard({ label, sub, valor, title, delta, menorMelhor = false, destaque = false, serie }: {
  label: string; sub?: string; valor: string; title: string;
  delta: number | null; menorMelhor?: boolean; destaque?: boolean; serie: number[];
}) {
  return (
    <div className="p-5" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-white">{label}</p>
          {sub && <p className="text-[11px]" style={{ color: MUTED }}>{sub}</p>}
        </div>
        <Sparkline dados={serie} cor={TEMA.sparkline} />
      </div>
      <p
        title={title}
        className="mt-3 text-3xl font-medium tracking-tight"
        style={{ color: destaque ? YELLOW : "#fff", fontVariantNumeric: "tabular-nums" }}
      >
        {valor}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <DeltaBadge delta={delta} menorMelhor={menorMelhor} />
        <span className="text-[11px]" style={{ color: MUTED }}>vs período anterior</span>
      </div>
    </div>
  );
}

const PERIODOS = ["7 dias", "15 dias", "30 dias"] as const;
type Periodo = (typeof PERIODOS)[number];
const DIAS_POR_PERIODO: Record<Periodo, number> = { "7 dias": 7, "15 dias": 15, "30 dias": 30 };

type ColCliente = "cliente" | "tipo" | "gasto" | "conversas" | "cplSemanal";

export default function Dashboard(
  { daily, contas, fonte, ultimaSync, limites }:
  { daily: MetricaDiaria[]; contas: ContaMap[]; fonte: "firestore" | "mock"; ultimaSync: string | null; limites: LimiteConta[] }
) {
  // Seletor de período: agora filtra de verdade, recomputando o painel a partir
  // dos registros diários para a janela selecionada.
  const [periodo, setPeriodo] = useState<Periodo>("15 dias");

  const data = useMemo(
    () => montarPainel(daily, contas, DIAS_POR_PERIODO[periodo]),
    [daily, contas, periodo]
  );

  // KPIs do topo (formatação/deltas/sparklines) — respeita o período selecionado.
  const kpis = useMemo(
    () => montarKpis(daily, contas, DIAS_POR_PERIODO[periodo]),
    [daily, contas, periodo]
  );

  // Ranking de gestores por CPL (menor = melhor).
  const ranking = useMemo(
    () => [...data.gestores].sort((a, b) => a.cpl - b.cpl),
    [data.gestores]
  );
  const maxCpl = Math.max(1, ...ranking.map((g) => g.cpl));
  const subindo = data.gestores.filter((g) => g.cplVar > 0);
  // Gestores com CPL absoluto acima do limiar (em R$).
  const cplAlto = data.gestores.filter((g) => g.cpl >= CPL_ALERTA);

  // Contas perto do teto de gasto (para os alertas e as barrinhas de uso).
  const pertoLimite = useMemo(() => contasPertoDoLimite(contas, limites), [contas, limites]);
  const limitesPorConta = useMemo(() => new Map(limites.map((l) => [l.accountId, l])), [limites]);

  // Lista unificada de alertas para a central. Respeita o período: subindo/cplAlto
  // derivam de data.gestores, que é recomputado por período; o limite é vitalício
  // da conta (spend_cap não tem recorte de período).
  const alertas = useMemo<AlertaCard[]>(() => {
    const arr: AlertaCard[] = [];
    for (const g of cplAlto) {
      arr.push({ id: `cplAlto-${g.nome}`, tipo: "cplAlto", severidade: "critico", nome: g.nome, cpl: g.cpl, cplVar: g.cplVar });
    }
    for (const g of subindo) {
      arr.push({ id: `subindo-${g.nome}`, tipo: "cplSubindo", severidade: "atencao", nome: g.nome, cpl: g.cpl, cplVar: g.cplVar });
    }
    for (const a of pertoLimite) {
      arr.push({
        id: `limite-${a.accountId}`, tipo: "limite", severidade: a.critico ? "critico" : "atencao",
        nome: a.cliente, gestor: a.gestor, accountId: a.accountId, usoPct: a.usoPct, restante: a.restante,
      });
    }
    return arr;
  }, [cplAlto, subindo, pertoLimite]);

  const contagem: Record<TipoAlerta, number> = {
    cplSubindo: subindo.length,
    cplAlto: cplAlto.length,
    limite: pertoLimite.length,
  };

  // Filtro da aba de alertas (qual tipo mostrar). "todos" = sem filtro.
  const [centralFiltro, setCentralFiltro] = useState<TipoAlerta | "todos">("todos");

  // Nº de clientes por gestor (a partir do de-para).
  const clientesPorGestor = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contas) m.set(c.gestor, (m.get(c.gestor) ?? 0) + 1);
    return m;
  }, [contas]);

  // Aba ativa: rankings (gestores/nichos/criativos) ou a central de alertas.
  const [aba, setAba] = useState<"gestores" | "nichos" | "criativos" | "alertas">("gestores");
  // Abre a aba de alertas já filtrada pelo tipo do chip clicado.
  function abrirAlertas(tipo: TipoAlerta | "todos") {
    setCentralFiltro(tipo);
    setAba("alertas");
  }
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
        <KpiCard
          label="Gasto"
          valor={moedaCard(kpis.gasto.valor)}
          title={brl(kpis.gasto.valor)}
          delta={kpis.gasto.delta}
          serie={kpis.gasto.serie}
        />
        <KpiCard
          label="Leads"
          sub="formulário"
          valor={numCard(kpis.leads.valor)}
          title={`${num(kpis.leads.valor)} leads de formulário`}
          delta={kpis.leads.delta}
          serie={kpis.leads.serie}
        />
        <KpiCard
          label="CPL médio"
          valor={brlDec(kpis.cpl.valor)}
          title={`${brlDec(kpis.cpl.valor)} · base: ${num(kpis.cpl.base)} resultados no período (leads + conversas)`}
          delta={kpis.cpl.delta}
          menorMelhor
          destaque
          serie={kpis.cpl.serie}
        />
        <KpiCard
          label="Conversas"
          sub="WhatsApp"
          valor={numCard(kpis.conversas.valor)}
          title={`${num(kpis.conversas.valor)} conversas de WhatsApp`}
          delta={kpis.conversas.delta}
          serie={kpis.conversas.serie}
        />
      </div>

      {/* Alertas: linha compacta de chips. Clicar abre a aba Alertas já filtrada. */}
      {alertas.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>Alertas</span>
          {TIPO_ORDEM.filter((tp) => contagem[tp] > 0).map((tp) => (
            <ChipAlerta
              key={tp}
              rotulo={TIPO_ROTULO[tp]}
              cor={TIPO_COR[tp]}
              contagem={contagem[tp]}
              ativo={aba === "alertas" && centralFiltro === tp}
              onClick={() => abrirAlertas(tp)}
            />
          ))}
          <button
            onClick={() => abrirAlertas("todos")}
            className="ml-1 text-[12px] font-medium underline-offset-2 hover:underline"
            style={{ color: MUTED }}
          >
            ver todos
          </button>
        </div>
      )}

      {/* Toggle de abas: rankings (por CPL) + central de alertas */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["gestores", "nichos", "criativos", "alertas"] as const).map((a) => {
          const rotulo = a === "gestores" ? "Gestores"
            : a === "nichos" ? "Nichos"
            : a === "criativos" ? "Criativos" : "Alertas";
          return (
            <button
              key={a}
              onClick={() => setAba(a)}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
              style={aba === a ? { background: YELLOW, color: INK } : { background: CARD, color: MUTED }}
            >
              {rotulo}
              {a === "alertas" && alertas.length > 0 && (
                <span
                  className="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
                  style={aba === a ? { background: "rgba(0,0,0,0.18)", color: INK } : { background: "#2a2a2a", color: MUTED }}
                >
                  {alertas.length}
                </span>
              )}
            </button>
          );
        })}
        {aba !== "alertas" && (
          <span className="ml-1 text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>· ranking por CPL</span>
        )}
      </div>

      {aba === "alertas" ? (
        alertas.length > 0 ? (
          <CentralAlertas
            alertas={alertas}
            filtro={centralFiltro}
            setFiltro={setCentralFiltro}
            contagem={contagem}
            limitesPorConta={limitesPorConta}
          />
        ) : (
          <div className="mb-10 rounded-xl p-8 text-center text-[13px]" style={{ background: CARD, color: MUTED }}>
            Nenhum alerta no período selecionado.
          </div>
        )
      ) : aba === "criativos" ? (
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
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: LINE }}>
                    {/* Amarelo só no melhor gestor (destaque); demais em tom neutro. */}
                    <div className="h-full rounded-full" style={{ width: `${largura}%`, background: melhor ? YELLOW : "#3A3A3A" }} />
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
                  <th className="px-4 py-3 font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Limite</th>
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center" style={{ color: MUTED }}>
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  clientes.map((c) => (
                    <LinhaClienteRow key={c.cliente} c={c} limite={limitesPorConta.get(c.accountId)} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Rodapé discreto — horário do último sync (fuso de Brasília) */}
      <footer
        className="mt-10 border-t pt-4 text-center text-[11px] tracking-wide"
        style={{ borderColor: LINE, color: MUTED }}
      >
        {rotuloSync(ultimaSync)}
      </footer>

      {/* Assistente de IA — só aparece se NEXT_PUBLIC_IA_ATIVA = "true" */}
      <IAChat periodoDias={DIAS_POR_PERIODO[periodo]} />
    </div>
  );
}

// Chip compacto de alerta (rótulo + contagem) na tela principal.
function ChipAlerta({ rotulo, cor, contagem, ativo, onClick }: {
  rotulo: string; cor: string; contagem: number; ativo: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors"
      style={{ background: ativo ? cor : CARD, color: ativo ? INK : "#fff", border: `1px solid ${ativo ? cor : LINE}` }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: ativo ? INK : cor }} />
      {rotulo}
      <span
        className="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
        style={{ background: ativo ? "rgba(0,0,0,0.18)" : "#2a2a2a", color: ativo ? INK : cor }}
      >
        {contagem}
      </span>
    </button>
  );
}

// Pílula de filtro por tipo dentro da central.
function FiltroPill({ rotulo, ativo, onClick }: { rotulo: string; ativo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
      style={ativo ? { background: YELLOW, color: INK } : { background: "#2a2a2a", color: MUTED }}
    >
      {rotulo}
    </button>
  );
}

// Ordena os alertas de um grupo: por ordem de tipo e, dentro do tipo, do mais grave.
function ordenarAlertas(itens: AlertaCard[]): AlertaCard[] {
  return [...itens].sort((a, b) => {
    const ta = TIPO_ORDEM.indexOf(a.tipo), tb = TIPO_ORDEM.indexOf(b.tipo);
    if (ta !== tb) return ta - tb;
    return (b.usoPct ?? b.cpl ?? 0) - (a.usoPct ?? a.cpl ?? 0);
  });
}

// Central de alertas: lista tudo com espaço, agrupada por severidade e por tipo.
function CentralAlertas({ alertas, filtro, setFiltro, contagem, limitesPorConta }: {
  alertas: AlertaCard[];
  filtro: TipoAlerta | "todos";
  setFiltro: (f: TipoAlerta | "todos") => void;
  contagem: Record<TipoAlerta, number>;
  limitesPorConta: Map<string, LimiteConta>;
}) {
  const lista = filtro === "todos" ? alertas : alertas.filter((a) => a.tipo === filtro);
  const criticos = ordenarAlertas(lista.filter((a) => a.severidade === "critico"));
  const atencao = ordenarAlertas(lista.filter((a) => a.severidade === "atencao"));

  return (
    <section className="mb-10 rounded-xl p-5" style={{ background: CARD }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>Central de alertas</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <FiltroPill rotulo="Todos" ativo={filtro === "todos"} onClick={() => setFiltro("todos")} />
          {TIPO_ORDEM.filter((tp) => contagem[tp] > 0).map((tp) => (
            <FiltroPill
              key={tp}
              rotulo={`${TIPO_ROTULO[tp]} (${contagem[tp]})`}
              ativo={filtro === tp}
              onClick={() => setFiltro(tp)}
            />
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="py-6 text-center text-[13px]" style={{ color: MUTED }}>Nenhum alerta neste filtro.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {criticos.length > 0 && (
            <GrupoSeveridade titulo="Crítico" cor={RED} itens={criticos} limitesPorConta={limitesPorConta} />
          )}
          {atencao.length > 0 && (
            <GrupoSeveridade titulo="Atenção" cor={AMBAR} itens={atencao} limitesPorConta={limitesPorConta} />
          )}
        </div>
      )}
    </section>
  );
}

function GrupoSeveridade({ titulo, cor, itens, limitesPorConta }: {
  titulo: string; cor: string; itens: AlertaCard[]; limitesPorConta: Map<string, LimiteConta>;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} />
        <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: cor }}>{titulo}</h3>
        <span className="text-[11px] tabular-nums" style={{ color: MUTED }}>{itens.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {itens.map((a) => (
          <AlertaCardRow key={a.id} a={a} limite={a.accountId ? limitesPorConta.get(a.accountId) : undefined} />
        ))}
      </div>
    </div>
  );
}

// Uma linha/card de alerta. Limite → cliente + gestor + barra + %/R$ restante.
// CPL → gestor + CPL (R$) + variação.
function AlertaCardRow({ a, limite }: { a: AlertaCard; limite?: LimiteConta }) {
  const ehLimite = a.tipo === "limite";
  return (
    <div className="flex items-center gap-4 rounded-lg px-4 py-3" style={{ background: INK }}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TIPO_COR[a.tipo] }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-white">{a.nome}</span>
          <span
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase"
            style={{ background: "#2a2a2a", color: TIPO_COR[a.tipo] }}
          >
            {TIPO_ROTULO[a.tipo]}
          </span>
        </div>
        <p className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
          {ehLimite ? `Gestor: ${a.gestor}` : "Gestor"}
        </p>
      </div>
      <div className="flex w-64 shrink-0 items-center justify-end gap-3">
        {ehLimite ? (
          <>
            <BarraLimite limite={limite} />
            <span className="w-24 text-right text-[12px] tabular-nums" style={{ color: MUTED }}>
              resta {brlDec(a.restante ?? 0)}
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium tabular-nums text-white">{brlDec(a.cpl ?? 0)}</span>
            <Trend v={a.cplVar ?? 0} menorMelhor />
          </>
        )}
      </div>
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

function LinhaClienteRow({ c, limite }: { c: LinhaCliente; limite?: LimiteConta }) {
  return (
    // hover:bg = TEMA.hover (#232323) — literal exigido pelo Tailwind.
    <tr className="transition-colors hover:bg-[#232323]">
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
      <td className="px-4 py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
        <BarraLimite limite={limite} />
      </td>
    </tr>
  );
}

// Barrinha de uso do teto (usado vs spend_cap). Só aparece para contas com teto.
function BarraLimite({ limite }: { limite?: LimiteConta }) {
  if (!limite || limite.spendCap <= 0) {
    return <span className="text-[12px]" style={{ color: MUTED }}>—</span>;
  }
  const usoPct = limite.amountSpent / limite.spendCap;
  const larg = Math.min(100, Math.max(0, usoPct * 100));
  const cor = usoPct >= LIMITE_CRITICO ? RED : usoPct >= LIMITE_ATENCAO ? AMBAR : GREEN;
  return (
    <div className="flex items-center gap-2" title={`${brlDec(limite.amountSpent)} de ${brlDec(limite.spendCap)}`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: LINE }}>
        <div className="h-full rounded-full" style={{ width: `${larg}%`, background: cor }} />
      </div>
      <span className="text-[12px] tabular-nums" style={{ color: cor }}>{Math.round(usoPct * 100)}%</span>
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
