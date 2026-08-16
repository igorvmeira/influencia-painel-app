"use client";

import { TEMA } from "@/lib/brand";
import { estiloDe, Semaforo } from "@/lib/semaforo";

/**
 * O balão de orientação da tabela, em TRÊS estados.
 *
 * ⚠️ O EMOJI 💬 NÃO SERVE MAIS, e isto é achado da migração de tema: emoji
 * renderiza com as próprias cores e **ignora `color`**. Enquanto o balão só
 * indicava "existe orientação", tanto fazia; agora que ele precisa CARREGAR a cor
 * do semáforo, emoji é impossível. Daí o SVG.
 *
 * ⚠️⚠️ TRÊS ESTADOS, NUNCA DOIS. Conflatar "sem orientação" com "sem semáforo"
 * apagaria justamente a informação que o Roberto quer enxergar — quais contas
 * ninguém comentou ainda:
 *
 *   VAZADO (só contorno) ... ninguém escreveu nada. É um convite, não um dado.
 *   CHEIO cinza ............ tem orientação, quem escreveu NÃO classificou.
 *   CHEIO colorido ......... tem orientação com julgamento de desempenho.
 *
 * ⚠️ E A COR NÃO É O ÚNICO CANAL: o `aria-label` e o `title` dizem o estado por
 * extenso. Cor sozinha não sobrevive a daltonismo nem a print em preto e branco —
 * e uma tabela de varredura é exatamente o que acaba impresso em reunião.
 */
export default function BalaoOrientacao({
  cliente, temOrientacao, semaforo, onClick,
}: {
  cliente: string;
  temOrientacao: boolean;
  semaforo: Semaforo | null | undefined;
  onClick: () => void;
}) {
  const e = temOrientacao ? estiloDe(semaforo ?? null) : null;

  // Vazado = contorno em `bordaForte` (3,19:1): é CONTROLE clicável, e a borda é
  // quem afirma isso quando não há preenchimento. Mesma regra do resto do app.
  const preenchimento = !temOrientacao ? "none" : e!.cor;
  const contorno = !temOrientacao ? TEMA.bordaForte : "none";

  const estado = !temOrientacao
    ? "sem orientação — clique para escrever a primeira"
    : semaforo
      ? `orientação · desempenho: ${e!.rotulo}`
      : "orientação sem classificação de desempenho";

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${cliente} — ${estado}`}
      aria-label={`${cliente}: ${estado}`}
      className="inline-flex shrink-0 items-center rounded p-0.5 align-middle transition hover:brightness-125"
    >
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
        {/* Balão com rabicho: forma reconhecível em 13px, que é o tamanho que
            cabe numa linha de tabela densa sem empurrar o nome. */}
        <path
          d="M2.4 1.6h11.2c.66 0 1.2.54 1.2 1.2v7.2c0 .66-.54 1.2-1.2 1.2H6.2L3.2 14.2v-3H2.4c-.66 0-1.2-.54-1.2-1.2V2.8c0-.66.54-1.2 1.2-1.2z"
          fill={preenchimento}
          stroke={contorno}
          strokeWidth={contorno === "none" ? 0 : 1.3}
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
