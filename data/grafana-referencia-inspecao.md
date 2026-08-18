# A instância de referência — o que ela realmente é

Inspecionada em **17/08/2026**, com sessão autenticada pelo Igor (a credencial nunca passou
por mim). Só leitura: estrutura, CSS e timing. **Nenhum número, nome ou valor de cliente
atravessou.** Nada gravado em disco durante a inspeção, nada em log.

Companheiro do [`bi-comercial-inventario.md`](./bi-comercial-inventario.md) — os dois
levantamentos de ferramenta de terceiro ficam lado a lado.

---

## 🛑 O ACHADO PRINCIPAL: não é um dashboard de Grafana

**Isto corrige uma premissa que orientou semanas de trabalho.**

O que se vê nos prints não é a linguagem visual do Grafana. É um **app HTML/CSS escrito à
mão que roda dentro de painéis do Grafana**. No dashboard principal, dos 59 painéis:

| tipo de painel | quantos | o que é |
|---|---|---|
| `marcusolsson-dynamictext-panel` | 20 | HTML/CSS livre |
| `text` | 20 | HTML/CSS livre |
| `volkovlabs-echarts-panel` | 12 | Apache ECharts |
| **`timeseries`** | **6** | **painel nativo do Grafana** |
| `table` / `row` | 18 | estrutura |

**40 painéis de HTML puro**, com média de **~6.500 caracteres de template cada** — cerca de
260 KB de CSS escrito à mão dentro do JSON do dashboard. **Só 6 de 59 são painel nativo.**

> ⚠️ **A consequência prática:** quando extraímos "a linguagem visual do Grafana" da fonte
> open source, extraímos a fonte errada. Aquilo descreveu o Grafana — não descreveu isto.
> Toda conclusão daquele levantamento vale para o Grafana e **não** vale para esta instância.
> A mais importante: *"o uPlot não anima"*, que é verdade e é irrelevante aqui (ver item 3).

Também é customizado: página de login com copy de marketing, home que **embute outro
dashboard num iframe** em modo kiosk, e navegação com pastas e emoji.

---

## ✅ As duas convergências independentes

Valem como validação: **dois times resolvendo o mesmo problema chegaram na mesma resposta**,
sem contato.

**1. O token de tinta sobre a cor de marca.**

    deles:  --inf-accent-ink: #1b0f22
    nosso:  textoSobreDestaque: #0F0E0B

Mesmo problema (texto sobre fundo de destaque precisa de token próprio, nunca o token de
texto geral), mesma solução, nomes quase iguais. O nosso nasceu de um defeito medido — a
pill dourada do Shell caindo para 1,60:1 no tema escuro.

**2. A curva de easing.**

    deles:  cubic-bezier(.22,1,.36,1)
    nosso:  MOVIMENTO.ease = cubic-bezier(.22,1,.36,1)

**Idêntica, dígito por dígito.** É a curva que cobre ~80% da distância nos primeiros 40% do
tempo — a que respeita a regra de "a animação não pode fazer esperar para ler".

A diferença está na duração: eles rodam a barra em **1,1s**, nós em **520ms**.

---

## 1. Customizações — o sistema de tokens deles

Quinze variáveis CSS `--inf-*`, estruturalmente quase idêntico ao nosso:

| papel | deles | nosso |
|---|---|---|
| superfícies | `--inf-surface` `#17121f` · `-2` `#221a2d` · `-3` `#2d2339` | `card` `#1C1B17` · `hover` `#26241E` · `flutuante` `#302E27` |
| bordas | `--inf-line` `rgba(255,255,255,.09)` · `--inf-line-2` `.16` | `borda` `#2E2C26` · `bordaForte` `#6E6A5E` |
| texto | `--inf-fg` `#f6f2ea` · `--inf-fg-3` `#8a8194` | `texto` `#F2F0EA` · `muted` `#9C978B` |
| destaque | `--inf-accent` `#ffdd02` + soft/mid/ink | `destaque` `#F3B60E` + tints |
| negativo | `--inf-neg` `#ff6f83` + soft | `negativo` `#F2726A` + `negativoFundo` |
| extra | `--inf-plum` `#a72cc4` | — |

