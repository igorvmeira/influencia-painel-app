"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Dispara a animação quando o bloco ENTRA NA TELA, não quando a página carrega.
 *
 * ⚠️ POR QUE NÃO NO CARREGAMENTO: numa tela alta, animar tudo de uma vez faz o
 * usuário chegar num bloco que já animou sem ele ver — a animação vira custo sem
 * benefício. E pior: se a rede demora, a página pinta pronta e a animação nunca
 * acontece, o que dá dois comportamentos diferentes para a mesma tela.
 *
 * ⚠️ UMA VEZ POR MONTAGEM. Voltar rolando NÃO reanima: quem já leu o bloco não
 * quer esperar de novo para reler. É a mesma regra do "não faça esperar para ler".
 *
 * ⚠️ prefers-reduced-motion LIGA DIRETO, sem observar. Não é só pular a transição:
 * é não depender do observer para o conteúdo aparecer. Se o IntersectionObserver
 * falhar (navegador antigo, aba em segundo plano no momento certo), o conteúdo
 * ficaria invisível — por isso a ausência da API também liga direto.
 */
export function useEntrada<T extends HTMLElement = HTMLDivElement>(): {
  ref: React.RefObject<T>;
  entrou: boolean;
} {
  // ⚠️ `useRef<T>(null)` e não `useRef<T | null>(null)`: os tipos do React 18
  // devolvem `RefObject<T | null>` no segundo caso, que a prop `ref` recusa.
  const ref = useRef<T>(null);
  const [entrou, setEntrou] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (entrou) return;

    const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Falha ABERTA: sem observer, ou sem elemento, o conteúdo aparece. O risco de
    // um bloco invisível é muito pior que o de uma animação perdida.
    if (!el || semMovimento || typeof IntersectionObserver === "undefined") {
      setEntrou(true);
      return;
    }

    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          setEntrou(true);
          io.disconnect();
        }
      },
      // threshold baixo + margem negativa: dispara quando o bloco está entrando
      // de verdade, não quando um pixel dele aparece na borda.
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [entrou]);

  return { ref, entrou };
}

/**
 * Atraso em cascata de um item, com TETO — ver `MOVIMENTO.escalonamentoTetoMs`.
 * Sem o teto, uma lista de 20 linhas terminaria 800ms depois de começar, e as
 * últimas linhas seriam espera pura.
 */
export function atrasoDe(indice: number, passoMs: number, tetoMs: number): number {
  return Math.min(indice * passoMs, tetoMs);
}
