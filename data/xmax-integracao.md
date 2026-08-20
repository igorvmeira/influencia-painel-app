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

## ⚠️ CORREÇÃO: número medido ANTES do backfill não vale depois dele

A distribuição de "quantas vezes o mesmo contato é trabalhado" foi medida duas vezes, e a
segunda invalidou a primeira:

| | antes do backfill | depois |
|---|---|---|
| trabalhado 1× | **736** | **611** |
| trabalhado 2× | **65** | **148** |
| máximo | 11× | 11× |

**Não é deriva da base viva — é o backfill.** A primeira medição aconteceu quando só
existiam oportunidades ABERTAS, porque a API não lista encerrada. O backfill trouxe 2.873
encerradas, e o `vezesTrabalhado` de muita gente subiu: quem parecia trabalhado uma vez
passou a mostrar 2, 3 ou 4 quando o histórico fechado apareceu.

**O número novo é o certo.** "Quantas vezes o contato foi trabalhado" ignorando o que já
encerrou subestima exatamente o que a métrica existe para medir — e subestima **na direção
que faz a automação parecer melhor do que é**.

⚠️ **LIÇÃO, irmã da do frame de data:** quando a fonte de dados muda de tamanho, todo
número derivado dela precisa ser remedido, não conferido. E a diferença não se lê como
deriva: 736 → 611 é grande demais para ser a base viva, e foi isso que denunciou.

**Regra prática:** ao citar um número medido, cite também **quando** e **sobre que
universo**. Os cinco números de conferência do sync (1.656 / 1.455 / 629 / 838 / 225)
carregam `escopo: "abertas do funil de captação"` justamente por isso.

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

### ⚠️ CORREÇÃO DE 15/08/2026 — e a lição vale mais que a correção

> ~~"Em 2026 o comercial chegou 47 vezes em Fechamento e clicou 'ganhou' uma vez."~~
> **2026 tem 11 vitórias, todas em março.**

O erro: **47 e 1 foram medidos por mês de CRIAÇÃO**, e o clique acontece na data de
**FECHAMENTO**. Com a mediana de criação até vitória em **82 dias**, negócio criado em
2026 ainda nem teve tempo de fechar — o "1" media a espera, não a marcação.

**LIÇÃO — nunca comparar dois números em frames de data diferentes.** Cada um estava
certo sozinho. Juntos, mediam coisas distintas, e a conclusão saiu maior que o dado. É
irmã da lição do denominador: número correto sobre o eixo errado passa na revisão, porque
a conta fecha.

⚠️ **Onde isso é fácil de repetir neste projeto:** `createdAt` é criação, `closedat` é o
clique de encerramento, `stagebegintime` é entrada na etapa atual. **Três eixos de data no
mesmo objeto** — qualquer comparação entre dois deles precisa dizer qual está usando.

O que a base realmente mostra, por **data do clique**:

| mês do clique | vitórias | maior dia |
|---|---|---|
| jul–out/2024 | 12 | 2 |
| **03/05/2025** | **12** | **12 — todas no mesmo dia** |
| set/2025 | 3 | 3 |
| **mar/2026** | **11** | 4 |
| abr–ago/2026 | **0** | — |

**O clique não parou: ele nunca foi rotina.** Acontece em sessões — 12 marcadas numa
única tarde em maio/2025, nada entre out/2025 e fev/2026, 11 em março/2026, e **zero nos
últimos cinco meses**. É arrumação periódica, não registro no momento da venda.

### 🛑 NENHUMA SÉRIE MENSAL DE FECHAMENTO É CONFIÁVEL HOJE

A consequência é maior que o erro, e é a conclusão mais importante desta seção inteira.
São **duas fontes de venda, e as duas estão quebradas para fins de mês**:

| fonte | o que tem | o que falta |
|---|---|---|
| **confirmadas** (`status = 1`) | valor e data | a data é do **clique**, não da venda — 12 numa tarde |
| **em Fechamento** (63) | valor | **data nenhuma** |

**O painel consegue dizer QUANTO foi vendido e O QUE está vendido. Não consegue dizer
"vendas em julho".** Esse número só passa a existir quando o clique virar rotina.

⚠️ **Isto NÃO é ressalva de rodapé — é o número principal do Thiago.** A declaração vai
**onde o número aparece**, não em tooltip: a data de fechamento é a data em que alguém
marcou, e como a marcação não é rotina, a série mensal é aproximada. Tooltip é para o
detalhe do mês marcado; a limitação da série é texto no corpo.

