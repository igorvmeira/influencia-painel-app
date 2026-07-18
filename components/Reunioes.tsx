"use client";

import { Reuniao } from "@/lib/types";
import { useAgenda } from "@/lib/useAgenda";
import { chaveDia, hhmm, rotuloDia, chavesHojeAmanha } from "@/lib/formatAgenda";
import { TEMA } from "@/lib/brand";

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const YELLOW = TEMA.destaque;
const INK = TEMA.fundo;

const DIAS = 15; // igual ao DIAS_JANELA da API (só rótulo do estado vazio)

// Avatar de iniciais de um participante.
function Avatar({ nome }: { nome: string }) {
  const ini = nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
      style={{ background: LINE, color: "#cfcbc3" }}
      title={nome}
    >
      {ini}
    </span>
  );
}

function CardReuniao({ r }: { r: Reuniao }) {
  const horario = r.diaTodo ? "Dia todo" : `${hhmm(r.inicio)}–${hhmm(r.fim)}`;
  const extras = r.participantes.length - 4;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
      <div className="w-24 shrink-0 text-sm font-medium tabular-nums text-white">{horario}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {r.titulo}
          {r.recorrente && <span className="ml-1.5 text-[11px]" style={{ color: MUTED }} title="Evento recorrente">↻</span>}
        </p>
        {r.participantes.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1">
            {r.participantes.slice(0, 4).map((p, i) => <Avatar key={p.email ?? i} nome={p.nome} />)}
            {extras > 0 && <span className="ml-1 text-[11px]" style={{ color: MUTED }}>+{extras}</span>}
          </div>
        )}
      </div>
      {r.linkMeet && (
        <a
          href={r.linkMeet}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: YELLOW, color: INK }}
        >
          Entrar no Meet
        </a>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((g) => (
        <div key={g}>
          <div className="mb-3 h-4 w-48 animate-pulse rounded motion-reduce:animate-none" style={{ background: CARD }} />
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse motion-reduce:animate-none" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Reunioes() {
  const { reunioes, erro } = useAgenda();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Pautas e Reuniões</h1>
        <p className="text-[13px]" style={{ color: MUTED }}>Próximos {DIAS} dias · agenda da Influência.</p>
      </div>

      {erro ? (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "#2a1414", color: TEMA.negativo }}>
          Não foi possível carregar a agenda: {erro}
        </div>
      ) : !reunioes ? (
        <Skeleton />
      ) : reunioes.length === 0 ? (
        <div className="rounded-xl px-4 py-8 text-center text-[13px]" style={{ background: CARD, border: `1px solid ${LINE}`, color: MUTED }}>
          Nenhuma reunião nos próximos {DIAS} dias.
        </div>
      ) : (
        <ListaPorDia reunioes={reunioes} />
      )}
    </div>
  );
}

function ListaPorDia({ reunioes }: { reunioes: Reuniao[] }) {
  const { hoje, amanha } = chavesHojeAmanha();
  // Agrupa preservando a ordem (reunioes já vêm ordenadas por início).
  const grupos = new Map<string, Reuniao[]>();
  for (const r of reunioes) {
    const k = chaveDia(r.inicio);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(r);
  }

  return (
    <div className="space-y-8">
      {[...grupos.entries()].map(([chave, itens]) => (
        <div key={chave}>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider" style={{ color: chave === hoje ? YELLOW : MUTED }}>
            {rotuloDia(itens[0].inicio, chave, hoje, amanha)}
          </h2>
          <div className="space-y-2">
            {itens.map((r) => <CardReuniao key={r.id} r={r} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
