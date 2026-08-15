# Integração com o Xmax — painel comercial (LEVANTAMENTO, ainda não implementado)

O Xmax é o CRM do setor comercial da agência: lead chega → qualifica → reunião →
fechamento. O painel comercial será uma **aba no mesmo app** (superapp), não projeto
separado. A spec OpenAPI está versionada ao lado, em [`xmax-api.yaml`](./xmax-api.yaml)
(v10.4.0, 152 operações).

**Nada foi implementado.** Este documento é o levantamento feito sobre a spec em
15/08/2026 e o plano do endpoint de diagnóstico, que só será escrito depois que a
agência responder as perguntas bloqueantes abaixo.

---

## ⚠ CORREÇÃO DE EXPECTATIVA: o retroativo EXISTE, parcialmente

A agência foi avisada de que "não há funil retroativo". **Isso está forte demais e
precisa ser corrigido com eles.**

Cada oportunidade carrega **três datas reais**, disponíveis desde já, sem depender de
nenhuma automação:

| campo | o que permite calcular retroativamente |
|---|---|
| `createdAt` | **leads que chegaram por mês** |
| `closedat` + `status` (1 ganha / 2 perdida) | **fechamentos por mês** |
| `closerecurrentvalue` | **MRR novo por mês** |
| `stagebegintime` | há quanto tempo está na etapa **atual** (estagnação) |

Ou seja: **os números de manchete do Thiago — leads, fechamentos e MRR por mês — são
todos calculáveis para trás.**

**O que NÃO existe retroativamente, e só começa quando as automações estiverem
configuradas apontando para o nosso endpoint:**

- o **caminho** do lead pelas etapas (passou por "reunião agendada"? quando?)
- a **taxa de conversão etapa a etapa** ao longo do tempo
- quanto tempo ficou em cada etapa **anterior** à atual

A API guarda só a etapa **atual** e desde quando ela começou. Não há
`getOpportunityHistory` (existe `getTicketHistory`, mas só para tickets).

---

## O que a API faz e o que não faz

### Não existe leitura de oportunidades encerradas

`getPipeOpportunities` é literal no summary: *"Oportunidades já encerradas não serão
retornadas."* As únicas leituras de oportunidade em toda a API são:

- `getOpportunity` — uma, por ID
- `getPipeOpportunities` — as **abertas** de um funil (sem paginação, sem filtro de
  data; filtro opcional por `stageId`)

Contraste útil numa conversa com o suporte: a API **tem** leitura por período para
chats (`getChatsByDateRange`, `getAllChatsClosedYesterday`). O padrão existe no
produto, só não foi feito para o CRM.

### Duas saídas para os fechados

1. **Diff diário.** Guardar o conjunto de abertas; quando um ID some da listagem,
   chamar `getOpportunity` e ler `status`. Custo: ~3 chamadas fixas + N sumidas por
   dia (com 1.656 oportunidades e giro de 10–40/dia, **15–45 chamadas diárias**).
   ⚠ "Sumiu" ≠ "fechou": pode ter sido `removeOpportunity` (404) ou
   `transferOpportunity` (mudou de funil). O `status` desempata.
2. **Varredura do espaço de IDs (a testar).** Os IDs são inteiros sequenciais e
   `getOpportunity` aceita qualquer um. Se forem densos, caminhar de 1 até o máximo
   recupera **todo o histórico de fechados**, inclusive antigo — backfill de ~1.656
   chamadas, uma vez só. **É hipótese, não fato: o diagnóstico testa primeiro.**

### "Capturas de Webhook" é a direção INVERSA

`getAllWebhookCaptures` **não serve para recebermos eventos do Xmax**. Uma "captura" é
um endpoint hospedado **pelo Xmax** para sistemas externos enviarem dados **para
dentro** dele; o campo `key` identifica qual captura recebe.

Direção: **terceiros → Xmax**. Para Xmax → nós, o mecanismo é a **automação**.

### Valores são inteiros × 100

`recurrentvalue: 10050` é **R$ 100,50**. Vale para `value`, `closevalue`,
`closerecurrentvalue` e os campos de produto. Errar isso é um MRR 100× maior na tela.

### Autenticação

- **Chave GLOBAL** — `getAllPipelines`, `getAllWebhookCaptures`, `getAllQueues`, e os
  demais globais. A chave da fila é rejeitada com `AUTH_018`.
- **Chave da FILA + `queueId` obrigatório** — todo o resto do CRM.

---

## Respostas do suporte (15/08/2026) — bloqueios liberados

| pergunta | resposta |
|---|---|
| Instância | `https://influencia40.atenderbem.com` |
| `queueId` do comercial | **7** |
| Allowlist de IP? | **Não há.** `AUTH_021` não se aplica; a Vercel funciona |
| A automação faz POST para URL nossa? | **Sim**, e permite cabeçalho ou campo fixo no corpo — dá para autenticar o que chega (`XMAX_WEBHOOK_SECRET`) |
| Endpoint que liste fechadas por período? | **Não existe** — confirma o desenho do diff |

⚠ **Correção de uma hipótese minha:** eu havia suposto que o Xmax fosse white-label da
família **Whaticket**. **Está errado — é do AtenderBem.** A suposição não chegou a
influenciar o levantamento (tudo aqui saiu da spec, não da hipótese), mas fica o
registro para ninguém pesquisar na árvore errada.

### As 6 origens (o mapa que a API não devolve)

| ID | nome |
|---|---|
| 1 | GOOGLE |
| 2 | Tráfego Pago - FaceAds |
| 3 | INOVA SUMMIT |
| 4 | REMARKETING - WHATSAPP |
| 5 | Leads ABRINT |
| 6 | TYPEBOT |