**E é o argumento mais concreto para o alinhamento de processo com a agência:** pedir que
o comercial marque "ganhou" na hora não é burocracia de CRM — **é o que faz o número do
mês existir.** Enquanto não virar rotina, "quanto vendemos em julho" não tem resposta, por
mais completo que o painel fique.

Implementado em `vendasConfirmadasPorMes.mesmoDia` (70% no mesmo dia, mínimo 5 vendas) —
o mês **fica na série**, marcado, com o motivo no tooltip.

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

## ✅ ENCERRADA: o teto da Vercel não era ~10s (medido em 17/08/2026)

A pendência abaixo nasceu de uma **premissa herdada da documentação, não medida** — e a
premissa estava errada. Fica registrada como foi, porque a lição de método vale mais que
o desfecho.

**O que se acreditava (16/08/2026):** o `/api/comercial/sync?aplicar=1` leva 8,2s numa
rodada idempetente; o plano gratuito corta em ~10s; o `maxDuration = 60` declarado na rota
só valeria no Pro. **Margem de 1,8s**, e a rodada idempotente é o melhor caso.

**O que a medição mostrou (17/08/2026),** em 117 chamadas reais ao `/api/sync-meta` em
produção, durante o backfill por conjunto:

| | |
|---|---|
| mediana | **4,2s** |
| p90 | 9,3s |
| p99 | 14,9s |
| **maior que COMPLETOU** | **33,7s** (BL FIBRA, 1.173 linhas de conjunto) |
| chamadas acima de 10s | 11 |
| chamadas acima de 30s | 1 |
| **estouros** | **zero** |

O `maxDuration = 60` **está sendo respeitado neste projeto**. Os 8,2s do sync comercial
nunca foram risco: sobra margem de 7x, não de 1,8s.

**O gatilho de quebrar em blocos está CANCELADO.** Se um dia o plano ou o runtime mudarem
o teto, a medição precisa ser refeita — o número acima tem data por isso.

⚠️ **A lição, que é o que sobra disto:** desenhar em volta de um limite de infraestrutura
que ninguém mediu quase custou uma reescrita do sync comercial em blocos, resolvendo um
problema inexistente. Premissa de infraestrutura envelhece e é barata de medir. Está
registrada em CLAUDE.md, em *Sincronização e tarefas longas*.

**A rede de segurança já está no ar:** o aviso de dado velho aparece nas duas telas do
comercial a partir de 2 dias sem sync. Se a automação falhar em silêncio, a tela avisa
antes de alguém decidir com foto velha.

## 🛑 NÃO FILTRE CLONE PELA ETAPA DE RECUPERAÇÃO — medido em 17/08/2026

Registrado porque **é a ideia natural, e ela falha nas duas direções.** Quem olhar a série
de leads novos vai propor exatamente isto, como o Igor propôs.

**A proposta:** contar oportunidade (não pessoa) para captar o cliente que volta, excluindo
as criadas pelas etapas de recuperação `[113]` e `[49]`, que é onde a automação clona.

**Por que não funciona:**

**1. O clone não FICA na etapa de recuperação.** Das 1.477 oportunidades criadas em
maio/2025 (o mês da clonagem em massa), **1.444 estão hoje na etapa 28** e apenas **13
(0,9%)** em `[113]`/`[49]`. Filtrar por etapa atual não pega o clone — ele foi criado,
trabalhado e encerrado noutro lugar.

**2. Quem está em recuperação hoje majoritariamente MIGROU para lá.** Das 1.141 em
`[113]`/`[49]`, só **237 nasceram ali**; **904 migraram**, com mediana de **535 horas
(22 dias)** entre criação e chegada. Etapa atual ≠ etapa de nascimento, e o CRM não guarda
o caminho.

**3. E o efeito é o CONTRÁRIO do pretendido.** O filtro destrói os meses normais, cujos
leads estão em recuperação agora — que é para o que a recuperação serve:

| | maior mês | 2º maior | razão |
|---|---|---|---|
| oportunidade crua | 1.477 | 303 | 4,9x |
| **excluindo recuperação** | 1.464 | 211 | **6,9x** |

