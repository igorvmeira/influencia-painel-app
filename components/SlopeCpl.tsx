"use client";

import { useEffect, useRef, useState } from "react";
import { TEMA } from "@/lib/brand";
import { brlDec, num } from "@/lib/format";

export interface PontoSlope {
  nome: string;
  cplAnterior: number;
  cplAtual: number;
  /** Abaixo do piso de conversões: sai da ESCALA, mas continua exibido acima do gráfico. */
  volumeBaixo: boolean;
  conversas: number;
}

// SVG próprio em vez de recharts: recharts não faz dodging de rótulo, e com 7 linhas
// os nomes da ponta direita colidem. Aqui o empurrão vertical é explícito.
//
// ESCALA LINEAR, e o outlier FORA dela. A tentativa anterior foi usar escala
// logarítmica para caber um gestor com CPL uma ordem de grandeza acima (R$ 99 contra
// R$ 7–18). Não resolveu: as linhas normais ainda ficavam em ~34% da altura, e a log
// tem o efeito colateral de tornar a inclinação difícil de ler para quem não espera
// eixo comprimido. Tirar o outlier da escala devolve a faixa inteira às 7 linhas
// comparáveis, e ele aparece numa faixa própria acima — visível, sem sequestrar o eixo.
const ALTURA = 300;
const PAD_TOPO = 24;
const PAD_BASE = 30;
const LARG_ROTULO = 168; // "JOÃO PEDRO ... R$ 00,00" com folga
const X0 = 14;           // eixo do mês anterior
const MIN_GAP = 14;      // distância mínima entre rótulos (pedido: ~14px)
const LARG_PADRAO = 720; // usado até o ResizeObserver medir

