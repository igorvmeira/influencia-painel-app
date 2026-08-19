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
  navFundo: "#0A000C",    // sidebar — o degrau mais profundo
  fundo: "#19001E",       // fundo da página
  card: "#530163",        // superfície de card (texto 15,12:1 · dourado 9,44:1)
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
  hover: "#5C0E6B",       // hover de superfície NEUTRA (classe: hover:bg-brand-hover)
  zebra: "#4F015F",       // linha alternada de tabela densa
  chip: "#60146E",        // fundo de selo/chip neutro
  flutuante: "#651C74",   // tooltip e popover — acima do card, por isso mais claro
  /**
   * ⚠️ DUAS BORDAS, DUAS FUNÇÕES — e a formulação que impede confundi-las:
   *
   *     `borda`      SEPARA superfícies.
   *     `bordaForte` AFIRMA que o elemento é clicável.
   *
   * Não é uma escala de intensidade, é uma diferença de papel. Subir tudo para
   * `bordaForte` "porque contrasta mais" encheria a tela de molduras e apagaria
   * justamente o sinal que distingue um botão de um retângulo — que é o único
   * motivo de `bordaForte` existir.
   */
  borda: "#631972",       // SEPARA superfície: card, painel, divisória, grade
  /**
   * O par de `borda` — ver a formulação lá em cima. Aqui vale o CASO REAL que a
   * originou: em `borda` (1,23:1) as três opções não selecionadas do seletor de
   * semáforo viraram texto solto no escuro, sem preenchimento e sem contorno. O
   * olho acha a aresta de um card grande com quase nada de contraste; o de um
   * pill de 24px de altura, não.
   *
   * Onde entra: botão, opção de seletor, campo em foco, painel flutuante que
   * precisa se destacar de uma superfície da mesma cor.
   */
  bordaForte: "#9C6DA5",  // AFIRMA controle clicável e foco (3,19:1 no card)

  // ===== TEXTO =====
  texto: "#FFFFFF",       // primário — 15,12:1 sobre card (AAA)
  muted: "#BC9DC3",       // secundário — 5,92:1 (AA)
  placeholder: "#B28EB9", // placeholder de inputs — 4,75:1 (AA)

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
  destaque: "#FFDD02",    // dourado da marca — preenchimento e texto ≥18px
  ouroTexto: "#FFDD02",   // ⚠️ NO ESCURO OS DOIS CONVERGEM. O token continua porque
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
  textoSobreDestaque: "#000000", // 10,58:1 sobre o dourado (AAA)

  // ===== SEMÂNTICA =====
  // Verde = bom, vermelho = ruim. ⚠️ A semântica é do SIGNIFICADO, não do sinal:
  // CPL subindo é RUIM e vai de vermelho mesmo sendo "+".
  positivo: "#5CC98D",    // 8,37:1 sobre card
  negativo: "#F37870",    // 6,07:1 sobre card
  // ⚠️ O ÂMBAR DA CASA VIROU LARANJA, e não é capricho: clareado para o escuro, o
  // âmbar antigo (#9A6600) ficava a uma razão de luminância de **1,03** do dourado
  // — indistinguíveis lado a lado, só o matiz separava. O laranja abre para 1,31.
  // NÃO "corrigir" de volta para amarelo: reintroduz a colisão com o destaque.
  atencao: "#E8944A",     // 7,19:1 sobre card

  // ===== TINTS DE SELO (chips de delta, faixas de aviso) =====
  // Tint escuro do próprio matiz. No claro eram lavados (#E4F2EA); aqui são
  // profundos, e o texto continua na cor semântica cheia.
  positivoFundo: "#314745", // positivo sobre ele: 6,92:1
  negativoFundo: "#3B132B", // negativo sobre ele: 5,64:1
  neutroFundo: "#5C0E6B",   // delta zero / sem comparação — muted sobre ele: 5,33:1
  avisoFundo: "#755813",    // faixa de aviso — destaque sobre ele: 7,94:1
  limiteFundo: "#381625",   // alerta de limite — atencao sobre ele: 5,88:1
  erroFundo: "#3B132B",     // card de erro — negativo sobre ele: 5,44:1

  // ===== GRÁFICOS =====
  /**
   * ⚠️ NOME SEMÂNTICO, DE PROPÓSITO — este token chamava `sparkline`, e o nome era
   * o defeito. Ele acabou em 8 lugares e só UM era uma sparkline: os outros sete
   * são barra de ranking, eixo do slope, linha-guia e barra do waterfall. Quem
   * escolhia o token (eu, nesta migração) o pegava pelo que ele É — o neutro que
   * passa os 3:1 — e carregava junto um nome que diz onde ele MORAVA.
   *
   * É a mesma armadilha do `navFundo`, que virou "a cor mais escura disponível" e
   * foi parar em três gráficos: token com nome de LUGAR só serve naquele lugar;
   * quando algo precisa de contraste, o nome tem que dizer o SIGNIFICADO.
   *
   * ⚠️ E É DADO, NÃO DECORAÇÃO: cai na WCAG 1.4.11 e precisa de 3:1 — o valor
   * claro apenas escurecido daria 1,88:1 e sumiria no card.
   */
  dadoNeutro: "#9C6DA5",  // 3,19:1 sobre card — série, barra ou eixo sem semântica
  // ⚠️ SÓ TRILHO — o sulco VAZIO atrás da barra. 1,47:1 sobre o card, o que é certo
  // para um sulco e ERRADO para qualquer coisa que informe. Dois rankings usavam
  // este token na PRÓPRIA BARRA (onde o comprimento codifica o CPL) e no escuro a
  // maioria das barras sumiria. Barra neutra que carrega dado usa `sparkline`.
  // É o exemplo do "token legítimo em contexto errado": nenhum grep acha, só medir
  // o par real acha.
  barraNeutra: "#6E297C", // TRILHO de barra/ranking — nunca a barra em si

  // ===== VÉUS E REALCES (as cores que NÃO são hex) =====
  // ⚠️ ESTES TOKENS NASCERAM DE UM BURACO NA AUDITORIA. A regra da casa é "nenhuma
  // cor chumbada fora dos tokens", e a conferência procurava `#RRGGBB` — então
  // quatro `rgba(...)` passaram batido por toda a vida do tema claro. Todos eram
  // dependentes do tema, e todos quebravam no escuro do jeito mais silencioso:
  // véu escuro sobre fundo escuro não escurece nada, e realce escuro sobre card
  // escuro não realça nada. Procure por `rgba(` também, não só por `#`.
  overlay: "rgba(0,0,0,0.72)",              // véu do drawer mobile — mais forte que
                                            // no claro: sobre fundo já escuro, 0,55
                                            // não separava o drawer da página
  realceGrafico: "rgba(255,255,255,0.08)",  // cursor de hover em gráfico. ⚠️ CLARO,
                                            // não escuro — é o inverso do tema claro

  // ===== DEGRADÊ DE BARRA =====
  /**
   * ⚠️ DEGRADÊ SÓ EM COR COM FOLGA DE CONTRASTE — e essa regra saiu da medição,
   * não do gosto. A barra é DADO: o ponto MAIS ESCURO do degradê é que precisa
   * passar os 3:1 da WCAG 1.4.11, não a média nem o ponto claro.
   *
   *   amarelo #FFDD02 parte de 10,05:1 sobre o card → aguenta escurecer até −45%
   *   (3,16:1). O segundo stop escolhido é −18% (#D1B502, 6,65:1): profundidade
   *   visível, longe do piso.
   *
   * 🛑 `dadoNeutro` NÃO GANHA DEGRADÊ. Ele parte de 3,19:1, que já É o piso —
   * qualquer escurecimento reprova (−15% cai para 2,46:1). Barra neutra é chapada,
   * e isso não é inconsistência: é a única forma de ela continuar legível.
   *
   * Direção: no horizontal o claro fica na PONTA (puxa o olho para o valor); no
   * vertical o claro fica no TOPO, pelo mesmo motivo.
   */
  gradDestaqueH: "linear-gradient(90deg, #D1B502 0%, #FFDD02 100%)",
  gradDestaqueV: "linear-gradient(180deg, #FFDD02 0%, #D1B502 100%)",

  /**
   * HACHURA DE DADO INCOMPLETO — coluna/barra cujo período a base não cobre inteiro.
   *
   * ⚠️ TEXTURA, NÃO COR, e é isso que ela resolve. "Incompleto" e "anômalo" são fatos
   * diferentes que apareciam na mesma série: `atencao` já significa anomalia (mês com
   * clonagem da automação), então marcar o parcial com cor faria o tooltip afirmar a
   * causa errada. Textura é um canal livre — e é canal REDUNDANTE por si, sobrevivendo
   * a daltonismo e a impressão em preto e branco sem precisar de glifo.
   *
   * ⚠️ É OVERLAY, com as lacunas TRANSPARENTES — a cor da coluna passa por baixo. Tem
   * que ser assim porque a coluna muda de cor (`dadoNeutro` no normal, `atencao` no mês
   * clonado, dourado no destacado); hachura de cor fixa faria o mês parcial parecer
   * destacado. Uso: `background: [hachuraParcial, corQueAColunaJaTeria]`.
   *
   * ⚠️⚠️ E ELA CLAREIA, NUNCA ESCURECE — a regra mais reutilizável deste token.
   *
   * A primeira versão listrava de ESCURO e reprovava, por um motivo que já estava escrito
   * dez linhas acima e eu não apliquei: a barra é DADO (o comprimento carrega a
   * informação), cai na WCAG 1.4.11 e precisa de 3:1 — e `dadoNeutro` dá **exatamente
   * 3,19:1**. Ele JÁ ESTÁ no piso. Escurecer qualquer fração dele reprova, e é a mesma
   * razão pela qual ele não ganha degradê.
   *
   * **A generalização: sobre fundo escuro, CLAREAR passa por construção e ESCURECER
   * precisa de medição.** Subir a luminância só pode aumentar a razão contra um card
   * escuro; baixá-la come a margem, e cor que já está no piso não tem margem nenhuma.
   * Vale para hachura, degradê, véu, hover e realce — toda modificação de uma cor de
   * DADO. Antes de escurecer, pergunte quanta folga a cor tem; se a resposta for "ela é
   * o piso", a resposta é não.
   *
   * Medido (5px base / 3px listra em `texto`), composto contra o card e textura contra
   * a base:
   *     sobre dadoNeutro ... 7,66:1  · textura 4,74:1
   *     sobre atencao ...... 10,17:1 · textura 2,10:1
   *     sobre destaque ..... 11,57:1 · textura 1,60:1   ← a mais fraca
   *
   * `muted` foi descartado como listra: sobre a coluna âmbar dava textura de 1,22:1,
   * ou seja hachura invisível justamente no mês que mais precisa de leitura.
   *
   * 🛑 LIMITE CONHECIDO: sobre o dourado a textura é fraca (1,60:1). Coluna que seja
   * `destacada` E `parcial` ao mesmo tempo precisa de outro canal — hoje não existe esse
   * caso, e se aparecer, medir antes de confiar.
   */
  hachuraParcial:
    "repeating-linear-gradient(135deg, transparent 0 5px, #FFFFFF 5px 8px)",

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
  navTexto: "#FFFFFF",      // 16,82:1 sobre navFundo
  navMuted: "#BC9DC3",      // 6,58:1 — "Em breve", e-mail do rodapé
  navBorda: "#631972",      // divisórias internas
  navHover: "#5C0E6B",      // hover de item inativo
  navChip: "#60146E",       // fundo do selo "Em breve"
  /**
   * MOLDURA DE CONTROLE NA SIDEBAR — o `bordaForte` da sidebar.
   *
   * ⚠️ POR QUE UM TOKEN PRÓPRIO. `bordaForte` foi derivado contra o CARD, e a sidebar é
   * outro degrau da escala. O botão "Sair" pinta a moldura contra `navHover`, e ali o
   * `bordaForte` dá **2,97:1** — falta 0,03 para o piso de 3:1 da WCAG 1.4.11. É o tipo
   * de diferença que ninguém enxerga e que decide passar ou reprovar.
   *
   * ⚠️ E É TOKEN VÁLIDO EM CONTEXTO ERRADO, a armadilha que nenhuma busca acha: o
   * `audita-tema` media `bordaForte` contra o `card` (3,31:1, passa) enquanto a tela o
   * pintava contra `navHover`. O par declarado descrevia uma superfície que aquele
   * controle nunca pisa.
   *
   * Medido contra as TRÊS superfícies onde um controle da sidebar pode pousar, para o
   * próximo não cair no mesmo buraco:
   *   navHover 3,49:1 · navFundo 5,94:1 · navChip 3,32:1
   */
  navBordaForte: "#A57BAE",

  // ===== CHIPS DE ÍCONE (tela Início) =====
  /**
   * ⚠️ DEIXARAM DE SER PROVISÓRIOS. Até 18/08/2026 estes chips eram terra e oliva —
   * escolha de DESIGN, com "[PROVISÓRIO]" escrito ao lado, porque a marca só tinha o
   * dourado e não havia secundárias oficiais. O Manual 2026 trouxe as três: ROXO, AZUL
   * MARINHO e BEGE. Terra e oliva saíram; não há mais nada provisório aqui.
   *
   * Padrão de construção: fundo escuro tingido no matiz + ícone claro do MESMO matiz.
   * Os quatro pares foram medidos (ver scripts/deriva-paleta.js).
   */
  chipDourado: "#755813", // chip do card Dashboard (ícone em destaque: 8,01:1)
  chipRoxo: "#2E0136",    // ícone em roxoTexto
  roxoTexto: "#C5A9CA",   // 8,44:1 sobre chipRoxo
  chipAzul: "#00114D",    // ícone em azulTexto
  azulTexto: "#99A3C9",   // 7,11:1 sobre chipAzul
  chipBege: "#661F71",    // ícone em begeTexto
  begeTexto: "#DDDACD",   // 7,49:1 sobre chipBege
} as const;

