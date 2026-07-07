"use client";

import { useEffect, useMemo, useState } from "react";
import { ContaMap, Criativo } from "@/lib/types";
import { brl, brlDec, num } from "@/lib/format";
import { auth } from "@/lib/firebaseClient";
import { TEMA } from "@/lib/brand";

// Cores lidas dos design tokens (fonte única em lib/brand.ts).
const INK = TEMA.fundo;
const CARD = TEMA.card;
const YELLOW = TEMA.destaque;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;

// Piso de conversas para um criativo entrar no ranking. Fácil de ajustar.
const PISO_CONVERSAS = 5;

const PERIODOS: { label: string; dias: number }[] = [
  { label: "7 dias", dias: 7 },
  { label: "15 dias", dias: 15 },
  { label: "30 dias", dias: 30 },
];

type Modo = "cliente" | "nicho";
const nichoDe = (n?: string) => (n && n.trim()) || "Sem nicho";

export default function CriativosSection(
  { contas, diasInicial }: { contas: ContaMap[]; diasInicial: number }
) {
  const opcoes = useMemo(
    () => [...contas].sort((a, b) => a.cliente.localeCompare(b.cliente)),
    [contas]
  );
  const nichos = useMemo(
    () => [...new Set(contas.map((c) => nichoDe(c.nicho)))].sort((a, b) => a.localeCompare(b)),
    [contas]
  );

  const [modo, setModo] = useState<Modo>("cliente");
  const [accountId, setAccountId] = useState("");
  const [nicho, setNicho] = useState("");
  const [dias, setDias] = useState(PERIODOS.some((p) => p.dias === diasInicial) ? diasInicial : 15);
  const [criativos, setCriativos] = useState<Criativo[]>([]);
  const [erros, setErros] = useState<{ accountId: string }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alvo = modo === "cliente" ? accountId : nicho;

  useEffect(() => {
    setErro(null);
    setErros([]);
    if (!alvo) { setCriativos([]); return; }

    let cancelado = false;
    setCarregando(true);
    const q = modo === "cliente"
      ? `accountId=${encodeURIComponent(accountId)}`
      : `nicho=${encodeURIComponent(nicho)}`;
    const url = `/api/criativos?${q}&dias=${dias}`;

    (async () => {
      const usuario = auth?.currentUser;
      if (!usuario) throw new Error("Sessão expirada. Faça login novamente.");
      const token = await usuario.getIdToken();
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
      return j as { criativos: Criativo[]; erros?: { accountId: string }[] };
    })()
      .then((j) => { if (!cancelado) { setCriativos(j.criativos); setErros(j.erros ?? []); } })
      .catch((e) => { if (!cancelado) { setErro(e.message); setCriativos([]); } })
      .finally(() => { if (!cancelado) setCarregando(false); });

    return () => { cancelado = true; };
  }, [modo, accountId, nicho, dias, alvo]);

  const ranqueados = useMemo(
    () => criativos.filter((c) => c.conversas >= PISO_CONVERSAS).sort((a, b) => a.cpl - b.cpl),
    [criativos]
  );
  const insuficientes = useMemo(
    () => criativos.filter((c) => c.conversas < PISO_CONVERSAS).sort((a, b) => b.gasto - a.gasto),
    [criativos]
  );

  const nomeCliente = opcoes.find((c) => c.accountId === accountId)?.cliente;
  const rotuloAlvo = modo === "cliente" ? nomeCliente : nicho;

  return (
    <div className="flex flex-col gap-6">
      {/* Modo: por cliente ou por nicho */}
      <div className="flex items-center gap-1 self-start rounded-full p-1" style={{ background: CARD }}>
        {(["cliente", "nicho"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
            style={modo === m ? { background: YELLOW, color: INK } : { background: "transparent", color: MUTED }}
          >
            {m === "cliente" ? "Por cliente" : "Por nicho"}
          </button>
        ))}
      </div>

      {/* Seletores: cliente/nicho + período */}
      <div className="flex flex-wrap items-center gap-3">
        {modo === "cliente" ? (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="min-w-[220px] rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: INK, color: "#fff", border: `1px solid ${LINE}` }}
          >
            <option value="">Selecione um cliente…</option>
            {opcoes.map((c) => (
              <option key={c.accountId} value={c.accountId}>{c.cliente}</option>
            ))}
          </select>
        ) : (
          <select
            value={nicho}
            onChange={(e) => setNicho(e.target.value)}
            className="min-w-[220px] rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: INK, color: "#fff", border: `1px solid ${LINE}` }}
          >
            <option value="">Selecione um nicho…</option>
            {nichos.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1 rounded-full p-1" style={{ background: CARD }}>
          {PERIODOS.map((p) => {
            const ativo = p.dias === dias;
            return (
              <button
                key={p.dias}
                onClick={() => setDias(p.dias)}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors"
                style={ativo ? { background: YELLOW, color: INK } : { background: "transparent", color: MUTED }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {carregando && <span className="text-[13px]" style={{ color: MUTED }}>Carregando ao vivo…</span>}
      </div>

      {/* Estados */}
      {!alvo ? (
        <div className="rounded-xl px-4 py-6 text-center text-[13px]" style={{ background: CARD, color: MUTED }}>
          {modo === "cliente"
            ? "Selecione um cliente para ver o ranking de criativos."
            : "Selecione um nicho para ranquear os criativos de todos os clientes dele."}
        </div>
      ) : erro ? (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "#2a1414", color: "#FF6B5E" }}>
          {erro}
        </div>
      ) : carregando ? (
        <div className="rounded-xl px-4 py-6 text-center text-[13px]" style={{ background: CARD, color: MUTED }}>
          {modo === "cliente"
            ? `Buscando criativos de ${rotuloAlvo} na Meta…`
            : `Buscando criativos do nicho ${rotuloAlvo} (várias contas) na Meta…`}
        </div>
      ) : criativos.length === 0 ? (
        <div className="rounded-xl px-4 py-6 text-center text-[13px]" style={{ background: CARD, color: MUTED }}>
          Nenhum anúncio retornado para {rotuloAlvo} nesse período.
        </div>
      ) : (
        <>
          {erros.length > 0 && (
            <div className="rounded-xl px-4 py-2.5 text-[12px]" style={{ background: "#2a2607", color: YELLOW }}>
              {erros.length} conta(s) do nicho falharam e foram ignoradas.
            </div>
          )}

          {/* Ranking (>= piso de conversas) */}
          <div className="rounded-xl p-4" style={{ background: CARD }}>
            <p className="mb-3 px-1 text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>
              Ranking · menor CPL primeiro
            </p>
            {ranqueados.length === 0 ? (
              <p className="px-1 py-3 text-[13px]" style={{ color: MUTED }}>
                Nenhum criativo com {PISO_CONVERSAS}+ conversas nesse período.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {ranqueados.map((c, i) => (
                  <LinhaCriativo key={`${c.adId}-${i}`} c={c} pos={i + 1} melhor={i === 0} />
                ))}
              </div>
            )}
          </div>

          {/* Volume insuficiente (sem posição) */}
          {insuficientes.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: CARD }}>
              <p className="mb-3 px-1 text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>
                Volume insuficiente · menos de {PISO_CONVERSAS} conversas
              </p>
              <div className="flex flex-col gap-2">
                {insuficientes.map((c, i) => (
                  <LinhaCriativo key={`${c.adId}-${i}`} c={c} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LinhaCriativo({ c, pos, melhor }: { c: Criativo; pos?: number; melhor?: boolean }) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg p-2.5"
      style={melhor ? { background: "rgba(246,224,3,0.10)", border: `1px solid ${YELLOW}` } : { background: INK }}
    >
      <div className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums" style={{ color: pos ? (melhor ? YELLOW : "#fff") : MUTED }}>
        {pos ?? "—"}
      </div>
      <Miniatura url={c.thumbnailUrl} />
      <div className="min-w-0 flex-1">
        {c.cliente && (
          <p className="truncate text-[11px] font-medium" style={{ color: YELLOW }}>{c.cliente}</p>
        )}
        <p className="truncate text-sm text-white" title={c.adName}>{c.adName}</p>
        <p className="text-[11px]" style={{ color: MUTED }}>{num(c.conversas)} conversas · {brl(c.gasto)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums" style={{ color: melhor ? YELLOW : "#fff" }}>
          {c.conversas > 0 ? brlDec(c.cpl) : "—"}
        </p>
        <p className="text-[11px]" style={{ color: MUTED }}>CPL</p>
      </div>
    </div>
  );
}

function Miniatura({ url }: { url: string | null }) {
  if (!url) {
    return <div className="h-12 w-12 shrink-0 rounded-md" style={{ background: "#2a2a2a" }} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" style={{ background: "#2a2a2a" }} />
  );
}
