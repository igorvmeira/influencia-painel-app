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

---

## Fechamento (commit 10)

- [x] Commit 4 — gráficos e rampa (3 entradas: sparkline reprovava, CPL adiado, HeroChart geométrico)
- [ ] Commit 5 — Dashboard
- [ ] Commit 6 — Início + chips
- [ ] Commit 7 — Comercial + Gestores
- [ ] Commit 8 — Carteira, Orientações, Fila, Recuperação, modais
- [ ] Commit 10 — revisar a lista inteira e decidir o que vira par declarado novo
