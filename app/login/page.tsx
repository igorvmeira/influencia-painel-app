"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";
import { useAuth } from "@/components/AuthProvider";
import { TEMA } from "@/lib/brand";
import NodeMark from "@/components/NodeMark";

// Tokens do tema (fonte única: lib/brand.ts). Antes esta tela redeclarava as
// cores como literais — e já divergia do token.
const FUNDO = TEMA.fundo;
const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;
const TEXTO = TEMA.texto;
const YELLOW = TEMA.destaque;

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, configurado } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Já logado? vai direto para o painel.
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!auth) { setErro("Autenticação não configurada."); return; }
    setEnviando(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
      router.replace("/");
    } catch {
      setErro("E-mail ou senha inválidos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4" style={{ background: FUNDO }}>
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: CARD, border: `1px solid ${LINE}`, boxShadow: TEMA.sombraCard }}
      >
        {/* Slot da logo: dimensionado para receber o SVG/PNG definitivo. */}
        <div className="mb-8 flex h-8 items-center gap-2.5">
          <NodeMark />
          <span className="text-lg font-semibold" style={{ color: TEXTO }}>Influência</span>
        </div>

        <h1 className="mb-1 text-xl font-semibold" style={{ color: TEXTO }}>Entrar no painel</h1>
        <p className="mb-6 text-[13px]" style={{ color: MUTED }}>Acesso restrito ao time interno.</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="text-[12px]" style={{ color: MUTED }}>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: FUNDO, color: TEXTO, border: `1px solid ${LINE}` }}
            />
          </label>
          <label className="text-[12px]" style={{ color: MUTED }}>
            Senha
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: FUNDO, color: TEXTO, border: `1px solid ${LINE}` }}
            />
          </label>

          {erro && <p className="text-[13px]" style={{ color: TEMA.negativo }}>{erro}</p>}
          {!configurado && (
            <p className="text-[12px]" style={{ color: MUTED }}>
              Configure as variáveis NEXT_PUBLIC_FIREBASE_* para habilitar o login.
            </p>
          )}

          {/* CTA dourado: preenchimento da marca + o texto ESCURO do token próprio.
              ⚠️ Nunca TEMA.texto aqui — no escuro ele é off-white e dá 1,60:1. */}
          <button
            type="submit"
            disabled={enviando}
            className="mt-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ background: YELLOW, color: TEMA.textoSobreDestaque }}
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
