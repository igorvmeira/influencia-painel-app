"use client";

import { useState } from "react";
import { buscarJson } from "@/lib/buscaAutenticada";
import { mensagemErro } from "@/lib/erros";
import { brl, brlDec, num } from "@/lib/format";
import { TEMA } from "@/lib/brand";
import { ContaMap, Criativo } from "@/lib/types";

const MUTED = TEMA.muted;

/**
 * Criativos de UMA conta, carregados SÓ NO CLIQUE.
 *
 * ⚠️ É A ÚNICA PARTE DO MODAL QUE CUSTA. Todo o resto sai do `/api/painel`, que a
 * sessão já tem; criativo é consulta à Marketing API. O Roberto abre o modal para
 * ver CPL e gasto na maioria das vezes — cobrar uma chamada à Meta por abertura
 * seria pagar sempre por algo que ele quer às vezes.
 *
 * ⚠️ DUAS ROTAS, E A ESCOLHA É POR MÊS FECHADO:
 *   · mês FECHADO → `/api/criativos-mes`, com cache PERMANENTE por (conta, mês).
 *     Grátis a partir da segunda visita, para sempre.
 *   · período rolante ou mês corrente → `/api/criativos` ao vivo, sem cache.
 * A guarda de "mês fechado" vive no servidor — cachear mês em andamento
 * congelaria um número que ainda ia mudar.
 */
export default function CriativosDaConta({ conta, dias }: { conta: ContaMap; dias: number }) {
  const [estado, setEstado] = useState<"inicial" | "carregando" | "pronto" | "erro">("inicial");
  const [criativos, setCriativos] = useState<Criativo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [doCache, setDoCache] = useState(false);

  // Mês fechado = o anterior ao corrente. É o único que pode vir do cache.
  const hoje = new Date();
  const ant = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const anoFechado = ant.getFullYear();
  const mesFechado = ant.getMonth() + 1;

  async function carregar(usarMesFechado: boolean) {
    setEstado("carregando");
    setErro(null);
    try {
      if (usarMesFechado) {
        const j = await buscarJson<{ criativos: Criativo[]; doCache?: boolean }>(
          `/api/criativos-mes?accountId=${encodeURIComponent(conta.accountId)}&ano=${anoFechado}&mes=${mesFechado}`,
          { tetoMs: 45000, oQue: "os criativos do mês fechado" }
        );
        setCriativos(j.criativos ?? []);
        setDoCache(!!j.doCache);
      } else {
        const j = await buscarJson<{ criativos: Criativo[] }>(
          `/api/criativos?accountId=${encodeURIComponent(conta.accountId)}&dias=${dias}`,
          { tetoMs: 45000, oQue: "os criativos" }
        );
        setCriativos(j.criativos ?? []);
        setDoCache(false);
      }
      setEstado("pronto");
    } catch (e) {
      // `mensagemErro` recebe a string crua — o `buscarJson` já traduz o abort.
      setErro(mensagemErro((e as Error)?.message ?? String(e)));
      setEstado("erro");
    }
  }

  if (estado === "inicial") {
    return (
      <div className="px-5 py-4" style={{ background: TEMA.card, border: `1px solid ${TEMA.borda}`, borderRadius: TEMA.raioCard }}>
        <p className="mb-3 text-[12.5px]" style={{ color: MUTED }}>
          Consultar criativos chama a API da Meta. Escolha o recorte:
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button" onClick={() => carregar(true)}
            className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition hover:brightness-125"
            style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}
          >
            Mês fechado ({String(mesFechado).padStart(2, "0")}/{anoFechado}) · em cache
          </button>
          <button
            type="button" onClick={() => carregar(false)}
            className="rounded-full px-4 py-1.5 text-[12px] font-medium transition hover:brightness-125"
            style={{ background: "transparent", color: TEMA.texto, border: `1px solid ${TEMA.bordaForte}` }}
          >
            Últimos {dias} dias · ao vivo
          </button>
        </div>
        <p className="mt-2.5 text-[11.5px]" style={{ color: MUTED }}>
          O mês fechado fica em cache permanente — a partir da segunda vez não custa
          consulta nenhuma. O período rolante é sempre ao vivo.
        </p>
      </div>
    );
  }

  if (estado === "carregando") {
    return (
      <div className="h-24 animate-pulse motion-reduce:animate-none"
        style={{ background: TEMA.hover, borderRadius: TEMA.raioCard }} />
    );
  }

  if (estado === "erro") {
    return (
      <div className="rounded-lg px-4 py-3 text-[12.5px]" style={{ background: TEMA.erroFundo, color: TEMA.negativo }}>
        {erro}
        <button
          type="button" onClick={() => setEstado("inicial")}
          className="ml-3 underline underline-offset-2"
        >
          escolher de novo
        </button>
      </div>
    );
  }

  if (!criativos.length) {
    return (
      <p className="rounded-lg px-4 py-3 text-[12.5px]" style={{ background: TEMA.chip, color: MUTED }}>
        Nenhum criativo com gasto no recorte escolhido.
      </p>
    );
  }

  const ordenados = [...criativos].sort((a, b) => b.gasto - a.gasto).slice(0, 8);

  return (
    <div className="px-5 py-4" style={{ background: TEMA.card, border: `1px solid ${TEMA.borda}`, borderRadius: TEMA.raioCard }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px]" style={{ color: MUTED }}>
        <span>{ordenados.length} de {criativos.length} criativos, por gasto</span>
        {doCache && <span style={{ color: TEMA.positivo }}>✓ veio do cache — não custou consulta</span>}
      </div>
      <div className="space-y-2">
        {ordenados.map((c) => (
          // ⚠️ `key` é o adId, nunca o nome: nome de criativo se repete entre
          // campanhas e duplicaria linha (regra do CLAUDE.md).
          <div key={c.adId} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
            style={{ borderColor: TEMA.borda }}>
            <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: TEMA.texto }} title={c.adName}>
              {c.adName}
              {/* Ausente = NÃO SABEMOS, e nunca "pausado" — ver o tipo Criativo. */}
              {c.situacao === "pausado" && (
                <span className="ml-2 text-[10.5px]" style={{ color: MUTED }}>pausado</span>
              )}
            </span>
            <span className="shrink-0 text-[12px] tabular-nums" style={{ color: MUTED }}>{brl(c.gasto)}</span>
            <span className="shrink-0 text-[12px] tabular-nums" style={{ color: MUTED }}>{num(c.conversas)} conv</span>
            <span className="w-20 shrink-0 text-right text-[12.5px] font-medium tabular-nums" style={{ color: TEMA.texto }}>
              {c.conversas > 0 ? brlDec(c.cpl) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