Fonte de verdade para o código: `lib/xmax.ts`. Aqui fica só o registro do que a
agência informou.

### ✅ RESOLVIDO: a prospecção está na ETAPA, não na origem

**A hipótese anterior (ABRINT / INOVA SUMMIT) está DESCARTADA** — juntas somam 55 de
5.084 oportunidades. Não é ali.

O diagnóstico de 15/08/2026 achou o lugar certo: o funil 4 tem as etapas **LEADS
OUTBOUND** (86 abertas, 5,2%) e **PROSPECÇÃO M&A** (9). E o cruzamento decide:

> **Das 95 oportunidades nessas duas etapas, 89 têm `origin = 0` (sem origem)** e só 6
> têm FaceAds.

Ou seja: **quem entra por prospecção não tem origem preenchida.** O funil por origem,
sozinho, nunca responderia a pergunta do Marcos ("lista converte pior que anúncio?").
A resposta exige cruzar **origem × etapa**.

### ⚠ A limitação que decide o cronograma

**A etapa mede quem está PARADO nela, não quem ENTROU por ela.** O campo é a etapa
ATUAL: um lead que entrou por LEADS OUTBOUND e avançou para NEGOCIAÇÃO já não é
contado como outbound. Os 86 são estoque parado, não captação.

**A prospecção só será medível de verdade quando o histórico de etapas existir** — e o
histórico só nasce com as automações apontando para o nosso endpoint. É o argumento
mais forte para ligá-las cedo, e vale dizer à agência com todas as letras: sem elas, a
pergunta que motivou a tela fica sem resposta confiável.

### Origem 0 = AUSÊNCIA de origem (1.672 de 5.084, 33%)

Três evidências independentes, medidas em 15/08/2026:

- **zero** oportunidades com `origin` null — a API normaliza ausência para 0;
- funis **inteiros** em 0: Black Friday 1.010/1.010, Financeiro 65/65, Indicações
  11/11 — carga em massa, ninguém escolheu origem;
- **cai com o tempo**: 37% (2024) → 54% (2025) → **17% (2026)**, sinal de hábito de
  preenchimento, não de categoria estável.

**A tela mostra "Sem origem", NUNCA rateia entre as outras.** Um terço da base
distribuído proporcionalmente inventaria volume em todas e destruiria a comparação que
motiva a tela. Ver `SEM_ORIGEM` em `lib/xmax.ts`.

### Etiquetas — o que elas revelam além do "sem perfil"

`getTags` devolve 15 nomes, mas as oportunidades usam **36 IDs**: 21 não resolvem
(namespaces diferentes). Ordenados por uso, os seis maiores concentram 553 dos 621 usos
órfãos e **valem ser pedidos à agência**: `[17]` 211, `[34]` 99, `[6]` 77, `[8]` 68,
`[7]` 52, `[44]` 46.

Das que têm nome, duas famílias úteis que não estavam no plano:

| etiqueta | usos | serve para |
|---|---|---|
| `[26] MARCO - NE` | 2.199 | parece marcar **responsável** — dá recorte por vendedor sem depender do `responsableid` |
| `[27] André - NE` | 345 | idem |
| `[39]` a `[43]` (faixas de ticket) | 242 somadas | segmentar o funil por **porte do cliente** |
| `[38] Sem Perfil` | **14** | a desqualificação que o Marcos citou — **volume bem menor do que a dor sugeria** |

⚠ O `Sem Perfil` com 14 usos não bate com "muito lead não é lead". Ou a desqualificação
acontece de outro jeito (o funil 23 "LEADS NÃO QUALIFICADOS" tem 333 abertas), ou a
etiqueta é recente.

---

## ⚠️ A AUTOMAÇÃO DE RECUPERAÇÃO CLONA O LEAD

**O funil 4 tem 1.656 oportunidades abertas e 1.443 telefones distintos — 12,9% a
menos.** Medido em 15/08/2026.

E a duplicação **não é difusa**: 90% dela está em duas etapas.

| etapa | abertas | duplicadas | % da etapa |
|---|---|---|---|
| **LEAD RECUPERADO- AUTOMAÇÃO** | 188 | **171** | **91%** |
| **Recuperação de LEAD** | 830 | 123 | 15% |
| Fechamento | 92 | 12 | 13% |
| Follow-up Agendamento | 231 | 9 | 4% |
| LEADS OUTBOUND | 86 | 1 | 1% |
| Agendado Reunião | 40 | 0 | 0% |

A etapa "LEAD RECUPERADO- AUTOMAÇÃO" está **91% duplicada**, e há telefones com **11
oportunidades**, todos alternando entre as etapas 113 e 49. Não é erro de digitação: é a
automação de recuperação criando uma oportunidade nova a cada disparo. Essas duas etapas
concentram **61% do funil**.

O Black Friday (funil 15), que era a suspeita inicial, contamina menos: 157 a 248 das
1.010 batem com alguém do funil 4 (15,5% no match estrito, 24,6% no frouxo), alcançando
333 oportunidades distintas. **Mas o funil 15 está fora do escopo — o problema mora
dentro do 4.**

> **Sem isto registrado, alguém defende numa reunião um número de leads 13% maior que a
> realidade.**

## DECISÃO: o número principal é PESSOA, e a tela sempre diz qual está mostrando

Decidido pelo Igor em 15/08/2026.

- **PESSOA (telefone distinto) é o número principal.** O Thiago pergunta "quantos leads
  chegaram", e 11 disparos para o mesmo contato não são 11 leads.
