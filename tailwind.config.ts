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
        // TEMA ESCURO (16/08/2026). Os contrastes medidos e o porquê de cada decisão
        // estão em lib/brand.ts — este arquivo é só o espelho, nunca a explicação.
        brand: {
          ink: "#F2F0EA",        // TEXTO primário (TEMA.texto) — off-white, não mais preto
          yellow: "#F3B60E",     // dourado da marca (TEMA.destaque)
          yellowDeep: "#F3B60E", // no escuro converge com o de cima (TEMA.ouroTexto)
          onYellow: "#0F0E0B",   // ⚠️ texto SOBRE o dourado (TEMA.textoSobreDestaque)
          bg: "#0F0E0B",         // fundo da página (TEMA.fundo)
          card: "#1C1B17",       // superfície de card (TEMA.card)
          hover: "#26241E",      // hover de linha/superfície (TEMA.hover)
          line: "#2E2C26",       // borda 1px — ESTRUTURAL no escuro (TEMA.borda)
          lineStrong: "#6E6A5E", // foco/seleção (TEMA.bordaForte)
          muted: "#9C978B",      // texto secundário (TEMA.muted)
          placeholder: "#8B867A",// placeholder de inputs (TEMA.placeholder)
          zebra: "#191814",      // linha alternada de tabela (TEMA.zebra)
        },
        // Sidebar — o degrau MAIS PROFUNDO da escala (TEMA.nav*). Paleta separada
        // para poder mudar a navegação sem tocar no conteúdo.
        nav: {
          bg: "#0B0A08",     // fundo da sidebar (TEMA.navFundo)
          text: "#F2F0EA",   // itens do menu (TEMA.navTexto)
          muted: "#9C978B",  // secundário na sidebar (TEMA.navMuted)
          line: "#2E2C26",   // divisória interna (TEMA.navBorda)
          hover: "#26241E",  // hover de item inativo (TEMA.navHover)
          chip: "#2A2822",   // selo "Em breve" (TEMA.navChip)
        },
      },
      fontFamily: {
        // Poppins via next/font (self-host); a var é definida em app/layout.tsx.
        sans: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
