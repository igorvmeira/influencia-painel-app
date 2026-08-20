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

## 3. ~~O nome de 17 etiquetas~~ — não são desconhecidas, são INALCANÇÁVEIS

**Resolvido em 17/08/2026 pela spec; a CONCLUSÃO corrigida em 20/08/2026 por medição.**

Existem **dois** endpoints de etiqueta, e era isso que faltava saber:

| endpoint | grupo na spec | devolve | vocabulário |
|---|---|---|---|
| `getTags` | Contatos | 15 etiquetas | **contato** |
| `getChatTags` | **Fila** | 3 etiquetas (6, 12, 13) | **conversa** |

Varridos os 140 operationIds do arquivo — **não existe terceiro endpoint**. Reconferido em
20/08/2026.

### 🛑 O QUE ESTAVA ERRADO AQUI

A frase *"as etiquetas são globais da instância: as filas 17 e 19 devolvem exatamente a
mesma lista da 7"* era uma **conclusão tirada de 3 filas de 7**. As outras quatro não
foram consultadas, e o texto não dizia isso.

⚠️ E ela contradiz o próprio sumário do endpoint na spec: *"etiquetas de chat cadastradas
no sistema **e atribuídas à fila**"*. A atribuição é **por fila** — "global da instância"
nunca poderia sair dessa leitura.

**As 7 filas, com o motivo exato de cada silêncio** (três tentativas cada, 20/08/2026):

| fila | resultado | código | o que significa |
|---|---|---|---|
| `[7]` Influência Marketing | ✅ responde | — | |
| `[17]` INSTAGRAM | ✅ responde | — | |
| `[19]` marketing | ✅ responde | — | |
| `[15]` OS DIRETORES | 🛑 503 | `QUEUE_008` | **fila desabilitada** |
| `[20]` DISPAROS | 🛑 503 | `QUEUE_008` | **fila desabilitada** |
| `[18]` IA - PROVEDOR DE INTENET | 🛑 401 | `AUTH_018` | **a chave global não alcança** |
| `[22]` Notificações Internas | 🛑 401 | `AUTH_018` | **a chave global não alcança** |

⚠️ **503 aqui NÃO é instabilidade.** `QUEUE_008` é *"a fila informada está desabilitada"* —
estado permanente, não erro transitório. Repetir não resolve; foi repetido três vezes.

### A correção que interessa

**As 17 sem nome não são "etiquetas que só a agência sabe".** São IDs cujo endpoint
definidor **nós não conseguimos chamar** — por fila desabilitada ou por permissão da chave.
Duas coisas diferentes, e a diferença muda o que fazer:

- *"só a agência sabe"* → esperar alguém digitar uma lista à mão (foi o que estava escrito,
  e o Marcos já disse que **não consegue rastrear por ID na interface** — ou seja, o
  caminho registrado estava fechado);
- *"a chave não alcança"* → **pedir ao suporte** que a chave global cubra as filas 18 e 22,
  e perguntar se `getChatTags` responde por fila desabilitada. É pedido concreto, com
  código de erro na mão.

🔑 **E o ID space é COMPARTILHADO, não dois namespaces separados.** As oportunidades
carregam etiquetas dos DOIS lados: `[4]`, `[9]`, `[26]`, `[39]` são de `getTags` e `[6]`,
`[12]`, `[13]` são de `getChatTags`. Os dois endpoints são **duas janelas para a mesma
lista**, cada uma mostrando um pedaço — não dois vocabulários que se somam.

⚠️ Isso também desfaz a leitura de que faltava *nome*: `[38]`–`[43]` **sempre estiveram**
em `getTags`. Nunca faltou ID nem nome para as faixas de porte; faltava saber que a
listagem de contato e a de conversa são recortes da mesma coisa. **A pergunta certa nunca
foi "como se chama a etiqueta 39", foi "por que a lista vem incompleta".**

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

