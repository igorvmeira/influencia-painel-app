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

### ⚠ Não existe origem "prospecção de lista"

Era **metade** do funil que responderia à dor do Marcos (anúncio × prospecção). Nenhuma
das seis origens diz "lista".

**Hipótese a confirmar com ele:** "Leads ABRINT" (a ABRINT é a associação de provedores
— "leads ABRINT" cheira a lista de associados) e "INOVA SUMMIT" (evento) podem ser
justamente a prospecção, registrada com outro nome. Se for, a pergunta dele já tem
resposta sem campo novo.

**Não classificar por conta própria.** O agrupamento origem → categoria vive numa
constante configurável em `lib/xmax.ts`, com as incertas marcadas como `a_confirmar` —
nunca chumbado no código nem adivinhado.

## Perguntas ainda abertas

1. **A lista de etiquetas**, em especial o ID de "sem perfil" (o diagnóstico tenta
   resolver via `getTags`, mas pode ser outro namespace).
2. **Como o Marcos registra prospecção de lista**, se não é nenhuma das 6 origens.

---

## Plano do `/api/diag-xmax` (endpoint TEMPORÁRIO, ainda não escrito)

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

1. **Não existe origem "prospecção de lista".** O funil por origem responde metade da
   pergunta do Marcos; a outra metade não tem onde ser lida. Ver a hipótese ABRINT /
   INOVA SUMMIT acima. *(O `origin` continuar sem endpoint é secundário: o mapa das 6
   já veio da agência e está em `lib/xmax.ts`.)*
2. **O MRR depende de o comercial preencher `closerecurrentvalue` ao ganhar.** O campo
   é OPCIONAL no `winOpportunity`. Se fecharem sem preencher, o número de manchete do
   Thiago vem **zero** e o painel não tem como saber que está faltando. Medir no
   diagnóstico antes de prometer a tela.
3. **Automação pode não saber chamar URL** (premissa não verificada).
4. **Allowlist de IP** contra IP dinâmico da Vercel.
5. **Valores × 100** — erro de 100× no MRR se alguém esquecer.
6. **`tags` da oportunidade podem não ser resolvíveis** pelo `getTags`.
7. **Polling diário perde transições intradiárias** até as automações existirem.

## Escopo já decidido

- Aba no mesmo app, não projeto separado.
- **Sem barra de meta** nesta versão — a agência não tem meta consolidada; o painel é
  que vai produzir o histórico.
- **MRR só de ENTRANTES.** Saída/cancelamento de cliente está fora do escopo.
- Durante a implantação, só o Igor acessa (sem criar usuários novos) — o que depende
  do sistema de papéis, ainda pendente (ver o levantamento de papéis).
