"use client";

import { useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { brl, brlDec, num } from "@/lib/format";
import { PontoGrafico } from "@/lib/kpis";
import { TEMA } from "@/lib/brand";

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const TEXTO = TEMA.texto;
const RED = TEMA.negativo;
// TEMA ESCURO. A atribuição de papéis abaixo continua valendo — e é a que a
// referência aprovada pede: barra principal DOURADA. Medidos sobre o card:
// dourado 9,44:1, linha de leads (off-white) 15,12:1, CPL (vermelho) 6,07:1.
// Os três passam o piso de 3:1 da WCAG 1.4.11 para dado não-textual.
const BARRA = TEMA.destaque;
const LINHA_LEADS = TEMA.texto;

// Ticks do eixo esquerdo em R$ compacto (ex.: "R$ 12 mil").
const fmtEixoRS = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 0 });
const eixoRS = (v: number) => `R$ ${fmtEixoRS.format(v)}`;
const eixoNum = (v: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 0 }).format(v);

/**
 * Linha-fantasma (período de comparação). Quando ausente, a linha não é desenhada
 * — é o caso do modo dia e do personalizado com comparação automática, iguais a
 * como sempre foram.
 *
 * `nota` explica por que a fantasma pode acabar antes da linha principal: com
 * períodos de tamanhos diferentes (julho 31 vs junho 30), o último dia do período
 * atual não tem par. Sem essa explicação o fim da linha parece corte de dado.
 */
export interface Fantasma {
  rotulo: string;
  nota?: string;
}

function TooltipGrafico({ active, payload, label, fantasma }: {
  active?: boolean; payload?: { payload: PontoGrafico }[]; label?: string;
  fantasma?: Fantasma | null;
}) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    // ⚠️ O tooltip flutua SOBRE o card do gráfico. Com `card` no fundo dele, os dois
    // ficam da mesma cor e no claro era a sombra que separava — no escuro a sombra
    // não aparece. Agora: `flutuante` (o degrau acima do card) com `bordaForte`.
    <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: TEMA.flutuante, border: `1px solid ${TEMA.bordaForte}`, color: TEXTO, boxShadow: TEMA.sombraCard }}>
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
      {p.ghost != null && (
        <div className="mt-1 flex justify-between gap-4 border-t pt-1 tabular-nums" style={{ borderColor: LINE, color: MUTED }}>
          <span>{fantasma?.rotulo ?? "Leads · período anterior"}</span><span>{num(p.ghost)}</span>
        </div>
      )}
      {/* Dia sem par no período de comparação: aparece exatamente onde a linha
          pontilhada terminou, que é onde alguém desconfiaria de dado faltando. */}
      {p.ghost == null && fantasma?.nota && (
        <div className="mt-1 border-t pt-1 text-[11px]" style={{ borderColor: LINE, color: MUTED }}>
          Sem par na comparação — {fantasma.nota}.
        </div>
      )}
    </div>
  );
}

/** Quais séries o hover da legenda pode isolar. A fantasma NÃO é uma delas —
 *  ver `opacidadeDe` abaixo. */
type SerieDestacavel = "gasto" | "leads" | "cpl";

/**
 * ⚠️ RECUO DE 0,45, e NÃO os 0,25 do SlopeCpl. Não é descuido nem inconsistência:
 * a regra da casa é "recuar as outras", e a INTENSIDADE acompanha quantas outras
 * existem.
 *
 * No slope são 8 linhas se cruzando no mesmo espaço, e 0,25 é o que permite
 * isolar uma. Aqui são 3 séries já distintas por FORMA — barra, linha cheia,
 * linha tracejada — e recuar tanto faria o gasto praticamente sumir. As barras
 * são a referência de escala de quem está olhando a linha de CPL; apagá-las tira
 * o que dá sentido ao que sobrou.
 *
 * ⚠️ NÃO IGUALE OS DOIS VALORES achando que um deles está errado.
 */
const RECUO = 0.45;

function ItemLegenda({
  cor, tracejado = false, barra = false, texto, chave, destacado, onEntrar, onSair,
}: {
  cor: string; tracejado?: boolean; barra?: boolean; texto: string;
  /** Ausente = item não interativo (é o caso da fantasma, que segue os leads). */
  chave?: SerieDestacavel;
  destacado: SerieDestacavel | null;
  onEntrar?: (c: SerieDestacavel) => void;
  onSair?: () => void;
}) {
  // A fantasma acompanha os leads, aqui também: a legenda dela não pode ficar
  // acesa enquanto a linha recuou, nem o contrário.
  const alvo = chave ?? "leads";
  const recuado = destacado !== null && destacado !== alvo;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px]"
      style={{
        color: MUTED,
        opacity: recuado ? RECUO : 1,
        transition: "opacity 120ms",
        cursor: chave ? "default" : undefined,
      }}
      onMouseEnter={chave && onEntrar ? () => onEntrar(chave) : undefined}
      onMouseLeave={chave ? onSair : undefined}
    >
      {barra
        ? <span style={{ width: 10, height: 10, background: cor, borderRadius: 2, display: "inline-block" }} />
        : <span style={{ width: 14, height: 0, borderTop: `2px ${tracejado ? "dashed" : "solid"} ${cor}`, display: "inline-block" }} />}
      {texto}
    </span>
  );
}

