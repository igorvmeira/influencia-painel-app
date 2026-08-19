"use client";

import { useEffect, useRef } from "react";
import { TEMA } from "@/lib/brand";

/**
 * A CASCA de janela sobreposta — véu, foco, Esc, trava de rolagem e o
 * comportamento no celular.
 *
 * ⚠️ CASCA COMPARTILHADA, CONTEÚDOS SEPARADOS. Esta é a parte onde errar é caro
 * (foco preso, rolagem dupla, Esc que não fecha) e onde não há nada de específico
 * de tela. Já os conteúdos — análise de conta e orientação — são naturezas
 * distintas: um é painel de métricas, o outro é texto com histórico. Forçá-los no
 * mesmo componente seria o erro que já evitamos entre KpiCard e CardGestor.
 *
 * ⚠️ NO CELULAR VIRA TELA CHEIA. Janela sobreposta em tela estreita corta
 * conteúdo e é ruim de fechar; abaixo de 768px ela ocupa tudo, sem raio.
 */
export default function Modal({
  aberto, aoFechar, titulo, subtitulo, children, rodape,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!aberto) return;

    // ⚠️ Guarda quem tinha o foco ANTES de abrir. Sem devolver no fechamento, quem
    // navega por teclado volta para o topo da página e perde o lugar na lista.
    focoAnterior.current = document.activeElement as HTMLElement | null;
    caixaRef.current?.focus();

    // ⚠️ Trava a rolagem do fundo. Sem isto, rolar dentro do modal "vaza" para a
    // página atrás quando o conteúdo acaba, e a lista se move sob a janela.
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); aoFechar(); }
    };
    document.addEventListener("keydown", aoTeclar);

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAntes;
      focoAnterior.current?.focus?.();
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center md:items-center md:p-6">
      {/* O véu usa `TEMA.overlay` — o mesmo do drawer, que precisou engrossar para
          0,66 no tema escuro: escurecer o escuro não separa nada. */}
      <div
        className="absolute inset-0"
        style={{ background: TEMA.overlay }}
        onClick={aoFechar}
        aria-hidden="true"
      />

      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className="relative flex w-full flex-col outline-none md:max-w-3xl md:rounded-xl"
        style={{
          background: TEMA.card,
          border: `1px solid ${TEMA.bordaForte}`,
          maxHeight: "100dvh",
        }}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-4 px-5 py-4"
          style={{ borderBottom: `1px solid ${TEMA.borda}` }}
        >
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-brand-ink">{titulo}</h2>
            {subtitulo && (
              <p className="mt-0.5 text-[12px]" style={{ color: TEMA.muted }}>{subtitulo}</p>
            )}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="shrink-0 rounded-lg px-2.5 py-1 text-[16px] leading-none transition hover:brightness-125"
            /**
             * ⚠️ `bordaForteElevada`, não `bordaForte`. Este botão pousa no `chip`, que é
             * mais claro que o card — e ali o `bordaForte` dá **2,82:1**, abaixo do piso de
             * 3:1 da WCAG 1.4.11.
             *
             * TERCEIRA ocorrência do mesmo defeito (botão "Sair" 2,97 · `DeltaChip`
             * neutralizado 2,97 · este 2,82), e a mais grave das três pelo que ela é: o
             * controle que a pessoa procura quando quer SAIR.
             */
            style={{ background: TEMA.chip, color: TEMA.muted, border: `1px solid ${TEMA.bordaForteElevada}` }}
          >
            ✕
          </button>
        </div>

        {/* O corpo é quem rola, não a página — daí a trava lá em cima. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {rodape && (
          <div className="shrink-0 px-5 py-3" style={{ borderTop: `1px solid ${TEMA.borda}` }}>
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}
