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

// Tema escuro. A sidebar deixou de ser "a âncora clara/escura" e virou o degrau
// MAIS PROFUNDO da escala de elevação (navFundo < fundo < card), para o conteúdo
// parecer vir à frente. Paleta própria (TEMA.nav*) — ver lib/brand.ts.
const FUNDO = TEMA.fundo;
const AMARELO = TEMA.destaque;
// ⚠️ NÃO use TEMA.texto sobre o dourado. Ver `textoSobreDestaque` em lib/brand.ts:
// no tema claro `texto` era quase-preto e dava 9,44:1 sobre o dourado; no escuro
// virou off-white e o MESMO código passa a 1,60:1, ilegível e sem erro nenhum.
const SOBRE_AMARELO = TEMA.textoSobreDestaque;
const NAV_FUNDO = TEMA.navFundo;
const NAV_TEXTO = TEMA.navTexto;
const NAV_MUTED = TEMA.navMuted;
const NAV_BORDA = TEMA.navBorda;

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
      style={{ background: NAV_FUNDO, color: NAV_TEXTO, borderRight: `1px solid ${NAV_BORDA}` }}
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
              className={`mb-1 block rounded-lg px-3 py-2 text-sm font-medium transition-colors${ativo ? "" : " hover:bg-nav-hover"}`}
              // Item ativo: pill dourado com o texto ESCURO do token próprio (10,58:1).
              style={ativo ? { background: AMARELO, color: SOBRE_AMARELO } : { color: NAV_TEXTO }}
            >
              {item.rotulo}
            </Link>
          );
        })}

        <p className="mb-2 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: NAV_MUTED }}>
          Em breve
        </p>
        {MENU_EM_BREVE.map((item) => (
          <div
            key={item.rotulo}
            aria-disabled="true"
            title={item.descricao}
            className="mb-1 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ color: NAV_MUTED, cursor: "not-allowed" }}
          >
            <span className="truncate">{item.rotulo}</span>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
              style={{ background: TEMA.navChip, color: NAV_MUTED }}
            >
              Em breve
            </span>
          </div>
        ))}
      </nav>

      <div className="border-t px-4 py-4" style={{ borderColor: NAV_BORDA }}>
        {user?.email && <p className="truncate text-[11px]" style={{ color: NAV_MUTED }}>{user.email}</p>}
        <button
          onClick={sair}
          // ⚠️ O fundo estava no `style` inline com um `hover:bg-nav-chip` na classe —
          // inline vence stylesheet, então o hover NUNCA pintou. Defeito anterior ao
          // tema escuro; só apareceu porque a migração mediu par a par.
          className="mt-2 w-full rounded-lg bg-nav-hover px-3 py-1.5 text-sm font-medium transition-colors hover:bg-nav-chip"
          // ⚠️ `bordaForteElevada`, não `bordaForte`. O motivo original continua valendo —
          // `navBorda` dá ~1,5:1 aqui e o botão fica sem limite visível — mas o
          // `bordaForte` é derivado contra o CARD, e sobre `navHover` ele caiu para
          // 2,97:1 na paleta 2026. A sidebar é outro degrau e tem a moldura dela.
          style={{ color: NAV_TEXTO, border: `1px solid ${TEMA.bordaForteElevada}` }}
        >
          Sair
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen" style={{ background: FUNDO }}>
      {/* Topbar mobile com hambúrguer — MESMA identidade escura da sidebar, senão o
          mobile ficaria com duas linguagens (topbar clara + drawer escuro). */}
      <div
        className="flex items-center gap-3 px-4 py-3 md:hidden"
        style={{ background: NAV_FUNDO, color: NAV_TEXTO, borderBottom: `1px solid ${NAV_BORDA}` }}
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
            {/* ⚠️ O véu precisou ENGROSSAR no tema escuro. Era 0,55 do quase-preto
                sobre uma página CLARA, e o contraste vinha de graça. Sobre a página
                escura, escurecer o escuro não separa nada — o drawer parecia flutuar
                sem fundo. Agora é `TEMA.overlay` (preto a 0,66); a borda-direita
                (navBorda, dentro do <aside>) recorta a silhueta contra ele. */}
            <div className="absolute inset-0" style={{ background: TEMA.overlay }} onClick={() => setAberto(false)} />
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
