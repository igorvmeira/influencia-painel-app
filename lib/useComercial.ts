"use client";

import { useEffect, useState } from "react";
import { auth } from "./firebaseClient";
import { mensagemErro } from "./erros";
import type { AgregadoComercial } from "./comercialAgregado";

/** Cache de sessão — o agregado só muda quando o sync roda, então trocar de aba
 *  e voltar não refaz a busca. Mesmo padrão do useContas. */
let cache: AgregadoComercial | null = null;
let carregou = false;
let emVoo: Promise<AgregadoComercial | null> | null = null;

/**
 * ⚠️ TETO DE ESPERA. `fetch` não tem timeout: se o servidor aceita a conexão e
 * nunca responde, a promessa **nunca settla** — nem resolve nem rejeita — e a
 * tela fica em "Carregando…" para sempre, sem nunca dizer que falhou.
 *
 * Isso é o oposto de degradar com elegância: um erro visível é recuperável (o
 * usuário recarrega, avisa alguém); um carregamento eterno parece que o sistema
 * ainda está trabalhando, e a pessoa espera indefinidamente.
 */
const TETO_MS = 20000;

async function buscar(): Promise<AgregadoComercial | null> {
  const usuario = auth?.currentUser;
  if (!usuario) throw new Error("Sessão expirada. Faça login novamente.");
  const token = await usuario.getIdToken();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TETO_MS);
  try {
    const r = await fetch("/api/comercial/funil", {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j?.erro || `Erro ${r.status}`);
    return (j.agregado ?? null) as AgregadoComercial | null;
  } catch (e) {
    // A mensagem do abort ("The user aborted a request") não diz nada a quem lê.
    if ((e as Error)?.name === "AbortError") {
      throw new Error(
        `O servidor não respondeu em ${TETO_MS / 1000}s. O funil pode estar indisponível — tente recarregar.`
      );
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export function useComercial(): {
  agregado: AgregadoComercial | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
} {
  const [agregado, setAgregado] = useState<AgregadoComercial | null>(cache);
  const [carregando, setCarregando] = useState(!carregou);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (carregou) { setCarregando(false); return; }
    let vivo = true;
    setErro(null);
    setCarregando(true);
    emVoo = emVoo ?? buscar();
    emVoo
      .then((a) => {
        cache = a; carregou = true;
        if (vivo) { setAgregado(a); setCarregando(false); }
      })
      .catch((e) => {
        // ⚠️ Zera a promessa compartilhada: sem isso, a falha ficaria memorizada
        // no módulo e o "tentar de novo" reanexaria à MESMA promessa já rejeitada,
        // repetindo o erro sem tocar na rede.
        emVoo = null;
        if (vivo) { setErro(mensagemErro(e)); setCarregando(false); }
      });
    return () => { vivo = false; };
  }, [tentativa]);

  return { agregado, carregando, erro, recarregar: () => setTentativa((t) => t + 1) };
}
