"use client";

import { useMemo, useState } from "react";
import { ContaMap, EntradaOrientacao } from "@/lib/types";
import { useContas } from "@/lib/useContas";
import { useOrientacoes, salvarOrientacao, buscarHistorico } from "@/lib/useOrientacoes";
import { haQuanto } from "@/lib/tempo";
import { TEMA } from "@/lib/brand";

const CARD = TEMA.card;
const INK = TEMA.fundo;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const YELLOW = TEMA.destaque;
const GREEN = TEMA.positivo;
const RED = TEMA.negativo;
const MAX = 500;

export default function Orientacoes() {
  const { contas, erro: erroContas } = useContas();
  const { mapa, erro: erroOri, recarregar } = useOrientacoes();
  const [busca, setBusca] = useState("");
  const [gestorSel, setGestorSel] = useState("todos");

  const contasAtivas = useMemo(() => (contas ? contas.filter((c) => !c.pausado) : []), [contas]);
  const gestores = useMemo(() => [...new Set(contasAtivas.map((c) => c.gestor))].sort(), [contasAtivas]);

  const gruposFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtradas = contasAtivas.filter((c) =>
      (gestorSel === "todos" || c.gestor === gestorSel) && c.cliente.toLowerCase().includes(q)
    );
    const m = new Map<string, ContaMap[]>();
    for (const c of filtradas) (m.get(c.gestor) ?? m.set(c.gestor, []).get(c.gestor)!).push(c);
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([g, cs]) => [g, cs.sort((x, y) => x.cliente.localeCompare(y.cliente))] as const);
  }, [contasAtivas, busca, gestorSel]);

  const erro = erroContas || erroOri;
  const carregando = (!contas || !mapa) && !erro;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Orientações Gerenciais</h1>
        <p className="text-[13px]" style={{ color: MUTED }}>Uma observação por conta, com histórico. Contas pausadas ficam fora.</p>
      </div>

      {erro ? (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "#2a1414", color: RED }}>
          {erro}
        </div>
      ) : carregando ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse motion-reduce:animate-none" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }} />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-[#6b675f] sm:w-64"
              style={{ background: CARD, color: "#fff", border: `1px solid ${LINE}` }}
            />
            <select
              value={gestorSel}
              onChange={(e) => setGestorSel(e.target.value)}
              className="rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: CARD, color: "#fff", border: `1px solid ${LINE}` }}
            >
              <option value="todos">Todos os gestores</option>
              {gestores.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="space-y-8">
            {gruposFiltrados.map(([gestor, contas]) => (
              <div key={gestor}>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{gestor}</h2>
                <div className="space-y-2">
                  {contas.map((c) => (
                    <LinhaOrientacao key={c.accountId} conta={c} atual={mapa![c.accountId] ?? null} aoSalvar={recarregar} />
                  ))}
                </div>
              </div>
            ))}
            {gruposFiltrados.length === 0 && (
              <p className="text-[13px]" style={{ color: MUTED }}>Nenhuma conta encontrada.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LinhaOrientacao({ conta, atual, aoSalvar }: {
  conta: ContaMap; atual: EntradaOrientacao | null; aoSalvar: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [histAberto, setHistAberto] = useState(false);
  const [hist, setHist] = useState<EntradaOrientacao[] | null>(null);
  const [carregandoHist, setCarregandoHist] = useState(false);

  function abrirEdicao() {
    setTexto(atual?.texto ?? "");
    setErroLocal(null);
    setEditando(true);
  }

  async function salvar() {
    const t = texto.trim();
    if (!t || salvando) return;
    setSalvando(true);
    setErroLocal(null);
    try {
      await salvarOrientacao(conta.accountId, t);
      setEditando(false);
      setSalvo(true);
      setHist(null); // histórico muda; recarrega sob demanda
      await aoSalvar();
      setTimeout(() => setSalvo(false), 2500);
    } catch (e) {
      setErroLocal((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarHistorico() {
    const abrir = !histAberto;
    setHistAberto(abrir);
    if (abrir && hist === null) {
      setCarregandoHist(true);
      try {
        setHist(await buscarHistorico(conta.accountId));
      } catch {
        setHist([]);
      } finally {
        setCarregandoHist(false);
      }
    }
  }

  return (
    <div className="p-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{conta.cliente}</p>
          {!editando && (
            <p className="mt-1 whitespace-pre-wrap text-[13px]" style={{ color: atual ? "#fff" : MUTED }}>
              {atual ? atual.texto : "—"}
            </p>
          )}
          {!editando && atual && (
            <p className="mt-1 text-[11px]" style={{ color: MUTED }}>
              atualizada {haQuanto(atual.em)}{atual.autor ? ` por ${atual.autor}` : ""}
            </p>
          )}
        </div>
        {!editando && (
          <div className="flex shrink-0 items-center gap-2">
            {salvo && <span className="text-[12px] font-medium" style={{ color: GREEN }}>✓ salvo</span>}
            <button
              onClick={abrirEdicao}
              className="rounded-full px-3 py-1.5 text-[12px] font-medium"
              style={{ background: INK, color: "#fff", border: `1px solid ${LINE}` }}
            >
              {atual ? "Editar" : "Adicionar"}
            </button>
          </div>
        )}
      </div>

      {editando && (
        <div className="mt-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX))}
            rows={3}
            placeholder="Ex.: CPL levemente alto. Fazer mais 4 criativos."
            className="w-full rounded-lg px-3 py-2 text-[13px] outline-none placeholder:text-[#6b675f]"
            style={{ background: INK, color: "#fff", border: `1px solid ${LINE}` }}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px]" style={{ color: MUTED }}>{texto.length}/{MAX}</span>
            <div className="flex items-center gap-2">
              {erroLocal && <span className="text-[12px]" style={{ color: RED }}>{erroLocal}</span>}
              <button onClick={() => setEditando(false)} className="rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ color: MUTED }}>Cancelar</button>
              <button
                onClick={salvar}
                disabled={salvando || !texto.trim()}
                className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-40"
                style={{ background: YELLOW, color: INK }}
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={alternarHistorico} className="mt-2 text-[12px] hover:text-white" style={{ color: MUTED }}>
        {histAberto ? "Ocultar histórico" : "Ver histórico"}
      </button>
      {histAberto && (
        <div className="mt-2 border-t pt-2" style={{ borderColor: LINE }}>
          {carregandoHist ? (
            <p className="text-[12px]" style={{ color: MUTED }}>Carregando…</p>
          ) : hist && hist.length > 0 ? (
            <ul className="space-y-2">
              {hist.map((h, i) => (
                <li key={i} className="text-[12px]">
                  <p className="whitespace-pre-wrap" style={{ color: "#cfcbc3" }}>{h.texto}</p>
                  <p className="text-[11px]" style={{ color: MUTED }}>{haQuanto(h.em)}{h.autor ? ` · ${h.autor}` : ""}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px]" style={{ color: MUTED }}>Sem histórico anterior.</p>
          )}
        </div>
      )}
    </div>
  );
}
