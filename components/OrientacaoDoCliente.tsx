"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buscarHistorico } from "@/lib/useOrientacoes";
import { mensagemErro } from "@/lib/erros";
import { estiloDe } from "@/lib/semaforo";
import { haQuanto } from "@/lib/tempo";
import { TEMA } from "@/lib/brand";
import { EntradaOrientacao } from "@/lib/types";

const MUTED = TEMA.muted;

/**
 * A orientação de UM cliente, para o modal do Dashboard.
 *
 * ⚠️ O PEDIDO era não sair da tela: clicar no balão levava para a /orientacoes
 * inteira, e quem estava lendo a tabela perdia a posição, o período selecionado e
 * a rolagem. Ver a orientação de um cliente não deveria custar a sessão de leitura.
 *
 * ⚠️ CUSTO: a orientação ATUAL vem de graça — o Dashboard já carregou o mapa
 * inteiro (é assim que ele sabe desenhar o balão). Só o HISTÓRICO custa, e por
 * isso ele é buscado ao abrir, não junto com a tabela: são 55 docs na coleção e
 * ninguém abre 55 modais.
 */
export default function OrientacaoDoCliente({
  accountId, atual,
}: {
  accountId: string;
  atual: EntradaOrientacao | null;
}) {
  const [historico, setHistorico] = useState<EntradaOrientacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setHistorico(null);
    setErro(null);
    buscarHistorico(accountId)
      .then((h) => { if (vivo) setHistorico(h); })
      .catch((e) => { if (vivo) setErro(mensagemErro((e as Error)?.message ?? String(e))); });
    return () => { vivo = false; };
  }, [accountId]);

  if (!atual) {
    return (
      <div>
        <p className="rounded-lg px-4 py-3 text-[12.5px]" style={{ background: TEMA.chip, color: MUTED }}>
          Esta conta ainda não tem orientação escrita.
        </p>
        <LinkParaGerenciar />
      </div>
    );
  }

  const e = estiloDe(atual.semaforo ?? null);
  // ⚠️ O histórico VEM COM a atual dentro; a lista abaixo mostra só o que veio antes.
  const anteriores = (historico ?? []).filter((h) => h.em !== atual.em);

  return (
    <div>
      {/* ================= A ATUAL ================= */}
      <div className="px-5 py-4" style={{ background: TEMA.card, border: `1px solid ${TEMA.borda}`, borderRadius: TEMA.raioCard }}>
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          {/* ⚠️ O selo traz o RÓTULO em texto, não só a cor: cor sozinha não
              sobrevive a daltonismo nem a print em preto e branco. */}
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: e.fundo, color: e.cor }}
            title={e.descricao}
          >
            {e.rotulo}
          </span>
          <span className="text-[11.5px]" style={{ color: MUTED }}>
            {atual.autor} · {haQuanto(atual.em)}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: TEMA.texto }}>
          {atual.texto}
        </p>
      </div>

      {/* ⚠️ SEMÁFORO ≠ ALERTA DE CPL, e o modal repete isso porque aqui ele aparece
          sozinho, sem a tabela ao lado onde os dois convivem rotulados. */}
      <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
        O selo é o <b style={{ color: TEMA.texto }}>julgamento de quem escreveu</b>, não o alerta
        automático de CPL — os dois podem discordar, e discordar não é erro de nenhum dos dois.
      </p>

      {/* ================= HISTÓRICO ================= */}
      <div className="mt-5">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: MUTED }}>
          Antes desta
        </div>

        {erro ? (
          <p className="rounded-lg px-4 py-3 text-[12.5px]" style={{ background: TEMA.erroFundo, color: TEMA.negativo }}>
            {erro}
          </p>
        ) : historico === null ? (
          <div className="h-14 animate-pulse motion-reduce:animate-none" style={{ background: TEMA.hover, borderRadius: TEMA.raioCard }} />
        ) : anteriores.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: MUTED }}>
            Esta é a primeira orientação desta conta.
          </p>
        ) : (
          <div className="space-y-2">
            {anteriores.map((h) => {
              const eh = estiloDe(h.semaforo ?? null);
              return (
                <div
                  key={h.em}
                  className="px-4 py-3"
                  style={{ background: TEMA.zebra, border: `1px solid ${TEMA.borda}`, borderRadius: TEMA.raioCard }}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: eh.fundo, color: eh.cor }}>
                      {eh.rotulo}
                    </span>
                    <span className="text-[11px]" style={{ color: MUTED }}>{h.autor} · {haQuanto(h.em)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
                    {h.texto}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <LinkParaGerenciar />
    </div>
  );
}

/**
 * ⚠️ O modal é SÓ LEITURA, de propósito. Escrever orientação tem seletor de
 * semáforo, validação e histórico que se empilha — replicar isso numa janela
 * sobreposta duplicaria o formulário e criaria duas verdades sobre como se
 * escreve. Quem quer editar vai para a tela que já faz isso bem.
 */
function LinkParaGerenciar() {
  return (
    <Link
      href="/orientacoes"
      className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] underline underline-offset-2 transition hover:brightness-125"
      style={{ color: TEMA.ouroTexto }}
    >
      Escrever ou editar em Orientações →
    </Link>
  );
}
