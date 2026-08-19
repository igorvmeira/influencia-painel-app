# Pares desencontrados — declarado ≠ pintado

Lista viva, aberta em **18/08/2026** durante a migração de marca 2026.
Cada commit de tela (4 a 8) acrescenta o que achar; o **commit 10 fecha**.

## O que é um par desencontrado

O `scripts/audita-tema.js` mede pares que **alguém declarou**: `["muted", "card", 4.5]`
quer dizer "o `muted` é pintado sobre o `card`, e ali precisa de 4,5:1". Um par
desencontrado é quando a tela pinta aquela tinta sobre **outra superfície**.

⚠️ **Os dois desfechos são igualmente graves, e o segundo é pior de achar:**

- **REPROVA** — a superfície real tem menos contraste que a declarada. O painel está
  ilegível num canto e a auditoria diz verde.
- **PASSA POR SORTE** — a superfície real tem *mais* contraste. Ninguém se machuca hoje,
  e a régua está medindo outra tela: no dia em que a superfície real mudar, nada acusa.

> **Passar por sorte é o mesmo erro de reprovar por engano.** Nos dois casos o número
> que a auditoria imprime não descreve o que está na tela.

## As regras desta lista

1. **Desencontro que REPROVA se conserta no commit em que aparece** — não espera o
   fechamento. Esta lista é o levantamento dos que passam por sorte.
2. Toda entrada carrega: **onde**, **par declarado**, **par que a tela pinta**,
   **contraste real**, e **passa ou reprova**.
3. A lista existe porque cinco relatórios espalhados em cinco mensagens de commit não
   são uma lista. Quem for fechar no 10 precisa de um lugar só.

## Por que isto não sai de uma varredura

Tentado em 18/08/2026. Uma varredura que procura `background:` e `color:` no mesmo
`style={{}}` acusou **6 pares** — e os 6 eram **artefato do método**: o fundo vinha de um
elemento ANCESTRAL (o `Bloco` que embrulha a seção), que a janela de busca não enxerga.
E é assim que a maior parte deste painel pinta.

**Os dois casos reais abaixo não aparecem nessa lista de 6.** Foram achados lendo o
componente. Um número saído daquela varredura teria parecido resposta e não era —
por isso o levantamento é por LEITURA, tela a tela, nos commits 4 a 8.

---

## Entradas

### 1. Moldura do botão "Sair" — 🛑 REPROVAVA · corrigido no commit 3

| | |
|---|---|
| **onde** | `components/Shell.tsx`, botão "Sair" no rodapé da sidebar |
| **declarado** | `bordaForte` sobre `card` — **3,31:1** ✅ |
| **a tela pinta** | `bordaForte` sobre `navHover` (o fundo do próprio botão) |
| **contraste real** | **2,97:1** 🛑 (piso 3:1, WCAG 1.4.11) |
| **desfecho** | reprovava por 0,03 |

O `bordaForte` é derivado contra o **card**, e a sidebar é outro degrau da escala. No tema
anterior a sidebar era quase preta e o par passava por acidente; com o roxo a folga sumiu.

**Conserto:** token próprio `navBordaForte` (`#A57BAE`), medido contra as três superfícies
onde um controle da sidebar pode pousar — `navHover` 3,49:1, `navFundo` 5,94:1, `navChip`
3,32:1. Resolve a classe, não o caso.

### 2. Placeholder do login — ⚠️ PASSAVA POR SORTE · corrigido no commit 3

| | |
|---|---|
| **onde** | `app/login/page.tsx`, inputs de e-mail e senha |
| **declarado** | `placeholder` sobre `card` — **4,80:1** ✅ |
| **a tela pinta** | `placeholder` sobre `fundo` — o input tem `background: TEMA.fundo` **dentro** do card |
| **contraste real** | **7,04:1** ✅ |
| **desfecho** | passava, com o número errado |

O input é **encaixado** no card, não elevado — mesma direção que os fundos semânticos
adotaram no commit 2. A régua descrevia uma superfície que aquele texto nunca pisa.

**Conserto:** o par declarado virou `["placeholder", "fundo", 4.5]`.

### 3. Linha da sparkline — 🛑 REPROVAVA · corrigido no commit 4

| | |
|---|---|
| **onde** | `components/Sparkline.tsx`, a linha do CardGestor |
| **declarado** | `dadoNeutro` sobre `card` — **3,31:1** ✅ |
| **a tela pintava** | `dadoNeutro` **a 90% de opacidade** sobre o card = `#95629E` |
| **contraste real** | **2,91:1** 🛑 (piso 3:1, WCAG 1.4.11) |
| **desfecho** | reprovava |

