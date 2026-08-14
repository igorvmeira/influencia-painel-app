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

## Perguntas ainda abertas

**Bloqueiam o desenho das coleções** — o modelo não é desenhado antes delas:

1. **Como o Marcos desqualifica lead?** Etiqueta `[38] Sem Perfil` (14 usos), funil 23
   "LEADS NÃO QUALIFICADOS" (333), ou os dois? Muda onde a taxa de desqualificação é
   lida.
2. **O MRR vazio:** medido, 1 de 3 ganhas fechou com `closerecurrentvalue = 0`. Ele
   preenche sempre? Se não, o número de manchete do Thiago nasce menor que a realidade
   e o painel não tem como saber.
3. Os nomes das 6 etiquetas mais usadas sem nome (`[17] [34] [6] [8] [7] [44]`).

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
