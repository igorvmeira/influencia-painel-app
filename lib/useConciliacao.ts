"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import type { Pendencia, TrocaGestor, SugestaoGestor, Criacao } from "./conciliaPlanilha";
import type { DiagnosticoAba } from "./planilhaGerencial";

/**
 * ⚠️ TETO EM TUDO. A conciliação lê a planilha viva, o Firestore e sonda a Meta —
 * três fontes de rede numa chamada só. Sem `AbortController` a tela pode ficar em
 * "Carregando…" para sempre: `fetch` não tem timeout, a promessa nunca settla, o
 * `.catch` nunca roda, e espera eterna parece que o sistema ainda está trabalhando.
 *
 * ⚠️ E AQUI O TETO EM MÉTODO DE ESCRITA É LEGÍTIMO, ao contrário do caso geral: as
 * três aplicações são idempotentes por construção. `planilha.*` é um `set` com merge
 * do objeto inteiro; a criação usa docId determinístico (= accountId); e a troca de
 * gestor, que é a única que EMPILHA (append-only), só é enviada quando o plano da
 * prévia a listou — reenviar depois de uma resposta perdida encontra o gestor já
 * trocado e a troca deixa de existir no plano seguinte.
 */
const TETO_MS = 60000;

export interface RespostaConciliacao {
  ok: boolean;
  modo: "previa" | "aplicar";
  chamador: "cron" | "pessoa";
  /** ⚠️ Três datas, nunca uma — planilha, painel e sondagem envelhecem separado. */
  lidaEmPlanilha: string;
  lidaEmPainel: string;
  sondadasEm: string;
  janelaGestor: { de: string | null; ate: string };
  planilha: { titulo: string; abasIgnoradas: { aba: string; motivo: string }[] };
  estrutura: DiagnosticoAba[];
  resumo: {
    linhasLidas: number;
    atualizacoes: number;
    inalteradas: number;
    trocasGestor: number;
    criacoes: number;
    sugestoesGestor: number;
    pendencias: number;
    foraDeOperacao: number;
    semLinhaNaPlanilha: number;
    gravadas: number;
  };
  conferencia: {
    mensagem: string;
    documentosConferidos: number;
    deUmTotalDe: number;
    comBlocoPlanilha: number;
  } | null;
  atualizacoes: { accountId: string; cliente: string; campos: string[] }[];
  trocasGestor: TrocaGestor[];
  criacoes: Criacao[];
  sugestoesGestor: SugestaoGestor[];
  pendencias: Pendencia[];
  foraDeOperacao: { accountId: string; cliente: string }[];
  semLinhaNaPlanilha: { accountId: string; cliente: string; gestor: string }[];
}

async function chamar(query: string): Promise<RespostaConciliacao> {
  const u = auth?.currentUser;
  if (!u) throw new Error("Sessão expirada. Faça login novamente.");
  const token = await u.getIdToken();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TETO_MS);
  try {
    const r = await fetch(`/api/sync-planilha${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    const j = await r.json();
    // ⚠️ O 403 sobe com a MENSAGEM da rota, e a tela decide o desenho pelo texto —
    // é o que faz bloqueio sair em painel neutro e pane sair em vermelho.
    if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
    return j as RespostaConciliacao;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error(
        `O servidor não respondeu em ${Math.round(TETO_MS / 1000)}s. Se você mandou aplicar, `
        + "a gravação pode ter acontecido — recarregue antes de tentar de novo."
      );
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export const carregarPrevia = () => chamar("");
export const aplicarCampos = () => chamar("?aplicar=1");
export const aplicarGestor = () => chamar("?aplicarGestor=1");
export const aplicarCriacao = () => chamar("?aplicarCriacao=1");

export function useConciliacao(): {
  dados: RespostaConciliacao | null;
  erro: string | null;
  carregando: boolean;
  recarregar: () => Promise<void>;
  aplicar: (d: RespostaConciliacao) => void;
} {
  const [dados, setDados] = useState<RespostaConciliacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await carregarPrevia());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { dados, erro, carregando, recarregar, aplicar: setDados };
}