```
2025-12    72 → 17        2026-02   299 → 38
2026-03   141 → 29        2026-01   119 → 40
```

Maio/2025 sai de 1.477 para 1.464 — perde 13 — e fica **mais** dominante.

### A régua que funciona: intervalo mínimo por pessoa

Aprovada pelo Igor em 17/08/2026: **conta oportunidade, e a mesma pessoa só conta de novo
se a nova oportunidade vier ≥ 30 dias depois da última contada.**

| corte | maio/2025 | maior mês | 2º | razão |
|---|---|---|---|---|
| 0 dias (crua) | **1.477** | 1.477 | 303 | 4,9x |
| 7 dias | 33 | 299 | 280 | 1,1x |
| **30 dias** | **32** | 291 | 267 | **1,1x** |
| 90 dias | 30 | 275 | 252 | 1,1x |

30 dias porque: o gráfico fica legível (nenhuma coluna achata as outras), a cadência do
clone é menor que 7 dias (o corte de 7 já resolve e o de 30 remove só 1 a mais), e "voltou
um mês depois" é defensável na conversa. E a régua do dono é atendida — o maior mês passa
de **257 pessoas** para **291**, e os ~13% de diferença são o retorno de cliente.

> ⚠️ **É HEURÍSTICA, NÃO MEDIÇÃO — e isso vai NA TELA, perto do número, nunca em tooltip.**
> Não conseguimos distinguir clone de retorno genuíno; usamos o tempo como proxy. O rótulo
> é **"oportunidades, contando cada pessoa no máximo uma vez a cada 30 dias"** — nunca
> "leads novos" seco. Heurística escondida vira fato na terceira reunião.
>
> As duas séries ficam disponíveis (pessoa e oportunidade), com a de oportunidade como
> principal por decisão do dono. **A diferença entre elas é informação:** é o retorno de
> cliente.

## `fk_campaign` entrou no normalizador — 20/08/2026

O campo existe na API (`OpportunityObject`, `data/xmax-api.yaml`) e **não existia
no nosso normalizador**. Quem varresse as 4.862 oportunidades gravadas hoje receberia
zero — e o zero seria NOSSO, não do CRM. Agora ele é gravado como `campanhaId` em
`comercial_oportunidades`.

**O que ele é:** o ID da campanha de disparo de mensagens que originou a oportunidade,
preenchido automaticamente quando ela nasce no contexto de um atendimento vindo de
campanha. `0` quando não há vínculo.

⚠️ **Gravado como `null`, não como `0`** — e isso **diverge de `origem` de propósito**. Em
`origin` a spec não documenta sentinela, então não dá para saber se zero é ausência ou
categoria, e o valor cru é preservado. Em `fk_campaign` a spec diz textualmente *"0 quando
não houver vinculação"*: a ausência é **conhecível**, e ausência conhecida grava `null`.

### 🛑 O HISTÓRICO SÓ FICA COBERTO SE O BACKFILL RODAR

**O sync não relê oportunidade encerrada.** Ele monta a foto com `getPipeOpportunities`,
cujo próprio sumário na spec diz *"Oportunidades já encerradas não serão retornadas"*. Uma
oportunidade que já estava fechada quando o campo entrou **nunca mais passa pelo
normalizador do sync** — o campo fica ausente nela para sempre.

A parte que se resolve sozinha é menor do que parece, mas existe: toda oportunidade que
estiver **aberta em qualquer sync depois de hoje** ganha o campo e o leva consigo quando
fechar. O buraco é só o que **já estava encerrado em 20/08/2026**.

**O backfill alcança o resto**, porque ele não usa a listagem: varre por ID com
`getOpportunity`, que aceita qualquer id — inclusive encerrado — e passa o retorno pelo
**mesmo** `normalizarOportunidade`, gravando com `{ merge: true }`.

```
/api/comercial/backfill?reiniciar=1&aplicar=1
/api/comercial/backfill?aplicar=1     (repetir até concluido: true)
```

⚠️ O `CRON_SECRET` vai no header `Authorization: Bearer`, não na URL — ver "Como chamar
as rotas internas" no README da raiz. No PowerShell, `curl` é alias de
`Invoke-WebRequest`: use `Invoke-RestMethod`.

