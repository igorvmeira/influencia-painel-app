# Pares desencontrados — declarado ≠ pintado

> **REABERTA em 20/08/2026** — pendência 4, a barra neutra sobre o trilho.
> ~~**FECHADA em 18/08/2026**~~, no commit 10 da migração de marca 2026. 19 entradas
> revisadas: **6 reprovavam e foram corrigidas**, 13 passavam (algumas por sorte) e viraram
> par declarado ou condição escrita.

---

## 🔶 PENDÊNCIAS NOMEADAS — o que fica em aberto, e o que custa

Três coisas saem desta migração sem conserto. **Nenhuma é esquecimento; as três são
decisão registrada**, com o motivo e o custo de não mexer.

### 1. O balão de orientação — três semânticas sem texto simultâneo

**O que é:** verde, amarelo e vermelho num símbolo de 13px, colidindo em 1,16 · 1,13 ·
1,32. O `title` só existe no hover e **não existe no toque**.

**O que custa se ninguém mexer:** quem não distingue matiz — ou usa a tabela no celular —
vê a mesma bolinha em três situações diferentes. A informação "esta conta vai mal" fica
invisível para essa pessoa, na tela onde ela decidiria agir.

**A saída já está desenhada:** forma por estado (preenchido / vazado / meio-preenchido).
Sem token novo. Ver entrada 17.

### 2. "CPL caindo é bom" implementado em quatro arquivos

**O que é:** `DeltaChip`, `SlopeCpl`, `CardGestor` e `Waterfall` cada um com sua expressão
da mesma regra. Hoje as quatro concordam — foram lidas uma a uma no commit 7b.

🛑 **O que custa se ninguém mexer:** divergência entre elas aparece como **bônus errado**,
não como tela feia. Um verde onde devia ser vermelho é alguém recebendo por um CPL que
subiu. E não há conferência que pegue: as quatro passam contraste, passam typecheck, e a
divergência só aparece no contracheque.

**A saída:** a regra num módulo só, consumida pelas quatro. É mudança estrutural.

### 3. A logo definitiva (commit 9) não entrou

**O que é:** `LOGO_E_SIMBOLO.svg` e `PATTERN_INFLUENCIA.svg` **nunca chegaram ao
repositório**. Procurados em `public/`, no `git ls-files` e na pasta pai.

⚠️ **NÃO é regressão:** o `NodeMark` placeholder já estava lá antes da migração e
acompanhou o flip sozinho — ele usa `TEMA.destaque`, e está em **15,32:1** sobre a
sidebar, que é a versão AMARELA que o manual manda em fundo escuro. A tela está correta;
o que falta é a marca de verdade.

### 📋 QUANDO O SVG OFICIAL CHEGAR — a lista do que trocar

**Lista de substituição, NÃO abstração.** Um módulo único não se justifica aqui e o motivo
é medido: `app/icon.png` é **convenção de arquivo do Next** — ele lê o ARQUIVO, não um
módulo, então esse é irredutível de qualquer jeito. E o `NodeMark` **já é** um componente
único (`components/NodeMark.tsx`), com três chamadas. Não há o que criar; criar seria o erro
dos `chipRoxo`/`chipAzul`/`chipBege`, apagados no commit 6 por não terem consumidor.

| arquivo | o que é | existe hoje? |
|---|---|---|
| `app/icon.png` | favicon (o Next gera o `<link rel="icon">`) | 🔶 provisório, gerado do PNG |
| `app/apple-icon.png` | ícone iOS, 180×180 | 🔶 provisório, gerado do PNG |
| `components/NodeMark.tsx` | o símbolo em SVG inline — **3 chamadas**: `Shell` (sidebar e cabeçalho móvel) e `login` | 🔶 placeholder desenhado à mão |

⚠️ **O `NodeMark` recebe `cor` e `size` por prop e usa `TEMA.destaque` como padrão.** Quem
trocar o desenho precisa manter as duas props — a sidebar chama sem argumento (26px) e o
cabeçalho móvel chama com `size={22}`.

🛑 **E NÃO existe `public/` neste projeto.** Não crie uma para isto: nada da marca aparece
na tela como imagem hoje — o cabeçalho usa o `NodeMark` inline. `public/` só se justifica
quando um componente for exibir a assinatura como arquivo, e aí a decisão é outra.

**O que falta chegar da agência:**

| arquivo | formato | onde entra |
|---|---|---|
| assinatura completa | SVG, texto em curvas, 4 cores (amarela, branca, roxa, preta) | login |
| símbolo isolado | SVG, mesmas 4 cores | sidebar, carregamento, estado vazio |
| versão monocromática 1 cor | SVG, silhueta chapada | favicon 16px |
| horizontal e empilhada | SVG, se existirem | sidebar de 240px vs login |

**E três perguntas sem resposta:** área de respiro e tamanho mínimo; se a logo pode ir
**sobre o amarelo** (o manual cobre fundo escuro e claro, não o amarelo, e nós usamos
amarelo como preenchimento); e se já existe favicon desenhado.

