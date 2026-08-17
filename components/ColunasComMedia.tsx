"use client";

import { TEMA, MOVIMENTO } from "@/lib/brand";
import { useEntrada, atrasoDe } from "@/lib/useEntrada";

export interface Coluna {
  rotulo: string;
  valor: number;
  /**
   * Sinaliza a coluna sem usar cor como único canal — o rótulo diz o resto.
   *
   * 🛑 NÃO COMBINE com `parcial` sem medir. Sobre o dourado a hachura tem textura de
   * apenas **1,60:1** contra a base (medido em 17/08/2026) — visível de perto, fraca de
   * longe. Sobre a coluna neutra são 4,74:1 e sobre a âmbar 2,10:1, ambas confortáveis.
   * Hoje nenhuma série usa os dois juntos; se precisar, o parcial vai ter que ganhar um
   * segundo canal nesse caso. Ver `hachuraParcial` em lib/brand.ts.
   */
  destacada?: boolean;
  /**
   * Mês anômalo. ⚠️ A coluna vira âmbar E ganha um "⚠" acima do valor: cor
   * sozinha não é canal suficiente, e este marcador existe justamente para
   * quem não distingue matiz.
   */
  alerta?: boolean;
  /**
   * Período que a base não cobre inteiro (mês corrente, ou o primeiro mês da série).
   *
   * ⚠️ ESTADO SEPARADO DE `alerta`, nunca o mesmo. Um diz "o dado está INCOMPLETO", o
   * outro diz "o dado está INFLADO pela automação" — causas diferentes, ações
   * diferentes. A coluna parcial ganha HACHURA (textura), não cor: cor nesta série já
   * está gasta em `alerta`, e reusá-la faria o tooltip afirmar a causa errada.
   */
  parcial?: boolean;
  titulo?: string;
}

const ALTURA = 190;

/**
 * Colunas verticais com o valor no topo e uma linha de média.
 *
 * ⚠️ O VALOR ENTRA DEPOIS QUE A BARRA ASSENTA (260ms). Animando junto, o número
 * sobe com a barra e fica ilegível durante todo o trajeto — que é exatamente o
 * que a regra da casa proíbe. A linha de média entra por último, quando já existe
 * o que comparar.
 *
 * ⚠️ A MÉDIA É DADO, não enfeite: vai em `dadoNeutro` (3,19:1), tracejada para
 * não se confundir com uma coluna, e com o valor escrito ao lado — a linha
 * sozinha diria "existe uma média" sem dizer qual.
 */
export default function ColunasComMedia({
  colunas, formatar, mostrarMedia = true,
}: {
  colunas: Coluna[];
  formatar: (n: number) => string;
  mostrarMedia?: boolean;
}) {
  const { ref, entrou } = useEntrada<HTMLDivElement>();

  if (!colunas.length) {
    return <p className="text-[12.5px]" style={{ color: TEMA.muted }}>Sem dados no período.</p>;
  }

  const max = Math.max(...colunas.map((c) => c.valor), 1);
  const media = colunas.reduce((t, c) => t + c.valor, 0) / colunas.length;
  // Deixa 18% de folga no topo para o rótulo de valor não encostar na borda.
  const pctDe = (v: number) => (v / max) * 82;

  return (
    <div ref={ref}>
      <div
        className="relative flex items-end gap-3 border-b pb-0 pt-7"
        style={{ height: ALTURA, borderColor: TEMA.borda }}
      >
        {mostrarMedia && media > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0"
            style={{
              bottom: `${pctDe(media)}%`,
              borderTop: `1px dashed ${TEMA.dadoNeutro}`,
              opacity: entrou ? 1 : 0,
              transition: `opacity ${MOVIMENTO.mediaMs}ms ease-out`,
              transitionDelay: `${MOVIMENTO.barraMs + 60}ms`,
            }}
          >
            <span
              className="absolute right-0 top-[-15px] px-1.5 text-[10.5px] tabular-nums"
              style={{ background: TEMA.card, color: TEMA.muted }}
            >
              média {formatar(media)}
            </span>
          </div>
        )}

        {colunas.map((c, i) => {
          const atraso = atrasoDe(i, MOVIMENTO.escalonamentoMs, MOVIMENTO.escalonamentoTetoMs);
          const alt = pctDe(c.valor);
          return (
            <div key={c.rotulo} className="relative flex h-full flex-1 flex-col justify-end items-center">
              <span
                className="absolute inset-x-0 text-center text-[11.5px] font-semibold tabular-nums"
                style={{
                  bottom: `${alt}%`,
                  color: TEMA.texto,
                  opacity: entrou ? 1 : 0,
                  transform: entrou ? "translateY(0)" : "translateY(4px)",
                  transition: `opacity ${MOVIMENTO.rotuloMs}ms ease-out, transform ${MOVIMENTO.rotuloMs}ms ${MOVIMENTO.ease}`,
                  transitionDelay: `${atraso + MOVIMENTO.rotuloAtrasoMs}ms`,
                }}
              >
                {c.alerta && <span style={{ color: TEMA.atencao }}>⚠ </span>}
                {formatar(c.valor)}
              </span>

              <div
                title={c.titulo}
                className="w-full max-w-[34px] rounded-t-[3px]"
                style={{
                  height: entrou ? `${alt}%` : "0%",
                  // ⚠️ Degradê só onde a cor tem folga: dourado parte de 9,44:1 e
                  // aguenta; `dadoNeutro` parte de 3,19:1, que já é o piso, e o
                  // âmbar não foi medido para escurecer — os dois vão chapados.
                  //
                  // ⚠️ A HACHURA VEM NA FRENTE, com lacunas transparentes: a cor que a
                  // coluna já teria passa por baixo. Assim o parcial não muda de cor —
                  // muda de textura — e o mês clonado continua âmbar mesmo quando é
                  // também parcial. Ver `hachuraParcial` em lib/brand.ts.
                  background: [
                    ...(c.parcial ? [TEMA.hachuraParcial] : []),
                    c.alerta ? TEMA.atencao : c.destacada ? TEMA.gradDestaqueV : TEMA.dadoNeutro,
                  ].join(", "),
                  transition: `height ${MOVIMENTO.barraMs}ms ${MOVIMENTO.ease}`,
                  transitionDelay: `${atraso}ms`,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-3">
        {colunas.map((c) => (
          <span
            key={c.rotulo}
            className="flex-1 text-center text-[11px]"
            style={{ color: TEMA.muted }}
          >
            {c.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}