⚠️ **Enquanto o backfill não rodar, `campanhaId` ausente NÃO significa "sem campanha"** —
significa "esta oportunidade não passou pelo normalizador novo". São coisas diferentes, e
é a leitura tranquilizadora que vence se ninguém escrever isto. Qualquer tela ou contagem
que use o campo antes disso precisa dizer de que recorte está falando.

### O que a amostra já diz — e o que ela NÃO diz

Sondadas **12 oportunidades perdidas** direto na API (as mais recentes encerradas, ids
18239 a 18492): **`fk_campaign` = 0 nas 12**.

⚠️ **Doze não fecham nada.** É a amostra mais recente, e o disparo em massa que originou a
suspeita de clone é de **maio/2025** — justamente fora dela. O número serve para dizer que
o campo VEM na resposta e é legível; não serve para estimar cobertura.

🔑 **E mesmo cheio, ele responde outra pergunta que a heurística dos 30 dias.** `campanhaId`
identifica *nasceu de um disparo*; a régua dos 30 dias mede *a mesma pessoa contada duas
vezes*. Um clone pode não ter campanha vinculada, e um lead de campanha pode ser genuíno.
**Não substitui a heurística** — no melhor caso vira uma segunda fonte para conferi-la.

---

## 🪦 `/api/diag-porte` — REMOVIDA em 20/08/2026, e o que ela mediu

Rodou uma vez, em 20/08/2026 às 15:05Z. **4.905 leituras**, uma varredura de
`comercial_oportunidades`. Denominadores: 2.693 pessoas distintas, **2.608 com telefone**
(a régua), 85 sem.

### O número que substitui o "~8%"

| régua | cobertura de porte |
|---|---|
| por PESSOA, telefone estrito | **254 de 2.608 (9,7%)** |
| por OPORTUNIDADE (a régua antiga) | 255 de 4.905 (5,2%) |

🔑 **254 pessoas, 255 oportunidades** — a etiqueta pousa em UMA oportunidade por pessoa,
quase nunca em duas. Então a diferença entre as duas réguas **não vem do numerador, vem do
denominador**: contar linha divide por 4.905 quando só existem 2.608 pessoas.

⚠️ O "212 de 2.670" antigo **não foi reconstruído** e não vai lado a lado com estes. O mais
próximo é `254 de 2.693` = 9,4% sobre todas as chaves — pista, não reconciliação.

### 🛑 A COBERTURA É UMA RAMPA, NÃO UM PATAMAR

| desde | pessoas | com faixa | cobertura |
|---|---|---|---|
| 01/06/2026 | 575 | 179 | **31,1%** |
| 01/07/2026 | 375 | 142 | **37,9%** |
| 01/08/2026 | 161 | 114 | **70,8%** |

**Os 9,7% gerais são a média de duas eras** — 24 meses entre 0% e 9,5%, e uma era nova que
ainda está subindo. A `[38] Sem Perfil` aparece pela primeira vez em jun/26, coerente com
a etiqueta ter sido criada em 29/06/2026.

🔑 **OS TRÊS CORTES SE PAGARAM, e este é o registro que mais vale reusar.** Com um corte
só, o relatório teria dito *"31% desde junho"* — e isso seria lido como PATAMAR. São três
medidas do mesmo dado que discordam entre si, e a discordância É a informação: **um corte
só não tem como se defender.** O custo de três foi zero, porque cabem na mesma varredura.

### 4️⃣ O NÍVEL 4 É O ÚNICO PLANO — herança direta para a Demanda 2

| nível | desde 01/06 | desde 01/07 | desde 01/08 |
|---|---|---|---|
| 2 Follow-up | 43,2% | 49,5% | 79,5% |
| 3 Agendado Reunião | 34,4% | 29,6% | 71,4% |
| **4 Negociação** | **77,3%** | **78,9%** | **80,0%** |
| 5 Fechamento | 0% (n=4) | 0% (n=2) | — (n=0) |

**Onde o lead chega em Negociação, a etiqueta está lá em ~80% dos casos, independente do
corte.** É o ÚNICO recorte da base sobre o qual dá para afirmar alguma coisa hoje — os
outros ainda estão em movimento.

🔧 **Se a Demanda 2 precisa de um denominador defensável, é o nível 4.** E o motivo da data
de corte vai NA TELA junto do número (ver a obrigação registrada acima).

### ⏳ A MEDIÇÃO DO FECHAMENTO PRECISA SER REPETIDA — e o motivo mudou

