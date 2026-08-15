"use client";

import { auth } from "./firebaseClient";

/**
 * Busca autenticada com TETO DE ESPERA — o helper que todos os ganchos usam.
 *
 * ⚠️⚠️ POR QUE O TETO EXISTE: `fetch` NÃO tem timeout. Se o servidor aceita a
 * conexão e nunca responde, a promessa **nunca settla** — nem resolve nem
 * rejeita. O `.catch` do gancho nunca roda, `carregando` fica `true` para sempre,
 * e a tela mostra "Carregando…" indefinidamente **sem nunca dizer que falhou**.
 *
 * Isso é o oposto de degradar com elegância, e o modo de falha é traiçoeiro:
 * erro visível é recuperável — a pessoa recarrega, avisa alguém, tenta depois.
 * **Carregamento eterno parece que o sistema ainda está trabalhando**, e quem
 * olha espera por algo que não vem. No /dashboard, que é a tela que a agência
 * mais usa, isso passaria meses por "hoje está lento".
 *
 * ⚠️ E o AbortController é a ÚNICA forma de conseguir isso: não existe opção de
 * timeout no `fetch`, e um `Promise.race` deixaria a requisição original correndo
 * solta em segundo plano.
 */

/** 20s. Acima disto, qualquer tela nossa já é experiência ruim — melhor falhar. */
export const TETO_PADRAO_MS = 20000;

export class ErroDeRede extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ErroDeRede";
  }
}

/**
 * Faz GET autenticado com ID token do Firebase e devolve o JSON já validado.
 * Lança com mensagem legível — nunca deixa passar `"The user aborted a request"`,
 * que não diz nada a quem lê a tela.
 */
export async function buscarJson<T>(
  rota: string,
  { tetoMs = TETO_PADRAO_MS, oQue = "os dados" }: { tetoMs?: number; oQue?: string } = {}
): Promise<T> {
  const usuario = auth?.currentUser;
  if (!usuario) throw new ErroDeRede("Sessão expirada. Faça login novamente.");
  const token = await usuario.getIdToken();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), tetoMs);
  try {
    const r = await fetch(rota, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new ErroDeRede(j?.erro || `Erro ${r.status}`);
    return j as T;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new ErroDeRede(
        `O servidor não respondeu em ${Math.round(tetoMs / 1000)}s ao buscar ${oQue}. `
        + "Pode estar indisponível — tente recarregar."
      );
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}
