# Perguntas abertas para a agência

Coisas que **só a agência pode responder** e que travam feature. Cada item tem o número
medido, para a conversa não depender de memória.

> Regra de uso: quando uma resposta chegar, ela vai para o arquivo da feature
> correspondente (`README.md` ou `xmax-integracao.md`) **com a data e quem decidiu**, e o
> item sai daqui. Este arquivo é fila, não histórico.

---

## 1. O que são `origem 0` e `origem 2`? (bloqueia a quebra por origem)

As oportunidades do Xmax têm um campo `origem` numérico, sem nome. **Medido em
17/08/2026**, nas 4.881 oportunidades gravadas:

| origem | total | % do total | últimos 6 meses | % recente |
|---|---|---|---|---|
| **2** | 2.948 | 60,4% | 1.146 | **82,4%** |
| **0** | 1.894 | 38,8% | 234 | **16,8%** |
| 5 | 17 | 0,3% | 0 | — |
| 1 | 9 | 0,2% | 8 | 0,6% |
| 4 | 6 | 0,1% | 0 | — |
| 3 | 5 | 0,1% | 1 | 0,1% |
| 6 | 2 | 0,0% | 2 | 0,1% |

**Duas origens carregam 99,2% do volume e não sabemos o que nenhuma das duas é.**

E a mistura MUDOU: a origem 0 caiu de ~39% do histórico para ~17% dos últimos 6 meses.
Isso pode ser mudança de processo, campo que deixou de ser preenchido, ou origem nova
virando padrão — e a leitura de uma série por origem depende de saber qual.

**Por que trava:** um gráfico com duas fatias chamadas "2" e "0" **parece informação e não
é**. Preferimos a rampa de 5 cores esperando a um gráfico enganoso no ar.

**O que precisamos:** o nome de cada uma das 7, e principalmente de 0 e 2. Se a 0 saiu de
uso, saber quando e por quê.

---

## 2. Regra de desempate: pessoa com origens diferentes

A `origem` é por **oportunidade**; a contagem de leads novos é por **pessoa**. Quando a
mesma pessoa tem oportunidades de origens diferentes, qual vale?

**Medido:** **38 pessoas** têm mais de uma origem. Em **5 delas** as duas regras candidatas
dão resultados diferentes:

```
Jesse Grupo ON + Fibra     primeira=2  mais frequente=0   [2×1 0×2]
Ediana | Infornet          primeira=5  mais frequente=2   [5×1 2×3]
```

**As opções:** a **primeira** origem (como a pessoa chegou) ou a **mais frequente** (por
onde ela mais vem).

**É decisão de negócio, não técnica** — as duas são implementáveis e respondem perguntas
diferentes: "de onde vem nosso lead" contra "por onde esse cliente se relaciona". Hoje
muda 5 pessoas; a regra tem que existir antes de a base crescer.

---

## 3. O nome de 17 etiquetas — as outras 18 a API já entregou

**Resolvido em 17/08/2026 pela própria spec**, sem depender de ninguém. Existem **dois**
endpoints de etiqueta, em namespaces diferentes — era isso que faltava:

| endpoint | grupo na spec | devolve |
|---|---|---|
| `getTags` | Contatos | 15 etiquetas (id + nome) |
| `getChatTags` | **Fila** | 3 etiquetas (6, 12, 13) |

União: **18 dos 35 ids em uso**. Varridos os 140 operationIds do arquivo — não existe
terceiro endpoint. E as etiquetas são **globais da instância**: as filas 17 e 19 devolvem
exatamente a mesma lista da 7.

### 🎉 As faixas de porte estão nomeadas — e são SEIS

| tag | nome | oportunidades |
|---|---|---|
| 39 | menos de 1k | 106 |
| 40 | 1k a 3k | 44 |
| 41 | 3k a 5k | 19 |
| 42 | 5k a 10k | 21 |
| 43 | Mais de 10k | 40 |
| **38** | **Sem Perfil** | 18 |

`[38] Sem Perfil` não estava na lista original da agência e pertence à família.

> 🛑 **A PERGUNTA DA DEMANDA 2 MUDOU DE NATUREZA.** Não é mais "não sabemos o nome" — é
> **quase ninguém etiqueta**. Só **~212 das 2.670 pessoas (8%)** têm faixa; uma tela de
> qualificação por porte mostraria **92% em "sem faixa"**, descrevendo o preenchimento do
> CRM e não a carteira.
>
> **Pergunta para o dono:** (a) passar a etiquetar sempre, (b) uma tela que assume que a
> maioria não tem faixa e diz isso, ou (c) esperar o preenchimento subir.

### Outras que a API resolveu

