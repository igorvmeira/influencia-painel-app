"use client";

import { TEMA } from "@/lib/brand";
import { brlDec, num } from "@/lib/format";
import Sparkline from "./Sparkline";
import DeltaChip from "./DeltaChip";

const MUTED = TEMA.muted;
const LINE = TEMA.borda;

// Iniciais do avatar: primeira letra das duas primeiras palavras ("JOÃO PEDRO" → JP);
// nome de palavra única usa as duas primeiras letras ("LUCAS" → LU).
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return (partes[0] ?? "?").slice(0, 2).toUpperCase();
}

export default function CardGestor({
  nome, cpl, cplVar, conversas, gasto, serieCpl,
  premiado, motivoInelegivel, contasTotal, contasIncompletas, onClick, aberto,
}: {
  nome: string;
  cpl: number;
  cplVar: number;
  conversas: number;
  gasto: number;
  serieCpl: number[];
  /** Recebeu o selo de melhor evolução do mês. */
  premiado: boolean;
  /** Preenchido quando o gestor NÃO pode concorrer ao selo. */
  motivoInelegivel: string | null;
  contasTotal: number;
  contasIncompletas: number;
  onClick: () => void;
  aberto: boolean;
}) {
  const semConversao = conversas === 0;
  // CPL caindo é BOM: a cor da linha acompanha a semântica, não o sinal.
  const corLinha = semConversao ? TEMA.sparkline : cplVar < 0 ? TEMA.positivo : cplVar > 0 ? TEMA.negativo : TEMA.sparkline;

  return (
    <button
      onClick={onClick}
      className="w-full p-4 text-left transition-shadow hover:shadow-md"
      style={{
        background: TEMA.card,
        // A borda dourada é o único uso de destaque como CONTORNO — o selo é o
        // que carrega o significado; a borda só ajuda a achar o card no grid.
        border: premiado ? `2px solid ${TEMA.destaque}` : `1px solid ${LINE}`,
        borderRadius: TEMA.raioCard,
        boxShadow: TEMA.sombraCard,
        outline: aberto ? `2px solid ${TEMA.destaque}` : undefined,
        outlineOffset: aberto ? 2 : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
            style={{ background: TEMA.navFundo, color: TEMA.navTexto }}
          >
            {iniciais(nome)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold" style={{ color: TEMA.texto }}>{nome}</span>
            <span className="block text-[11px] tabular-nums" style={{ color: MUTED }}>
              {contasTotal} conta{contasTotal === 1 ? "" : "s"} · {num(conversas)} conv.
            </span>
          </span>
        </div>
        <span className="shrink-0 text-[10px]" style={{ color: MUTED }}>{aberto ? "▼" : "▶"}</span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <span className="block text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>CPL do mês</span>
          <span className="block text-[28px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: TEMA.texto }}>
            {semConversao ? "—" : brlDec(cpl)}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <DeltaChip
            delta={semConversao ? null : cplVar}
            menorMelhor
            motivo={semConversao ? "sem conversões no mês — CPL indefinido" : null}
          />
          {/* Sparkline mostra a FORMA da tendência; o número acima é o valor real. */}
          <span title="Tendência diária do CPL no mês (picos suavizados). O valor exibido é o CPL real do mês.">
            <Sparkline dados={serieCpl} cor={corLinha} largura={92} altura={26} />
          </span>
        </div>
      </div>

      {/* Selos de honestidade têm prioridade sobre o charme: aparecem sempre,
          mesmo que empurrem o layout. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {premiado && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}
            title="Melhor evolução de CPL entre os gestores elegíveis do mês."
          >
            ★ melhor evolução
          </span>
        )}
        {contasIncompletas > 0 && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
            style={{ background: TEMA.limiteFundo, color: TEMA.atencao }}
            title="Contas cuja série começa depois do dia 1 do mês analisado ou do de comparação."
          >
            ⚠ {contasIncompletas} conta{contasIncompletas === 1 ? "" : "s"} sem mês completo
          </span>
        )}
        {!premiado && motivoInelegivel && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
            style={{ background: TEMA.chip, color: MUTED, cursor: "help" }}
            title={motivoInelegivel}
          >
            fora do selo
          </span>
        )}
      </div>
    </button>
  );
}
