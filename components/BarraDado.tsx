"use client";

import { TEMA, MOVIMENTO } from "@/lib/brand";

/**
 * Barra horizontal de dado, com trilho e crescimento animado.
 *
 * ⚠️ TRILHO E BARRA SÃO TOKENS DIFERENTES, e confundi-los já custou três defeitos
 * nesta base: `barraNeutra` é o SULCO vazio (1,47:1, decorativo) e a barra é DADO
 * (piso de 3:1 da WCAG 1.4.11, porque o comprimento carrega a informação).
 *
 * ⚠️ O DEGRADÊ SÓ VALE PARA O DOURADO. `dadoNeutro` parte de 3,19:1, que já é o
 * piso — escurecer qualquer ponto dele reprova. Por isso `degrade` só é aplicado
 * quando a cor tem folga; ver os tokens `gradDestaque*` em lib/brand.ts.
 */
export default function BarraDado({
  pct, cor, degrade = false, entrou, indice = 0, titulo, className,
}: {
  /** Classes do TRILHO — o layout é decisão da tela (largura, ordem responsiva). */
  className?: string;
  /** 0–100. */
  pct: number;
  cor: string;
  /** Só ligue em cor com folga de contraste (dourado). Nunca no neutro. */
  degrade?: boolean;
  /** Vem do `useEntrada` do bloco: a barra não decide sozinha quando animar. */
  entrou: boolean;
  indice?: number;
  titulo?: string;
}) {
  const atraso = Math.min(indice * MOVIMENTO.escalonamentoMs, MOVIMENTO.escalonamentoTetoMs);
  return (
    <div
      className={className ?? "h-2.5 flex-1 overflow-hidden rounded-full"}
      style={{ background: TEMA.barraNeutra }}
      title={titulo}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: entrou ? `${Math.max(0, Math.min(100, pct))}%` : "0%",
          background: degrade ? TEMA.gradDestaqueH : cor,
          transition: `width ${MOVIMENTO.barraMs}ms ${MOVIMENTO.ease}`,
          transitionDelay: `${atraso}ms`,
        }}
      />
    </div>
  );
}
