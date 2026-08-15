# Migração para tema escuro — o que a medição achou

Concluída em 16/08/2026. Referência visual aprovada pelo dono (dashboard Easymon da
própria Influência). **Nenhuma lógica, nenhum dado e nenhuma rota foram tocados.**

Este documento é a retrospectiva: o que quebrou, o que era dívida antiga, e o que levar
para o próximo projeto. As regras generalizáveis estão no `CLAUDE.md`; a conferência
executável está em `scripts/audita-tema.js`.

---

## O ponto de partida enganou

A auditoria inicial deu um resultado ótimo: **312 usos de `TEMA.*` em 25 componentes e
zero cor chumbada** fora de `lib/brand.ts` e `tailwind.config.ts`. A centralização tinha
segurado.

E ainda assim **todos os defeitos reais passaram por essa conferência.** Nenhum deles era
uma cor fora do lugar; eram cores certas, de tokens certos, medindo errado no contexto
novo. A lição-mãe da migração é essa: **auditar a ORIGEM da cor não diz nada sobre onde
ela foi parar.**

---

## Quantas telas precisaram de correção além da paleta

| tela | além da paleta |
|---|---|
| Início | ✅ 2 hovers mortos |
| Dashboard | ✅ pill dourada, barra de ranking, estilo morto |
| Orientações | ✅ contorno do seletor e do botão |
| Gestores | ✅ fatia da BarraSplit, avatar |
| Carteira | — nada |
| **Comercial** | — nada |

**4 de 6.** Mais o `Shell`, o `login` e o `IAChat`, que são compartilhados.

⚠️ **A Comercial é a única tela sem dívida porque NASCEU depois da migração**, já no
vocabulário que ela estabeleceu. É o argumento mais concreto a favor de codificar as
regras: tela escrita com o vocabulário certo não acumula o problema, não é preciso
lembrar de nada.

---

## Tokens que mudaram de papel

| token | antes | depois | por quê |
|---|---|---|---|
| `navFundo` | virou "a cor mais escura disponível" e foi parar em 3 gráficos | **só a sidebar** | eram 3 usos legítimos **por acaso**: no claro, qualquer coisa que precisasse contrastar com branco funcionava. 1,15:1 no escuro |
| `atencao` | âmbar `#9A6600` | laranja **`#E8944A`** | clareado para o escuro, ficava a **1,03** de razão do dourado — indistinguíveis |
| `barraNeutra` | trilho **e** barra de dado | **só trilho** | 1,47:1. Como barra, a maioria do ranking sumiria |
| `sparkline` | nome de componente, usado em 8 lugares | **`dadoNeutro`** | só 1 dos 8 era uma sparkline |
| `ouroTexto` | dourado escurecido, o único ouro legível como texto | **converge com `destaque`** | no escuro o dourado dá 9,44:1 e passa AAA |
| `borda` | divisória decorativa | **separa superfície** (estrutural) | no escuro nenhuma elevação chega a 3:1; a borda faz o trabalho |
| `sombraCard` | elevação | reforço sutil | não há luz para bloquear no escuro |

**Tokens novos:** `textoSobreDestaque`, `bordaForte`, `dadoNeutro`, `flutuante`,
`overlay`, `realceGrafico`. Todos nasceram de um defeito medido, nenhum de preferência.

---

## O que ficou FORA por ser feature, não cor

Vira a lista do próximo projeto — a camada de componentes que aproxima da referência.

1. **KPI card com o valor anterior** (`ant. 289`). Muda conteúdo de tela aprovada.
2. **Hover que destaca a série no HeroChart.** Aprovado em conceito; é a regra da casa
   nascida no `SlopeCpl`, mas é interação nova.
3. **Donut com legenda-tabela.** Não existe em tela nenhuma hoje. O candidato natural é o
   funil por origem do comercial.
4. ~~Tooltip rico~~ — **já existia**. O do `HeroChart` mostra os quatro valores com
   rótulo, a comparação do período anterior e a nota de dia sem par. Registrado para não
   virar pedido duplicado.

---

## O que era DÍVIDA que a migração expôs (tudo já corrigido)

Nenhum destes é defeito de tema. São problemas que existiam no claro e que **só apareceram
porque a migração obrigou a medir par a par.**

5. **Hover morto por `background` inline** — 3 casos. Inline vence stylesheet; o hover
   nunca pintou, no claro também. Dois cards da Início e o botão "Sair".
6. **Token de trilho usado como barra de dado** — 3 casos. Ranking de gestores, de nichos
   e a barra "outras" do waterfall.
7. **Token posicional escolhido pela aparência** — `navFundo` em 3 gráficos, `sparkline`
   em 7 lugares que não eram sparkline.
8. **Estilo morto** — `color` num elemento cujo conteúdo é emoji. Pintava nada.
9. **Controle sem contorno visível** — 3 casos. Afordância fraca desde sempre (1,13:1 no
   claro), que passou a atingir o seletor de semáforo recém-entregue.

🛑 **O mais grave, em classe própria:** a fatia de Formulário da `BarraSplit` a 1,15:1.
Todos os outros eram elementos sumindo; **este produziria um número errado na leitura.**
Barra dividida com fatia invisível não fica meio apagada — **vira uma barra cheia**, e a
tela passa a afirmar 100% onde havia 40%.

---

## Regras de nascimento para o STARTER

O que fazer no dia 1 de um projeto novo para não repetir nada disso.

1. **Nome de token diz SIGNIFICADO, não lugar.** `dadoNeutro`, `bordaForte`,
   `textoSobreDestaque` — nunca `sparkline`, `navFundo`, `corDoCard`. O nome é o que
   impede o reuso errado, porque **nenhuma busca acha um token usado fora do papel dele.**
2. **Pares que precisam de token próprio, desde o início:**
   - `{fundo de marca + texto}` → `textoSobreDestaque`
   - `{separa superfície}` vs `{afirma que é clicável}` → `borda` e `bordaForte`
   - `{sulco vazio}` vs `{dado neutro}` → `barraNeutra` e `dadoNeutro`
   - `{superfície flutuante}` → `flutuante`, para tooltip não encostar no card
3. **Contraste é medido, e remedido a cada troca de valor.** A diferença entre 4,4:1 e
   4,5:1 não se enxerga.
4. **Fundo de elemento com `hover:` vai em classe, nunca em `style` inline.**
5. **Hover CLAREIA:** `brightness` para superfície tingida ou de marca, troca de
   `background` para neutra. Opacidade inverte de sentido com o tema.
6. **`color-scheme` declarado no `<html>`** desde o começo — é o que faz `<select>`,
   barra de rolagem e campos nativos acompanharem o tema.
7. **`scripts/audita-tema.js` versionado e rodando.** Ele cobre espelho, contraste, cor
   chumbada (`#`, `rgba(`, `hsl(`) e hover morto.
   ⚠️ **E não cobre o principal:** token legítimo em contexto errado. Esse só a medição do
   par REAL acha, e ela é humana. O script existe para sobrar atenção para essa parte.
