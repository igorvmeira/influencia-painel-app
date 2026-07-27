"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";
import { useAuth } from "./AuthProvider";
import { TEMA } from "@/lib/brand";
import { MENU_PRINCIPAL, MENU_EM_BREVE } from "@/lib/menu";
import NodeMark from "./NodeMark";

// Tema claro: sidebar CLARA com o dourado só como acento (pill do item ativo e
// logo). Um slab dourado inteiro pesaria demais no tema claro.
const CARD = TEMA.card;
const FUNDO = TEMA.fundo;
const LINE = TEMA.borda;
const TEXTO = TEMA.texto;
const MUTED = TEMA.muted;
const AMARELO = TEMA.destaque;

export default function Shell({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  async function sair() {
    if (auth) await signOut(auth);
    router.replace("/login");
  }

  const nav = (
    <aside
      className="flex h-full w-60 shrink-0 flex-col"
      style={{ background: CARD, color: TEXTO, borderRight: `1px solid ${LINE}` }}
    >
      {/* Slot da logo: dimensionado para receber o SVG/PNG definitivo. */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <NodeMark />
        <span className="text-lg font-semibold">Influência</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        {MENU_PRINCIPAL.map((item) => {
          const ativo = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href!}
              onClick={() => setAberto(false)}
              className="mb-1 block rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              // Item ativo: pill dourado com texto quase-preto (nunca texto dourado).
              style={ativo ? { background: AMARELO, color: TEXTO } : { color: TEXTO }}
            >
              {item.rotulo}
            </Link>
          );
        })}

        <p className="mb-2 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          Em breve
        </p>
        {MENU_EM_BREVE.map((item) => (
          <div
            key={item.rotulo}
            aria-disabled="true"
            title={item.descricao}
            className="mb-1 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ color: MUTED, cursor: "not-allowed" }}
          >
            <span className="truncate">{item.rotulo}</span>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
              style={{ background: TEMA.chip, color: MUTED }}
            >
              Em breve
            </span>
          </div>
        ))}
      </nav>

      <div className="border-t px-4 py-4" style={{ borderColor: LINE }}>
        {user?.email && <p className="truncate text-[11px]" style={{ color: MUTED }}>{user.email}</p>}
        <button
          onClick={sair}
          className="mt-2 w-full rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          style={{ background: FUNDO, color: TEXTO, border: `1px solid ${LINE}` }}
        >
          Sair
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen" style={{ background: FUNDO }}>
      {/* Topbar mobile com hambúrguer */}
      <div
        className="flex items-center gap-3 px-4 py-3 md:hidden"
        style={{ background: CARD, color: TEXTO, borderBottom: `1px solid ${LINE}` }}
      >
        <button onClick={() => setAberto(true)} aria-label="Abrir menu" className="text-xl leading-none">☰</button>
        <NodeMark size={22} />
        <span className="font-semibold">Influência</span>
      </div>

      <div className="flex">
        {/* Sidebar fixa no desktop */}
        <div className="sticky top-0 hidden h-screen md:block">{nav}</div>

        {/* Drawer no mobile */}
        {aberto && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0" style={{ background: "rgba(28,27,23,0.35)" }} onClick={() => setAberto(false)} />
            <div className="absolute left-0 top-0 h-full shadow-2xl">{nav}</div>
          </div>
        )}

        {/* Conteúdo */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
