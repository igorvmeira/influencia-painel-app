"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";
import { useAuth } from "@/components/AuthProvider";

const INK = "#141414";
const CARD = "#1F1F1F";
const YELLOW = "#F6E003";
const LINE = "#2A2A2A";
const MUTED = "#9A968F";

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
    <main className="flex min-h-screen items-center justify-center px-4" style={{ background: INK }}>
      <div className="w-full max-w-sm rounded-2xl p-8" style={{ background: CARD }}>
        <div className="mb-8 flex items-center gap-2.5">
          <NodeMark />
          <span className="text-lg font-semibold text-white">Influência</span>
        </div>

        <h1 className="mb-1 text-xl font-semibold text-white">Entrar no painel</h1>
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
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none"
              style={{ background: INK, border: `1px solid ${LINE}` }}
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
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none"
              style={{ background: INK, border: `1px solid ${LINE}` }}
            />
          </label>

          {erro && <p className="text-[13px]" style={{ color: "#FF6B5E" }}>{erro}</p>}
          {!configurado && (
            <p className="text-[12px]" style={{ color: MUTED }}>
              Configure as variáveis NEXT_PUBLIC_FIREBASE_* para habilitar o login.
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="mt-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ background: YELLOW, color: INK }}
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}

function NodeMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="5" r="2.4" fill="#F6E003" />
      <circle cx="5.5" cy="16" r="2.4" fill="#F6E003" />
      <circle cx="18.5" cy="16" r="2.4" fill="#F6E003" />
      <path d="M12 6.5 L6.5 14.5 M12 6.5 L17.5 14.5 M7.5 16 L16.5 16" stroke="#F6E003" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