⚠️ **A BASE CROMÁTICA É OUTRA.** A deles é **roxa** (`#17121f`, `#221a2d`, `#2d2339`, mais o
`plum`); a nossa é **quente/oliva** (`#1C1B17`, `#26241E`). O destaque deles é amarelo puro
saturado; o nosso é o dourado da marca. **Nunca copiamos a paleta — e não devemos.**

Só o token de texto é quase o mesmo (`#f6f2ea` contra `#F2F0EA`), o que é convergência de
"off-white legível sobre escuro", não cópia.

---

## 2. Densidade — o "8px contra 20px" era um mal-entendido

O `padding: 0` e `border-radius: 6px` que eu tinha medido antes são a **moldura nativa do
Grafana**, que eles deixam transparente. O espaçamento real vive dentro do HTML deles:

| | deles | nosso |
|---|---|---|
| padding de card | 8–16px vertical · 13–18px horizontal | **20px** |
| gap | 6–14px | 16px |
| raio | 14px (pill 100px) | 12px |
| rótulo em caps | **9,5–11px** | 11px |
| `letter-spacing` | **.12–.16em** | .06em → **.13em** (corrigido) |
| peso do número | **800** | 600 |
| número herói | `clamp(26px, 3.4vw, 40px)` | 26/34px fixos |

**A diferença real é de 4 a 12px, não de 12.** E eles compensam com fonte menor e tracking
muito mais aberto.

**Densidade horizontal: eles NÃO são densos.** 59 painéis em 40 linhas do grid, média de
**1,5 painel por linha**, máximo 3. Empilham tanto quanto nós.

---

## 3. Animação — a conclusão anterior estava errada para esta instância

*"O uPlot não anima"* vale para painel nativo, e eles quase não usam painel nativo.

**Sete `@keyframes` e mais de doze transições no CSS deles:**

    inf-ttl-pulse    2.4s ease-in-out INFINITE
    inf-tb-entra     .32s cubic-bezier(.2,.9,.3,1.1)   ← overshoot
    rtm-sobe         .5s  cubic-bezier(.2,.9,.28,1)
    rtm-tracao       1s   ease-out
    transition: width 1.1s cubic-bezier(.22,1,.36,1)   ← nosso easing
    hover            .16s                               ← nosso: 120ms

**Nos gráficos ECharts:** `animationDuration: 700`, `animationEasing: 'cubicOut'`.

Confirmado em tempo de execução: `document.getAnimations()` devolveu **`inf-ttl-pulse` com
`iterations: Infinity`** rodando. E os gráficos renderizam em **SVG**, não canvas.

---

## 4. Tipos de painel e nossos equivalentes

| deles | temos? |
|---|---|
| HTML livre (40 painéis) | ✅ componentes React — tipados e testáveis, o que 6,5 KB de template em JSON não é |
| ECharts (12) | ⚠️ cobrimos as formas que usamos (HeroChart, Sparkline, ColunasComMedia, BarraDado); ECharts é muito mais capaz |
| `timeseries` (6) | ✅ HeroChart |
| `table` | ✅ |
| **`row` colapsável (17)** | ❌ **não temos** |
| **variável de template por consulta (7)** | ❌ não temos — os filtros deles vêm do banco |

---

## 5. O que foi adotado, e o que foi RECUSADO com motivo

### Adotado

**Tracking dos rótulos em caps: `.06em` → `.13em`** (17/08/2026). Era a diferença
tipográfica mais visível entre os dois. A 11px isso vai de 0,66px para 1,43px por
caractere — **+15px de largura num rótulo de 20 caracteres**. O valor `.13em` é um dos que
eles usam, e cai dentro da faixa medida (.12–.16em).

