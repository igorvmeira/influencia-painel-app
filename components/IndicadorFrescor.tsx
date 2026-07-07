"use client";

import { TEMA } from "@/lib/brand";

// Promove a última sincronização: ponto verde + "atualizado há Xh" quando < 24h;
// âmbar + "desatualizado há Xd" quando >= 24h; sem registro → âmbar "pendente".
function calcular(iso: string | null): { cor: string; texto: string; title: string } {
  if (!iso) return { cor: TEMA.atencao, texto: "Sincronização pendente", title: "Nenhum sync registrado ainda" };
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return { cor: TEMA.atencao, texto: "Sincronização pendente", title: "" };

  const completo = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(ts));
  const title = `Último sync: ${completo}`;

  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 60) return { cor: TEMA.positivo, texto: min <= 1 ? "atualizado agora" : `atualizado há ${min} min`, title };
  const h = Math.floor(min / 60);
  if (h < 24) return { cor: TEMA.positivo, texto: `atualizado há ${h}h`, title };
  const d = Math.floor(h / 24);
  return { cor: TEMA.atencao, texto: `desatualizado há ${d} ${d === 1 ? "dia" : "dias"}`, title };
}

export default function IndicadorFrescor({ ultimaSync }: { ultimaSync: string | null }) {
  const info = calcular(ultimaSync);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]"
      style={{ background: TEMA.card, border: `1px solid ${TEMA.borda}`, color: TEMA.muted }}
      title={info.title}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: info.cor }} />
      {info.texto}
    </span>
  );
}
