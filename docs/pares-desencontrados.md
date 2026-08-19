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

---

## Fechamento (commit 10)

- [ ] Commit 4 — gráficos e rampa
- [ ] Commit 5 — Dashboard
- [ ] Commit 6 — Início + chips
- [ ] Commit 7 — Comercial + Gestores
- [ ] Commit 8 — Carteira, Orientações, Fila, Recuperação, modais
- [ ] Commit 10 — revisar a lista inteira e decidir o que vira par declarado novo