126 das 130 pessoas no Fechamento entraram ANTES de junho. Só **4** são da era nova, e
nenhuma tem faixa. Com n=4 não há conclusão possível.

A leitura inicial foi *"é cedo demais, o ciclo comercial não teve tempo"*. **Medido, ela
não fecha.** Tempo entre criar a oportunidade e chegar ao Fechamento, nas 95 abertas hoje
em `[20]` (via `getPipeOpportunities`, zero leitura de Firestore):

```
mín 0d · p25 11d · MEDIANA 24d · p75 51d · p90 136d · máx 377d
83% chegaram em até 80 dias — o tempo decorrido desde 01/06
```

🛑 **Se a mediana é 24 dias e 83% chegam em 80, a safra de junho JÁ TEVE TEMPO.** A base
inteira tem 130 de 2.608 (5%) no Fechamento; aplicada às 575 pessoas da era nova, essa
taxa preveria ~29 — e são 4. **A explicação do calendário acerta a direção e não fecha o
valor, então não é explicação.**

⚠️ E a mediana tem SOBREVIVÊNCIA embutida: ela descreve quem CHEGOU, não a probabilidade
de chegar. Serve para dizer que quem chega, chega rápido — não para estimar quantos chegam.

**Quando repetir:** a partir de **novembro/2026** a safra de junho terá ~150 dias, além do
p90 de 136 — aí o silêncio deixa de ter desculpa de calendário. Se em novembro ainda houver
pouca gente da era nova no Fechamento, a pergunta deixa de ser sobre etiqueta e passa a ser
sobre o funil.

### 🆕 A QUARTA SAÍDA QUE FALTAVA NA LISTA: **CEDO DEMAIS**

Uma série que muda de patamar tem quatro leituras, não três:

| leitura | como se reconhece | o que fazer |
|---|---|---|
| **DEGRAU** | o veredito é o mesmo em todos os cortes | usar o número |
| **RAMPA** | o veredito muda com o corte | não há número único ainda |
| **BURACO** | volume suficiente e cobertura baixa | investigar, agir |
| **CEDO DEMAIS** | n pequeno demais para qualquer conclusão | **esperar** |

🔑 **A quarta se parece com as outras três e não se resolve investigando — se resolve
esperando.** E os dois erros de classificação são caros em direções opostas: confundi-la
com BURACO gera ação sobre um problema que não existe; confundi-la com RESÍDUO gera falsa
tranquilidade sobre um que pode existir.
⚠️ **E ela não é desculpa automática:** foi o que quase aconteceu aqui. "Cedo demais" só
vale depois de medir o tempo de ciclo — que é exatamente o que derrubou a explicação.

### ✅ A etapa 28 é resíduo puro, sem ressalva

**1.641 de 1.641** criadas antes de junho, nos três cortes. `depoisSemFaixa = 0` em todos.
Zero oportunidades criadas depois de junho estão lá. É a cova dos clones de maio/2025, e
está fechada — derruba os agregados como peso morto histórico, não como processo vivo.

### 🪣 O `semData` veio ZERO — e isso é resultado, não desperdício

A rota isolou os registros sem data num balde próprio em vez de deixá-los cair em "antes".
Vieram **0** em todos os níveis e etapas: a decisão não mudou o resultado.

🔑 **Mas isso só se soube MEDINDO.** Se tivesse vindo alto, teria mudado tudo — e teria
mudado para o lado que CONFIRMA a hipótese do resíduo histórico, que é o lado que ninguém
investiga. **Balde vazio confirmado é resultado**; balde vazio presumido é sorte.
Ver a régua no CLAUDE.md.

### O que a rota mediu e não cabe aqui

Distribuição das 5 faixas (a menor é `[41] 3k a 5k` com 20 pessoas — não sustenta gráfico),
cobertura por etapa crua, série mensal de 28 meses e concentração por responsável (82% das
marcações em oportunidades **sem responsável informado**; entre os nomeados só o id 23
marca — o 49, com 29,5% de toda a base, marcou zero). O JSON completo ficou com o Igor.

---

## 🪦 A rota `/api/diag-etiquetas` foi REMOVIDA em 20/08/2026 — e o que ela sabia

Lápide explícita, não silêncio: ela nunca chegou a rodar (faltava credencial do Firebase
Admin no `.env.local`) e foi apagada por decisão do Igor. Motivo: ela media cobertura de
porte varrendo o Firestore, e as 6 faixas passaram a vir nomeadas direto da API — manter
rota bloqueada esperando credencial é dívida, não backup.