/**
 * MOVIMENTO — tokens de animação, decididos com o Igor em 16/08/2026.
 *
 * A referência (Grafana) NÃO anima: os painéis renderizam em canvas por
 * performance. Então isto é desenho nosso, não cópia — e a regra que rege tudo
 * saiu dele: **se a animação faz alguém esperar para ler o número, ela está
 * errada.**
 *
 * Consequências que já estão embutidas nos valores abaixo:
 *   · o easing cobre ~80% da distância nos primeiros 40% do tempo — a barra
 *     chega perto do valor quase imediato e só assenta no fim;
 *   · o escalonamento tem TETO, senão um ranking de 20 linhas levaria 800ms;
 *   · o rótulo de valor entra DEPOIS que a barra assenta: subindo junto com ela,
 *     o número fica ilegível durante todo o trajeto.
 *
 * ⚠️ NÚMERO NÃO CONTA NA ENTRADA. O `NumeroAnimado` anima só quando o valor MUDA
 * (troca de período) e já era escrito assim. Contar na entrada contraria a regra
 * acima — um número contando é ilegível enquanto conta.
 */
export const MOVIMENTO = {
  /** Crescimento da barra, do zero ao valor. */
  barraMs: 520,
  /** Ease-out forte: quase todo o percurso no começo, assentamento no fim. */
  ease: "cubic-bezier(.22,1,.36,1)",
  /** Atraso por índice, para as barras entrarem em cascata. */
  escalonamentoMs: 40,
  /** ⚠️ TETO do escalonamento — acima disto a lista inteira vira espera. */
  escalonamentoTetoMs: 240,
  /** Rótulo de valor: entra depois da barra assentar. */
  rotuloMs: 240,
  rotuloAtrasoMs: 260,
  /** Linha de média: por último, quando já há o que comparar. */
  mediaMs: 300,
  /** Hover — o mesmo 120ms que o resto do app já usa. */
  hoverMs: 120,
} as const;
