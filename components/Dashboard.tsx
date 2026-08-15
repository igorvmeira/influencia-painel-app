"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { ContaMap, EntradaOrientacao, LimiteConta, LinhaCliente, MetricaDiaria } from "@/lib/types";
import { useOrientacoes } from "@/lib/useOrientacoes";
import { montarNichos, montarPainel } from "@/lib/painel";
import { CPL_ALERTA, LIMITE_ATENCAO, LIMITE_CRITICO, contasPertoDoLimite } from "@/lib/alertas";
import { estiloDe } from "@/lib/semaforo";
import { brl, brlDec, num, pct } from "@/lib/format";
import { montarKpis, montarKpisMes, moedaCard, numCard, serieGrafico, serieGraficoMes } from "@/lib/kpis";
import {
  janelaMes, intervaloLabel, janelaPersonalizada, primeiroDiaDisponivel,
  ultimoDiaDisponivel, comparacaoExigeDesde, ymdParaBR, diasSobrepostos,
} from "@/lib/periodo";
import { MARCA, TEMA } from "@/lib/brand";
import NichosSection from "./NichosSection";
import CriativosSection from "./CriativosSection";
import HeroChart from "./HeroChart";
import Sparkline from "./Sparkline";
import KpiCard from "./KpiCard";
import DeltaChip from "./DeltaChip";
import BarraDado from "./BarraDado";
import { useEntrada } from "@/lib/useEntrada";
import NumeroAnimado from "./NumeroAnimado";
import IndicadorFrescor from "./IndicadorFrescor";
import IAChat from "./IAChat";

// Cores lidas dos design tokens (fonte única em lib/brand.ts).
const INK = TEMA.fundo;
const CARD = TEMA.card;
const YELLOW = TEMA.destaque;   // preenchimento (pill/barra) — NUNCA cor de texto
const OURO = TEMA.ouroTexto;    // "ouro" legível quando precisa ser TEXTO
const LINE = TEMA.borda;
const TEXTO = TEMA.texto;
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
// `motivo` explica o "—" no tooltip com o motivo CONCRETO (datas), quando houver.

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
        className="flex items-center gap-1.5 text-[12px] transition-colors"
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
      style={{ background: TEMA.chip, color: MUTED }}
    >
      {ini}
    </span>
  );
}

// Card de KPI: rótulo + subtítulo, número grande tabular (com count-up), delta
// semântico e sparkline. O número anima ao trocar de período (respeita reduced-motion).

const PERIODOS = ["7 dias", "15 dias", "30 dias", "60 dias", "Mês", "Personalizado"] as const;
type Periodo = (typeof PERIODOS)[number];
type PeriodoDia = Exclude<Periodo, "Mês" | "Personalizado">;
const DIAS_POR_PERIODO: Record<PeriodoDia, number> = { "7 dias": 7, "15 dias": 15, "30 dias": 30, "60 dias": 60 };
// Rótulo curto dos botões (o "Mês"/"Personalizado" mantêm o nome por extenso).
const ROTULO_CURTO: Record<Periodo, string> = {
  "7 dias": "7d", "15 dias": "15d", "30 dias": "30d", "60 dias": "60d",
  "Mês": "Mês", "Personalizado": "Personalizado",
};

// Até que ponto dois períodos de tamanhos diferentes ainda comparam de forma justa
// em GASTO e CONVERSÕES (que são somas — o período mais longo tem mais dias
// somando). Acima disto, o Δ dessas duas métricas perde a cor semântica e vira
// cinza: continua sendo exibido, mas para de parecer bom/ruim.
//
// Decisão da agência (05/08/2026): 31 vs 30 dias (~3%) é efeito de calendário e
// não merece perder a cor — o chip âmbar já avisa. Já 7 vs 31 dias (~77%) produz
// um Δ de gasto de −75% que é quase todo tamanho, não desempenho.
//
// O Δ de CPL NUNCA é neutralizado: é uma RAZÃO (gasto ÷ conversões), sobrevive à
// diferença de tamanho, e é o número que a agência usa para avaliar o mês.
//
// PISO MEDIDO — cuidado ao baixar: 10% foi escolhido para que QUALQUER par de
// meses do calendário mantenha a cor, e a folga é pequena.
//     31 vs 30 = 3,23%   31 vs 29 = 6,45%   30 vs 28 = 6,67%
//     31 vs 28 = 9,68%  <- pior caso (janeiro vs fevereiro), a 0,32 ponto do teto
// Abaixo de ~9,7 a comparação mês contra mês passa a perder a cor em fevereiro,
// que é justamente o caso que a agência quis preservar.
const TOLERANCIA_TAMANHO_PCT = 10;

/**
 * Diferença proporcional entre dois períodos, em % do MAIOR — assim o resultado
 * fica entre 0 e 100% e não explode quando o menor é muito pequeno
 * (7 vs 31 dias dá 77%, não 343%).
 */
function difTamanhoPct(a: number, b: number): number {
  const maior = Math.max(a, b);
  return maior > 0 ? (Math.abs(a - b) / maior) * 100 : 0;
}

