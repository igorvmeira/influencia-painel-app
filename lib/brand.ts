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
  // ⚠️ NÃO existe mais um `cores` aqui. Havia um par {ink, amarelo} que ninguém
  // consumia — paleta duplicada é o defeito que este projeto já pagou uma vez (ver
  // o comentário no topo de app/globals.css, sobre o `:root` que divergiu do token).
  // A paleta é o TEMA abaixo, e é a única.
} as const;

// Design tokens do painel — fonte única das decisões visuais. Todo o app
// (cards, tabelas, KPIs, gráficos) lê daqui; é o que um futuro starter herda.
//
// ===========================================================================
// TEMA ESCURO — migrado em 16/08/2026, referência aprovada pelo dono (Easymon).
// ===========================================================================
// Todo par de cor abaixo foi MEDIDO com a fórmula WCAG 2.1 antes de entrar, não
// escolhido no olho. Os números estão no comentário de cada bloco. Alvos:
//   • texto normal ...... 4,5:1   (WCAG AA 1.4.3)
//   • texto ≥18px ....... 3:1     (mesma regra, faixa de "texto grande")
//   • dado não-textual .. 3:1     (WCAG 1.4.11 — série de gráfico, ícone que informa)
//   • decoração ......... sem piso (divisória, trilho de barra)
//
// ⚠️ AO TROCAR QUALQUER VALOR, REMEÇA O PAR. Um token que "parece igual" pode
// cruzar o piso: a diferença entre 4,4:1 e 4,5:1 não se enxerga, e é a fronteira
// entre passar e reprovar.
export const TEMA = {
  // ===== SUPERFÍCIES — três degraus de elevação =====
  // ⚠️ A ELEVAÇÃO SOZINHA NÃO SEPARA NADA. Testados quatro pares fundo/card: o
  // melhor deu 1,18:1, e chegar a 3:1 exigiria clarear o card até virar cinza
  // médio, o que mata o "escuro profundo" da referência.
  //
  // QUEM SEPARA O CARD É A BORDA — e ela lê contra o FUNDO, não contra o card.
  // Consequência que precisa sobreviver a este comentário: no escuro, **remover
  // borda é remover ESTRUTURA, não decoração**. Um "limpa as bordas" bem
  // intencionado dissolve o layout inteiro numa mancha só.
  navFundo: "#0B0A08",    // sidebar — o degrau mais profundo
  fundo: "#0F0E0B",       // fundo da página
  card: "#1C1B17",        // superfície de card (texto 15,12:1 · dourado 9,44:1)
  /**
   * ⚠️ REGRA DE HOVER NO ESCURO (Igor, 16/08/2026) — duas ferramentas, um princípio:
   * **no escuro, hover CLAREIA.** Nunca opacidade.
   *
   *   • superfície NEUTRA ......... troca de background para este token
   *   • superfície TINGIDA ou de MARCA ... `hover:brightness-125`
   *
   * O motivo de não ser uma só: trocar o background de um card de alerta apaga o
   * tinte semântico (vermelho de CPL estourado vira cinza), e clarear um card
   * neutro por filtro é mais frágil que trocar a cor. O motivo de não ser
   * opacidade: `hover:opacity-90` clareia sobre fundo claro e ESCURECE sobre fundo
   * escuro — o gesto continua acontecendo e passa a significar o contrário.
   *
   * ⚠️ `brightness` atinge o elemento E os filhos, então o par foi medido no estado
   * de hover, não só no normal: pill dourada 10,58 → 12,32:1, alerta de CPL
   * 5,44 → 5,91:1, alerta de limite 5,88 → 6,71:1. O dourado satura em #FFC80F e
   * para de subir, o que é o que permite usar 125 nos quatro sem estourar.
   */
  hover: "#26241E",       // hover de superfície NEUTRA (classe: hover:bg-brand-hover)
  zebra: "#191814",       // linha alternada de tabela densa
  chip: "#2A2822",        // fundo de selo/chip neutro
  flutuante: "#302E27",   // tooltip e popover — acima do card, por isso mais claro
  borda: "#2E2C26",       // divisória de 1px — ESTRUTURAL, ver acima
  bordaForte: "#6E6A5E",  // foco, seleção, borda que SIGNIFICA (3,19:1 no card)

  // ===== TEXTO =====
  texto: "#F2F0EA",       // primário — 15,12:1 sobre card (AAA)
  muted: "#9C978B",       // secundário — 5,92:1 (AA)
  placeholder: "#8B867A", // placeholder de inputs — 4,75:1 (AA)

  // ===== O DOURADO DA MARCA =====
  // ⚠️ A REGRA DO DOURADO MUDOU DE NATUREZA NO ESCURO, e isso vale ser entendido
  // antes de "corrigir": no tema claro ele era proibido como texto por CONTRASTE
  // (dourado sobre branco é ilegível). Sobre o card escuro ele dá **9,44:1**, que
  // passa AAA até em texto pequeno.
  //
  // A regra continua existindo, agora como HIERARQUIA, não acessibilidade:
  //   ✅ dourado em texto ≥18px — títulos de seção, valores de KPI, números grandes
  //   ❌ dourado em corpo de texto, rótulo, legenda, célula de tabela
  // Decisão do Igor em 16/08/2026. Se tudo for dourado, nada é destaque.
  destaque: "#F3B60E",    // dourado da marca — preenchimento e texto ≥18px
  ouroTexto: "#F3B60E",   // ⚠️ NO ESCURO OS DOIS CONVERGEM. O token continua porque
                          // nomeia a intenção ("ouro legível como texto") e porque um
                          // cliente em tema claro precisa dos dois separados de novo.

  // ⚠️ ARMADILHA QUE ESTE TOKEN EXISTE PARA FECHAR. O Shell tinha
  // `{ background: destaque, color: texto }` na pill do item ativo. No claro isso
  // era quase-preto sobre dourado = 9,44:1. No escuro, `texto` virou off-white e o
  // MESMO CÓDIGO passa a dar **1,60:1** — invisível, com o build passando e nenhum
  // hex tendo mudado. É o pior tipo de defeito: silencioso e a olho nu.
  //
  // REGRA PERMANENTE (Igor, 16/08/2026): todo par {fundo de marca + texto} tem
  // token PRÓPRIO. Nunca reusar o token de texto geral sobre cor de marca.
  textoSobreDestaque: "#0F0E0B", // 10,58:1 sobre o dourado (AAA)

  // ===== SEMÂNTICA =====
  // Verde = bom, vermelho = ruim. ⚠️ A semântica é do SIGNIFICADO, não do sinal:
  // CPL subindo é RUIM e vai de vermelho mesmo sendo "+".
  positivo: "#5CC98D",    // 8,37:1 sobre card
  negativo: "#F2726A",    // 6,07:1 sobre card
  // ⚠️ O ÂMBAR DA CASA VIROU LARANJA, e não é capricho: clareado para o escuro, o
  // âmbar antigo (#9A6600) ficava a uma razão de luminância de **1,03** do dourado
  // — indistinguíveis lado a lado, só o matiz separava. O laranja abre para 1,31.
  // NÃO "corrigir" de volta para amarelo: reintroduz a colisão com o destaque.
  atencao: "#E8944A",     // 7,19:1 sobre card

  // ===== TINTS DE SELO (chips de delta, faixas de aviso) =====
  // Tint escuro do próprio matiz. No claro eram lavados (#E4F2EA); aqui são
  // profundos, e o texto continua na cor semântica cheia.
  positivoFundo: "#14301F", // positivo sobre ele: 6,92:1
  negativoFundo: "#351A17", // negativo sobre ele: 5,64:1
  neutroFundo: "#26241E",   // delta zero / sem comparação — muted sobre ele: 5,33:1
  avisoFundo: "#33280D",    // faixa de aviso — destaque sobre ele: 7,94:1
  limiteFundo: "#352A12",   // alerta de limite — atencao sobre ele: 5,88:1
  erroFundo: "#3A1C18",     // card de erro — negativo sobre ele: 5,44:1

  // ===== GRÁFICOS =====
  // ⚠️ `sparkline` É DADO, NÃO DECORAÇÃO. Cai na WCAG 1.4.11 e precisa de 3:1 —
  // o valor claro apenas escurecido daria 1,88:1 e sumiria no card.
  sparkline: "#6E6A5E",   // 3,19:1 sobre card — mini-série E barra neutra de ranking
  // ⚠️ SÓ TRILHO — o sulco VAZIO atrás da barra. 1,47:1 sobre o card, o que é certo
  // para um sulco e ERRADO para qualquer coisa que informe. Dois rankings usavam
  // este token na PRÓPRIA BARRA (onde o comprimento codifica o CPL) e no escuro a
  // maioria das barras sumiria. Barra neutra que carrega dado usa `sparkline`.
  // É o exemplo do "token legítimo em contexto errado": nenhum grep acha, só medir
  // o par real acha.
  barraNeutra: "#3A382F", // TRILHO de barra/ranking — nunca a barra em si

  // ===== VÉUS E REALCES (as cores que NÃO são hex) =====
  // ⚠️ ESTES TOKENS NASCERAM DE UM BURACO NA AUDITORIA. A regra da casa é "nenhuma
  // cor chumbada fora dos tokens", e a conferência procurava `#RRGGBB` — então
  // quatro `rgba(...)` passaram batido por toda a vida do tema claro. Todos eram
  // dependentes do tema, e todos quebravam no escuro do jeito mais silencioso:
  // véu escuro sobre fundo escuro não escurece nada, e realce escuro sobre card
  // escuro não realça nada. Procure por `rgba(` também, não só por `#`.
  overlay: "rgba(0,0,0,0.66)",              // véu do drawer mobile — mais forte que
                                            // no claro: sobre fundo já escuro, 0,55
                                            // não separava o drawer da página
  realceGrafico: "rgba(242,240,234,0.06)",  // cursor de hover em gráfico. ⚠️ CLARO,
                                            // não escuro — é o inverso do tema claro

  // ===== FORMA =====
  raioCard: "0.75rem",
  // ⚠️ Sombra faz pouco no escuro — não há luz para bloquear. Ela ficou como um
  // reforço sutil de profundidade; quem realmente eleva o card é a BORDA.
  sombraCard: "0 1px 2px rgba(0,0,0,0.40), 0 1px 3px rgba(0,0,0,0.30)",

  // ===== SIDEBAR =====
  // ⚠️ ELA DEIXOU DE SER "A ÚNICA SUPERFÍCIE ESCURA". No tema claro a sidebar era
  // a âncora de contraste; agora tudo é escuro, e o papel dela virou outro: ser o
  // degrau MAIS PROFUNDO, para o conteúdo parecer vir à frente.
  // Os tokens continuam separados porque a sidebar tem fundo próprio — e é o que
  // permite mudá-la sem tocar no resto.
  // `navFundo` está declarado lá em cima, junto das outras superfícies — é o
  // degrau 1 dos três, e separá-lo daqui deixa a escala de elevação legível.
  navTexto: "#F2F0EA",      // 16,82:1 sobre navFundo
  navMuted: "#9C978B",      // 6,58:1 — "Em breve", e-mail do rodapé
  navBorda: "#2E2C26",      // divisórias internas
  navHover: "#26241E",      // hover de item inativo
  navChip: "#2A2822",       // fundo do selo "Em breve"

  // ===== CHIPS DE ÍCONE (tela Início) =====
  // ⚠️ PROVISÓRIO — terra e oliva são escolha de DESIGN, NÃO cores de marca. A
  // marca oficial tem só o dourado. Se a agência informar cores secundárias
  // oficiais, troque os hex aqui e o resto do app acompanha.
  // Redesenhados para o escuro em 16/08/2026, com o par remedido.
  chipDourado: "#33280D", // chip do card Dashboard (ícone em destaque: 7,94:1)
  // Terra segue SEM USO desde 05/08/2026 (era o card "Pautas e Reuniões",
  // escondido — ver lib/menu.ts). Mantido de propósito: apagá-lo é decisão de
  // PRODUTO, não de tema, e o par já está conferido caso o card volte.
  chipTerra: "#2E1D14",   // ícone em terraTexto
  terraTexto: "#E5A579",  // 7,67:1 sobre chipTerra [PROVISÓRIO]
  chipOliva: "#232A16",   // ícone em olivaTexto
  olivaTexto: "#C3D67C",  // 9,35:1 sobre chipOliva [PROVISÓRIO]
} as const;
