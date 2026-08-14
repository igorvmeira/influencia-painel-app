"use client";

import { useMemo, useState } from "react";
import { ContaMap } from "@/lib/types";
import { useContas, salvarGestor } from "@/lib/useContas";
import { OPCOES_GESTOR, PAUSADO } from "@/lib/gestores";
import { TEMA } from "@/lib/brand";

const CARD = TEMA.card;
const INK = TEMA.fundo;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const YELLOW = TEMA.destaque;
const GREEN = TEMA.positivo;
const RED = TEMA.negativo;
const AMBER = TEMA.atencao;

// Carimbo "editado por X em DD/MM" (tolera Timestamp serializado {_seconds}, ISO ou nada).
function carimboTexto(c: ContaMap): string | null {
  const por = c.gestorEditadoPor;
  const em = c.gestorEditadoEm as unknown;
  if (!por && !em) return null;
  let quando = "";
  const secs = em && typeof em === "object" && "_seconds" in (em as object) ? (em as { _seconds: number })._seconds : null;
  const d = secs ? new Date(secs * 1000) : typeof em === "string" ? new Date(em) : null;
  if (d && !isNaN(d.getTime())) quando = ` em ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return por ? `editado por ${por}${quando}` : `editado${quando}`;
}

export default function Carteira() {
  const { contas, erro } = useContas();
  const [busca, setBusca] = useState("");
  const [gestorSel, setGestorSel] = useState("todos");
  // Padrão: só ATIVAS (pedido da agência, 16/08/2026). A carteira tem 39 pausadas
  // de 117, e elas empurravam para baixo o que se opera todo dia.
  const [incluirPausadas, setIncluirPausadas] = useState(false);

  // Os três filtros compõem: pausadas, gestor e busca. Separado em duas etapas só
  // para o contador de ocultas ser HONESTO — ele conta as pausadas que sobreviveram
  // aos OUTROS filtros, não as 39 do total. Com "ANDRÉ" selecionado, "39 pausadas
  // ocultas" seria mentira: as pausadas dele são outras.
  const { listaFiltrada, pausadasOcultas } = useMemo(() => {
    if (!contas) return { listaFiltrada: [], pausadasOcultas: 0 };
    const q = busca.trim().toLowerCase();
    const semFiltroDePausa = contas
      .filter((c) => (gestorSel === "todos" || c.gestor === gestorSel) && c.cliente.toLowerCase().includes(q))
      .sort((a, b) => a.cliente.localeCompare(b.cliente));
    return {
      listaFiltrada: incluirPausadas ? semFiltroDePausa : semFiltroDePausa.filter((c) => !c.pausado),
      pausadasOcultas: incluirPausadas ? 0 : semFiltroDePausa.filter((c) => c.pausado).length,
    };
  }, [contas, busca, gestorSel, incluirPausadas]);

  const carregando = !contas && !erro;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-brand-ink">Carteira de Contas</h1>
        <p className="text-[13px]" style={{ color: MUTED }}>
          Contas ATIVAS por gestor. Edite o responsável; o histórico é datado e nada é apagado.
          O status (ativa/pausada) é só leitura aqui.
        </p>
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
              {OPCOES_GESTOR.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <span className="text-[12px]" style={{ color: MUTED }}>{listaFiltrada.length} conta(s)</span>

            {/* O toggle fica VISÍVEL mesmo sem pausadas no recorte: um filtro ligado
                que não se anuncia faz o usuário procurar uma conta que a tela decidiu
                esconder. Quando não há o que ocultar, ele aparece sem o contador. */}
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: TEMA.texto }}>
              <input
                type="checkbox"
                checked={incluirPausadas}
                onChange={(e) => setIncluirPausadas(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer"
                style={{ accentColor: YELLOW }}
              />
              Mostrar pausadas
              {pausadasOcultas > 0 && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
                  style={{ background: TEMA.chip, color: MUTED }}
                  title="Contas pausadas escondidas por este filtro, já considerando o gestor e a busca ativos."
                >
                  {pausadasOcultas} oculta{pausadasOcultas === 1 ? "" : "s"}
                </span>
              )}
            </label>
          </div>

          <div className="space-y-2">
            {listaFiltrada.map((c, i) => (
              <LinhaConta key={c.accountId} conta={c} ordem={i + 1} />
            ))}
            {listaFiltrada.length === 0 && (
              <p className="text-[13px]" style={{ color: MUTED }}>
                Nenhuma conta encontrada.
                {/* "Nada aqui" quando o filtro é que escondeu tudo manda procurar um
                    problema que não existe. Diz o motivo e o caminho de volta. */}
                {pausadasOcultas > 0 && ` ${pausadasOcultas} pausada${pausadasOcultas === 1 ? " está oculta" : "s estão ocultas"} — marque "Mostrar pausadas" para vê-la${pausadasOcultas === 1 ? "" : "s"}.`}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// NUMERAÇÃO (pedido do Roberto, 05/08/2026). Mesma regra nas três telas que numeram
// (/carteira, /gestores e a tabela de clientes do Dashboard): o número é a POSIÇÃO NA
// LISTA COMO ELA ESTÁ NA TELA — depois da busca, do filtro e da ordenação. Serve para
// contar e para achar a linha ("a 12ª"), não para identificar a conta: filtrar por um
// gestor renumera de 1 a N. O identificador estável continua sendo o accountId.
function LinhaConta({ conta, ordem }: { conta: ContaMap; ordem: number }) {
  // Gestor "vivo": estado local que reflete a última edição sem esperar re-render do cache.
  const [gestorAtual, setGestorAtual] = useState(conta.gestor);
  const [sel, setSel] = useState(conta.gestor);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const pausada = !!conta.pausado;
  // Divergência: o campo gestor diz PAUSADO mas a flag não (ou vice-versa). A flag é o
  // que REALMENTE controla rankings/alertas — por isso o aviso não é cosmético.
  const divergente = (gestorAtual === PAUSADO) !== pausada;
  const mudou = sel !== gestorAtual;

  // Garante que o valor atual apareça no dropdown mesmo se for um valor legado fora da lista.
  const opcoes = OPCOES_GESTOR.includes(gestorAtual) ? OPCOES_GESTOR : [gestorAtual, ...OPCOES_GESTOR];
  const carimbo = carimboTexto(conta);

  async function salvar() {
    if (!mudou || salvando) return;
    setSalvando(true);
    setErroLocal(null);
    try {
      const { gestor } = await salvarGestor(conta.accountId, sel);
      setGestorAtual(gestor);
      setSel(gestor);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    } catch (e) {
      setErroLocal((e as Error).message);
      setSel(gestorAtual); // desfaz a seleção pendente no erro
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="p-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Largura fixa para os nomes alinharem mesmo com 1, 2 ou 3 dígitos. */}
            <span className="w-6 shrink-0 text-right text-[11px] tabular-nums" style={{ color: MUTED }}>{ordem}</span>
            <p className="truncate text-sm font-medium text-brand-ink">{conta.cliente}</p>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
              style={pausada
                ? { background: TEMA.chip, color: MUTED }
                : { background: TEMA.positivoFundo, color: GREEN }}
            >
              {pausada ? "Pausada" : "Ativa"}
            </span>
          </div>
          {/* ml-8 = largura do número (w-6) + gap-2: alinha as sublinhas com o nome. */}
          <p className="ml-8 mt-1 text-[12px]" style={{ color: MUTED }}>
            {(conta.nicho && conta.nicho.trim()) || "Sem nicho"}
            {carimbo ? ` · ${carimbo}` : ""}
          </p>
          {divergente && (
            <p className="ml-8 mt-1 text-[11px]" style={{ color: AMBER }}>
              ⚠ gestor {gestorAtual === PAUSADO ? "= PAUSADO, mas a conta segue ATIVA" : "definido, mas a conta está PAUSADA"} — ajuste a flag no import/Console se preciso.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {salvo && <span className="text-[12px] font-medium" style={{ color: GREEN }}>✓ salvo</span>}
          {erroLocal && <span className="max-w-[180px] text-[12px]" style={{ color: RED }}>{erroLocal}</span>}
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            disabled={salvando}
            className="rounded-xl px-3 py-2 text-sm outline-none disabled:opacity-50"
            style={{ background: INK, color: TEMA.texto, border: `1px solid ${LINE}` }}
          >
            {opcoes.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          {mudou && (
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-40"
              style={{ background: YELLOW, color: TEMA.texto }}
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