// Gráfico-herói: gasto (barras, eixo R$ à esquerda), leads totais (linha amarela,
// eixo contagem à direita) e CPL (linha vermelha tracejada, eixo oculto próprio).
export default function HeroChart({ pontos, periodoLabel, fantasma = null }: {
  pontos: PontoGrafico[]; periodoLabel: string; fantasma?: Fantasma | null;
}) {
  const [destacado, setDestacado] = useState<SerieDestacavel | null>(null);

  /**
   * ⚠️ A FANTASMA SEGUE OS LEADS, e isto é o ponto do desenho inteiro.
   *
   * Ela não é uma quarta série: é o MESMO dado ("leads totais") do período
   * anterior, e só existe para ser lida CONTRA a linha atual. Se destacar os
   * leads apagasse a fantasma, a comparação sumiria justamente quando alguém
   * está olhando de perto — que é o oposto do que o destaque serve para fazer.
   *
   * Então o par entra e recua junto, sempre.
   */
  const opacidadeDe = (serie: SerieDestacavel, base = 1) =>
    destacado === null || destacado === serie ? base : base * RECUO;

  return (
    <div className="mb-10 p-5" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>Tendência do período</p>
        <div className="flex flex-wrap items-center gap-3">
          {/* O hover vive AQUI, na legenda — não na área do gráfico, onde o
              tooltip rico já mora. Duas interações no mesmo espaço brigariam, e o
              tooltip é a mais útil das duas. */}
          <ItemLegenda cor={BARRA} barra texto="Gasto (R$, esq.)"
            chave="gasto" destacado={destacado} onEntrar={setDestacado} onSair={() => setDestacado(null)} />
          <ItemLegenda cor={LINHA_LEADS} texto="Leads totais (dir.)"
            chave="leads" destacado={destacado} onEntrar={setDestacado} onSair={() => setDestacado(null)} />
          <ItemLegenda cor={RED} tracejado texto="CPL do dia"
            chave="cpl" destacado={destacado} onEntrar={setDestacado} onSair={() => setDestacado(null)} />
          {/* Sem `chave`: a fantasma não é isolável por si — ela segue os leads. */}
          {fantasma && <ItemLegenda cor={MUTED} tracejado texto={fantasma.rotulo} destacado={destacado} />}
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

            {/* ⚠️ Realce sob o cursor: CLARO translúcido. Era um lavado escuro, que
                sobre card escuro não realça nada — o hover simplesmente sumia, sem
                erro nenhum. É uma das quatro cores `rgba()` que a auditoria de hex
                não pegava; agora é token (`realceGrafico`). */}
            <Tooltip content={<TooltipGrafico fantasma={fantasma} />} cursor={{ fill: TEMA.realceGrafico }} />

            <Bar
              yAxisId="gasto" dataKey="gasto" name="Gasto" fill={BARRA}
              radius={[2, 2, 0, 0]} maxBarSize={26}
              opacity={opacidadeDe("gasto")}
              style={{ transition: "opacity 120ms" }}
            />
            {fantasma && (
              // connectNulls={false} é o que faz a fantasma PARAR onde o período de
              // comparação acaba, em vez de emendar por cima do buraco.
              // ⚠️ Opacidade base 0,7 MULTIPLICADA pelo recuo: ela já nasce discreta
              // por ser referência, e no recuo fica proporcionalmente discreta —
              // não some, porque some junto com os leads e o par tem que sobrar.
              <Line
                yAxisId="leads" type="monotone" dataKey="ghost" name={fantasma.rotulo}
                stroke={MUTED} strokeWidth={1.25} strokeDasharray="3 3" dot={false}
                connectNulls={false}
                opacity={opacidadeDe("leads", 0.7)}
                style={{ transition: "opacity 120ms" }}
              />
            )}
            <Line
              yAxisId="leads" type="monotone" dataKey="total" name="Leads totais"
              stroke={LINHA_LEADS} strokeWidth={2.5} dot={false} connectNulls={false}
              opacity={opacidadeDe("leads")}
              style={{ transition: "opacity 120ms" }}
            />
            {/* A linha que MAIS ganha com o destaque: fina, tracejada e sem eixo
                visível, ela se perde entre as barras quando tudo está aceso. */}
            <Line
              yAxisId="cpl" type="monotone" dataKey="cpl" name="CPL"
              stroke={RED} strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false}
              opacity={opacidadeDe("cpl")}
              style={{ transition: "opacity 120ms" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