// Dia de hoje (YYYY-MM-DD) no fuso do cliente — para saber se o último dia com
// dado ainda está "em andamento" (o sync roda de manhã, então ele é parcial).
function hojeNoFuso(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARCA.fuso, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return p; // en-CA já formata como YYYY-MM-DD
}

// "HH:MM" do último sync no fuso do cliente.
function horaSync(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: MARCA.fuso, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

type ColCliente = "cliente" | "tipo" | "gasto" | "conversas" | "cplSemanal";

// O que o número de conversões conta — e por que pode divergir da Business Manager.
// Limitação conhecida e documentada (ver lib/meta.ts): a BM exibe como "Resultado" o
// evento que CADA campanha otimiza; o painel agrega no nível da conta.
const TOOLTIP_CONVERSOES =
  "Leads de formulário + conversas de WhatsApp iniciadas. Contas com campanhas "
  + "otimizadas para outros eventos (ex.: cadastro no site) podem divergir do "
  + "'Resultados' da BM, que mostra o evento otimizado por campanha.";

// NOTA (29/07/2026): existia aqui um TOOLTIP_ALCANCE, para a coluna "Alcance somado".
// A coluna foi retirada a pedido do Roberto, junto com Impressões, então o tooltip
// saiu com ela. Se o alcance voltar, o ponto a explicar é: o painel SOMA o alcance
// diário e alcance NÃO é somável — a Meta só sabe o único de um intervalo consultado
// explicitamente, e não dá para derivá-lo dos diários (a sobreposição não está no
// dado). Medido na HELLO NET (20–26/07): 13.318 somado vs 7.870 únicos, ~69% acima.

// Ícone de ajuda reaproveitável (mesmo padrão do ⓘ do Alcance).
function Info({ texto }: { texto: string }) {
  return (
    <span title={texto} style={{ cursor: "help", color: MUTED }} className="text-[11px]">ⓘ</span>
  );
}

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

  // Orientações (indicador discreto na linha da conta). Degrada gracioso se falhar.
  const { mapa: orientacoes } = useOrientacoes();

  // ---- Limites do histórico disponível (janela móvel do agregado, ~95 dias) ----
  // Só contas ATIVAS: o mínimo global pegaria dias órfãos de conta pausada
  // (ver comentário em lib/periodo.ts).
  const primeiroDia = useMemo(() => primeiroDiaDisponivel(daily, contasAtivas), [daily, contasAtivas]);
  const ultimoDia = useMemo(() => ultimoDiaDisponivel(daily, contasAtivas), [daily, contasAtivas]);

  // Período personalizado: por padrão, a última semana FECHADA (termina no dia
  // anterior à âncora, que costuma estar parcial) — o caso de uso que motivou isto.
  const [custIni, setCustIni] = useState("");
  const [custFim, setCustFim] = useState("");
  useEffect(() => {
    if (!ultimoDia || custIni || custFim) return;
    const fimMs = Date.parse(ultimoDia + "T00:00:00Z") - 86400000; // último dia fechado
    const iniMs = fimMs - 6 * 86400000;
    const piso = primeiroDia ? Date.parse(primeiroDia + "T00:00:00Z") : iniMs;
    const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    setCustFim(ymd(Math.max(fimMs, piso)));
    setCustIni(ymd(Math.max(iniMs, piso)));
  }, [ultimoDia, primeiroDia, custIni, custFim]);

  // ---- Período de comparação ESCOLHIDO (pedido do Roberto, 05/08/2026) ----
  // Desligado por padrão: quem só quer a janela atual não vê complexidade a mais,
  // e o comportamento é o de sempre (mesmo nº de dias imediatamente antes).
  const [compAtivo, setCompAtivo] = useState(false);
  const [compIni, setCompIni] = useState("");
  const [compFim, setCompFim] = useState("");

  // Ao LIGAR, os campos vêm preenchidos com a janela automática que já estava
  // valendo — abrir o painel não pode mexer em nenhum número; só editar deve.
  // Ao desligar, os valores ficam guardados: religar não perde o que foi digitado.
  useEffect(() => {
    if (!compAtivo || compIni || compFim || !custIni || !custFim) return;
    const iniMs = Date.parse(custIni + "T00:00:00Z");
    const fimMs = Date.parse(custFim + "T00:00:00Z");
    if (Number.isNaN(iniMs) || Number.isNaN(fimMs)) return;
    const n = Math.round((fimMs - iniMs) / 86400000) + 1;
    const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    setCompIni(ymd(iniMs - n * 86400000));
    setCompFim(ymd(iniMs - 86400000));
  }, [compAtivo, compIni, compFim, custIni, custFim]);

  // Só vale quando ligado E com os dois campos preenchidos — meio preenchido cai
  // no automático em vez de produzir janela torta.
  const compValido = compAtivo && !!compIni && !!compFim;

  // Modo mês (mês corrente 1..D vs mês anterior 1..D). No modo dia, jm é null.
  const modoMes = periodo === "Mês";
  const modoCustom = periodo === "Personalizado";
  const jmMes = useMemo(() => (modoMes ? janelaMes(daily, contasAtivas) : null), [modoMes, daily, contasAtivas]);
  const jmCustom = useMemo(
    () => (modoCustom
      ? janelaPersonalizada(
          daily, contasAtivas, custIni, custFim,
          compValido ? compIni : undefined,
          compValido ? compFim : undefined
        )
      : null),
    [modoCustom, daily, contasAtivas, custIni, custFim, compValido, compIni, compFim]
  );
  // Janela explícita ativa (mês OU personalizado). No modo dia, é null.
  const jm = modoCustom ? jmCustom : jmMes;
  // Nº de dias efetivos: D na janela explícita; senão o do botão 7/15/30/60.
  const diasEfetivos = jm ? jm.D : DIAS_POR_PERIODO[periodo as PeriodoDia] ?? 30;

  // Intervalo de datas de cada botão de dia, ancorado no último dia COM DADO.
  // Deixa a janela explícita na tela — evita confusão ao conferir com a BM.
  const intervalos = useMemo(() => ({
    "7 dias": intervaloLabel(daily, contasAtivas, 7),
    "15 dias": intervaloLabel(daily, contasAtivas, 15),
    "30 dias": intervaloLabel(daily, contasAtivas, 30),
    "60 dias": intervaloLabel(daily, contasAtivas, 60),
  }) as Record<PeriodoDia, string | null>, [daily, contasAtivas]);

  const data = useMemo(
    () => (jm ? montarPainel(daily, contasAtivas, jm.D, jm.espec) : montarPainel(daily, contasAtivas, diasEfetivos)),
    [daily, contasAtivas, jm, diasEfetivos]
  );

  // KPIs do topo (formatação/deltas/sparklines) — respeita o período selecionado.
  const kpis = useMemo(
    () => (jm ? montarKpisMes(daily, contasAtivas, jm) : montarKpis(daily, contasAtivas, diasEfetivos)),
    [daily, contasAtivas, jm, diasEfetivos]
  );

  // Série diária para o gráfico-herói (mesma janela dos KPIs; fantasma quando há
  // janela explícita — no personalizado, o fantasma é o período anterior equivalente).
  const serieDoGrafico = useMemo(
    () => (jm ? serieGraficoMes(daily, contasAtivas, jm) : serieGrafico(daily, contasAtivas, diasEfetivos)),
    [daily, contasAtivas, jm, diasEfetivos]
  );

  // ---- Comparação indisponível: o período anterior não cabe no histórico ----
  // Regra da casa: melhor "—" do que número subestimado por falta de dado.
  // Acontece no 60d (exigiria 120 dias; a janela tem ~95) e em personalizados longos.
  const motivoSemComparacao = useMemo(() => {
    if (!primeiroDia) return null;
    const desdeBR = (ymd: string) => ymdParaBR(ymd);
    if (modoCustom) {
      if (!jmCustom?.parcial) return null;
      // Com período de comparação ESCOLHIDO, a data exigida é o próprio início dele
      // — não precisa recalcular. No automático, segue sendo início − D dias.
      const exigidoYmd = compValido
        ? compIni
        : new Date(Date.parse(custIni + "T00:00:00Z") - jmCustom.D * 86400000).toISOString().slice(0, 10);
      return `comparação indisponível: exigiria dados desde ${desdeBR(exigidoYmd)}, o histórico do painel começa em ${desdeBR(primeiroDia)}`;
    }
    if (modoMes) return null; // o modo mês já tem o selo "dados parciais" próprio
    const exigido = comparacaoExigeDesde(daily, contasAtivas, diasEfetivos);
    if (!exigido) return null;
    return `comparação indisponível: exigiria dados desde ${desdeBR(exigido)}, o histórico do painel começa em ${desdeBR(primeiroDia)}`;
  }, [primeiroDia, modoCustom, modoMes, jmCustom, custIni, compValido, compIni, daily, contasAtivas, diasEfetivos]);

  // ---- Tamanhos diferentes: o Δ de gasto/conversões carrega o dia a mais ----
  // CPL é RAZÃO e continua justo; gasto e conversões são SOMAS. Avisamos em vez de
  // normalizar por dia — normalizar mudaria em silêncio o significado do número.
  const avisoTamanhos = useMemo(() => {
    if (!modoCustom || !compValido || !jmCustom) return null;
    if (jmCustom.D === jmCustom.Dprev) return null;
    return `períodos de tamanhos diferentes (${jmCustom.D} vs ${jmCustom.Dprev} dias)`;
  }, [modoCustom, compValido, jmCustom]);

  // Diferença GRANDE o bastante para o Δ de gasto/conversões perder a cor.
  // Preenchido = neutraliza (o texto vira o tooltip do chip); null = mantém a cor.
  // O CPL não passa por aqui de propósito — razão sobrevive a tamanhos diferentes.
  const neutralizarSomas = useMemo(() => {
    if (!modoCustom || !compValido || !jmCustom) return null;
    if (difTamanhoPct(jmCustom.D, jmCustom.Dprev) <= TOLERANCIA_TAMANHO_PCT) return null;
    return `variação afetada por períodos de tamanhos muito diferentes (${jmCustom.D} vs ${jmCustom.Dprev} dias)`;
  }, [modoCustom, compValido, jmCustom]);

  // ---- Linha-fantasma do gráfico (período de comparação) ----
  // Modo Mês: exatamente como antes. Personalizado com comparação ESCOLHIDA: a
  // fantasma passa a aparecer, com o rótulo do período real. Personalizado
  // automático e modo dia seguem SEM fantasma, como sempre foram.
  const fantasmaGrafico = useMemo(() => {
    if (modoMes) return { rotulo: "Leads · mês anterior" };
    if (modoCustom && compValido && jmCustom) {
      return {
        rotulo: `Leads · ${jmCustom.labelAnterior}`,
        // Só quando os tamanhos diferem: é o único caso em que a linha acaba antes.
        nota: jmCustom.D !== jmCustom.Dprev
          ? `o período de comparação tem ${jmCustom.Dprev} dias`
          : undefined,
      };
    }
    return null;
  }, [modoMes, modoCustom, compValido, jmCustom]);

  // ---- Sobreposição: permitida, nunca bloqueada — mas precisa estar na tela ----
  // Só existe no modo explícito; no automático o anterior termina antes do início.
  const diasEmComum = useMemo(
    () => (modoCustom && compValido && custIni && custFim
      ? diasSobrepostos(custIni, custFim, compIni, compFim)
      : 0),
    [modoCustom, compValido, custIni, custFim, compIni, compFim]
  );

  // ---- Aviso de dia parcial: a janela inclui o último dia sincronizado? ----
  // O sync roda de manhã, então o dia corrente entra incompleto.
  const avisoParcial = useMemo(() => {
    if (!ultimoDia) return null;
    const ultimoEhHoje = ultimoDia === hojeNoFuso();
    if (!ultimoEhHoje) return null;             // último dia já fechou: nada a avisar
    // Vale para os DOIS períodos: o de comparação também pode alcançar a âncora
    // quando é escolhido à mão (no automático ele termina antes, por definição).
    const incluiUltimo = modoCustom
      ? custFim >= ultimoDia || (compValido && compFim >= ultimoDia)
      : true;                                       // dia/mês sempre terminam na âncora
    if (!incluiUltimo) return null;
    const hora = horaSync(ultimaSync);
    return hora ? `inclui dia parcial — última sincronização às ${hora}` : "inclui dia parcial (ainda em andamento)";
  }, [ultimoDia, modoCustom, custFim, compValido, compFim, ultimaSync]);

  // NOTA (29/07/2026): existia aqui um `tooltipSemDado`, que calculava a data em que a
  // coleta de reach/impressions começou para explicar o "—" dessas duas colunas.
  // Ficou órfão quando Alcance e Impressões saíram da exibição — era o único uso.

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
  /**
   * ⚠️ DOIS COMPORTAMENTOS DIFERENTES, e os dois são os desejados:
   *
   *   TROCA DE ABA → o bloco é renderizado condicionalmente, então o hook
   *   DESMONTA e remonta. `entrou` volta a false e a cascata roda de novo, que é
   *   o certo: aba nova é conteúdo novo entrando.
   *
   *   TROCA DE PERÍODO → o bloco continua montado e só os valores mudam. As
   *   barras TRANSICIONAM da largura antiga para a nova em vez de recomeçar do
   *   zero — mostrar o crescimento de novo esconderia justamente a comparação
   *   que o usuário pediu ao trocar o período.
   */
  const { ref: refRanking, entrou: entrouRanking } = useEntrada<HTMLDivElement>();
  // Abre a aba de alertas já filtrada pelo tipo do chip clicado.
  function abrirAlertas(tipo: TipoAlerta | "todos") {
    setCentralFiltro(tipo);
    setAba("alertas");
  }
  const nichos = useMemo(
    () => (jm ? montarNichos(daily, contasAtivas, jm.D, jm.espec) : montarNichos(daily, contasAtivas, diasEfetivos)),
    [daily, contasAtivas, jm, diasEfetivos]
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
        <span className="text-lg font-semibold" style={{ color: TEXTO }}>Dashboard de Tráfego</span>
        <div className="flex flex-wrap items-center gap-3">
          <IndicadorFrescor ultimaSync={ultimaSync} />
          <div className="flex items-center gap-1 rounded-full p-1" style={{ background: CARD, border: `1px solid ${LINE}` }}>
            {PERIODOS.map((p) => {
              const ativo = p === periodo;
              // Intervalo real da janela (ancorado no último dia COM DADO), ex.: "21–27/07".
              // O modo Mês já tem rótulo próprio (data.periodoLabel) — não duplica aqui.
              const faixa = p === "Personalizado"
                ? jmCustom?.labelAtual ?? null
                : p !== "Mês" ? intervalos[p as PeriodoDia] : null;
              return (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
                  style={ativo
                    ? { background: YELLOW, color: TEMA.textoSobreDestaque }
                    : { background: "transparent", color: MUTED }}
                  title={faixa ? `Janela: ${faixa}` : undefined}
                >
                  {ROTULO_CURTO[p]}
                  {ativo && faixa && (
                    <span className="ml-1.5 font-normal tabular-nums opacity-70">· {faixa}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Campos de data do período personalizado (travados na janela disponível) */}
      {modoCustom && (
        <div
          className="mb-5 px-4 py-3"
          style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12px]" style={{ color: MUTED }}>
              Início
              <input
                type="date"
                value={custIni}
                min={primeiroDia ?? undefined}
                max={custFim || ultimoDia || undefined}
                onChange={(e) => setCustIni(e.target.value)}
                className="mt-1 block rounded-lg px-3 py-2 text-sm outline-none tabular-nums"
                style={{ background: INK, color: TEXTO, border: `1px solid ${LINE}` }}
              />
            </label>
            <label className="text-[12px]" style={{ color: MUTED }}>
              Fim
              <input
                type="date"
                value={custFim}
                min={custIni || primeiroDia || undefined}
                max={ultimoDia ?? undefined}
                onChange={(e) => setCustFim(e.target.value)}
                className="mt-1 block rounded-lg px-3 py-2 text-sm outline-none tabular-nums"
                style={{ background: INK, color: TEXTO, border: `1px solid ${LINE}` }}
              />
            </label>
            <p className="pb-2 text-[11px]" style={{ color: MUTED }}>
              {primeiroDia && `Dados disponíveis a partir de ${ymdParaBR(primeiroDia)}`}
              {ultimoDia && ` até ${ymdParaBR(ultimoDia)}.`}
              {!compAtivo && (
                <>
                  <br />
                  Comparação: mesmo nº de dias imediatamente antes do início.
                </>
              )}
            </p>
          </div>

          {/* Segundo período: fechado por padrão. Quem só quer a janela atual não
              vê os campos; quem precisa comparar julho com junho abre e escolhe. */}
          <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-[12px]" style={{ color: TEXTO }}>
            <input
              type="checkbox"
              checked={compAtivo}
              onChange={(e) => setCompAtivo(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer"
              style={{ accentColor: YELLOW }}
            />
            Comparar com outro período
          </label>

          {compAtivo && (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3" style={{ borderColor: LINE }}>
              <label className="text-[12px]" style={{ color: MUTED }}>
                Comparar com — Início
                <input
                  type="date"
                  value={compIni}
                  min={primeiroDia ?? undefined}
                  max={compFim || ultimoDia || undefined}
                  onChange={(e) => setCompIni(e.target.value)}
                  className="mt-1 block rounded-lg px-3 py-2 text-sm outline-none tabular-nums"
                  style={{ background: INK, color: TEXTO, border: `1px solid ${LINE}` }}
                />
              </label>
              <label className="text-[12px]" style={{ color: MUTED }}>
                Fim
                <input
                  type="date"
                  value={compFim}
                  min={compIni || primeiroDia || undefined}
                  max={ultimoDia ?? undefined}
                  onChange={(e) => setCompFim(e.target.value)}
                  className="mt-1 block rounded-lg px-3 py-2 text-sm outline-none tabular-nums"
                  style={{ background: INK, color: TEXTO, border: `1px solid ${LINE}` }}
                />
              </label>
              <p className="pb-2 text-[11px]" style={{ color: MUTED }}>
                O Δ compara o período de cima com este.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Avisos honestos da janela ativa (dia parcial / comparação impossível /
          tamanhos diferentes / sobreposição). Todos são AVISO, nunca bloqueio. */}
      {(avisoParcial || motivoSemComparacao || avisoTamanhos || diasEmComum > 0) && (
        <div className="mb-5 flex flex-wrap gap-2">
          {avisoTamanhos && (
            <span
              className="rounded-lg px-3 py-1.5 text-[12px]"
              style={{ background: TEMA.limiteFundo, color: AMBAR }}
              title="O CPL é uma razão (gasto ÷ conversões) e continua justo entre períodos de tamanhos diferentes. Já gasto e conversões são somas: o período mais longo tem um dia a mais somando. O painel não normaliza por dia — isso mudaria o significado do número."
            >
              ⚠ {avisoTamanhos} — o Δ de CPL segue justo; os de gasto e conversões carregam o dia a mais
            </span>
          )}
          {diasEmComum > 0 && (
            <span
              className="rounded-lg px-3 py-1.5 text-[12px]"
              style={{ background: TEMA.limiteFundo, color: AMBAR }}
              title="Os dois períodos escolhidos têm dias em comum. Esses dias entram no lado atual E no lado de comparação do Δ, o que aproxima artificialmente os dois números. Não é bloqueado — só precisa ser lido com isso em mente."
            >
              ⚠ os dois períodos se sobrepõem em {diasEmComum} {diasEmComum === 1 ? "dia" : "dias"} — os mesmos dias contam dos dois lados do Δ
            </span>
          )}
          {avisoParcial && (
            <span
              className="rounded-lg px-3 py-1.5 text-[12px]"
              style={{ background: TEMA.limiteFundo, color: AMBAR }}
              title="O sync roda de manhã; o dia corrente entra incompleto. Para conferir com a Business Manager, use um período que termine no dia anterior."
            >
              ⚠ {avisoParcial}
            </span>
          )}
          {motivoSemComparacao && (
            <span
              className="rounded-lg px-3 py-1.5 text-[12px]"
              style={{ background: TEMA.avisoFundo, color: OURO }}
              title={motivoSemComparacao}
            >
              Δ sem base de comparação neste período
            </span>
          )}
        </div>
      )}

      {fonte === "mock" && (
        <div className="mb-5 rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.avisoFundo, color: OURO }}>
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
              style={{ background: TEMA.limiteFundo, color: AMBAR }}
              title="Parte do intervalo é anterior ao início do histórico (02/04/2026); a comparação pode subestimar."
            >
              dados parciais
            </span>
          )}
        </div>
      </div>
      {/* Gasto, Leads e Conversas são SOMAS: recebem `neutralizar`. O CPL médio é
          RAZÃO e fica de fora — ele mantém a cor mesmo com tamanhos diferentes. */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* ⚠️ `neutralizar` NÃO vai no CPL, e a ausência é deliberada: o CPL é uma
            RAZÃO (gasto ÷ conversões) e sobrevive a períodos de tamanhos
            diferentes. Gasto, leads e conversas são SOMAS — o período mais longo
            tem mais dias somando, e aí o Δ perde a cor. Ver TOLERANCIA_TAMANHO_PCT. */}
        <KpiCard
          rotulo="Gasto"
          valor={kpis.gasto.valor}
          formatar={moedaCard}
          titulo={brl(kpis.gasto.valor)}
          delta={kpis.gasto.delta}
          serie={kpis.gasto.serie}
          motivo={motivoSemComparacao}
          contexto={data.periodoLabel}
          neutralizar={neutralizarSomas}
          rodape="vs período anterior"
          grande
        />
        <KpiCard
          rotulo="Leads"
          sub="formulário"
          valor={kpis.leads.valor}
          formatar={numCard}
          titulo={`${num(kpis.leads.valor)} leads de formulário`}
          delta={kpis.leads.delta}
          serie={kpis.leads.serie}
          motivo={motivoSemComparacao}
          contexto={data.periodoLabel}
          neutralizar={neutralizarSomas}
          rodape="vs período anterior"
          grande
        />
        <KpiCard
          rotulo="CPL médio"
          valor={kpis.cpl.valor}
          formatar={brlDec}
          titulo={`${brlDec(kpis.cpl.valor)} · base: ${num(kpis.cpl.base)} resultados no período (leads + conversas)`}
          delta={kpis.cpl.delta}
          menorMelhor
          destaque
          serie={kpis.cpl.serie}
          motivo={motivoSemComparacao}
          contexto={data.periodoLabel}
          rodape="vs período anterior"
          grande
        />
        <KpiCard
          rotulo="Conversas"
          sub="WhatsApp"
          valor={kpis.conversas.valor}
          formatar={numCard}
          titulo={`${num(kpis.conversas.valor)} conversas de WhatsApp`}
          delta={kpis.conversas.delta}
          serie={kpis.conversas.serie}
          motivo={motivoSemComparacao}
          contexto={data.periodoLabel}
          neutralizar={neutralizarSomas}
          info={TOOLTIP_CONVERSOES}
          rodape="vs período anterior"
          grande
        />
      </div>

      {/* Precisa de atenção — reusa as MESMAS regras da central (cplAlto + pertoLimite).
          Os cards de alerta levam fundo levemente tingido (erroFundo/limiteFundo) além
          da borda semântica. Sem hover de fundo: sobre tint, o hover claro "lavava" a
          cor — o retorno vem por opacidade. */}
      <p className="mb-3 text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>Precisa de atenção</p>
      <div className="mb-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {cplAlto.length === 0 && pertoLimite.length === 0 ? (
          <div className="flex items-center gap-2 p-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}>
            <span style={{ color: GREEN }}>✓</span>
            <span className="text-[13px]" style={{ color: MUTED }}>Tudo sob controle — nenhum alerta no período.</span>
          </div>
        ) : (
          <>
            {cplAlto.length > 0 && (
              <button
                onClick={() => abrirAlertas("cplAlto")}
                className="p-4 text-left transition hover:brightness-125"
                style={{ background: TEMA.erroFundo, border: `1px solid ${RED}`, borderRadius: TEMA.raioCard }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: RED }} />
                  <span className="text-sm font-medium text-brand-ink">CPL estourado</span>
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
                className="p-4 text-left transition hover:brightness-125"
                style={{ background: TEMA.limiteFundo, border: `1px solid ${AMBAR}`, borderRadius: TEMA.raioCard }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: AMBAR }} />
                  <span className="text-sm font-medium text-brand-ink">Perto do limite de gasto</span>
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
      <HeroChart pontos={serieDoGrafico} periodoLabel={data.periodoLabel} fantasma={fantasmaGrafico} />

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
              // ⚠️ MESMA armadilha da pill do Shell, em outro lugar: sobre o dourado
              // vai `textoSobreDestaque`, nunca `texto`. Ver lib/brand.ts.
              style={aba === a ? { background: YELLOW, color: TEMA.textoSobreDestaque } : { background: CARD, color: MUTED }}
            >
              {rotulo}
              {a === "alertas" && alertas.length > 0 && (
                <span
                  className="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
                  // O preto a 0,18 escurece o PRÓPRIO dourado da pill (não a página),
                  // então continua valendo no escuro — o que muda é a cor do texto.
                  style={aba === a ? { background: "rgba(0,0,0,0.18)", color: TEMA.textoSobreDestaque } : { background: TEMA.chip, color: MUTED }}
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
          <div ref={refRanking} className="flex flex-col gap-4">
            {ranking.map((g, i) => {
              const melhor = i === 0;
              const largura = Math.max(6, (g.cpl / maxCpl) * 100);
              // Cor da barra reusa CPL_ALERTA: vermelho acima do teto; amarelo só no
              // melhor saudável; neutro nos demais saudáveis.
              // ⚠️ O neutro era `barraNeutra`, que é TRILHO — 1,47:1 sobre o card. Aqui
              // a barra é o DADO (o comprimento codifica o CPL), então cai no piso de
              // 3:1 da WCAG 1.4.11 e a maioria das barras sumiria. `sparkline` é o
              // token de dado neutro (3,19:1). Token legítimo no contexto errado é o
              // defeito que nenhum grep acha — ver CLAUDE.md.
              const acimaDoTeto = g.cpl >= CPL_ALERTA;
              const corBarra = acimaDoTeto ? RED : melhor ? YELLOW : TEMA.dadoNeutro;
              return (
                <div key={g.nome} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex w-36 shrink-0 items-center gap-2 sm:w-52">
                    {/* POSIÇÃO no ranking — não é o mesmo número das listas.
                        Aqui a ordem significa alguma coisa (menor CPL primeiro), então
                        o número vem com peso, igual ao ranking de Criativos, que já
                        fazia isso. Nas listas de conferência (/carteira, tabela de
                        clientes) ele é só contador e vai discreto.
                        O 1º NÃO vai em dourado: o selo "melhor" ao lado já é o dourado
                        da linha, e a casa não usa a cor de destaque como texto. */}
                    <span
                      className="w-5 shrink-0 text-sm font-medium tabular-nums"
                      style={{ color: melhor ? TEMA.texto : MUTED }}
                    >
                      {i + 1}
                    </span>
                    <Iniciais nome={g.nome} />
                    <span className="truncate text-sm" style={{ color: TEMA.texto }}>{g.nome}</span>
                    {melhor && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                        style={{ background: YELLOW, color: TEMA.textoSobreDestaque }}
                      >
                        melhor
                      </span>
                    )}
                  </div>
                  {/* ⚠️ O trilho era `borda`, que é token de SUPERFÍCIE. `barraNeutra`
                      é o token de sulco, e passa a ser usado aqui pelo `BarraDado` —
                      mesmo vocabulário do resto do app. */}
                  <BarraDado
                    className="order-last h-2.5 w-full overflow-hidden rounded-full sm:order-none sm:w-auto sm:flex-1"
                    pct={largura}
                    cor={corBarra}
                    degrade={melhor && !acimaDoTeto}
                    entrou={entrouRanking}
                    indice={i}
                    titulo={`${g.nome}: ${brlDec(g.cpl)}`}
                  />
                  <div className="ml-auto flex shrink-0 flex-col items-end sm:ml-0 sm:w-52">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums" style={{ color: TEMA.texto }}>{brlDec(g.cpl)}</span>
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
                ? { background: YELLOW, color: TEMA.textoSobreDestaque }
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
                      contentStyle={{ background: INK, border: `1px solid ${LINE}`, borderRadius: 8, color: TEMA.texto }}
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
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-brand-placeholder sm:w-72"
              style={{ background: CARD, color: TEMA.texto, border: `1px solid ${LINE}` }}
            />
          </div>

          <div className="overflow-x-auto rounded-xl" style={{ background: CARD }}>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr style={{ color: MUTED }} className="text-left">
                  {/* Numeração (Roberto, 05/08/2026): posição NA LISTA COMO ESTÁ NA TELA
                      — depois da busca e da ordenação. Serve para contar e localizar a
                      linha, não para identificar a conta; reordenar renumera. Não é
                      clicável de propósito: ordenar por "posição" não significa nada.
                      Mesma regra em /carteira e /gestores. */}
                  <th className="w-10 px-4 py-3 text-right font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>#</th>
                  <Th onClick={() => ordenar("cliente")}>Cliente{seta("cliente")}</Th>
                  <Th onClick={() => ordenar("tipo")}>Tipo{seta("tipo")}</Th>
                  <Th right onClick={() => ordenar("gasto")}>Gasto{seta("gasto")}</Th>
                  <Th right onClick={() => ordenar("conversas")}>
                    Conv. <Info texto={TOOLTIP_CONVERSOES} />{seta("conversas")}
                  </Th>
                  <Th right onClick={() => ordenar("cplSemanal")}>CPL{seta("cplSemanal")}</Th>
                  {/* Alcance e Impressões foram RETIRADOS da exibição a pedido do Roberto
                      (29/07/2026). O sync continua coletando e o cálculo continua em
                      painel.ts — reexibir é só devolver <th> aqui e <td> em
                      LinhaClienteRow. Ver comentário em lib/types.ts (LinhaCliente). */}
                  <th className="px-4 py-3 font-medium" style={{ borderBottom: `1px solid ${LINE}` }}>Limite</th>
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center" style={{ color: MUTED }}>
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  clientes.map((c, i) => (
                    <LinhaClienteRow key={c.accountId} c={c} ordem={i + 1} limite={limitesPorConta.get(c.accountId)} orientacao={orientacoes?.[c.accountId] ?? null} par={i % 2 === 1} />
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
      style={ativo ? { background: YELLOW, color: TEMA.textoSobreDestaque } : { background: TEMA.chip, color: MUTED }}
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
          <span className="truncate text-sm font-medium text-brand-ink">{a.nome}</span>
          <span
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase"
            style={{ background: TEMA.chip, color: TIPO_COR[a.tipo] }}
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
            <span className="text-sm font-medium tabular-nums text-brand-ink">{brlDec(a.cpl ?? 0)}</span>
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
      className={`cursor-pointer select-none px-4 py-3 font-medium hover:text-brand-ink ${right ? "text-right" : ""}`}
      style={{ borderBottom: `1px solid ${LINE}` }}
    >
      {children}
    </th>
  );
}

function LinhaClienteRow({ c, ordem, limite, orientacao, par }: {
  c: LinhaCliente; ordem: number; limite?: LimiteConta; orientacao: EntradaOrientacao | null; par?: boolean;
}) {
  return (
    // Zebra sutil (linhas alternadas) melhora a leitura horizontal em tabela densa;
    // hover:bg-brand-hover = TEMA.hover (classe Tailwind, ver tailwind.config).
    <tr className="transition-colors hover:bg-brand-hover" style={par ? { background: TEMA.zebra } : undefined}>
      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: MUTED }}>{ordem}</td>
      <td className="px-4 py-3" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>
        <span className="inline-flex items-center gap-1.5">
          {c.cliente}
          {orientacao && (
            // O `color` que havia aqui era estilo MORTO: o conteúdo é um emoji, que
            // renderiza com as próprias cores e ignora `color`. Sobreviveu a alguma
            // refatoração pintando nada.
            <Link href="/orientacoes" title={orientacao.texto} className="text-[12px] leading-none transition hover:brightness-125" aria-label="Ver orientação">
              💬
            </Link>
          )}
          {/* ⚠️ SEMÁFORO ≠ ALERTA DE CPL, e a tela precisa deixar isso claro.
              O alerta (coluna CPL / central de alertas) é CÁLCULO e muda sozinho a
              cada sync; este selo é JULGAMENTO do Roberto e só muda quando alguém
              escreve orientação. Podem discordar — CPL bom com semáforo vermelho é
              caso legítimo, não erro. Por isso o selo mora ao lado do NOME, longe
              da coluna de CPL, e o tooltip diz de quem é a opinião.
              Só aparece quando FOI classificado: um "—" cinza em toda linha viraria
              ruído numa tabela densa (na /orientacoes ele aparece sempre, porque lá
              a pergunta é justamente "o que falta classificar?"). */}
          {orientacao?.semaforo && (
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
              style={{ background: estiloDe(orientacao.semaforo).fundo, color: estiloDe(orientacao.semaforo).cor, cursor: "help" }}
              title={`Desempenho segundo a orientação: ${estiloDe(orientacao.semaforo).rotulo}. É julgamento de quem escreveu — não é o alerta automático de CPL, e pode discordar dele.`}
            >
              {estiloDe(orientacao.semaforo).rotulo}
            </span>
          )}
        </span>
      </td>
      <td className="px-4 py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
        <span
          className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
          style={c.tipo === "B2B"
            ? { background: TEMA.chip, color: TEMA.muted }
            : { background: TEMA.avisoFundo, color: TEMA.ouroTexto }}
        >
          {c.tipo}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>{brl(c.gasto)}</td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>{num(c.conversas)}</td>
      <td className="px-4 py-3 text-right tabular-nums" style={{ borderBottom: `1px solid ${LINE}`, color: TEMA.texto }}>{brlDec(c.cplSemanal)}</td>
      {/* Alcance/Impressões retirados da exibição (ver <thead>). c.reach e
          c.impressions continuam chegando preenchidos em LinhaCliente. */}
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
      {/* ⚠️ SEM `BarraDado` de propósito, apesar de ser barra de dado. Ela vive numa
          LINHA DE TABELA, e animar dezenas delas na entrada seria o mesmo ruído que
          nos fez tirar o count-up dos números em lista. O trilho vai em
          `barraNeutra` (o token de sulco), que era o que estava errado aqui. */}
      <div className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: TEMA.barraNeutra }}>
        <div className="h-full rounded-full" style={{ width: `${larg}%`, background: cor }} />
      </div>
      <span className="text-[12px] tabular-nums" style={{ color: cor }}>{Math.round(usoPct * 100)}%</span>
    </div>
  );
}

