"use client";

import { useMemo, useState } from "react";
import { LinhaNicho } from "@/lib/types";
import { brl, brlDec, num, pct } from "@/lib/format";
import { TEMA } from "@/lib/brand";

// Cores lidas dos design tokens (fonte única em lib/brand.ts).
const INK = TEMA.fundo;
const CARD = TEMA.card;
const YELLOW = TEMA.destaque;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const GREEN = TEMA.positivo;
const RED = TEMA.negativo;

export default function NichosSection({ nichos }: { nichos: LinhaNicho[] }) {
  const nomes = nichos.map((n) => n.nicho);
  const [selNicho, setSelNicho] = useState(nomes[0] ?? "");
  const [nichoA, setNichoA] = useState(nomes[0] ?? "");
  const [nichoB, setNichoB] = useState(nomes[1] ?? nomes[0] ?? "");

  const maxCpl = useMemo(() => Math.max(1, ...nichos.map((n) => n.cpl)), [nichos]);

  if (nichos.length === 0) {
    return (
      <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: CARD, color: MUTED }}>
        Sem nichos para exibir.
      </div>
    );
  }

  const sel = nichos.find((n) => n.nicho === selNicho) ?? nichos[0];
  const nA = nichos.find((n) => n.nicho === nichoA) ?? nichos[0];
  const nB = nichos.find((n) => n.nicho === nichoB) ?? nichos[Math.min(1, nichos.length - 1)];

  return (
    <div className="flex flex-col gap-8">
      {/* 1) Ranking de nichos por CPL */}
      <div className="rounded-xl p-5" style={{ background: CARD }}>
        <div className="flex flex-col gap-4">
          {nichos.map((n, i) => {
            // Nichos vêm ordenados por CPL crescente: primeiro = melhor, último = pior.
            const melhor = i === 0;
            const pior = nichos.length > 1 && i === nichos.length - 1;
            const largura = Math.max(6, (n.cpl / maxCpl) * 100);
            const corBarra = pior ? RED : melhor ? YELLOW : "#3A3A3A";
            return (
              <div key={n.nicho} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex w-32 shrink-0 items-center gap-2 sm:w-44">
                  <span className="truncate text-sm text-white">{n.nicho}</span>
                  {melhor && (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase" style={{ background: YELLOW, color: INK }}>
                      melhor
                    </span>
                  )}
                  {pior && (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase" style={{ background: RED, color: INK }}>
                      pior
                    </span>
                  )}
                </div>
                <div className="order-last h-2.5 w-full overflow-hidden rounded-full sm:order-none sm:w-auto sm:flex-1" style={{ background: LINE }}>
                  <div className="h-full rounded-full" style={{ width: `${largura}%`, background: corBarra }} />
                </div>
                <div className="ml-auto flex shrink-0 flex-col items-end sm:ml-0 sm:w-44">
                  <span className="text-sm font-medium tabular-nums text-white">{brlDec(n.cpl)}</span>
                  <span className="text-[11px]" style={{ color: MUTED }}>
                    {n.clientesCount} {n.clientesCount === 1 ? "cliente" : "clientes"} · {brl(n.gasto)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2) Cliente vs média do próprio nicho */}
      <div>
        <p className="mb-3 text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>
          Cliente vs média do nicho
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {nichos.map((n) => {
            const ativo = n.nicho === sel.nicho;
            return (
              <button
                key={n.nicho}
                onClick={() => setSelNicho(n.nicho)}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors"
                style={ativo ? { background: YELLOW, color: INK } : { background: CARD, color: MUTED }}
              >
                {n.nicho}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl p-5" style={{ background: CARD }}>
          <div className="mb-4 flex items-center justify-between border-b pb-3" style={{ borderColor: LINE }}>
            <span className="text-sm text-white">
              Média do nicho <span className="font-semibold" style={{ color: YELLOW }}>{brlDec(sel.cpl)}</span>
            </span>
            <span className="text-[12px]" style={{ color: MUTED }}>
              {sel.clientesCount} {sel.clientesCount === 1 ? "cliente" : "clientes"} · {brl(sel.gasto)}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {sel.clientes.map((c) => {
              const acima = c.desvioPct > 0;
              const cor = c.desvioPct === 0 ? MUTED : acima ? RED : GREEN;
              const seta = c.desvioPct > 0 ? "▲" : c.desvioPct < 0 ? "▼" : "•";
              const rotulo = c.desvioPct === 0 ? "na média" : acima ? "acima" : "abaixo";
              return (
                <div key={c.accountId} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: cor }} />
                    <span className="text-sm text-white">{c.cliente}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm tabular-nums text-white">{brlDec(c.cpl)}</span>
                    <span className="inline-flex w-28 items-center justify-end gap-1 text-xs font-medium" style={{ color: cor }}>
                      <span style={{ fontSize: 9 }}>{seta}</span>
                      {pct(c.desvioPct)} {rotulo}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3) Comparação lado a lado entre dois nichos */}
      <div>
        <p className="mb-3 text-[13px] uppercase tracking-wider" style={{ color: MUTED }}>
          Comparar nichos
        </p>
        <div className="rounded-xl p-5" style={{ background: CARD }}>
          <div className="mb-5 grid grid-cols-2 gap-4">
            <Seletor valor={nichoA} onChange={setNichoA} opcoes={nomes} />
            <Seletor valor={nichoB} onChange={setNichoB} opcoes={nomes} />
          </div>
          <LinhaComp label="CPL médio" a={brlDec(nA.cpl)} b={brlDec(nB.cpl)} melhor={nA.cpl === nB.cpl ? 0 : nA.cpl < nB.cpl ? -1 : 1} />
          <LinhaComp label="Conversas" a={num(nA.conversas)} b={num(nB.conversas)} melhor={nA.conversas === nB.conversas ? 0 : nA.conversas > nB.conversas ? -1 : 1} />
          <LinhaComp label="Gasto" a={brl(nA.gasto)} b={brl(nB.gasto)} melhor={0} />
          <LinhaComp label="Clientes" a={String(nA.clientesCount)} b={String(nB.clientesCount)} melhor={0} ultima />
        </div>
      </div>
    </div>
  );
}

function Seletor({ valor, onChange, opcoes }: { valor: string; onChange: (v: string) => void; opcoes: string[] }) {
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
      style={{ background: INK, color: "#fff", border: `1px solid ${LINE}` }}
    >
      {opcoes.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

// melhor: -1 = coluna A melhor (amarelo), 1 = coluna B melhor, 0 = neutro.
function LinhaComp({ label, a, b, melhor, ultima }: {
  label: string; a: string; b: string; melhor: -1 | 0 | 1; ultima?: boolean;
}) {
  const corA = melhor === -1 ? YELLOW : "#fff";
  const corB = melhor === 1 ? YELLOW : "#fff";
  return (
    <div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2.5"
      style={ultima ? {} : { borderBottom: `1px solid ${LINE}` }}
    >
      <span className="text-right text-sm font-medium tabular-nums" style={{ color: corA }}>{a}</span>
      <span className="text-center text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>{label}</span>
      <span className="text-left text-sm font-medium tabular-nums" style={{ color: corB }}>{b}</span>
    </div>
  );
}
