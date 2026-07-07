"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";

// Anima o número de um KPI (count-up) ao mudar de valor — tipicamente na troca de
// período. Formata cada frame com o mesmo formatador do card. Não anima no primeiro
// render nem quando o usuário pede menos movimento (prefers-reduced-motion).
export default function NumeroAnimado({
  valor, formatar, title, className, style, duracaoMs = 400,
}: {
  valor: number;
  formatar: (n: number) => string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  duracaoMs?: number;
}) {
  const [exibido, setExibido] = useState(valor);
  const anteriorRef = useRef(valor);
  const primeiroRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const semMovimento =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (primeiroRef.current || semMovimento) {
      primeiroRef.current = false;
      anteriorRef.current = valor;
      setExibido(valor);
      return;
    }

    const de = anteriorRef.current;
    const para = valor;
    anteriorRef.current = valor;
    if (de === para) { setExibido(para); return; }

    let inicio: number | null = null;
    const passo = (t: number) => {
      if (inicio === null) inicio = t;
      const p = Math.min(1, (t - inicio) / duracaoMs);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cúbico
      setExibido(de + (para - de) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(passo);
      else setExibido(para);
    };
    rafRef.current = requestAnimationFrame(passo);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [valor, duracaoMs]);

  return <span title={title} className={className} style={style}>{formatar(exibido)}</span>;
}