`[4] Trafego Pago - FaceAds - Provedor` (2.596) · `[26] MARCO - NE` (1.516) ·
`[27] Andre - NE` (182) · `[19] Indicacao` (66) · `[6] GUILHERME` (40) ·
`[10] LEAD RECUPERADO- PROVEDOR DE INTERNET` (25) · `[9] LEAD RECUPERADO- AUTOMACAO
AUTORIDADE` (15) · `[18] No-Show` (14) · `[11] REMARKETING - WHATSAPP` (5) ·
`[12] GOOGLE` (4) · `[13] ABRINT` (4) · `[29] Plano Start` (1)

### ❌ As 17 que faltam — e por que o BI NÃO resolve

**7, 8, 14, 15, 17, 20, 21, 23, 28, 31, 32, 33, 34, 35, 36, 37, 44.** As de maior volume:
`[17]` com 123 oportunidades, `[34]` com 96, `[8]` com 63, `[44]` com 50.

> 🛑 **NÃO TENTE PELO POWER BI — verificado em 17/08/2026, não funciona.**
>
> A ideia natural é usar o BI publicado do dono, que mostra etiquetas. Duas razões:
>
> 1. **O BI não mostra ID em lugar nenhum** — nem na tabela, nem no filtro. Só nomes. E
>    nome sem ID não serve: casar por nome é a regra que esta casa não quebra.
> 2. **Pior: o BI não conhece essas etiquetas.** A coluna `Etiqueta` dele é a família de
>    PORTE (a mesma que a aba Comercial chama de `temperatura`). Medido percorrendo a
>    tabela: **613 amostras de linha, 4 rótulos distintos** — "menos de 1k", "1k a 3k",
>    "3k a 5k" e "Etiquetar" (o valor de não-etiquetado). Todos já nomeados pela API.
>
> Havia um caminho rigoroso — juntar por `id_oportunidade`, que é chave única e não nome —
> mas ele morre na razão 2: **não há o que juntar.** A única fonte para as 17 é a agência.

**O que precisamos:** o nome das 17 acima, e a confirmação de que `[38]`–`[43]` são as
faixas de porte e em que ordem.

---

## 4. Existe campo de EMPRESA próprio no Xmax que a API não expõe?

A lista de "quem está parado em cada etapa" precisava de uma coluna de empresa. **Ela não
existe.**

**Medido em 17/08/2026:** os **489 títulos** de oportunidade estão preenchidos, e **478
(97,8%) contêm parte do nome da pessoa**:

```
ALINNE | TEK TELECOM
Fernando Lourenço Grupo Technet
MAERCIO | MIO TELECOM
Marivaldo Provedor
```

O CRM mistura **nome e empresa no mesmo campo**, sem separador confiável — ora `|`, ora
espaço, ora nada. Partir a string faria o painel afirmar o que não sabe, então a tela mostra
**uma coluna só, com o título cru, rotulada "título no CRM"** — nunca "empresa".

**O que precisamos:** se a interface do Xmax tem um campo de empresa separado que a API não
devolve, vale pedir à Atenderbem que ele apareça — e aí a coluna passa a ser de verdade.
**Se não existir**, o CRM inteiro tem nome e empresa misturados, e isso é decisão de processo
da agência, não limitação do painel.

## 5. Quando clicar em "ganhar"? (bloqueia a Etapa E do comercial)

Pendência antiga, mantida aqui porque continua travando. O CRM tem `status = 1` (ganha) com
`closerecurrentvalue`, mas **o clique não tem regra na agência** — e por isso a data de
fechamento é a data do CLIQUE, não da venda.

**Medido:** das 38 ganhas, **12 fecharam em 03/05/2025, todas no mesmo dia**, e 11 em
março/2026. Entre out/2025 e fev/2026, zero. Não é sazonalidade: é sessão de marcação
retroativa.

**O que precisamos:** o momento em que o comercial deve clicar em ganhar, para a série
mensal de vendas passar a significar alguma coisa.

---

## 6. Existe campo de MOTIVO DA PERDA no Xmax?

O painel mostra **quando e em que etapa** o lead morreu, e **nunca por quê** — a API não
devolve motivo. Isso já está dito na tela, não é omissão silenciosa.

**O que precisamos:** se a interface do Xmax oferece um campo de motivo que a API não
expõe, ou se ele não existe. Se existir e for preenchido, vale pedir à Atenderbem que
apareça na API.

---

## 7. Cores secundárias oficiais da marca

Dois tokens do painel (`chipTerra`/`terraTexto` e `chipOliva`/`olivaTexto`) estão marcados
`[PROVISÓRIO]` em `lib/brand.ts`: são escolha de design, não cor de marca. A marca oficial
tem só o dourado.

**O que precisamos:** as cores secundárias oficiais, se existirem. Com elas, troca-se o hex
em um arquivo e o resto do app acompanha — e o `[PROVISÓRIO]` sai.