Aplicado nos 7 rótulos de 11px em caps: `KpiCard`, `Inicio` (2), `Comercial`,
`AnaliseConta` (2), `OrientacaoDoCliente`.

> ⚠️ **`SecaoHeader` não entrou porque não tem rótulo em caps** — o título dele é 15px
> normal com tracking NEGATIVO (-.01em). Ficou registrado para ninguém procurar depois.
>
> E restam **7 outros rótulos pequenos** ainda em `tracking-wider` (.05em) no Dashboard,
> Gestores, Shell, CardGestor e NichosSection. Não foram tocados: são telas aprovadas, e a
> unificação é decisão à parte. Os títulos de seção de 13px ficam como estão — .13em num
> heading de 13px fica arejado demais.

### 🛑 RECUSADO POR PRINCÍPIO — as cinco, com o porquê

> ⚠️ Só entra aqui o que foi rejeitado por uma razão que **não depende de medida**. O que
> foi apenas calibrado tem seção própria logo abaixo — misturar os dois faz a lista dizer
> que um caminho está fechado quando ele só está aferido.

Registrado porque **daqui a três meses alguém vai olhar um print da referência e tentar
trazer**. Cada recusa tem motivo próprio, não é conservadorismo:

| o que | por que NÃO |
|---|---|
| **A paleta roxa** (`#17121f`, `--inf-plum`) | A nossa vem do **dourado da marca Influência**. A base cromática deles é roxa e o destaque é amarelo puro. Adotar seria trocar a identidade do cliente pela de outro. |
| **`clamp(26px, 3.4vw, 40px)` no número herói** | Auto-dimensionar ao viewport é **frágil e quebra em tela estreita**. Já decidimos por dois tamanhos FIXOS (26px e 34px), e a decisão é de TELA, não de componente. |
| **Sombras pesadas** (`0 22px 60px`, `0 8px 26px`) | O `brand.ts` proíbe, e no tema escuro sombra faz pouco — **não há luz para bloquear**. Quem eleva o card aqui é a BORDA. Copiar isso gastaria peso visual sem ganhar profundidade. |
| **Animação infinita** (`inf-ttl-pulse`, 2,4s, `Infinity`) | Movimento perpétuo **compete com a leitura o tempo todo**. É a mesma família do alarme que dispara todo dia: o que está sempre acontecendo deixa de ser sinal. |
| **Peso 800 nos números** | Com `tabular-nums` e o dourado, **600 já sustenta a hierarquia**. 800 num número grande vira mancha, e a régua da casa é tipografia forte sem peso decorativo. |

### ⚖️ AJUSTADO, NÃO RECUSADO — mesmo princípio, número diferente

**A duração da barra (1,1s deles contra 520ms nossos).** Não é recusa de princípio — é a
nossa regra aplicada: *se a animação faz alguém esperar para ler o número, ela está errada.*
1,1s de crescimento de barra é mais que o dobro do nosso. Fica como escolha consciente, não
como lacuna.

---

## 6. Onde continuamos atrás — e o que já foi decidido

| lacuna | custo | estado |
|---|---|---|
| **Período global** | alto — estado entre telas, mexe em telas aprovadas | plano à parte, junto das seções colapsáveis |
| **Seções colapsáveis** | médio — a /comercial é a que mais sofre | idem, porque as duas mexem no mesmo lugar |
| Filtros vindos de consulta | médio | não priorizado |

**E o que eles não têm:** nada da camada de honestidade (ver a seção correspondente em
[`README.md`](./README.md)). Um dashboard mostra o número; este painel mostra o número com
o que ele não prova.

---

## 7. Nota de escopo

Os dashboards desta instância consomem **PostgreSQL** replicando um ERP de provedor de
internet — os nomes técnicos indicam pré-compra, retenção e cancelamentos. **Não é o nosso
escopo** (Meta Ads + Xmax), e é o que o Igor já havia sinalizado: parte do que se vê ali
depende de dado que não temos e não teremos.

Comparar composição visual faz sentido. Comparar **cobertura de indicador** não faz.
