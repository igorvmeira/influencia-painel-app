"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { ContaMap, LimiteConta, LinhaCliente, MetricaDiaria } from "@/lib/types";
import { montarNichos, montarPainel } from "@/lib/painel";
import { CPL_ALERTA, LIMITE_ATENCAO, LIMITE_CRITICO, contasPertoDoLimite } from "@/lib/alertas";
import { brl, brlDec, num, pct } from "@/lib/format";
import { montarKpis, montarKpisMes, moedaCard, numCard, serieGrafico, serieGraficoMes } from "@/lib/kpis";
import { janelaMes } from "@/lib/periodo";
import { TEMA } from "@/lib/brand";
import NichosSection from "./NichosSection";
import CriativosSection from "./CriativosSection";
import HeroChart from "./HeroChart";
import Sparkline from "./Sparkline";
import NumeroAnimado from "./NumeroAnimado";
import IndicadorFrescor from "./IndicadorFrescor";
import IAChat from "./IAChat";

// Cores lidas dos design tokens (fonte única em lib/brand.ts).
const INK = TEMA.fundo;
const CARD = TEMA.card;
const YELLOW = TEMA.destaque;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const GREEN = TEMA.positivo;
const RED = TEMA.negativo;

// Cor âmbar do alerta de limite (as constantes/regra vivem em lib/alertas.ts).
const AMBAR = TEMA.atencao;

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

