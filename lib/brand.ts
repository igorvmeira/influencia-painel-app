// Configuração de marca do cliente: nome da agência, nome do assistente de IA
// e cores base do tema. Para reusar o painel em outro cliente, ajuste só este
// arquivo (o nome do assistente de IA vem daqui — não fixe no código).
export const MARCA = {
  // Nome da agência/cliente exibido no painel.
  agencia: "Influência",
  // Nome do assistente de IA (usado na UI do chat e no prompt do sistema).
  assistente: "Influ",
  // Cores base do tema dark (espelham tailwind.config.ts / o tema do painel).
  cores: {
    ink: "#141414",
    amarelo: "#F6E003",
  },
} as const;

// Design tokens do dashboard — fonte única das decisões visuais. Todo o painel
// (cards, tabelas, KPIs) lê daqui; é o que um futuro starter herda.
export const TEMA = {
  fundo: "#141414",     // fundo da página
  card: "#1C1C1C",      // superfície de card
  hover: "#232323",     // hover de linha/superfície (use como classe: hover:bg-[#232323])
  borda: "#2A2A2A",     // borda 1px
  destaque: "#F6E003",  // amarelo — SÓ ação/destaque (nunca decorativo)
  positivo: "#4ECB8F",  // verde — semântica de performance boa
  negativo: "#FF6B5E",  // vermelho — semântica de performance ruim
  atencao: "#F2B441",   // âmbar — alerta de limite
  muted: "#9A968F",     // texto secundário
  sparkline: "#4A4A48", // linha discreta das mini-séries (neutra)
  raioCard: "0.75rem",  // raio de borda dos cards (~12px)
} as const;
