"use client";

import { useMemo, useState } from "react";
import { ContaMap, EntradaOrientacao } from "@/lib/types";
import { useContas } from "@/lib/useContas";
import { useOrientacoes, salvarOrientacao, buscarHistorico } from "@/lib/useOrientacoes";
import { haQuanto } from "@/lib/tempo";
import { SEMAFOROS, estiloDe, type Semaforo } from "@/lib/semaforo";
import { TEMA } from "@/lib/brand";
import FormularioOrientacao from "./FormularioOrientacao";

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
        <h1 className="text-lg font-semibold text-brand-ink">Orientações Gerenciais</h1>
        <p className="text-[13px]" style={{ color: MUTED }}>Uma observação por conta, com histórico. Contas pausadas ficam fora.</p>
      </div>

      {erro ? (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.erroFundo, color: RED }}>
          {erro}
        </div>
      ) : carregando ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse motion-reduce:animate-none" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }} />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-brand-placeholder sm:w-64"
              style={{ background: CARD, color: TEMA.texto, border: `1px solid ${LINE}` }}
            />
            <select
              value={gestorSel}
              onChange={(e) => setGestorSel(e.target.value)}
              className="rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: CARD, color: TEMA.texto, border: `1px solid ${LINE}` }}
            >
              <option value="todos">Todos os gestores</option>
              {gestores.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="space-y-8">
            {gruposFiltrados.map(([gestor, contas]) => {
              // "Sem orientação" é o número acionável desta tela — é o que sobrou
              // para preencher. Vem junto da contagem para o grupo se explicar sozinho.
              const semOrientacao = contas.filter((c) => !mapa![c.accountId]).length;
              return (
                <div key={gestor}>
                  <h2 className="mb-3 flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                    {gestor}
                    <span className="font-normal normal-case tracking-normal">
                      · <span className="tabular-nums">{contas.length}</span> conta{contas.length === 1 ? "" : "s"}
                      {semOrientacao > 0 && (
                        <> · <span className="tabular-nums">{semOrientacao}</span> sem orientação</>
                      )}
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {contas.map((c, i) => (
                      <LinhaOrientacao key={c.accountId} conta={c} atual={mapa![c.accountId] ?? null} ordem={i + 1} aoSalvar={recarregar} />
                    ))}
                  </div>
                </div>
              );
            })}
            {gruposFiltrados.length === 0 && (
              <p className="text-[13px]" style={{ color: MUTED }}>Nenhuma conta encontrada.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// `ordem` é contador de LISTA, não posição de ranking: numera dentro do grupo do
// gestor, na ordem alfabética em que o grupo aparece, e a busca renumera. Mesma regra
// da /carteira e da tabela de clientes do Dashboard.
function LinhaOrientacao({ conta, atual, ordem, aoSalvar }: {
  conta: ContaMap; atual: EntradaOrientacao | null; ordem: number; aoSalvar: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  // Semáforo da EDIÇÃO em curso. Parte do que já está gravado; null = sem classificar.
  const [semaforo, setSemaforo] = useState<Semaforo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [histAberto, setHistAberto] = useState(false);
  const [hist, setHist] = useState<EntradaOrientacao[] | null>(null);
  const [carregandoHist, setCarregandoHist] = useState(false);

  function abrirEdicao() {
    setTexto(atual?.texto ?? "");
    // Parte do que já está classificado — reeditar o texto não deve zerar o
    // julgamento em silêncio. Se nunca teve, começa sem cor (cinza).
    setSemaforo(atual?.semaforo ?? null);
    setErroLocal(null);
    setEditando(true);
  }

  async function salvar() {
    const t = texto.trim();
    if (!t || salvando) return;
    setSalvando(true);
    setErroLocal(null);
    try {
      await salvarOrientacao(conta.accountId, t, semaforo);
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
    <div className="p-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-brand-ink">
            <span className="w-6 shrink-0 text-right text-[11px] font-normal tabular-nums" style={{ color: MUTED }}>{ordem}</span>
            <span className="truncate">{conta.cliente}</span>
            <SeloSemaforo s={atual?.semaforo ?? null} />
          </p>
          {/* ml-8 = largura do número (w-6) + gap-2: alinha o texto com o nome. */}
          {!editando && (
            <p className="ml-8 mt-1 whitespace-pre-wrap text-[13px]" style={{ color: atual ? TEMA.texto : MUTED }}>
              {atual ? atual.texto : "—"}
            </p>
          )}
          {!editando && atual && (
            <p className="ml-8 mt-1 text-[11px]" style={{ color: MUTED }}>
              atualizada {haQuanto(atual.em)}{atual.autor ? ` por ${atual.autor}` : ""}
            </p>
          )}
        </div>
        {!editando && (
          <div className="flex shrink-0 items-center gap-2">
            {salvo && <span className="text-[12px] font-medium" style={{ color: GREEN }}>✓ salvo</span>}
            <button
              onClick={abrirEdicao}
              className="rounded-full px-3 py-1.5 text-[12px] font-medium transition hover:brightness-125"
              // Mesmo motivo do seletor abaixo: é BOTÃO, então o limite vai em
              // `bordaForte`. O preenchimento recuado (`INK` sobre o card) separa
              // pouco no escuro — 1,12:1 — e sozinho não diz que é clicável.
              style={{ background: INK, color: TEMA.texto, border: `1px solid ${TEMA.bordaForte}` }}
            >
              {atual ? "Editar" : "Adicionar"}
            </button>
          </div>
        )}
      </div>

      {editando && (
        <div className="mt-3">
          {/* ⚠️ MESMO componente que o modal do Dashboard usa. Extraído em
              16/08/2026: dois formulários criariam duas verdades sobre como se
              escreve orientação, e é por isso que o modal podia ser só leitura
              antes. Com um só, escrever nos dois lugares é a mesma coisa. */}
          <FormularioOrientacao
            accountId={conta.accountId}
            inicial={atual}
            // A tela recarrega o mapa inteiro; o `aoSalvar` daqui não recebe a nova.
            aoSalvar={() => { setEditando(false); aoSalvar?.(); }}
            aoCancelar={() => setEditando(false)}
          />
        </div>
      )}

      <button onClick={alternarHistorico} className="mt-2 text-[12px] hover:text-brand-ink" style={{ color: MUTED }}>
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
                  <p className="whitespace-pre-wrap" style={{ color: TEMA.muted }}>{h.texto}</p>
                  <p className="flex items-center gap-1.5 text-[11px]" style={{ color: MUTED }}>
                    {haQuanto(h.em)}{h.autor ? ` · ${h.autor}` : ""}
                    {/* O histórico guarda o julgamento DA ÉPOCA — é ele que mostra
                        se a conta melhorou ou piorou entre uma orientação e outra. */}
                    <SeloSemaforo s={h.semaforo ?? null} />
                  </p>
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

/**
 * Selo do julgamento. Cinza = NÃO CLASSIFICADO, e o tooltip diz isso com todas as
 * letras — a cor sozinha faria "cinza" parecer "desempenho neutro", que é uma
 * afirmação que ninguém fez.
 *
 * ⚠️ NUNCA some. Um selo que desaparece quando não há classificação esconderia
 * justamente a informação útil: quantas contas ainda faltam ser julgadas.
 */
export function SeloSemaforo({ s }: { s: Semaforo | null }) {
  const e = estiloDe(s);
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
      style={{ background: e.fundo, color: e.cor, cursor: "help" }}
      title={e.descricao}
    >
      {s ? e.rotulo : "—"}
    </span>
  );
}