🛑 **E UMA OBRIGAÇÃO QUE A DEMANDA 2 HERDA, decidida em 20/08/2026:** se a tela usar
uma data de corte para separar a era com etiqueta da era sem, **o motivo da data vai
NA TELA, junto do número**. `2026-06-01` é onde a SÉRIE vira, não onde o processo
mudou — o CRM não guarda quando uma etiqueta foi aplicada, e a data é inferida da
ENTRADA das pessoas. Sem essa frase, três meses depois ela vira um fato que ninguém
questiona. Ver a régua no CLAUDE.md.

**A pergunta que ela responderia volta com a Demanda 2, não antes.** Quando voltar, estes
quatro achados de desenho evitam refazer a análise do zero:

1. **O agregado NÃO responde.** `comercial_agregados/funil` não guarda etiqueta nenhuma —
   só o booleano `desqualificada`, derivado da tag `[38]`. A distribuição por ID não
   existe lá. É varredura de `comercial_oportunidades` ou nada.
2. **NÃO ler `comercial_pessoas`.** A oportunidade já carrega `pessoaChave`, então a
   contagem POR PESSOA sai da mesma varredura. Ler as ~2.657 pessoas seria pagar 2.657
   leituras por um dado que já está na mão.
3. **A régua conta PESSOA, não oportunidade.** A automação de recuperação cria
   oportunidade nova a cada disparo; contar linha infla o mesmo contato várias vezes.
4. **`[38] Sem Perfil` não entra na cobertura de porte.** Ela marca desqualificação, não
   tamanho — somar as duas responderia outra pergunta.

⚠️ **E a estimativa de 8% nunca foi medida por nós.** O número que circula (`~212 de 2.670
pessoas`) veio da contagem de 17/08 sobre oportunidades, não da varredura por pessoa que a
rota faria. Continua **não medido** — não usar em conversa como se fosse.

---

## Motivo de perda: o CRM registra, a API não devolve — medido em 20/08/2026

⚠️ **Isto CONFIRMA o aviso que já está na `/comercial`**, e refina o texto dele.

**Os 6 motivos existem.** `getAllPipelines` devolve o `lossreasons` do funil 4:

```
Valor da Proposta · Não Teve Interesse · Sumiu
Fechou com outra Empresa · Não tem Perfil · Sem Nenhum Retorno
```

**E a escrita aceita motivo:** `loseOpportunity` tem `closereason` ("Razão para a perda")
e `closeobs`, os dois opcionais.

🛑 **Mas a LEITURA não devolve nenhum dos dois.** Lidas 12 oportunidades perdidas reais via
`getOpportunity`; a união das chaves dá **53 campos** e **nenhum** contém
`reason`/`loss`/`motivo`. Só `closedat`, `closedby`, `closevalue`, `closerecurrentvalue` e
`expectedclosedate` — todos sobre *quando* e *por quem*, nenhum sobre *por quê*.

| | existe? |
|---|---|
| motivos cadastrados no funil | ✅ 6 |
| `closereason` aceito na ESCRITA | ✅ string livre, opcional |
| `closereason` devolvido na LEITURA | 🛑 **não** |
| `fk_lossreason` na leitura | 🛑 **não** |

**A correção no texto da tela é de uma frase, e ela importa:** hoje o aviso diz que o CRM
*não devolve* o motivo — certo — mas quem lê entende *"o CRM não registra"*, que é falso e
leva à conclusão errada ("é inútil preencher"). O motivo pode estar lá dentro; **é a nossa
via de acesso que não o alcança.** Vira pergunta para o suporte, não limitação aceita.

⚠️ E `closereason` é **string livre**, não FK para os 6 cadastrados — mesmo que o suporte
abra a leitura, o campo pode vir com texto digitado à mão. Agrupar por motivo exigiria
normalizar, e isso se descobre ANTES de prometer o gráfico.

### Divergência da spec encontrada no caminho

`closedat` está documentado como *"formato ISO 8601"* e **vem como EPOCH em segundos**
(`1787139927`). É a mesma armadilha já blindada por `epochParaISO` em `lib/xmax.ts` — e a
terceira vez que a spec erra sobre um campo de data. **A spec descreve a intenção; o
`typeof` descreve o que chega.**

