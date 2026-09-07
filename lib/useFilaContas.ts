"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { buscarJson } from "./buscaAutenticada";
import { CandidataFila } from "./filaContas";

export interface RespostaFila {
  geradoEm: string | null;
  diasGasto: number | null;
  totalListadas: number | null;
  jaCadastradas: number | null;
  erroDescoberta: string | null;
  cortadasPeloTeto: number;
  motivoCorte: "teto" | "tempo" | null;
  candidatas: CandidataFila[];
  ignoradas: { accountId: string; por: string; em: string; motivo?: string | null }[];
}

/**
 * ⚠️ TETO DE ESPERA EM TODAS AS AÇÕES DESTA TELA — inclusive nos POSTs, e isso é
 * exceção à regra da casa ("teto em POST só com escrita idempotente"). Aqui a
 * condição é atendida, ação por ação:
 *
 *   · procurar ......... reescreve a FOTO `sistema/filaContas` (set sem merge)
 *   · ignorar .......... grava uma chave num mapa, sempre a mesma
 *   · desfazerIgnorar .. remove essa chave
 *   · cadastrar ........ docId DETERMINÍSTICO (= accountId), set com merge
 *
 * Nenhuma empilha nada — ao contrário de `salvarOrientacao`, que acrescenta ao
 * histórico e por isso segue sem teto. Repetir qualquer uma delas produz o mesmo
 * estado final.
 *
 * A única aspereza é no `cadastrar`: se a resposta se perder depois da gravação, a
 * retentativa devolve 409 "esta conta já está cadastrada" — que é desagradável de
 * ler e VERDADE. Vale mais que a alternativa, que é a tela travar em "Cadastrando…"
 * para sempre sem nunca dizer que falhou.
 */
const TETO_ACAO_MS = 30000;
/** A busca sob demanda fala com o Meta; o servidor já se corta em 8s. */
const TETO_PROCURAR_MS = 40000;

/**
 * ⚠️ O ERRO CARREGA O CORPO INTEIRO, e não só a frase.
 *
 * `new Error(j.erro)` jogava fora tudo o que a rota manda junto — `oQueFazer`,
 * `metaErro` (código cru da Meta) e `ignorada` (o motivo de quem dispensou a conta).
 * Enquanto só existia "cadastrar" isso não custava nada, porque a recusa cabia numa
 * linha. O cadastro por id colado recusa por TRÊS motivos diferentes, e dois deles
 * mandam a pessoa fazer coisas diferentes — encurtar para o título traria de volta o
 * problema que a classificação foi feita para resolver.
 */
export class ErroFila extends Error {
  detalhe: Record<string, unknown>;
  constructor(msg: string, detalhe: unknown) {
    super(msg);
    this.name = "ErroFila";
    this.detalhe = (detalhe ?? {}) as Record<string, unknown>;
  }
}

/**
 * A chamada CRUA: devolve o corpo inteiro da resposta.
 *
 * ⚠️ `acaoFila` existe em cima desta e devolve `RespostaFila | null` porque as ações
 * antigas só precisavam saber "deu certo". O cadastro por id colado precisa dos campos
 * do sucesso também — `nomeNaMeta`, `moeda`, `gasto`, e principalmente a lápide, que é
 * um AVISO exibido depois de a conta já ter entrado.
 */
export async function acaoFilaBruto(
  corpo: Record<string, unknown>,
  { tetoMs = TETO_ACAO_MS }: { tetoMs?: number } = {}
): Promise<Record<string, unknown>> {
  const u = auth?.currentUser;
  if (!u) throw new Error("Sessão expirada. Faça login novamente.");
  const token = await u.getIdToken();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), tetoMs);
  try {
    const r = await fetch("/api/fila-contas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new ErroFila(j?.erro || `Erro ${r.status}`, j);
    return j as Record<string, unknown>;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error(
        `O servidor não respondeu em ${Math.round(tetoMs / 1000)}s. A ação pode ter sido `
        + "gravada mesmo assim — recarregue a tela antes de tentar de novo."
      );
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Envelope compativel com as acoes antigas: "procurar" ja devolve a fila nova. */
export async function acaoFila(
  corpo: Record<string, unknown>,
  opts: { tetoMs?: number } = {}
): Promise<RespostaFila | null> {
  const j = await acaoFilaBruto(corpo, opts);
  return (j.candidatas ? (j as unknown as RespostaFila) : null);
}

/** Busca sob demanda ("procurar agora"): fala com o Meta e reescreve a fila. */
export const procurarAgora = () => acaoFila({ acao: "procurar" }, { tetoMs: TETO_PROCURAR_MS });

export function useFilaContas(): {
  fila: RespostaFila | null;
  erro: string | null;
  recarregar: () => Promise<void>;
  aplicar: (nova: RespostaFila) => void;
} {
  const [fila, setFila] = useState<RespostaFila | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setFila(await buscarJson<RespostaFila>("/api/fila-contas", { oQue: "a fila de contas" }));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { fila, erro, recarregar, aplicar: setFila };
}