⚠️ **Mecanismo NOVO — não é a superfície, é a tinta.** Nos casos 1 e 2 o par errava a
superfície. Aqui a superfície estava certa e a TINTA era outra: um `opacity={0.9}` no
`stroke` transformava o token numa terceira cor que nenhuma régua media.

A posição da linha codifica a tendência do CPL, então o piso de 3:1 vale.

**Conserto:** a opacidade saiu. Sem ela o que a tela pinta é o token, e a régua volta a
descrever a tela. As outras duas cores da sparkline passariam mesmo com a opacidade
(positivo 5,42 e negativo 4,28) — **só a neutra reprovava**, que é justamente a que
ninguém olha.

**Procure por isto nos próximos commits:** `opacity=`, `opacity:` e `fill-opacity` em
qualquer coisa que carregue dado. A busca por `#` e `rgba(` não acha nenhum deles.

### 4. Linha de CPL do HeroChart — ⚠️ PERGUNTA DE SIGNIFICADO · adiada de propósito

| | |
|---|---|
| **onde** | `components/HeroChart.tsx`, linha tracejada de CPL |
| **cor** | `negativo` (vermelho) — **4,98:1** sobre o card ✅ |
| **desfecho** | passa; a dúvida não é de contraste |

A linha inteira é vermelha **mesmo quando o CPL cai** — ou seja, mesmo quando o que ela
mostra é bom. A régua da casa diz "CPL subindo é RUIM → vermelho", e aqui o vermelho pinta
a SÉRIE, não o movimento dela. Pode ser identidade disfarçada de semântica.

⚠️ **Adiado de propósito** (decisão do Igor, 18/08/2026): é questão de SIGNIFICADO, não de
contraste, e resolver no meio da migração de paleta mistura dois eixos — o mesmo motivo de
a fonte ter vindo antes da cor.

Medido, para quem for retomar: **se o vermelho virasse `serie3`**, os pares do gráfico
ficariam gasto×leads 2,82 · gasto×cpl 1,62 · leads×cpl 1,74 — todos com folga. É a única
configuração em que as três séries fecham, e ela depende dessa resposta.

### 5. As três séries do HeroChart não fecham — ⚠️ IMPOSSIBILIDADE GEOMÉTRICA

| | |
|---|---|
| **onde** | `components/HeroChart.tsx` |
| **par no fio** | gasto (amarelo) × leads (branco) — **1,35:1** |
| **desfecho** | passa o piso de 1,3; sem a folga de 0,3 |

Com `serie1` (amarelo, decisão do dono) e `negativo` (vermelho, semântico) FIXOS, **não
existe cor para a linha de leads** que feche os dois pares:

```
para >=1,6 do amarelo  ->  L <= 0,437
para >=1,6 do vermelho ->  L <= 0,192  ou  L >= 0,569
para >=3,3 do card     ->  L >= 0,206
janela útil: entre 0,206 e 0,192  ->  VAZIA
```

Testados os três candidatos, pelo pior par de cada:

| linha de leads | pior par | contra o card |
|---|---|---|
| **branco `#FFFFFF` (hoje)** | **1,35** | 13,53 |
| `serie2 #C3A6C8` | 1,24 | 6,19 |
| `serie3 #7381B4` | 1,40 | 3,56 |

O `serie3` ganha 0,05 no pior par e custa **10 pontos de contraste** na linha principal do
gráfico principal. Troca ruim.

**Decisão: fica como está**, e não por desistência — o par gasto×leads é separado por
FORMA (barras contra linha), que é o canal redundante que a régua da casa aceita. A
BarraSplit precisou da rampa porque lá as duas fatias têm a MESMA forma e só a cor separa.

O desbloqueio real é a pergunta do item 4.

### 6. Selo de tipo do alerta — 🛑 REPROVAVA · corrigido no commit 5

| | |
|---|---|
| **onde** | `components/Dashboard.tsx`, `AlertaCardRow`, aba Alertas |
| **declarado** | `negativo` sobre `card` — **4,98:1** ✅ |
| **a tela pintava** | `negativo` sobre `chip` (o selo tinha `background: TEMA.chip`) |
| **contraste real** | **4,24:1** 🛑 (piso 4,5) |
| **desfecho** | reprovava — e só o vermelho |