### 4. A paleta não tem NEUTRO legível como BARRA sobre o trilho padrão

**Descoberto em 20/08/2026**, construindo a primeira barra sem semântica do painel
(Demanda 2, qualificação por porte).

**O que é:** o comprimento de uma barra É o dado, então ela precisa de 3:1 contra o que
está atrás — e o que está atrás é o TRILHO (`barraNeutra`), não o card. Os três tokens
neutros reprovam:

| token | × `barraNeutra` | × `card` |
|---|---|---|
| `dadoNeutro` | **2,27** 🛑 | 3,31 ✅ |
| `bordaForte` | **2,27** 🛑 | 3,31 ✅ |
| `bordaForteElevada` | **2,66** 🛑 | 3,89 ✅ |

Dos **36 tokens da paleta, só 12 passam contra o trilho E contra o card** — e todos são
semânticos (`positivo`/`negativo`/`atencao`), de série (`serie1`/`serie2`) ou de texto
(`muted`/`texto`/`placeholder`). Nenhum é neutro.

🔑 **POR QUE SÓ APARECEU AGORA:** todas as barras anteriores usam cor semântica ou
`destaque`, e todas passam (≥3,40 contra o trilho). O caso neutro nunca tinha existido.

**O contorno que está no ar:** a prop `semTrilho` do `BarraDado` — a barra pousa direto no
card, onde `dadoNeutro` dá 3,31 e passa. Padrão DESLIGADO; nenhuma barra existente mudou.

🛑 **O que custa se ninguém mexer:** o contorno resolve UMA tela. A segunda barra neutra
que aparecer vai bater no mesmo muro, e aí `semTrilho` não serve — porque tirar o sulco de
toda barra neutra apaga a referência de "quanto falta" onde ela é informação.

**Por que NÃO foi consertado com token novo agora, e a decisão é do Igor:** mexer numa
paleta que fechou hoje de manhã para atender uma tela é a ordem invertida. **Token de
paleta se cria quando o buraco é a CLASSE, não quando é o primeiro caso.** Quando a segunda
barra neutra aparecer, o token se justifica com dois casos reais — e aí ele nasce medido
contra o trilho E contra o card, que é a conferência que faltava.

**A conferência já existe:** `audita-tema.js` seção 6 mede todo token usado como `cor={}`
de barra contra `barraNeutra`, resolvendo apelidos locais (`const RED = TEMA.negativo`) e
os dois lados de um ternário. Hoje: 19 medidas, 2 isentas por `semTrilho`, 3 não resolvidas
(variáveis genuinamente dinâmicas, que ela DIZ que não cobre).

⚠️ **E o registro que mais vale desta entrada:** o `audita-tema` saiu **VERDE** antes disso.
A seção 2 media `dadoNeutro` contra `card` — o par DECLARADO — e a tela pintava sobre o
trilho. É a família 1 (superfície errada) outra vez, e foi achada LENDO, não pela
ferramenta. A seção 6 nasceu dessa reprovação, que é o padrão desta casa: **conferência
nova se escreve DEPOIS do defeito, para o próximo não depender de alguém olhar.**

### ⚠️ E uma divergência ainda sem resposta da agência

**`#530163` (manual) contra `#530263` (SVG entregue)** — um dígito. Vale o do MANUAL, e é
o que está em `lib/brand.ts`. Se a resposta for que o manual errou, o token muda **num
lugar só** e o `audita-tema` reconfere os 41 pares automaticamente. Registrada no README
desde o commit 1b.

---

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

### 15. Card sobre card na /carteira — ⚠️ 1,00:1, resolvido por BORDA · NÃO é regressão

| | |
|---|---|
| **onde** | `Modal` → `AnaliseConta` → `CriativosDaConta`, três andares |
| **medido** | andar 1 (`card` do Modal) e andar 3 (`card` do bloco) = **1,00:1** |
| **o que separa** | a borda do bloco, `bordaForte` sobre `card` = **3,31:1** |

🛑 **NÃO É REGRESSÃO DA PALETA.** `card` sobre `card` sempre deu 1,00:1 — no tema escuro
anterior também, e no claro antes dele. **A diferença é que agora foi medido.** Quem
reencontrar isto precisa saber que a migração de marca não causou.

A escada inteira cabe entre 1,03 e 1,27, porque foi desenhada para UM nível de elevação.
**A regra ficou escrita no `brand.ts`:** empilhamento além de um nível se resolve por
borda, não por superfície.

Rejeitados, com o motivo:

- **token `cardEncaixado`** — prometeria um nível abaixo para o quarto andar, e a escada
  não tem para onde ir. Promessa que a paleta não pode cumprir.
- **tirar o fundo do `CriativosDaConta`** — ele é componente COMPARTILHADO; o fundo
  próprio é o que o faz funcionar fora do modal.

### 16. Selos "Ativa" / "Pausada" — ⚠️ 1,16:1, condição textual