A resposta real traz **53 campos contra os 44 documentados** — `allowviewparent`, `bsuid`,
`fkCompany`, `freight`, `parentopportunity`, `portfolioId`, `products`, `username` e
`visibility` não estão na spec. Nenhum deles é motivo de perda.

---

## ⚠️ A régua dos "95% com valor" é 71% — medido em 17/08/2026

A demanda de alerta de valor recorrente faltando veio com uma régua do dono: *"95% das
vezes vai ter valor a partir de Negociação"*. Isso faria de valor faltando uma **exceção**,
que é o que justifica um alerta.

**Medido, nas oportunidades ABERTAS do funil 4:**

| etapa | pessoas | com valor | sem valor | MRR informado |
|---|---|---|---|---|
| `[27]` Negociação | 23 | 17 | **6** | R$ 71.560 |
| `[20]` Fechamento | 88 | 62 | **26** | R$ 157.560 |
| **total** | **111** | **79** | **32** | **R$ 229.120** |

**71,2% têm valor, não 95%. São 32 pessoas de 111 — 29%.**

**Consequência de desenho:** 32 não é exceção, é **fila de trabalho**. A tela mostra como
pendência a preencher (em cor de ênfase), nunca como alarme — alarme que acende em 29% dos
casos é o alarme diário que ninguém lê, e essa regra já está no CLAUDE.md.

> 🛑 **E O MRR É PISO, NUNCA TOTAL.** Os R$ 229.120 somam só as 79 pessoas com valor
> informado. As outras 32 têm MRR **desconhecido, não zero** — publicar o número como
> "dinheiro parado" afirmaria que 29% da fila vale zero. É a mesma família do *ausência de
> dado não é evidência de ausência do fato*. A tela diz isso no corpo, não em tooltip: **"os
> R$ 229.120 são um piso, não o total"**, com o denominador ao lado de cada número e a frase
> de que o dinheiro real é maior e não dá para dizer quanto.

> ⚠️ **A DIVERGÊNCIA FICA AQUI, NÃO NA INTERFACE.** Decisão do Igor em 17/08/2026: uma
> versão da tela escrevia "não os 95% que a régua supunha", e ele tirou — o dono precisa
> saber, mas **a tela é lida por outras pessoas**, e citar a régua dele ali vira correção
> pública. O número vai na conversa, que é onde ela pertence. Na tela só o medido, com o
> denominador. **Número na tela informa, não argumenta.**

**Conferido:** a seção nova (`porEtapaAvancada`) e a existente (`fechamento.emFechamento`)
publicam os mesmos valores para a etapa 20 — 88 pessoas, 62 com valor, R$ 157.560. Duas
seções divergindo sobre a mesma etapa seria pior que uma seção só. E nenhuma pessoa está nas
duas etapas ao mesmo tempo, então a soma das linhas fecha.

## Perguntas ainda abertas

**Bloqueiam o desenho das coleções** — o modelo não é desenhado antes delas:

✅ ~~Como o Marcos desqualifica lead?~~ — **respondido**: as duas formas, ver a decisão
acima.
✅ ~~O MRR vazio~~ — **respondido**: passa a preencher; as antigas ficam, e a tela
sinaliza.
✅ ~~Origem 0~~ — **confirmado como ausência**. O Thiago cria campanhas com QR code para
captação e essas geralmente entram sem origem. Mantida a regra "Sem origem".

**Baixa prioridade, não bloqueia:**

1. ~~**Os nomes das 21 etiquetas sem nome**~~ — **a pergunta mudou em 20/08/2026.** Elas
   não estão sem nome: o endpoint que as nomeia é `getChatTags`, e ele **não responde**
   pelas filas `[15]` e `[20]` (desabilitadas, `QUEUE_008`) nem pelas `[18]` e `[22]` (a
   chave global não alcança, `AUTH_018`). Ver a seção 3 de `perguntas-agencia.md`.
   ⚠️ **A lista antiga já estava obsoleta e ninguém percebeu:** ela citava `[6]` com 77
   usos como sem nome, e `[6] GUILHERME` está em `getChatTags` desde 17/08. Contagem de
   "desconhecidos" envelhece em silêncio — ela só cresce quando alguém a recalcula.
   **Vira pedido ao suporte**, não espera pelo Marcos (que já disse não conseguir
   rastrear por ID na interface — esse caminho estava fechado desde o começo).
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

