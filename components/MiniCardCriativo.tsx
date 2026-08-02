"use client";

import { useState } from "react";
import { TEMA } from "@/lib/brand";
import { brl, brlDec, num } from "@/lib/format";
import { CriativoMes } from "@/lib/useCriativosMes";

// Mini-card do criativo. A thumbnail é SEMPRE best-effort: a URL vem ao vivo (não
// é persistida, porque expira) e o anúncio pode ter sido excluído depois do mês.
// Falhar em carregar a imagem não pode quebrar nem esvaziar o card.
export default function MiniCardCriativo({
  c, rotulo, bom,
}: {
  c: CriativoMes;
  rotulo: string;   // "melhor CPL" | "pior CPL"
  bom: boolean;     // define a cor semântica do rótulo
}) {
  const [erroImg, setErroImg] = useState(false);
  const mostraImg = !!c.thumbnailUrl && !erroImg;

  return (
    <div
      className="flex gap-3 p-3"
      style={{ background: TEMA.card, border: `1px solid ${TEMA.borda}`, borderRadius: TEMA.raioCard }}
    >
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg"
        style={{ background: TEMA.chip }}
        aria-hidden="true"
      >
        {mostraImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.thumbnailUrl!}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setErroImg(true)}
            loading="lazy"
          />
        ) : (
          // Reserva quando a miniatura não veio (anúncio excluído, URL expirada
          // ou falha de rede). O card continua útil: nome, CPL e conta.
          <span className="text-[16px]" style={{ color: TEMA.muted }}>▣</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase"
            style={{
              background: bom ? TEMA.positivoFundo : TEMA.negativoFundo,
              color: bom ? TEMA.positivo : TEMA.negativo,
            }}
          >
            {rotulo}
          </span>
          <span className="truncate text-[11px]" style={{ color: TEMA.muted }}>{c.cliente}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-[12px]" style={{ color: TEMA.texto }} title={c.adName}>
          {c.adName}
        </p>
        <p className="mt-1 text-[11px] tabular-nums" style={{ color: TEMA.muted }}>
          CPL <strong style={{ color: bom ? TEMA.positivo : TEMA.negativo }}>{brlDec(c.cpl)}</strong>
          {" · "}{num(c.conversas)} conv · {brl(c.gasto)}
        </p>
      </div>
    </div>
  );
}
