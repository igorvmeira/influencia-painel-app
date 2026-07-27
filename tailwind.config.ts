import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Espelham os tokens de lib/brand.ts (TEMA) — para uso em CLASSES do Tailwind
        // (hover:, placeholder: etc.), que não conseguem ler valores de JS.
        // Fonte única conceitual: brand.ts. Ao mudar lá, atualize aqui.
        brand: {
          ink: "#1C1B17",        // texto quase-preto morno (TEMA.texto)
          yellow: "#F3B60E",     // dourado da marca (preenchimento)
          yellowDeep: "#7A5B00", // dourado escurecido (legível como texto)
          yellowTint: "#FCF4DF", // tint dourado (fundo de aviso)
          bg: "#F7F6F2",         // fundo da página
          card: "#FFFFFF",       // superfície de card
          hover: "#F1EFE9",      // hover de linha/superfície
          line: "#E6E3DB",       // borda 1px
          muted: "#6C6960",      // texto secundário
          placeholder: "#8B877D",// placeholder de inputs
          zebra: "#FBFAF7",      // linha alternada de tabela
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
