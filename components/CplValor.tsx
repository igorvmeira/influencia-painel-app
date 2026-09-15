"use client";

import { TEMA } from "@/lib/brand";
import { brlDec } from "@/lib/format";
import { explicaSemCpl, rotuloSemCpl } from "@/lib/cpl";

/**
 * O CPL na tela: o número quando existe, "—" com o MOTIVO quando não.
 *
 * ⚠️ O motivo vai ESCRITO ao lado, não só no `title`: tooltip não existe no celular, e um
 * "—" sozinho numa coluna de números se lê como "carregando" — ou como zero, que é
 * exatamente o erro que isto existe para desfazer.
 *
 * A regra (o que é indefinido, e por quê) mora em lib/cpl.ts. Aqui só se desenha.
 */
export default function CplValor({ cpl, gasto, conversas, motivo = true }: {
  cpl: number | null;
  gasto: number;
  conversas: number;
  /** `false` em lugar apertado: fica só o "—", com a frase inteira no tooltip. */
  motivo?: boolean;
}) {
  if (cpl !== null) return <>{brlDec(cpl)}</>;
  const rotulo = rotuloSemCpl(gasto, conversas);
  return (
    <span title={explicaSemCpl(gasto, conversas) ?? undefined} style={{ cursor: "help" }}>
      —
      {motivo && rotulo && (
        <span className="ml-1 font-sans text-[10.5px] font-normal" style={{ color: TEMA.muted }}>{rotulo}</span>
      )}
    </span>
  );
}