- **OPORTUNIDADE não se perde** — responde outra pergunta legítima ("quanto trabalho o
  comercial teve"), e a agência de fato trabalhou aquele lead 11 vezes. Fica ao lado,
  com rótulo explícito.
- ⚠️ **NUNCA um número solto chamado "leads".** Toda contagem na tela diz se é pessoa ou
  oportunidade. É a diferença entre 1.443 e 1.656 no mesmo funil.

### O telefone como chave: serve, com margem conhecida

**Qualidade do dado** (funil 4, 1.656 abertas): 93,8% com 11 dígitos, 5,3% com 10.
Apenas **4 sem telefone** e **3 suspeitos** (curto ou dígito repetido). O campo é
confiável.

**Mesmo telefone com nomes diferentes** — 110 grupos de telefone repetido:

| | grupos | leitura |
|---|---|---|
| nomes legíveis batem | 78 (71%) | clone da mesma pessoa |
| título é o próprio telefone, ou vazio | 9 (8%) | criada pela automação sem nome — **não é pessoa diferente** |
| nomes legíveis se contradizem | **23 (21%)** | os ambíguos |

⚠️ **Mas 23 grupos são 1,4% do funil**, e a inspeção mostra que a maioria nem é pessoa
diferente: são **pessoa × empresa** (`ricardo | techbrasil`, `marcos | itelecom`,
`luiz | camposnet`) ou **variação do mesmo nome** (`debia | debbie`, `marry | mah`).
Genuinamente pessoas distintas parecem ser 2 ou 3.

**Veredito: o telefone serve como chave**, com erro máximo conhecido de 1,4% — e o erro
real é menor. Se um dia passar disso, a chave precisa mudar; até lá, muda-se uma linha.

**Match ESTRITO (número completo normalizado), nunca o frouxo de 8 dígitos.** Há 12
chaves de 8 dígitos que cobrem mais de um número completo — o frouxo juntaria pessoas
diferentes só porque o final coincide. É a mesma lição do "GOLD contém OLD", com gente.

### ⚠️ LIÇÃO DE MÉTODO: script que compara contra limiar precisa do denominador certo

O script que mediu isso **cuspiu o veredito errado**: comparou os 21% contra um limiar e
concluiu "risco alto, o telefone não serve como chave, precisa de outra". Estava certo na
conta e errado na pergunta — **21% dos GRUPOS de telefone repetido são 1,4% do FUNIL**, e
é o funil que decide se a chave serve.

O erro só apareceu porque a amostra foi olhada em vez de o veredito ser aceito. Vale para
qualquer medição futura deste painel: **antes de comparar um percentual contra um limiar,
diga em voz alta sobre o que ele é percentual.** Um número correto sobre o denominador
errado é mais perigoso que um número errado, porque passa na revisão.

## DECISÃO: desqualificação conta AS DUAS formas

O Marcos confirmou que o funil "LEADS NÃO QUALIFICADOS" (id 23) e a etiqueta
`[38] Sem Perfil` têm **o mesmo papel**, em épocas diferentes:

- **ANTES**: movia o lead para o funil 23
- **AGORA**: usa a etiqueta `[38]` (criada pelo Thiago — por isso só 14 usos)

**O modelo conta as duas como desqualificação.** Contar só a etiqueta apaga todo o
histórico; contar só o funil perde os de agora.

### A virada: ~julho/2026 — **INFERIDO, não medido**

| sinal | valor |
|---|---|
| primeira oportunidade com a etiqueta `[38]` | createdAt **29/06/2026** |
| funil 23 por mês | fev 42 · mar 66 · abr 32 · mai 74 · jun 71 · **jul 43** · **ago 4** |

O funil 23 despenca em agosto — 4 em quinze dias contra 43 em julho inteiro (o esperado
pro-rata seria ~21).

⚠️ **NUNCA tratar como fato.** `createdAt` é a data da **oportunidade**, não da marcação
da etiqueta nem da mudança de funil — e a API **não guarda** nenhuma das duas. Um lead
criado em maio pode ter sido desqualificado em agosto. É piso, não a virada.

## DECISÃO: como a tela sinaliza MRR incompleto

O Marcos passa a preencher `closerecurrentvalue` daqui para frente; **as antigas ficam
como estão**, então os fechamentos anteriores podem estar subestimados.

A tela mostra, **no corpo e não em tooltip**:

> **R$ 42.300 em MRR novo** · 14 fechamentos
> ⚠ **3 sem valor informado** — o total real é maior

Três regras dentro disso:

1. **Só aparece quando existe.** Zero fechamentos sem valor, zero ruído.
2. **Diz "o total real é maior"**, não "pode estar incompleto". O sentido do erro é
   conhecido — MRR ausente só subestima. Dizer apenas "incompleto" deixaria o Thiago sem
   saber para que lado.
3. **Não estima o que falta.** Nada de "≈ R$ 45.000 projetado": inventaria número que
   ninguém digitou.

Como o preenchimento passa a acontecer, o contador **vai a zero sozinho** nos meses
novos — e a presença dele nos meses antigos vira a marca de onde o dado é fraco.

## ⚠️ O CLIQUE DE "GANHOU" PAROU EM 2025 — e a Etapa E depende disso

Medido em 14/08/2026 sobre a base COMPLETA (4.529 oportunidades do funil 4, já com o
backfill). O achado saiu de um número que não fechava: 92 abertas paradas na etapa
**Fechamento** contra ~38 ganhas em dois anos e meio inteiros.

**A contraprova diz que a etapa está certa:** das 38 ganhas do funil, **37 estão em
Fechamento**. O caminho do CRM funciona — o que parou foi a marcação.

E parou numa data. Ganhas por período, entre as que passaram por Fechamento:

| período | passaram por Fechamento | ganhas | abertas sem desfecho |
|---|---|---|---|
| 2024 | 28 | 14 | 8 |
| 2025 (1º sem.) | 29 | 16 | 13 |
| 2025 (2º sem.) | 33 | 6 | 27 |
| 2026 | 47 | **1** | 44 |

**Em 2026 o comercial chegou 47 vezes em Fechamento e clicou "ganhou" uma vez.**

O indício mais forte é o valor: **63 das 92 abertas em Fechamento (68%) já têm
`recurrentvalue` preenchido, somando R$ 157.560,00/mês** — contra R$ 68.120,00 de MRR
em TODO o histórico de ganhas clicadas. O time digita o valor negociado; é o clique
final que não acontece. Valor sem status é venda sem registro.

E o tempo confirma: **48 das 92 (52%) estão paradas na etapa há mais de 180 dias**,
17 delas há mais de um ano. Negociação de provedor não dura 12 meses.

**⚠️ MAS "está em Fechamento" NÃO é "vendeu".** As 3 que entraram na etapa nos últimos
30 dias são negociação viva de verdade. A tela **não pode escolher sozinha**: trocar
`status = 1` por "está em Fechamento" só troca um número errado por outro, para cima.

**Consequência para a Etapa E** — o painel mostra as duas contagens, sempre rotuladas,
nunca um número solto chamado "vendas":

1. **Vendas confirmadas** — `status = 1`, com o MRR que veio junto. É o número duro.
2. **Em Fechamento sem desfecho** — com **idade na etapa**, que é o que separa
   negociação viva de venda não registrada. Isto é uma **fila de trabalho**, não uma
   métrica de resultado: são R$ 84.630,00/mês em recorrente parado há mais de 180 dias
   esperando um clique.

**RESSALVA DE MÉTODO, que vale para qualquer leitura futura de etapa:** a API guarda só
a etapa ATUAL, nunca o histórico. Para encerrada, `fkStage` é onde ela estava ao
encerrar — isso é "esteve em Fechamento". Para aberta, é onde está agora. **Quem passou
por Fechamento e voltou atrás continuando aberta é invisível.** Todo número desta seção
é PISO, nunca total.

### ✅ DECISÃO DO DONO (Thiago, 15/08/2026): Fechamento É venda

Levado como número, não como suspeita. A resposta:

> "pode considerar Fechamento como a negociação já concluída"

e confirmado que **concluída = venda GANHA**, não perda. Ou seja: **estar na etapa [20]
significa venda feita, mesmo sem o clique de "ganhar".**

⚠️ **A decisão resolve como o painel LÊ, não como o comercial REGISTRA.** O alinhamento do
processo (quando clicar em ganhar) segue pendente com o Marcos — ver o bloqueio abaixo, que
NÃO foi cancelado por esta decisão. E enquanto não for resolvido, **as vendas continuam sem
data**, que é a consequência tratada a seguir.

O desenho, então:

| bloco | base | valor |
|---|---|---|
| **Vendas confirmadas** | `status = 1` | `closerecurrentvalue` — 32 de 38, **R$ 68.120,00** |
| **Em Fechamento** | abertas na etapa [20] | `recurrentvalue` — 63 de 92, **R$ 157.560,00** |

⚠️ **Dois campos diferentes, e isso não é detalhe:** aberta usa `recurrentvalue`, ganha usa
`closerecurrentvalue`. `value` está **zerado nas 92** — a agência só usa o recorrente.
Somar o campo errado devolve zero em silêncio.

⚠️ **Nunca um número só chamado "MRR".** Sempre a composição: *"R$ 68.120 confirmado +
R$ 157.560 em fechamento"*. E a **idade na etapa continua na tela**: 48 das 92 paradas há
mais de 180 dias, 17 há mais de um ano, 3 entradas nos últimos 30 dias. É o que separa
negociação viva de venda não registrada, e continua valendo mesmo com a decisão do dono.

### ⚠️ A CONSEQUÊNCIA: venda sem clique é venda SEM DATA

O painel passa a saber que 63 vendas aconteceram — **e não sabe em que mês.** "Fechamentos
no mês" é justamente o número que o Thiago mais quer, e é o que esta decisão não entrega.

A única data disponível é `stagebegintime` — **quando entrou na etapa atual**. Para estas
92 a etapa atual É Fechamento, então ela é literalmente "quando chegou em Fechamento": a
melhor aproximação possível de data de venda. **Mesmo assim, NÃO é usada para montar a
série mensal.** Duas razões, e as duas são sobre confiança no número:

1. **Reescreveria o passado.** Distribuídas por `stagebegintime`, as 63 jogam receita nova
   em **8 meses de 2024/2025** — R$ 7.570 em mai/2025, R$ 16.390 em out/2025… meses que a
   agência já fechou e já reportou. Nove entraram na etapa há mais de um ano.
2. **O passado mudaria DE NOVO.** No dia em que alguém clicar "ganhar", a venda ganha
   `closedat` e **migra** do mês do `stagebegintime` para o mês do clique. Um gráfico cujo
   histórico se move é pior que um gráfico incompleto: ninguém consegue conferir contra o
   que anotou mês passado.

**REGRA:** a série mensal mostra **só as confirmadas** (por `closedat`) — estável, nunca
muda. As 63 aparecem como **bloco do presente**, com valor e faixa de idade, sem mês
atribuído e com o motivo dito na tela: *"sem data de fechamento — não foram marcadas como
ganhas"*.

E isso tem uma propriedade boa: conforme o processo melhorar, cada venda marcada **migra
sozinha** para a série, com data de verdade, e o bloco encolhe. **O tamanho do bloco vira
a medida da dívida de processo** — o painel mostra o problema em vez de escondê-lo numa
estimativa.

Se o Thiago quiser a visão mensal mesmo assim, ela existe e está medida — mas com o rótulo
**"entrou em Fechamento no mês"**, nunca "vendeu no mês", e nunca somada na mesma linha das
confirmadas.

### 🚫 BLOQUEIO DE PROCESSO (não técnico) — segue pendente, e não é o mesmo assunto

A pergunta foi feita ao Marcos em 15/08/2026, e a resposta **não foi "clico" nem "não
clico"** — foi que a regra não existe:

> "precisa estabelecer melhor quando realmente dar ganho, se é quando fecha e manda os
> dados ou só quando assina o contrato. Falta esse alinhamento ainda."

Ou seja: o `status = 1` é ação manual **e ninguém definiu quando tomá-la**. É exatamente
o que a medição acima encontrou, dito pelo lado de dentro. O Thiago já definiu que
fechamento é *"envio dos dados para contrato"*, mas isso **nunca chegou ao comercial como
regra** — o Igor escalou para o Thiago acertar com o Marcos em 15/08/2026.

**A decisão do Thiago destravou a LEITURA, e este bloqueio continua de pé** — são dois
assuntos. O dono definiu o que o painel conta como venda; o processo define quando o
comercial registra. Enquanto o segundo não existir:

- as vendas em Fechamento continuam **sem data** (ver a consequência acima);
- **"vendas no mês" segue sem definição operacional** — a série mensal só tem as 38
  confirmadas, e um mês real pode ter fechado negócios que não aparecem em mês nenhum.

⚠️ **A Etapa E só é desenhada depois da Etapa C validada** — decisão do Igor: *"quero ver o
funil na tela antes de somar dinheiro nele"*. E, quando for desenhada, ela mostra o bloco
sem data em vez de estimar uma; o tamanho desse bloco é o próprio indicador de que o
processo ainda não fechou.

## O FUNIL É DEFINIDO PELO DONO, não pelo `stageorders`

Definido pelo Thiago em 15/08/2026. Ele não só filtrou etapas: **agrupou duas entradas no
mesmo nível.**

| nível | etapas | |
|---|---|---|
| 1 | **[15] Novo Lead - TRÁFEGO** + **[114] LEADS OUTBOUND** | ⚠️ **empate** — as duas são "lead novo" |
| 2 | [21] Follow-up Agendamento | |
| 3 | [17] Agendado Reunião | |
| 4 | [27] NEGOCIAÇÃO | |
| 5 | [20] Fechamento | |

**Saem do funil**, com os motivos dele: `[118] LEADS FUTUROS` ("não faz sentido estar
aí"), `[61] Nutrição Negociação` ("não precisa constar"), `[138] PROSPECÇÃO M&A` e
`[134] COMPRA E VENDA` (**outro produto** — ver a seção de ideias futuras),
`[49] LEAD RECUPERADO- AUTOMAÇÃO` (o lead recuperado **volta para lead novo**: é estado
transitório, não estágio) e `[113] Recuperação de LEAD` (vai para a visão de recuperação
— o Thiago descreveu como *"lead que não conseguiu trabalhar por agendamento, tipo um
lead perdido tentando ser recuperado"*, o que confirma a Variante B).

⚠️ **A ORDEM DE NEGÓCIO É CONSTANTE NO CÓDIGO; o `stageorders` continua sendo lido e
mostrado.** As duas ficam visíveis no retorno do sync e o conflito é explícito se
divergirem — porque agora existem duas verdades, e a que manda é a do dono. Medido em
15/08/2026: o `stageorders` é `[15,118,114,138,134,21,113,49,17,27,61,20]` e, removidas
as excluídas, **a ordem relativa das 6 é a mesma** — hoje não há conflito, só recorte.

⚠️ **O empate do nível 1 muda o `etapaMaisAvancada`.** Pela ordem do Xmax, [15] é a
posição 1 e [114] a posição 3 — o código atual faria OUTBOUND "mais avançado" que
TRÁFEGO. Não é: são a mesma coisa por dois caminhos. A comparação passa a ser por
**nível**, não por posição.

### O que os números viram (medido em 14/08/2026, ANTES de mexer no código)

Decisões do Igor em 15/08/2026, sobre as três ambiguidades que a medição levantou:

1. **`[49]` FICA na recuperação** — recuperação = `[113, 49]` = 838. As 35 pessoas que
   estão só nele não podem sumir das duas visões, e conceitualmente é recuperação: o
   Thiago descreveu como estado transitório do ciclo.
2. **Negociação = `[27] + [20]` = 110.** O Thiago listou *Agendado Reunião* como etapa
   própria; tratar reunião marcada como negociação contraria o desenho dele. O
   `[17,27,20]` = 150 **continua disponível**, com o rótulo **"em conversa avançada"** —
   são perguntas diferentes, não duas versões da mesma.
3. **As 156 que saem viram LINHA VISÍVEL**, nunca sumiço — mesmo tratamento da
   recuperação, detalhe a um clique. É literalmente a queixa do Thiago sobre a perda; não
   cabe cometê-la contra ele.

### CONSTANTES DE CONFERÊNCIA (medidas em 14/08/2026, recalculadas do zero duas vezes)

| métrica | hoje | funil novo | |
|---|---|---|---|
| oportunidades abertas (funil 4) | 1.656 | **1.656** | não muda |
| pessoas com aberta | 1.455 | **1.455** | não muda |
| **em captação** | 629 | **472** | −157 |
| **em recuperação** `[113,49]` | 838 | **838** | igual |
| **em negociação** `[27,20]` | 225 | **110** | −115 |
| em conversa avançada `[17,27,20]` | — | **150** | rótulo novo |
| fora do funil | — | **156** | linha visível |

Pessoas por nível: **91 · 231 · 40 · 22 · 88** — e a soma tem de fechar em 472, o que é a
conferência que pega erro de empate no nível 1.

Dois fatos que saltam dessa coluna e valem para o desenho da tela:

- **O nível 1 quase não existe pelo tráfego: 5 oportunidades abertas em [15] contra 86 em
  [114].** A entrada do funil hoje é outbound, não anúncio — e isso contradiz a intuição
  de quem só olha o investimento em mídia.
- **O nível 5 (88) é maior que o 3 (40) e o 4 (22) somados.** Não é funil, é ampulheta —
  e é o entulho de Fechamento medido na seção anterior.

⚠️ **156 pessoas somem do funil de captação** (75 em [61], 44 em [118], 30 em [134], 9 em
[138]). Elas **não podem simplesmente desaparecer da tela**: é literalmente a queixa do
Thiago sobre o BI, cometida por nós. Precisam de destino explícito antes da Etapa C
codificar o recorte.

## A PERDA — o que dá e o que NÃO dá para mostrar (requisito do Thiago, Etapa C)

A queixa: *"quando dá a perda, ele some do funil e do BI"*. **O painel resolve a parte
principal** — uma vez sincronizada, a perdida fica no Firestore com `status 2`, `closedat`
e a etapa; não some mais de lugar nenhum. O backfill já trouxe **2.835 perdidas** do
funil 4, de mai/2024 a ago/2026.

Mas três coisas foram medidas em 14/08/2026 e mudam o que a tela pode prometer.

### ❌ `closereason` NÃO EXISTE no retorno — o "por quê" não dá para mostrar

A spec documenta `closereason` e `closeobs` no `loseOpportunity`, e isso é enganoso:
são parâmetros de **escrita**. Sondadas as **2.835 perdidas uma a uma** no
`getOpportunity`, os dois campos **não aparecem entre os 50 que a API devolve** — não é
"vem vazio", é que a chave não vem.

⚠️ **O que isso NÃO prova:** não dá para distinguir *"a API nunca devolve"* de *"ninguém
nunca preencheu, e a API omite chave vazia"*. As duas dão o mesmo resultado hoje, mas só
a segunda é consertável por processo. **Descobrir isso é olhar a tela do Xmax** — ela
oferece campo de motivo ao marcar perda? Pergunta para o Marcos; não vale testar
escrevendo, porque seria escrita no CRM de produção.

Também não está em outro lugar: `description` tem conteúdo em 36% das perdidas, mas é
**dado de formulário** ("Nome: … Dono da empresa: … Email: …"), não motivo. Uma ou outra
traz nota de vendedor ("Cliente analisando proposta, pediu retorno") — texto livre
ocasional, nunca categoria. `products` e `username` vêm vazios em 100%.

**Consequência: a tela mostra ONDE o lead morreu, nunca POR QUÊ.** Prometer "motivo da
perda" com este dado seria inventar categoria.

### ⚠️ 1.444 PERDAS NUM ÚNICO DIA — 27/05/2025, e a causa NÃO é a que parecia

**1.444 perdas fecharam em 27/05/2025** — 51% de todas as perdas registradas — e 99%
delas estão em etapas que hoje não existem. A primeira leitura foi "reorganização de
funil". **Errada.** A medição seguinte, olhando o outro lado do calendário, achou a causa
de verdade:

| | |
|---|---|
| oportunidades criadas em **26/05/2025** | **1.445** |
| oportunidades perdidas em **27/05/2025** | **1.444** |
| **pessoas distintas nelas** | **2** |
| vida até a perda | **1 dia**, todas |

**São DUAS pessoas clonadas 1.445 vezes pela automação, criadas num dia e descartadas no
seguinte.** Não é limpeza de CRM: é a automação de recuperação em laço — a mesma medida na
seção da duplicação, no seu pior dia. Os picos menores são idênticos em natureza: 99
oportunidades em 28/08/2024 são **6 pessoas** (`LETICIA`, `LETICIA FERN`, `Leticia`…), 52
em 18/01/2025 são **2 pessoas** (`Renato Lisboa` repetido).

### ✅ E POR ISSO O PICO NÃO PRECISA DE REGRA ESPECIAL — a contagem por pessoa já resolve

Perdas por mês, nas duas contagens:

| mês | oportunidades | **pessoas** | fator |
|---|---|---|---|
| 2025-04 | 23 | 23 | 1,0× |
| **2025-05** | **1.456** | **11** | **132×** |
| 2025-06 | 28 | 27 | 1,0× |

Contada por pessoa, a série inteira fica entre **3 e 152 por mês, mediana 29** — sem
anomalia, sem exceção, sem dia especial. **O maior defeito da base é neutralizado pela
regra que o painel já tem**, decidida antes e por outro motivo. No total: 2.835
oportunidades perdidas são **1.020 pessoas** (2,8×).

⚠️ **A ressalva continua valendo para a visão de OPORTUNIDADE.** O painel mostra as duas
contagens, e a de oportunidade continua com 51% concentrado num dia. Lá, e só lá, o dia
aparece marcado com o motivo — nunca somado cru à série. A regra geral fica: **anomalia
que só existe na contagem por oportunidade é sintoma de clonagem, não de negócio.**

### 🛑 CONTRAEXEMPLO OBRIGATÓRIO: 05/02/2026 é campanha DE VERDADE

**Nunca criar uma regra que exclua dias por volume.** O dia 05/02/2026 tem **190
oportunidades criadas** — volume de pico — e é legítimo:

| | 26/05/2025 (clonagem) | **05/02/2026 (real)** |
|---|---|---|
| oportunidades | 1.445 | 190 |
| **pessoas distintas** | **2** | **175** |
| com origem preenchida | 0 | 176 |
| destino | etapa apagada, perdidas em 1 dia | **168 em Recuperação de LEAD**, 170 ainda abertas |

É uma **campanha de recuperação** com 175 pessoas reais. Um filtro do tipo "dia com mais
de N registros é carga em massa" apagaria esta campanha inteira — e apagaria justamente o
trabalho que a agência fez.

**O que separa os dois não é o volume, é a razão oportunidades ÷ pessoas:** 722× no
primeiro, 1,1× no segundo. É essa razão que denuncia clonagem, e ela é a mesma medida que
o painel já usa para tudo. Regra por data seria coincidência virando lei.

### ✅ A ETAPA da perda existe — mas o nome, só de 2026 em diante

`fkStage` de uma encerrada é onde ela estava ao encerrar, e são **22 etapas distintas** —
não há limbo, o dado é real. O problema é outro: **13 dessas etapas foram APAGADAS do
Xmax** e a API não devolve nome para elas em funil nenhum. A maior, `[28]`, tem 1.641
perdas concentradas entre ago/2024 e mai/2025 — é o fóssil do funil antigo.

| ano | perdas em etapa apagada | em etapa viva |
|---|---|---|
| 2024 | 76 (16%) | 410 |
| 2025 | 1.669 (76%) | 525 |
| **2026** | **0 (0%)** | **155** |

**Leitura: de 2026 em diante o "onde morreu" é 100% legível.** No histórico, o ID fica e o
nome não — e a tela mostra `etapa 28 (apagada)`, com a contagem visível, nunca somindo
num balde "outros".

### O que a Etapa C então entrega sobre a perda

1. **Perdidas por mês** — com os dias de limpeza em massa separados e rotulados.
2. **Onde morreu** — por etapa, com nível do funil novo; etapa apagada aparece com o ID.
3. **Quem encerrou** — `closedby` vem preenchido em 42% (usuário 23 concentra 60% delas).
4. **Não entrega o porquê** — e diz na tela que não tem o dado, em vez de omitir a coluna.

## IDEIA FUTURA: M&A é outro produto, merece funil próprio

`[138] PROSPECÇÃO M&A` e `[134] COMPRA E VENDA` saem do funil de captação porque **não são
o mesmo negócio**: este funil é de assessoria de marketing. São 39 oportunidades abertas
hoje — pouco para uma tela, suficiente para não jogar fora. Quando a agência quiser
acompanhar M&A, é **funil próprio**, com etapas e taxas próprias; misturar os dois faria a
conversão de marketing parecer pior do que é e a de M&A desaparecer.

## Perguntas ainda abertas

**Bloqueiam o desenho das coleções** — o modelo não é desenhado antes delas:

✅ ~~Como o Marcos desqualifica lead?~~ — **respondido**: as duas formas, ver a decisão
acima.
✅ ~~O MRR vazio~~ — **respondido**: passa a preencher; as antigas ficam, e a tela
sinaliza.
✅ ~~Origem 0~~ — **confirmado como ausência**. O Thiago cria campanhas com QR code para
captação e essas geralmente entram sem origem. Mantida a regra "Sem origem".

**Baixa prioridade, não bloqueia:**

1. **Os nomes das 21 etiquetas sem nome** (`[17]` 211 usos, `[34]` 99, `[6]` 77, `[8]`
   68, `[7]` 52, `[44]` 46 — 621 usos no total). O Marcos **não consegue rastrear por ID
   na interface**, então ficam sem resposta por ora.
   **Tratamento:** balde explícito **"etiqueta não identificada"**, com o ID e a
   contagem VISÍVEIS na tela. Nunca somem em silêncio — `else` vazio já escondeu coisa
   demais em projeto deste estúdio.

---

## O funil do comercial é o 4, e só ele

`PIPELINE_COMERCIAL = 4` ("Provedor de internet", 1.655 abertas) — **constante em
`lib/xmax.ts`, não env**: o funil não muda de um dia para o outro, env exigiria
Redeploy, e um override por env deixaria o comportamento mudar sem o código mostrar.

⚠ **Não é o funil 1**, que se chama "COMERCIAL" e tem 52 abertas. O nome engana.

Os outros 18 ficam fora: a instância tem 5.084 abertas, mas a maioria está em pipelines
de disparo/automação (Black Friday 1.010, AUTOMAÇÃO-NUTRIÇÃO 904, NUTRIÇÃO 415…).
Somar tudo infla o funil em ~3×.

## Autenticação: a chave GLOBAL nos dois escopos

A chave da fila fornecida é rejeitada com `AUTH_018` (o `queueId=7` está certo — a
global passa nele). Mas a decisão não foi por contorno: **os dados do CRM são globais à
instância**, medido — o funil 1 devolve as mesmas 52 oportunidades com `queueId` 7, 17
ou 19. A fila autentica, não recorta. Usar a chave da fila não reduziria exposição
nenhuma. `XMAX_API_KEY_FILA` fica documentada e **não é obrigatória**.

## Plano do `/api/diag-xmax` (endpoint temporário — JÁ ESCRITO E RODADO)

Mesmo padrão do `/api/diag-janelas` que já usamos e removemos: protegido por
`CRON_SECRET`, somente leitura, e **removido no fim**. Ele existe para responder cinco
perguntas antes de qualquer feature ser escrita:

1. **Quais funis e etapas existem** — nomes e IDs reais (`getAllPipelines`).
2. **Quais valores de `origin` aparecem** nas ~1.656 oportunidades, e quantos
   distintos. É o insumo do mapa manual.
3. **A varredura de ID funciona?** `getOpportunity` em IDs baixos (1, 100, 1000):
   volta oportunidade encerrada? Isso decide se há backfill retroativo de fechados.
4. **Quantas ganhas têm `closerecurrentvalue` preenchido?** É o risco nº 2 abaixo —
   precisa ser medido ANTES de prometer a tela de MRR.
5. **Os IDs de `tags` da oportunidade batem com `getTags`?** (`getTags` está sob a tag
   *Contatos* e diz "etiquetas de contatos" — pode ser outro namespace.)

## Coleções planejadas

Prefixo `comercial_` para nunca colidir com as de tráfego. docId determinístico, sync
idempotente, prévia antes de aplicar, pré-agregado para a tela não varrer coleção
(a lição da `metricasAgregadas`).

| coleção | docId | conteúdo |
|---|---|---|
| `comercial_oportunidades` | `{id}` do Xmax | estado atual + `createdAt`, `stagebegintime`, `closedat`, `status`, valores, origem, tags, responsável |
| `comercial_transicoes` | `{oppId}_{ymd}_{stageId}` | transições datadas (webhook daqui para frente; diff como rede) |
| `comercial_agregados` | `{ano}-{mes}` | funil por origem, contagem por etapa, MRR, taxa de desqualificação |
| `comercial_config` | `origens` / `etapas` / `tags` | mapas ID → nome (manuais) |
| `sistema/sync_comercial` | fixo | cursor e última execução |

**Custo por tela: 2 leituras** (agregado do mês + config). Trocar de mês: +1.

## Envs necessárias

| variável | valor | segredo? |
|---|---|---|
| `XMAX_BASE_URL` | `https://influencia40.atenderbem.com` | não (mas só servidor) |
| `XMAX_API_KEY_GLOBAL` | — | **SIM** |
| `XMAX_API_KEY_FILA` | — | **SIM** |
| `XMAX_QUEUE_ID` | `7` | não |
| `XMAX_WEBHOOK_SECRET` | — | **SIM** — autentica o POST da automação |
| `CRON_SECRET` | já existe | reaproveitar |

`XMAX_PIPELINE_ID` **não entra ainda**: o diagnóstico descobre os funis pelo
`getAllPipelines`. Só vira env quando soubermos qual é o do comercial.

⚠ **As duas chaves foram pedidas REGENERADAS** (a global circulou por print de
WhatsApp; a da fila tinha valor fraco). Elas dão acesso de **escrita** ao CRM inteiro —
`removeOpportunity` está na API.

**Nenhuma com `NEXT_PUBLIC_`.** As chaves dão acesso de ESCRITA ao CRM inteiro
(`removeOpportunity` está na API) — vazar uma delas é grave.

## O que só dá para configurar dentro do Xmax

A API **lê** o ID da automação (`enterautomation`, `leaveautomation`,
`winautomation`, `loseautomation`) mas **não cria nem configura** nenhuma. É trabalho
de interface, por alguém com acesso:

1. Criar as automações de entrada/saída de etapa apontando para o nosso endpoint.
2. Confirmar que a automação faz POST para URL (pergunta bloqueante nº 2).
3. Fornecer o mapa de origens e a lista de etiquetas em texto.
4. Garantir que a fila do comercial está **habilitada** (senão: `QUEUE_008`).

## Riscos, do mais grave ao menor

1. **O MRR vazio deixou de ser hipótese: foi MEDIDO.** Das 3 ganhas da amostra, **1
   fechou com `closerecurrentvalue = 0`**. O campo é opcional no `winOpportunity`, e o
   painel não tem como distinguir "vendeu zero de recorrência" de "esqueceram de
   preencher". O número de manchete do Thiago nasceria menor que a realidade.
2. **A prospecção só é medível com o histórico de etapas.** A etapa atual mede estoque
   parado, não captação — ver a seção acima. Sem as automações, a pergunta que motivou
   a tela não tem resposta confiável.
3. **`closedat` e `stagebegintime` são EPOCH, não ISO** — a spec mente. `new Date()`
   direto devolve Invalid Date, que não estoura: vira NaN na tela ou some num filtro de
   período. Blindado por `epochParaISO`/`fechadaEm`/`naEtapaDesde` em `lib/xmax.ts`.
4. **Valores × 100** — erro de 100× no MRR se alguém esquecer o `centavosParaReais`.
5. **21 IDs de etiqueta sem nome**, 621 usos no total. Sem os nomes, viram balde cego.
6. **Polling diário perde transições intradiárias** até as automações existirem.
7. ~~Allowlist de IP~~ — **descartado**: a agência confirmou que não há (15/08/2026).
8. ~~Automação pode não saber chamar URL~~ — **descartado**: faz POST e aceita cabeçalho
   ou campo fixo no corpo (15/08/2026).

## Escopo já decidido

- Aba no mesmo app, não projeto separado.
- **Sem barra de meta** nesta versão — a agência não tem meta consolidada; o painel é
  que vai produzir o histórico.
- **MRR só de ENTRANTES.** Saída/cancelamento de cliente está fora do escopo.
- Durante a implantação, só o Igor acessa (sem criar usuários novos) — o que depende
  do sistema de papéis, ainda pendente (ver o levantamento de papéis).