> ✅ **RESPONDIDA em 18/08/2026 pelo Manual de Marca 2026.** As secundárias oficiais são
> **roxo `#530163`**, **azul marinho `#001A77`** e **bege `#D9D6C7`**. Terra e oliva saíram.
>
> ⚠️ E os chips que eu criei com as cores novas saíram TAMBÉM, no commit 6: eles nunca
> tiveram consumidor. A Início deixou de ter cards de navegação em 16/08/2026, e com eles
> foram os chips — terra e oliva já estavam mortos quando esta pergunta foi escrita.
> Se a Início ganhar categoria por cor um dia, ela usa a **rampa** (`serie1/2/3`), que já
> está medida contra o card e entre as vizinhas. Ver a nota em `lib/brand.ts`.

Dois tokens do painel (`chipTerra`/`terraTexto` e `chipOliva`/`olivaTexto`) estão marcados
`[PROVISÓRIO]` em `lib/brand.ts`: são escolha de design, não cor de marca. A marca oficial
tem só o dourado.

**O que precisamos:** as cores secundárias oficiais, se existirem. Com elas, troca-se o hex
em um arquivo e o resto do app acompanha — e o `[PROVISÓRIO]` sai.

---

# Vindas do BI comercial (17/08/2026)

Levantadas no inventário do Power BI que o comercial usa — detalhe em
[`bi-comercial-inventario.md`](./bi-comercial-inventario.md). **As três primeiras são
pré-requisito para comparar qualquer número com o BI.**

## 8. O que é `data_entrada`?

Criação da oportunidade ou entrada na etapa atual? É a coluna de data da tabela Base, e
dela depende todo o frame de comparação. **Sem isso, nenhuma série do BI é comparável com
a nossa.**

## 9. Quais valores tem `situacao`, e o que "Todos" inclui?

É um dos quatro filtros globais do relatório e recorta todas as medidas. Não sabemos se
separa aberto/fechado, ativo/inativo, ou outra coisa.

## 10. De onde vem o `Mínimo de peso`?

A tabela `tipo` do BI classifica em LEAD NOVO / EM_PROCESSAMENTO / CONVERTIDO usando uma
coluna `Mínimo de peso` — ou seja, **as etapas têm peso numérico** e o estado sai de um
limiar.

**É campo do CRM ou construção do modelo do BI?** Não temos nada equivalente, e não vamos
importar o conceito sem saber o que ele é.

## 11. 🎯 As metas: quais são, quem define, com que periodicidade — e sobre qual base

**A pergunta que mais muda o painel.** Nós decidimos não ter meta porque a agência disse
que não havia meta consolidada. **O BI tem duas configuradas** (15% e 25%) — então ou mudou,
ou existe meta que não chegou até nós.

O que já está determinado pela aritmética:

    % ENTREGA_CONVERSAO         = % CONVERSÃO         ÷ meta de 15%
    % ENTREGA_CONVERSAO_LIQUIDA = % CONVERSAO_LIQUIDA ÷ meta de 25%

As metas são **taxas de conversão**, não volume de leads, vendas ou MRR. Isso é bom: já
temos o numerador, faltaria só o alvo — seria configuração, não feature.

> 🛑 **Só que falta o denominador.** O BI tem duas taxas de conversão sobre bases
> diferentes: `% CONVERTIDO` (sobre o total de leads) e `% CONVERSAO_LIQUIDA` (sobre os
> qualificados) — as duas determinadas. E a **`% CONVERSÃO`, que é a medida contra a meta
> de 15%, não bate com nenhuma das duas.**
>
> **Precisamos saber sobre o que a `% CONVERSÃO` é percentual.** Sem isso, implementar a
> meta constrói a régua sobre a base errada.

**E a meta é fixa ou muda por período?** Não determinado — os slicers do relatório são
canvas e não abriram por automação. Meta fixa é uma env; meta por mês é documento de
config com grão de mês. Muda o desenho.

## 12. O dataset do BI tem mais de uma empresa?

O slicer `empresa` está fixo em INFLUENCIA MARKETING, mas existir como filtro sugere que o
modelo comporta outras. Se sim, precisamos saber se o recorte que vemos é comparável.

## 13. O `responsavel` deveria ser sempre preenchido?

Hoje é ~1/3 (amostra de ~520 linhas). Nenhum visual do BI agrega por ele. Se a intenção é
acompanhar por vendedor, o campo precisa ser preenchido antes de qualquer tela existir —
ver a decisão registrada em `bi-comercial-inventario.md`.