// Contas pausadas: acordeão discreto de rodapé, fechado por padrão. Ao abrir,
// mostra pills só com o nome do cliente (account_id vai no title). Estado não
// persiste — volta fechado a cada carga.
function PausadasRodape({ pausadas }: { pausadas: ContaMap[] }) {
  const [aberto, setAberto] = useState(false);
  if (pausadas.length === 0) return null;
  return (
    <div className="mt-10">
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex items-center gap-1.5 text-[12px] transition-colors hover:text-white"
        style={{ color: MUTED }}
        aria-expanded={aberto}
      >
        <span style={{ fontSize: 10, transform: aberto ? "rotate(90deg)" : "none", transition: "transform 150ms" }}>▸</span>
        {pausadas.length} contas pausadas · fora dos rankings, médias e alertas
      </button>
      {aberto && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {pausadas.map((c) => (
            <span
              key={c.accountId}
              title={c.accountId}
              className="truncate rounded-md px-2 py-1 text-[11px]"
              style={{ background: CARD, border: `1px solid ${LINE}`, color: MUTED }}
            >
              {c.cliente}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Avatar discreto com as iniciais do gestor (tokens da marca).
function Iniciais({ nome }: { nome: string }) {
  const ini = nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
      style={{ background: LINE, color: "#cfcbc3" }}
    >
      {ini}
    </span>
  );
}

// Card de KPI: rótulo + subtítulo, número grande tabular (com count-up), delta
// semântico e sparkline. O número anima ao trocar de período (respeita reduced-motion).
function KpiCard({ label, sub, valorNum, formatar, title, delta, menorMelhor = false, destaque = false, serie }: {
  label: string; sub?: string; valorNum: number; formatar: (n: number) => string; title: string;
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
      <NumeroAnimado
        valor={valorNum}
        formatar={formatar}
        title={title}
        className="mt-3 block text-3xl font-medium tracking-tight"
        style={{ color: destaque ? YELLOW : "#fff", fontVariantNumeric: "tabular-nums" }}
      />
      <div className="mt-2 flex items-center gap-2">
        <DeltaBadge delta={delta} menorMelhor={menorMelhor} />
        <span className="text-[11px]" style={{ color: MUTED }}>vs período anterior</span>
      </div>
    </div>
  );
}

const PERIODOS = ["7 dias", "15 dias", "30 dias", "Mês"] as const;
type Periodo = (typeof PERIODOS)[number];
type PeriodoDia = Exclude<Periodo, "Mês">;
const DIAS_POR_PERIODO: Record<PeriodoDia, number> = { "7 dias": 7, "15 dias": 15, "30 dias": 30 };

type ColCliente = "cliente" | "tipo" | "gasto" | "conversas" | "cplSemanal";

export default function Dashboard(
  { daily, contas, fonte, ultimaSync, limites }:
  { daily: MetricaDiaria[]; contas: ContaMap[]; fonte: "firestore" | "mock"; ultimaSync: string | null; limites: LimiteConta[] }
) {
  // Seletor de período: agora filtra de verdade, recomputando o painel a partir
  // dos registros diários para a janela selecionada.
  const [periodo, setPeriodo] = useState<Periodo>("15 dias");

  // Regra única: conta pausada fica FORA de toda a operação (rankings, médias,
  // nichos, criativos, KPIs, gráfico e alertas). As pausadas só alimentam o
  // contador/selo de transparência abaixo.
  const contasAtivas = useMemo(() => contas.filter((c) => !c.pausado), [contas]);
  const pausadas = useMemo(() => contas.filter((c) => c.pausado), [contas]);

  // Modo mês (mês corrente 1..D vs mês anterior 1..D). No modo dia, jm é null.
  const modoMes = periodo === "Mês";
  const jm = useMemo(() => (modoMes ? janelaMes(daily, contasAtivas) : null), [modoMes, daily, contasAtivas]);
  // Nº de dias efetivos: D no modo mês; senão o do botão 7/15/30.
  const diasEfetivos = modoMes ? jm?.D ?? 30 : DIAS_POR_PERIODO[periodo as PeriodoDia];

  const data = useMemo(
    () => (modoMes && jm ? montarPainel(daily, contasAtivas, jm.D, jm.espec) : montarPainel(daily, contasAtivas, diasEfetivos)),
    [daily, contasAtivas, modoMes, jm, diasEfetivos]
  );

  // KPIs do topo (formatação/deltas/sparklines) — respeita o período selecionado.
  const kpis = useMemo(
    () => (modoMes && jm ? montarKpisMes(daily, contasAtivas, jm) : montarKpis(daily, contasAtivas, diasEfetivos)),
    [daily, contasAtivas, modoMes, jm, diasEfetivos]
  );

  // Série diária para o gráfico-herói (mesma janela dos KPIs; fantasma no modo mês).
  const serieDoGrafico = useMemo(
    () => (modoMes && jm ? serieGraficoMes(daily, contasAtivas, jm) : serieGrafico(daily, contasAtivas, diasEfetivos)),
    [daily, contasAtivas, modoMes, jm, diasEfetivos]
  );

  // Tooltip do "—" (Alcance/Impressões): data DINÂMICA em que a coleta começou.
  const tooltipSemDado = useMemo(() => {
    let min = "";
    for (const m of daily) if (typeof m.reach === "number" && (min === "" || m.data < min)) min = m.data;
    if (!min) return "Ainda não coletado (passa a ser preenchido no próximo sync).";
    const [y, mo, d] = min.split("-");
    return `Passou a ser coletado a partir de ${d}/${mo}/${y}; dias anteriores não têm o dado.`;
  }, [daily]);

  // Ranking de gestores por CPL (menor = melhor).
  const ranking = useMemo(
    () => [...data.gestores].sort((a, b) => a.cpl - b.cpl),
    [data.gestores]
  );
  const maxCpl = Math.max(1, ...ranking.map((g) => g.cpl));
  const subindo = data.gestores.filter((g) => g.cplVar > 0);
  // Gestores com CPL absoluto acima do limiar (em R$).
  const cplAlto = data.gestores.filter((g) => g.cpl >= CPL_ALERTA);
  // Pior gestor por CPL (para o card vermelho da faixa "Precisa de atenção").
  const piorCpl = cplAlto.length ? cplAlto.reduce((a, b) => (b.cpl > a.cpl ? b : a)) : null;

  // Contas perto do teto de gasto (para os alertas e as barrinhas de uso).
  // Só contas ativas — uma pausada não está gastando, não pode disparar alerta.
  const pertoLimite = useMemo(() => contasPertoDoLimite(contasAtivas, limites), [contasAtivas, limites]);
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

  // Nº de clientes por gestor (só contas ativas — pausadas não contam no ranking).
  const clientesPorGestor = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contasAtivas) m.set(c.gestor, (m.get(c.gestor) ?? 0) + 1);
    return m;
  }, [contasAtivas]);

  // Aba ativa: rankings (gestores/nichos/criativos) ou a central de alertas.
  const [aba, setAba] = useState<"gestores" | "nichos" | "criativos" | "alertas">("gestores");
  // Abre a aba de alertas já filtrada pelo tipo do chip clicado.
  function abrirAlertas(tipo: TipoAlerta | "todos") {
    setCentralFiltro(tipo);
    setAba("alertas");
  }
  const nichos = useMemo(
    () => (modoMes && jm ? montarNichos(daily, contasAtivas, jm.D, jm.espec) : montarNichos(daily, contasAtivas, diasEfetivos)),
    [daily, contasAtivas, modoMes, jm, diasEfetivos]
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

  return (
    <div>
      {/* Topo: título da seção + frescor + seletor de período (logo/logout na sidebar) */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <span className="text-lg font-semibold text-white">Dashboard de Tráfego</span>
        <div className="flex flex-wrap items-center gap-3">
          <IndicadorFrescor ultimaSync={ultimaSync} />
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
        </div>
      </header>

      {fonte === "mock" && (
        <div className="mb-5 rounded-xl px-4 py-3 text-[13px]" style={{ background: "#2a2607", color: YELLOW }}>
          Exibindo dados de exemplo. Configure o Firebase e rode o sync do Meta para ver os números reais.
        </div>
      )}

      {/* Visão de Liderança */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>Visão de liderança</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px]" style={{ color: MUTED }}>{data.periodoLabel}</span>
          {modoMes && jm?.parcial && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "#2a2205", color: AMBAR }}
              title="Parte do intervalo é anterior ao início do histórico (02/04/2026); a comparação pode subestimar."
            >
              dados parciais
            </span>
          )}
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Gasto"
          valorNum={kpis.gasto.valor}
          formatar={moedaCard}
          title={brl(kpis.gasto.valor)}
          delta={kpis.gasto.delta}
          serie={kpis.gasto.serie}
        />
        <KpiCard
          label="Leads"
          sub="formulário"
          valorNum={kpis.leads.valor}
          formatar={numCard}
          title={`${num(kpis.leads.valor)} leads de formulário`}
          delta={kpis.leads.delta}
          serie={kpis.leads.serie}
        />
        <KpiCard
          label="CPL médio"
          valorNum={kpis.cpl.valor}
          formatar={brlDec}
          title={`${brlDec(kpis.cpl.valor)} · base: ${num(kpis.cpl.base)} resultados no período (leads + conversas)`}
          delta={kpis.cpl.delta}
          menorMelhor
          destaque
          serie={kpis.cpl.serie}
        />
        <KpiCard
          label="Conversas"
          sub="WhatsApp"
          valorNum={kpis.conversas.valor}
          formatar={numCard}
          title={`${num(kpis.conversas.valor)} conversas de WhatsApp`}
          delta={kpis.conversas.delta}
          serie={kpis.conversas.serie}
        />
      </div>

      {/* Precisa de atenção — reusa as MESMAS regras da central (cplAlto + pertoLimite). */}
      <p className="mb-3 text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>Precisa de atenção</p>
      <div className="mb-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {cplAlto.length === 0 && pertoLimite.length === 0 ? (
          <div className="flex items-center gap-2 p-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
            <span style={{ color: GREEN }}>✓</span>
            <span className="text-[13px]" style={{ color: MUTED }}>Tudo sob controle — nenhum alerta no período.</span>
          </div>
        ) : (
          <>
            {cplAlto.length > 0 && (
              <button
                onClick={() => abrirAlertas("cplAlto")}
                className="p-4 text-left transition-colors hover:bg-[#232323]"
                style={{ background: CARD, border: `1px solid ${RED}`, borderRadius: TEMA.raioCard }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: RED }} />
                  <span className="text-sm font-medium text-white">CPL estourado</span>
                </div>
                <p className="mt-1 text-sm" style={{ color: RED }}>
                  {cplAlto.length} {cplAlto.length === 1 ? "gestor" : "gestores"} com CPL acima de {brlDec(CPL_ALERTA)}
                </p>
                {piorCpl && (
                  <p className="mt-0.5 text-[12px] tabular-nums" style={{ color: MUTED }}>
                    Pior: {piorCpl.nome} · {brlDec(piorCpl.cpl)}
                  </p>
                )}
              </button>
            )}
            {pertoLimite.length > 0 && (
              <button
                onClick={() => abrirAlertas("limite")}
                className="p-4 text-left transition-colors hover:bg-[#232323]"
                style={{ background: CARD, border: `1px solid ${AMBAR}`, borderRadius: TEMA.raioCard }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: AMBAR }} />
                  <span className="text-sm font-medium text-white">Perto do limite de gasto</span>
                </div>
                <p className="mt-1 text-sm" style={{ color: AMBAR }}>
                  {pertoLimite.length} {pertoLimite.length === 1 ? "conta" : "contas"} perto do teto
                </p>
                <p className="mt-0.5 text-[12px] tabular-nums" style={{ color: MUTED }}>
                  Mais crítica: {pertoLimite[0].cliente} · {Math.round(pertoLimite[0].usoPct * 100)}% · estado atual (não depende do período)
                </p>
              </button>
            )}
          </>
        )}
      </div>

      {/* Gráfico-herói: tendência diária do período (fantasma do mês anterior no modo mês). */}
      <HeroChart pontos={serieDoGrafico} periodoLabel={data.periodoLabel} mesAnterior={modoMes} />

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
          <CriativosSection contas={contasAtivas} diasInicial={diasEfetivos} />
        </div>
      ) : aba === "gestores" ? (
        <div className="mb-10 rounded-xl p-5" style={{ background: CARD }}>
          <div className="flex flex-col gap-4">
            {ranking.map((g, i) => {
              const melhor = i === 0;
              const largura = Math.max(6, (g.cpl / maxCpl) * 100);
              // Cor da barra reusa CPL_ALERTA: vermelho acima do teto; amarelo só no
              // melhor saudável; neutro nos demais saudáveis.
              const acimaDoTeto = g.cpl >= CPL_ALERTA;
              const corBarra = acimaDoTeto ? RED : melhor ? YELLOW : "#3A3A3A";
              return (
                <div key={g.nome} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex w-28 shrink-0 items-center gap-2 sm:w-44">
                    <Iniciais nome={g.nome} />
                    <span className="truncate text-sm" style={{ color: "#fff" }}>{g.nome}</span>
                    {melhor && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                        style={{ background: YELLOW, color: INK }}
                      >
                        melhor
                      </span>
                    )}
                  </div>
                  <div className="order-last h-2.5 w-full overflow-hidden rounded-full sm:order-none sm:w-auto sm:flex-1" style={{ background: LINE }}>
                    <div className="h-full rounded-full" style={{ width: `${largura}%`, background: corBarra }} />
                  </div>
                  <div className="ml-auto flex shrink-0 flex-col items-end sm:ml-0 sm:w-52">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums" style={{ color: "#fff" }}>{brlDec(g.cpl)}</span>
                      {g.cplVar === 0 ? (
                        <span className="text-xs font-medium" style={{ color: MUTED }} title="sem histórico suficiente pra comparar">—</span>
                      ) : (
                        <Trend v={g.cplVar} menorMelhor />
                      )}
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
                  <th className="px-4 py-3 text-right font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>
                    <span className="inline-flex items-center gap-1">
                      Alcance
                      <span
                        title="Soma do alcance de cada dia. Como a mesma pessoa pode ser alcançada em dias diferentes, esse número tende a ser maior que o total de pessoas únicas do período."
                        style={{ cursor: "help", color: MUTED }}
                      >ⓘ</span>
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Impressões</th>
                  <th className="px-4 py-3 font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Limite</th>
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center" style={{ color: MUTED }}>
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  clientes.map((c) => (
                    <LinhaClienteRow key={c.accountId} c={c} limite={limitesPorConta.get(c.accountId)} tooltipSemDado={tooltipSemDado} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Contas pausadas — acordeão discreto de rodapé (fechado por padrão). */}
      <PausadasRodape pausadas={pausadas} />

      {/* Rodapé discreto — horário do último sync (fuso de Brasília) */}
      <footer
        className="mt-6 border-t pt-4 text-center text-[11px] tracking-wide"
        style={{ borderColor: LINE, color: MUTED }}
      >
        {rotuloSync(ultimaSync)}
      </footer>

      {/* Assistente de IA — só aparece se NEXT_PUBLIC_IA_ATIVA = "true" */}
      <IAChat periodoDias={diasEfetivos} />
    </div>
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

function LinhaClienteRow({ c, limite, tooltipSemDado }: { c: LinhaCliente; limite?: LimiteConta; tooltipSemDado: string }) {
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
      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: "#fff" }}>
        {c.reach != null ? num(c.reach) : <span style={{ color: MUTED, cursor: "help" }} title={tooltipSemDado}>—</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: "#fff" }}>
        {c.impressions != null ? num(c.impressions) : <span style={{ color: MUTED, cursor: "help" }} title={tooltipSemDado}>—</span>}
      </td>
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

