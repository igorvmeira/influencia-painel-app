"use client";

import { useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { buscarJson } from "./buscaAutenticada";
import type { ConteudoFoto, FotoFechamento, ResumoFechamentos, ValorDaFoto } from "./fotoFechamento";

export interface RespostaFechamentos {
  ok: true;
  resumo: ResumoFechamentos;
  foto: FotoFechamento | null;
}

/** Resumo dos fechamentos + a foto atual do mês pedido. Custo: 1 leitura, 2 quando o mês tem foto. */
export function buscarFechamentos(mes: string): Promise<RespostaFechamentos> {
  return buscarJson<RespostaFechamentos>(`/api/fechamento?mes=${encodeURIComponent(mes)}`, { oQue: "o fechamento do mês" });
}

// Cache de SESSÃO por mês, para a Início — que abre todo dia e não pode pagar 1 a 2 leituras a cada
// volta à tela. Mesmo desenho do `useDadosPainel`: reseta num reload.
// ⚠️ Um fechamento feito em OUTRA sessão só aparece aqui depois de recarregar — a mesma idade do
// `/api/painel` em cache. Um fechamento feito NESTA sessão limpa o cache (`esquecerFechamentos`).
const cacheFechamentos = new Map<string, RespostaFechamentos>();
const emVooFechamentos = new Map<string, Promise<RespostaFechamentos>>();
let geracao = 0;

/**
 * Chamar depois de gravar uma versão. A geração impede que uma busca que já estava em voo ANTES da
 * gravação devolva ao cache a resposta velha ("sem fechamento") depois dela.
 */
export function esquecerFechamentos() {
  geracao++;
  cacheFechamentos.clear();
  emVooFechamentos.clear();
}

export function useFechamentosDoMes(mes: string | null): {
  resposta: RespostaFechamentos | null;
  erro: string | null;
  carregando: boolean;
} {
  const [estado, setEstado] = useState<{ mes: string; resposta: RespostaFechamentos | null; erro: string | null } | null>(
    () => (mes && cacheFechamentos.has(mes) ? { mes, resposta: cacheFechamentos.get(mes)!, erro: null } : null)
  );

  useEffect(() => {
    if (!mes) return;
    let vivo = true;
    const pronta = cacheFechamentos.get(mes);
    if (pronta) { setEstado({ mes, resposta: pronta, erro: null }); return; }
    const g = geracao;
    let voo = emVooFechamentos.get(mes);
    if (!voo) { voo = buscarFechamentos(mes); emVooFechamentos.set(mes, voo); }
    voo
      .then((r) => {
        if (g === geracao) { cacheFechamentos.set(mes, r); emVooFechamentos.delete(mes); }
        if (vivo) setEstado({ mes, resposta: r, erro: null });
      })
      .catch((e) => {
        if (g === geracao) emVooFechamentos.delete(mes);
        if (vivo) setEstado({ mes, resposta: null, erro: (e as Error).message });
      });
    return () => { vivo = false; };
  }, [mes]);

  // Resposta de outro mês não vale para este.
  const atual = estado && estado.mes === mes ? estado : null;
  return { resposta: atual?.resposta ?? null, erro: atual?.erro ?? null, carregando: !!mes && !atual };
}

export interface RespostaPrevia {
  ok: true;
  liberacao: { pode: boolean; motivo: string | null };
  conteudo: ConteudoFoto;
  assinatura: string;
  versaoAtual: number;
  exigeMotivo: boolean;
  valor: ValorDaFoto;
  /** A pessoa pode gravar (está na lista). A prévia abre para todo mundo; fechar, não. */
  podeGravar: boolean;
}

export class ErroFechamento extends Error {
  constructor(msg: string, public status: number) {
    super(msg);
    this.name = "ErroFechamento";
  }
}

/** Teto de 30s: a prévia monta o mês inteiro no servidor. */
const TETO_MS = 30000;

/**
 * POST da prévia e do fechamento.
 * ⚠️ TETO NUM POST QUE GRAVA, e pode: repetir o "fechar" depois de um abort não duplica a foto — o
 * servidor exige a versão que a prévia viu e CRIA o doc, então a repetição volta 409 (ver
 * `gravarVersao` em lib/fechamentoServidor.ts).
 */
export async function pedirFechamento<T>(corpo: Record<string, unknown>): Promise<T> {
  const usuario = auth?.currentUser;
  if (!usuario) throw new ErroFechamento("Sessão expirada. Faça login novamente.", 401);
  const token = await usuario.getIdToken();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TETO_MS);
  try {
    const r = await fetch("/api/fechamento", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new ErroFechamento(j?.erro || `Erro ${r.status}`, r.status);
    return j as T;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new ErroFechamento(`O servidor não respondeu em ${TETO_MS / 1000}s. Nada foi confirmado — reabra a prévia para ver se o mês foi fechado.`, 0);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}