O `chip` é 1,17× mais claro que o card, e o `negativo` é a semântica de MENOR luminância:
ela come a folga primeiro. `destaque` (8,56) e `atencao` (4,81) passavam. **Das três, só
uma caía** — a assinatura desta família.

⚠️ E a linha de alerta tem `background: INK` (= `fundo`), não `card`. Tirando o chip, o
selo pousa numa superfície MAIS ESCURA que o card, não mais clara:

| | no chip | no fundo |
|---|---|---|
| destaque | 8,56 | **14,71** |
| negativo | **4,24** 🛑 | **7,29** |
| atencao | 4,81 | **8,27** |

**Conserto:** o selo perdeu o fundo e ganhou contorno na própria cor do tipo. Zero token
novo. As três semânticas voltam a pousar na superfície contra a qual foram derivadas —
a família 1 **desaparece** em vez de ser contornada com um `negativoElevado` que criaria
uma classe (o positivo e o atenção iam querer a versão elevada também).

### 7. `negativo` × `atencao` — ⚠️ 1,13:1, e o conserto foi de ÁREA, não de cor

| | |
|---|---|
| **onde** | `components/Dashboard.tsx`, os selos de tipo de alerta |
| **par** | `negativo` × `atencao` — **1,13:1** |
| **desfecho** | passa **com condição** |

