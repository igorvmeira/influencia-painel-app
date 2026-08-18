import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Espelham os tokens de lib/brand.ts (TEMA) — para uso em CLASSES do Tailwind
        // (hover:, placeholder: etc.), que não conseguem ler valores de JS.
        // Fonte única conceitual: brand.ts. Ao mudar lá, atualize aqui.
        //
        // MARCA 2026 — arranjo C (18/08/2026). Os contrastes medidos e o porquê de cada
        // decisão estão em lib/brand.ts — este arquivo é só o espelho, nunca a explicação.
        brand: {
          ink: "#FFFFFF",        // TEXTO primário (TEMA.texto) — branco puro, ver a nota lá
          yellow: "#FFDD02",     // AMARELO do manual 2026 (TEMA.destaque)
          yellowDeep: "#FFDD02", // converge com o de cima (TEMA.ouroTexto)
          onYellow: "#000000",   // ⚠️ texto SOBRE o amarelo (TEMA.textoSobreDestaque) — 15,60:1
          bg: "#19001E",         // fundo da página (TEMA.fundo)
          card: "#530163",       // superfície de card (TEMA.card)
          hover: "#5C0E6B",      // hover de linha/superfície (TEMA.hover)
          line: "#631972",       // borda 1px — ESTRUTURAL no escuro (TEMA.borda)
          lineStrong: "#9C6DA5", // foco/seleção (TEMA.bordaForte)
          muted: "#BC9DC3",      // texto secundário (TEMA.muted)
          placeholder: "#B28EB9",// placeholder de inputs (TEMA.placeholder)
          zebra: "#4F015F",      // linha alternada de tabela (TEMA.zebra)
        },
        // Sidebar — o degrau MAIS PROFUNDO da escala (TEMA.nav*). Paleta separada
        // para poder mudar a navegação sem tocar no conteúdo.
        nav: {
          bg: "#0A000C",     // fundo da sidebar (TEMA.navFundo)
          text: "#FFFFFF",   // itens do menu (TEMA.navTexto)
          muted: "#BC9DC3",  // secundário na sidebar (TEMA.navMuted)
          line: "#631972",   // divisória interna (TEMA.navBorda)
          hover: "#5C0E6B",  // hover de item inativo (TEMA.navHover)
          chip: "#60146E",   // selo "Em breve" (TEMA.navChip)
        },
      },
      fontFamily: {
        // MANUAL DE MARCA 2026 — as duas vars são definidas em app/layout.tsx (next/font,
        // self-host). Os nomes das vars são SEMÂNTICOS (--font-titulo / --font-dado) e não
        // o nome da fonte: trocar a família um dia não deve obrigar a varrer o projeto
        // atrás de "poppins", que foi exatamente o que esta migração teve que fazer.
        sans: ["var(--font-titulo)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        // ⚠️ "mono" aqui é a Inconsolata do manual, e o papel dela é DADO EM COLUNA —
        // ver a régua em app/layout.tsx. Não é a fonte de código.
        mono: ["var(--font-dado)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
