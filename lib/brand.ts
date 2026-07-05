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