Os dois passam folgado contra a superfície e colidem entre si — família 2. **Passa porque
o canal redundante é TEXTUAL:** o tipo sai por extenso ao lado (`TIPO_ROTULO` — "CPL
alto", "Perto do limite"), então a cor nunca é o único portador.

⚠️ **CONDIÇÃO:** se alguém remover o rótulo de texto, o par vira defeito **sem ninguém
tocar em cor**. É a mesma forma do amarelo × bege, que só vale com legenda rotulada.

🔑 **E o conserto do commit 5 é um caminho que nenhuma medição de contraste sugere
sozinha.** O chip ESCONDIA a colisão: com os três selos no mesmo fundo, a diferença entre
"CPL alto" e "Perto do limite" ficava só na cor do texto. O contorno na cor do tipo DOBRA
a área colorida — **o número dos dois continua 1,13:1; o que mudou foi quanto dele a tela
pinta.** Contraste é razão entre duas cores; legibilidade depende também de quanta
superfície carrega cada uma, e a régua não mede isso.

### 8. Contorno do `DeltaChip` neutralizado — 🛑 REPROVAVA · corrigido no commit 5

| | |
|---|---|
| **onde** | `components/DeltaChip.tsx`, estado neutralizado |
| **declarado** | `bordaForte` sobre `card` — **3,31:1** ✅ |
| **a tela pinta** | `bordaForte` sobre `neutroFundo` |
| **contraste real** | **2,97:1** 🛑 (piso 3) |

**Mesmo número e mesma causa do botão "Sair"** do commit 3 — `bordaForte` é derivado
contra o card e pousa numa superfície mais clara.

🛑 **E revelou um erro meu de nomeação.** O token criado no commit 3 se chamava
`navBordaForte` — nome POSICIONAL — e o segundo consumidor apareceu fora da sidebar em
dois dias. O achado que forçou a renomeação: **`neutroFundo` e `navHover` são o MESMO
valor**, ou seja o token certo já existia e só o nome mentia sobre onde ele servia.

**Conserto:** renomeado para **`bordaForteElevada`**, com "Elevada" definido no `brand.ts`
como *superfície mais clara que o card* (`hover`, `neutroFundo`, `chip`, `flutuante`).
Nome de lugar bloqueia reuso legítimo e força um terceiro token que seria duplicata.

### 9. Inputs de data em Inconsolata — ⚠️ métrica de fonte, não defeito

| | |
|---|---|
| **onde** | `components/Dashboard.tsx`, período personalizado (4 campos) |
| **testado** | servido por HTTP, as duas fontes, widget nativo |
| **desfecho** | Inconsolata aprovada — nada cortado |

```
                 largura   altura   scrollW = clientW ?
Space Grotesk     155px     38px     sim
Inconsolata       134px     36px     sim
```

Ícone do calendário intacto, placeholder `dd/mm/aaaa` inteiro. **Fica Inconsolata** — é o
quarto caso da régua (campo de formulário com valor de formato fixo).

⚠️ **A registrar:** o campo fica **21px mais estreito e 2px mais baixo**. Dois campos de
data ao lado de um botão de 38px vão desalinhar 2px. É métrica de FONTE, não layout — e o
conserto, se ficar visível, é do commit 8 ou depois, **nunca dentro de um commit de cor**.

### 10. Início — nenhum par desencontrado, e o porquê importa

A Início tem **uma superfície só**: tudo pousa no `card`. Sem empilhamento, a família 1 não
tem onde acontecer — foi a única tela até aqui em que a leitura não achou nada.

Vale registrar o contraste com o Dashboard (12 superfícies, 2 reprovações): **o risco da
família 1 é proporcional ao número de SUPERFÍCIES distintas da tela, não ao tamanho dela.**
A Início tem 480 linhas e zero achados; o Dashboard tem 1.400 e dois. Para as telas que
faltam (7 e 8), contar as superfícies antes é melhor previsão de esforço que contar linhas.

#### Dois falsos positivos da minha própria régua, registrados para não voltarem

**A borda do card contra a página é 1,80:1 — e não tem piso.** Apliquei 3:1 por reflexo. A
WCAG 1.4.11 cobre *componentes de interface* e *objetos gráficos*; a borda que separa
superfície é ESTRUTURA, não controle. E ela melhorou na migração: era 1,23:1 no tema escuro
anterior. O `brand.ts` já dizia isso — "nenhuma elevação chega a 3:1 e quem separa é a
borda" — eu é que medi contra um piso que não é dela.

**`negativo` × `atencao` (1,13) e `positivo` × `atencao` (1,16) nos alertas.** Passam pela
mesma condição do Dashboard: o canal redundante é TEXTUAL. A linha é
`<strong style={{color}}>{n}</strong> {texto}` — o número é colorido e o que ele significa
vem escrito ao lado ("contas com CPL alto", "contas gastando sem converter"). A cor é
ênfase redundante, nunca o único portador.

⚠️ **Mesma condição, mesmo risco:** remover o texto descritivo transforma os dois pares em
defeito sem ninguém tocar em cor.

### 11. Botão de fechar do `Modal` — 🛑 REPROVAVA · corrigido no commit 7

| | |
|---|---|
| **onde** | `components/Modal.tsx`, botão "fechar" do cabeçalho |
| **declarado** | `bordaForte` sobre `card` — **3,31:1** ✅ |
| **a tela pinta** | `bordaForte` sobre `chip` (o botão tem fundo próprio) |
| **contraste real** | **2,82:1** 🛑 (piso 3) |

🔑 **TERCEIRA ocorrência do mesmo defeito** — botão "Sair" 2,97 · `DeltaChip`
neutralizado 2,97 · este 2,82. E a mais grave das três pelo que ela é: **o controle que a
pessoa procura quando quer sair**.

**Conserto:** `bordaForteElevada`, que já existia. **Custou zero** — e é aí que a
renomeação do commit 5 se paga. Com o nome posicional (`navBordaForte`), esta terceira
teria exigido um TERCEIRO token para um valor que já existia duas vezes.

⚠️ **O conserto é no COMPONENTE, não na tela.** O `Modal` é compartilhado com a
/carteira (Análise de Conta), então a correção alcança as duas — o commit 8 **não deve
tratar isto como achado novo**.

### 12. O véu do modal quase não escurece — ⚠️ dependência invisível

| | |
|---|---|
| **onde** | `components/Modal.tsx`, `TEMA.overlay` |
| **medido** | a página vai de L=0,0030 para L=0,0006 — razão **1,05×** |
| **desfecho** | não é defeito; é o padrão do tema escuro |

O véu é `rgba(0,0,0,0.72)` sobre uma página que **já é quase preta** (`#19001E`).
Escurecer o escuro não separa nada. **Quem separa o modal do fundo é a MOLDURA**, em
`bordaForte` sobre o véu: **5,08:1**.

⚠️ **É dependência invisível, e é por isso que está aqui.** Quem clarear a superfície do
modal, ou enfraquecer a moldura achando que "o véu segura", faz a separação sumir sem
nenhuma conferência acusar — o véu continuará lá, aplicando 72% de preto sobre nada.

É o mesmo padrão do card contra a página (entrada 10): no tema escuro **a borda é
estrutura, não decoração**. A diferença é que aqui o elemento que parece fazer o trabalho
(o véu) é o que não faz.

### 13. /comercial — a rampa saiu do card pela primeira vez

A `BarraSplit` aparece sobre `card`, `chip` e `zebra` nesta tela. A rampa só tinha sido
medida contra o card (commit 4). Medida agora nas três, e as quatro passam:

```
         card    chip   zebra   fundo
serie1  10,05    8,56   10,38   14,71
serie2   6,19    5,27    6,40    9,06     entre si: 1,62
```

Os quatro pares entraram como declarados no `audita-tema` — antes a rampa passava por
sorte fora do card, que é o mesmo erro de reprovar por engano.

### 14. Esmaecimento de foco do `SlopeCpl` — ✅ isento, e a régua é a DURAÇÃO

| | |
|---|---|
| **onde** | `components/SlopeCpl.tsx`, `opacidadeDe` |
| **medido** | linhas não destacadas a 25%: **1,34:1** (positivo), 1,44 (negativo) |
| **desfecho** | isento — é estado de FOCO, não dado escondido |

**A régua é a DURAÇÃO, não o número:**

> Esmaecimento **transitório com gesto reversível** é FOCO — a pessoa pediu para isolar
> uma série, as outras estarem apagadas *é a função*, e soltar o mouse devolve tudo.
> Esmaecimento que **persiste sem o gesto** é DADO ESCONDIDO, e aí o piso de 3:1 vale.

🔑 **Se um dia o realce virar clique-para-fixar em vez de hover, ele MUDA DE CATEGORIA** e
esta linha passa a precisar de 3:1. Não é o valor 0,25 que decide; é o gesto.

E o piso não é alcançável sem matar a função: para as esmaecidas chegarem a 3:1 a
opacidade teria que subir a ~0,75, e aí não há realce. Mesmo raciocínio do `disabled:`,
isento pela WCAG 1.4.3.

⚠️ **Os dois números, para ninguém culpar nem absolver a migração por engano:**

```
tema anterior (card quase-preto) .. 1,69:1
marca 2026 (card roxo) ............ 1,34:1
```

**Piorou — e já estava abaixo de 3:1 antes.** Não é regressão da paleta.

⚠️ **QUINTA aparição do formato:** a conferência não pegou porque o valor é
`opacity={op}` com **variável**, e a busca procura literal. Somada às outras quatro no
`audita-tema`.

---

## 🔶 PENDÊNCIA NOMEADA — "CPL caindo é bom" está implementado QUATRO vezes

**Não é par desencontrado. É dívida estrutural, e vai para o EM ABERTO do projeto.**

A regra de negócio mais importante desta tela vive em quatro arquivos, cada um com a sua
expressão:

| arquivo | trecho |
|---|---|
| `components/DeltaChip.tsx` | `(menorMelhor ? delta < 0 : delta > 0) ? TEMA.positivo : TEMA.negativo` |
| `components/SlopeCpl.tsx` | `p.cplAtual < p.cplAnterior ? TEMA.positivo : p.cplAtual > p.cplAnterior ? TEMA.negativo : TEMA.muted` |
| `components/CardGestor.tsx` | `semConversao ? TEMA.dadoNeutro : cplVar < 0 ? TEMA.positivo : cplVar > 0 ? TEMA.negativo : TEMA.dadoNeutro` |
| `components/Waterfall.tsx` | `p.contribuicao < 0 ? TEMA.positivo : TEMA.negativo` |

**Hoje as quatro concordam** — li as quatro, uma a uma, no commit 7b. Nada garante que
continuem concordando.

🛑 **O risco em uma frase: divergência entre elas aparece como BÔNUS ERRADO, não como
tela feia.** Esta tela embasa bonificação de gestor. Um verde onde devia ser vermelho não
é defeito visual — é alguém recebendo por um CPL que subiu.

O `CLAUDE.md` já manda regra de negócio morar num módulo só, consumida por todas as
telas. Consertar é mudança estrutural: **não cabe em commit de cor**.

---

## Fechamento (commit 10)

- [x] Commit 4 — gráficos e rampa (3 entradas: sparkline reprovava, CPL adiado, HeroChart geométrico)
- [x] Commit 5 — Dashboard (4 entradas: selo reprovava, colisão de área, contorno do DeltaChip, inputs)
- [x] Commit 6 — Início + chips (zero desencontros; 2 falsos positivos da régua registrados)
- [x] Commit 7 — Comercial (3 entradas: Modal reprovava, véu invisível, rampa fora do card)
- [x] Commit 7b — Gestores (1 entrada + 1 pendência nomeada; zero reprovações)
- [ ] Commit 8 — Carteira, Orientações, Fila, Recuperação, modais
- [ ] Commit 10 — revisar a lista inteira e decidir o que vira par declarado novo