| | |
|---|---|
| **onde** | `components/Carteira.tsx`, coluna de status |
| **par** | `positivoFundo` × `chip` — **1,16:1** |
| **desfecho** | passa **com condição** |

Os dois selos colidem como superfície. **Passa porque cada um tem a palavra escrita
dentro** — "Ativa" e "Pausada". A cor nunca é o único portador.

⚠️ **CONDIÇÃO:** se alguém trocar o texto por um ponto colorido, o par vira defeito sem
ninguém tocar em cor. Terceira vez que esta condição aparece (Dashboard, Início, aqui).

### 17. 🔶 O balão de orientação — PENDÊNCIA: três semânticas sem texto simultâneo

| | |
|---|---|
| **onde** | `components/BalaoOrientacao.tsx`, em TODAS as linhas da tabela |
| **pares** | positivo × atencao **1,16** · atencao × negativo **1,13** · positivo × negativo **1,32** |
| **desfecho** | 🔶 dívida registrada, conserto fora deste commit |

Verde, amarelo e vermelho são indistinguíveis por luminância num símbolo de **13px**.

🛑 **NÃO é regressão:** as três semânticas sempre foram próximas em luminância (6,57 ·
5,65 · 4,98 sobre o card). **O que muda é o CONTEXTO** — aqui elas aparecem como símbolo
sem texto ao lado, ao contrário do Dashboard (rótulo escrito) e da Início (frase). É o
ÚNICO lugar do painel onde as três aparecem sem texto simultâneo.

⚠️ **O `title` existe e não basta:** só aparece no HOVER e **não existe no TOQUE**.
Registrar isto como "resolvido pelo title" seria escrever que está resolvido só para quem
usa mouse.

✅ **A saída conhecida:** forma diferente por estado — **preenchido / vazado /
meio-preenchido**. É a mesma solução do selo de alerta do commit 5: resolve por ÁREA e
FORMA, sem token novo. Não entrou aqui porque é mudança de FORMA, e commit de cor não
carrega isso — a regra que segurou a migração desde o commit 1.

### 18. 🔑 NOTA PERMANENTE — o primeiro suspeito de uma divergência é a RÉGUA

**Duas vezes em um dia** a medição acusou algo que não existia, e nas duas o defeito era
do teste:

| o que a régua disse | o que era |
|---|---|
| balão vazado × cheio cinza = **1,00:1** | medi `dadoNeutro`; o balão usa **`muted`** — o par real é **1,70:1** |
| 6 pares declarados "que a tela não pinta" | a varredura só via o mesmo `style={{}}`; o fundo vinha de ANCESTRAL |

Nos dois casos eu **fui conferir antes de reportar**, e nos dois o código estava certo.

> **Antes de confiar num verde ou investigar um vermelho, releia o que o teste assume.**

⚠️ E o custo de não fazer isso é assimétrico: um falso positivo reportado vira trabalho
inventado; um falso NEGATIVO vira defeito que ninguém procura mais.

### 19. As quatro telas do commit 8 — a métrica refinada

| tela | linhas | superfícies | empilhamento | achados |
|---|---|---|---|---|
| Carteira | 272 | 9 | **três andares** | **2** |
| Fila de Contas | 607 | 9 | plano | 0 |
| Recuperação | 187 | 6 | plano | 0 |
| Orientações | 281 | 6 | plano | 0 |

🔑 **A métrica não é quantas superfícies, é quantas se SOBREPÕEM.** A Fila tem 8
superfícies próprias — o maior número do lote — e **zero achados**: são oito avisos lado a
lado, nenhum empilhado. A Carteira tem 272 linhas e três níveis de profundidade, e rendeu
os dois.

Para quem for planejar a próxima migração: **conte os níveis de aninhamento, não os
tokens de fundo.**

---

## Fechamento — commit 10, 18/08/2026

| commit | tela | achados |
|---|---|---|
| 3 | Shell, sidebar, login | 🛑 1 (moldura do "Sair") |
| 4 | gráficos e rampa | 🛑 1 (opacidade da sparkline) + 2 registros |
| 5 | Dashboard | 🛑 2 (selo do alerta, contorno do DeltaChip) |
| 6 | Início | 0 — uma superfície só |
| 7 | Comercial | 🛑 1 (botão de fechar do Modal) |
| 7b | Gestores | 0 de cor · 1 pendência estrutural |
| 8 | Carteira, Orientações, Fila, Recuperação | 0 de cor · 3 registros |

**Seis reprovações, todas encontradas por LEITURA — nenhuma por ferramenta.** As três
conferências novas (hierarquia, vizinhas da rampa, tinta transformada) foram escritas
DEPOIS de cada defeito, e existem para o próximo não depender de alguém olhar.

🔑 **Quatro das seis eram o mesmo defeito**: `bordaForte` pousando em superfície mais
clara que o card (2,97 · 2,97 · 2,82) e o selo do alerta sobre o `chip` (4,24). A família
1 não é um punhado de casos isolados — é uma classe, e ela some quando o token tem nome
semântico em vez de posicional.