export default function SlopeCpl({
  pontos, labelAnterior, labelAtual,
}: {
  pontos: PontoSlope[];
  labelAnterior: string;
  labelAtual: string;
}) {
  // Largura REAL do container. Com viewBox + preserveAspectRatio o SVG centralizava
  // e sobrava vazio nas laterais em card largo; medir resolve de fato.
  const ref = useRef<HTMLDivElement>(null);
  const [larg, setLarg] = useState(LARG_PADRAO);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLarg(el.clientWidth || LARG_PADRAO);
    const ro = new ResizeObserver(([e]) => setLarg(e.contentRect.width || LARG_PADRAO));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [destacado, setDestacado] = useState<string | null>(null);

  const validos = pontos.filter((p) => p.cplAnterior > 0 && p.cplAtual > 0);
  const naEscala = validos.filter((p) => !p.volumeBaixo);
  const foraDaEscala = validos.filter((p) => p.volumeBaixo);

  const X1 = Math.max(X0 + 80, larg - LARG_ROTULO);
  const alturaUtil = ALTURA - PAD_TOPO - PAD_BASE;

  const corDe = (p: PontoSlope) =>
    p.cplAtual < p.cplAnterior ? TEMA.positivo : p.cplAtual > p.cplAnterior ? TEMA.negativo : TEMA.muted;

  // Faixa dos que saíram da escala: aparecem SEMPRE, com o motivo. Voltam sozinhos
  // para o gráfico quando passarem do piso de conversões (o flag vem de fora).
  const faixaFora = foraDaEscala.length > 0 && (
    <div className="mb-3 flex flex-col gap-1.5">
      {foraDaEscala.map((p) => (
        <div
          key={p.nome}
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-3 py-1.5 text-[12px]"
          style={{ background: TEMA.limiteFundo, color: TEMA.atencao }}
          title="Volume baixo no mês: a variação não sustenta conclusão, e o CPL fora de faixa distorceria a escala das demais linhas."
        >
          <span className="font-semibold">⚠ {p.nome}</span>
          <span className="tabular-nums" style={{ color: TEMA.texto }}>{brlDec(p.cplAtual)}</span>
          <span className="tabular-nums">(era {brlDec(p.cplAnterior)})</span>
          <span>· {num(p.conversas)} {p.conversas === 1 ? "conversão" : "conversões"}</span>
          <span className="font-medium">· fora da escala</span>
        </div>
      ))}
    </div>
  );

  if (naEscala.length < 2) {
    return (
      <div>
        {faixaFora}
        <p className="text-[12px]" style={{ color: TEMA.muted }}>
          Dados insuficientes para o comparativo de evolução.
        </p>
      </div>
    );
  }

  // ESCALA LINEAR sobre os gestores comparáveis, com folga de 6% nas pontas para os
  // pontos não encostarem nas bordas.
  const valores = naEscala.flatMap((p) => [p.cplAnterior, p.cplAtual]);
  const bruto0 = Math.min(...valores);
  const bruto1 = Math.max(...valores);
  const folga = (bruto1 - bruto0) * 0.06 || 1;
  const min = bruto0 - folga;
  const max = bruto1 + folga;
  const y = (v: number) => PAD_TOPO + (1 - (v - min) / (max - min)) * alturaUtil;

  // Dodging: ordena por posição ideal e empurra para baixo quem ficaria a menos de
  // MIN_GAP do anterior. Se sobrar gente embaixo, reequilibra subindo o bloco.
  const rotulos = naEscala
    .map((p) => ({ p, yIdeal: y(p.cplAtual), yFinal: y(p.cplAtual) }))
    .sort((a, b) => a.yIdeal - b.yIdeal);
  for (let i = 1; i < rotulos.length; i++) {
    const anterior = rotulos[i - 1].yFinal;
    if (rotulos[i].yFinal - anterior < MIN_GAP) rotulos[i].yFinal = anterior + MIN_GAP;
  }
  const excedente = rotulos[rotulos.length - 1].yFinal - (ALTURA - PAD_BASE);
  if (excedente > 0) for (const r of rotulos) r.yFinal -= excedente;

  /**
   * ESMAECIMENTO DE FOCO — e por que ele NÃO tem piso de contraste.
   *
   * ⚠️ A RÉGUA É A DURAÇÃO, não o número. Esmaecimento TRANSITÓRIO com gesto REVERSÍVEL
   * é FOCO: a pessoa pediu para isolar uma série, as outras estarem apagadas É a função,
   * e soltar o mouse devolve tudo. Esmaecimento que PERSISTE sem o gesto seria DADO
   * ESCONDIDO, e aí o piso de 3:1 volta a valer.
   *
   * 🔑 SE UM DIA O REALCE VIRAR CLIQUE-PARA-FIXAR em vez de hover, ele MUDA DE CATEGORIA
   * — e esta linha passa a precisar de 3:1. Não é o valor 0,25 que decide; é o gesto.
   *
   * ⚠️ E O PISO NÃO É ALCANÇÁVEL SEM MATAR A FUNÇÃO: medido em 18/08/2026, para as
   * linhas esmaecidas chegarem a 3:1 sobre o card a opacidade teria que subir a ~0,75, e
   * aí não há realce nenhum. Mesmo raciocínio do `disabled:`, isento pela WCAG 1.4.3.
   *
   * NÚMEROS, para ninguém culpar nem absolver a migração por engano:
   *   tema anterior (card quase-preto) .. positivo a 25% = 1,69:1
   *   marca 2026 (card roxo) ............ positivo a 25% = 1,34:1
   * PIOROU, e já estava abaixo de 3:1 antes. Não é regressão da paleta.
   */
  const opacidadeDe = (nome: string) => (destacado && destacado !== nome ? 0.25 : 1);

  return (
    <div ref={ref} className="w-full">
      {faixaFora}
      <svg
        width={larg}
        height={ALTURA}
        role="img"
        aria-label={`Evolução do CPL por gestor de ${labelAnterior} para ${labelAtual}`}
        onMouseLeave={() => setDestacado(null)}
      >
        {/* ⚠️ Os dois eixos verticais marcam OS PERÍODOS — são o que dá sentido às
            linhas, não moldura. Estavam em `borda` (1,23:1 no escuro), que some.
            `sparkline` dá 3,19:1, o piso da WCAG 1.4.11 para dado não-textual. */}
        <line x1={X0} y1={PAD_TOPO - 12} x2={X0} y2={ALTURA - PAD_BASE + 6} stroke={TEMA.dadoNeutro} strokeWidth={1} />
        <line x1={X1} y1={PAD_TOPO - 12} x2={X1} y2={ALTURA - PAD_BASE + 6} stroke={TEMA.dadoNeutro} strokeWidth={1} />

        {naEscala.map((p) => {
          const yA = y(p.cplAnterior);
          const yB = y(p.cplAtual);
          const cor = corDe(p);
          const op = opacidadeDe(p.nome);
          const forte = destacado === p.nome;
          return (
            <g
              key={p.nome}
              opacity={op}
              style={{ transition: "opacity 120ms" }}
              onMouseEnter={() => setDestacado(p.nome)}
            >
              <title>{`${p.nome}: ${brlDec(p.cplAnterior)} → ${brlDec(p.cplAtual)}`}</title>
              {/* Faixa invisível mais grossa: alvo de mouse generoso sem engrossar o traço. */}
              <line x1={X0} y1={yA} x2={X1} y2={yB} stroke="transparent" strokeWidth={14} />
              <line x1={X0} y1={yA} x2={X1} y2={yB} stroke={cor} strokeWidth={forte ? 2.75 : 1.75} />
              <circle cx={X0} cy={yA} r={forte ? 4 : 3} fill={cor} />
              <circle cx={X1} cy={yB} r={forte ? 4 : 3} fill={cor} />
              {/* Valor de origem só no realce, para não poluir a coluna esquerda. */}
              {forte && (
                <text x={X0 - 4} y={yA + 3} fontSize={10} fill={cor} textAnchor="end"
                  style={{ fontVariantNumeric: "tabular-nums" }}>
                  {brlDec(p.cplAnterior)}
                </text>
              )}
            </g>
          );
        })}

        {rotulos.map(({ p, yFinal, yIdeal }) => {
          const cor = corDe(p);
          const forte = destacado === p.nome;
          return (
            <g
              key={"r" + p.nome}
              opacity={opacidadeDe(p.nome)}
              style={{ transition: "opacity 120ms", cursor: "default" }}
              onMouseEnter={() => setDestacado(p.nome)}
            >
              <title>{`${p.nome}: ${brlDec(p.cplAnterior)} → ${brlDec(p.cplAtual)}`}</title>
              {/* Linha-guia quando o rótulo foi empurrado da posição real do ponto.
                  Em `borda` ela sumia no escuro e o rótulo parecia solto no gráfico. */}
              {Math.abs(yFinal - yIdeal) > 1 && (
                <line x1={X1} y1={yIdeal} x2={X1 + 7} y2={yFinal} stroke={TEMA.dadoNeutro} strokeWidth={0.75} />
              )}
              {/* Nome à esquerda e valor ancorado na borda direita: mesma linha, sem
                  chance de se sobrepor por mais longo que seja o nome. */}
              <text x={X1 + 10} y={yFinal + 4} fontSize={11} fill={TEMA.texto}
                style={{ fontWeight: forte ? 600 : 500 }}>
                {p.nome}
              </text>
              <text x={larg - 2} y={yFinal + 4} fontSize={11} fill={cor} textAnchor="end"
                style={{ fontVariantNumeric: "tabular-nums", fontWeight: forte ? 600 : 500 }}>
                {brlDec(p.cplAtual)}
              </text>
            </g>
          );
        })}

        <text x={X0} y={ALTURA - 10} fontSize={10} fill={TEMA.muted} textAnchor="start">{labelAnterior}</text>
        <text x={X1} y={ALTURA - 10} fontSize={10} fill={TEMA.muted} textAnchor="middle">{labelAtual}</text>
      </svg>
    </div>
  );
}
