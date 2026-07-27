// Configuração de marca do cliente: nome da agência, nome do assistente de IA
// e cores base do tema. Para reusar o painel em outro cliente, ajuste só este
// arquivo (o nome do assistente de IA vem daqui — não fixe no código).
export const MARCA = {
  // Nome da agência/cliente exibido no painel.
  agencia: "Influência",
  // Nome do assistente de IA (usado na UI do chat e no prompt do sistema).
  assistente: "Influ",
  // Fuso horário do cliente (agrupamento/exibição de datas, ex.: agenda). Troque aqui.
  fuso: "America/Sao_Paulo",
  // Cores base do tema claro (espelham tailwind.config.ts / o tema do painel).
  cores: {
    ink: "#1C1B17",     // quase-preto morno (texto)
    amarelo: "#F3B60E", // dourado oficial da marca (extraído da logo)
  },
} as const;

// Design tokens do painel — fonte única das decisões visuais. Todo o app
// (cards, tabelas, KPIs, gráficos) lê daqui; é o que um futuro starter herda.
//
// TEMA CLARO. Regra de contraste que rege esta paleta:
//   • `destaque` (#F3B60E) é PREENCHIMENTO, nunca cor de texto sobre fundo claro
//     (dourado em texto é ilegível). Botão/barra/pill dourado leva texto `texto`.
//   • Para "ouro" legível como TEXTO, use `ouroTexto` (dourado escurecido).
//   • `positivo`/`negativo`/`atencao` já vêm em tons escuros o bastante para ler
//     sobre claro. Semântica: verde=bom, vermelho=ruim (CPL subindo é RUIM).
export const TEMA = {
  fundo: "#F7F6F2",       // fundo da página — off-white morno
  card: "#FFFFFF",        // superfície de card
  hover: "#F1EFE9",       // hover de linha/superfície (classe: hover:bg-[#F1EFE9])
  borda: "#E6E3DB",       // borda 1px
  texto: "#1C1B17",       // TEXTO PRIMÁRIO (quase-preto morno)
  muted: "#6C6960",       // texto secundário
  destaque: "#F3B60E",    // dourado da marca — SÓ preenchimento (nunca texto)
  ouroTexto: "#7A5B00",   // dourado escurecido — a única forma de "ouro" legível em texto
  positivo: "#157F4C",    // verde — semântica de performance boa
  negativo: "#C23A2C",    // vermelho — semântica de performance ruim
  atencao: "#9A6600",     // âmbar escuro — alerta de limite / divergência
  placeholder: "#8B877D", // placeholder de inputs
  sparkline: "#C9C5BC",   // linha discreta das mini-séries (neutra)
  barraNeutra: "#D3CFC6", // trilho neutro de barras/rankings
  erroFundo: "#FBEBE8",   // fundo de card de erro (texto = negativo)
  positivoFundo: "#E4F2EA", // tint verde de selo (texto = positivo)
  avisoFundo: "#FCF4DF",  // fundo de faixa de aviso (texto = ouroTexto)
  limiteFundo: "#FBEFD9", // fundo do card de alerta de limite (texto = atencao)
  chip: "#EFEDE6",        // fundo de selo/chip neutro
  zebra: "#FBFAF7",       // linha alternada de tabela densa (zebra striping)
  raioCard: "0.75rem",    // raio de borda dos cards (~12px)
  sombraCard: "0 1px 2px rgba(28,27,23,0.04), 0 1px 3px rgba(28,27,23,0.06)", // elevação suave
} as const;