## 🪦 `/api/diag-xmax` foi REMOVIDA em 20/08/2026 — as 6 respostas e onde a lógica foi

Ela cumpriu o papel: seis perguntas feitas ANTES de escrever qualquer feature, todas
respondidas, e o que era permanente já tinha sido extraído para `lib/xmax.ts` e
`lib/comercial.ts` (é o que diz o comentário no topo do `lib/xmax.ts`: *"a rota
/api/diag-xmax é temporária, isto aqui não é"*).

🛑 **E o motivo de sair não foi só a regra da casa.** O bloco `6_amostraCrua` devolvia
**quatro objetos de oportunidade inteiros, sem filtro** — `title`, `mainphone` e
`mainmail` de leads reais — atrás apenas do `CRON_SECRET`, que está registrado neste
projeto como risco aceito por ser fraco. O próprio comentário assumia: *"Objeto inteiro,
sem filtro nem renomeação."* Defensável por uma tarde; inaceitável como rota permanente.
**Exposição de dado pessoal em produção não é diagnóstico esquecido — é vazamento com
prazo indeterminado.**

| # | pergunta | resposta | para onde a lógica foi |
|---|---|---|---|
| 1 | quais funis e etapas existem | 19 funis; o 4 é "Provedor de internet" com 12 etapas | `NIVEIS_FUNIL`, `ETAPAS_DO_FUNIL` e `ordemDeEtapas()` em `lib/comercial.ts` |
| 2 | quais valores de `origin` aparecem | 6 origens, nenhuma é prospecção de lista | mapa `ORIGENS` em `lib/xmax.ts` |
| 3 | **a varredura de ID funciona?** | **SIM** — `getOpportunity` devolve encerrada | virou `/api/comercial/backfill` |
| 4 | quantas ganhas têm `closerecurrentvalue` | **32 de 38**, R$ 68.120,00 | o Marcos passa a preencher; as antigas ficam e a tela diz |
| 5 | os ids de `tags` batem com `getTags`? | **é UM espaço de ids só** — ver seção 3 de `perguntas-agencia.md` | `ehDesqualificado()` / `TAG_SEM_PERFIL` |
| 6 | amostra dos campos crus | modelou `OportunidadeXmax` e revelou o epoch do `closedat` | `epochParaISO()` e a interface, em `lib/xmax.ts` |

⚠️ **A 3 é a que mais valeu, e por um motivo que não estava no plano.** O veredito dela
("`getOpportunity` aceita encerrada") é o que hoje torna o backfill capaz de cobrir o
histórico do `fk_campaign` — uma pergunta que nem existia quando a rota foi escrita. **Foi
o diagnóstico barato que decidiu uma feature três semanas depois**, e é o argumento a favor
de sondar a fonte antes de prometer, não contra.

### O que NÃO foi respondido e some com ela

Nada. As seis fecharam. Se voltar a fazer falta, a rota está no histórico do git — mas
**quem a ressuscitar precisa cortar o `6_amostraCrua` ou filtrar os campos pessoais
antes de subir.** É a única parte que não pode voltar como estava.

---

## ~~Plano do `/api/diag-xmax`~~ (histórico — a rota não existe mais)

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
5. ~~**Os IDs de `tags` da oportunidade batem com `getTags`?**~~ ✅ **RESPONDIDA em
   20/08/2026: é UM espaço de IDs só.** As oportunidades carregam etiquetas dos dois
   endpoints — `[4]`, `[9]`, `[26]`, `[39]` vêm de `getTags` e `[6]`, `[12]`, `[13]` de
   `getChatTags`. Não são namespaces paralelos; são duas janelas parciais para a mesma
   lista. (pergunta original: `getTags` está sob a tag
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
5. **IDs de etiqueta sem nome** — o balde cego continua, mas a CAUSA mudou (20/08/2026):
   não é que ninguém saiba o nome, é que `getChatTags` não responde por 4 das 7 filas. O
   tratamento é o mesmo (balde explícito com ID e contagem VISÍVEIS na tela, nunca `else`
   vazio); o que muda é para quem se pede o conserto. ⚠️ **O número 21 é de 15/08 e não
   foi recontado** — pelo menos um dos citados já tinha nome quando isto foi escrito.
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
