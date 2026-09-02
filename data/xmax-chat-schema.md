# Esquema REAL dos endpoints de chat do Xmax

> **Medido em 02/09/2026 contra a instância de produção.** Este arquivo existe porque a
> spec (`data/xmax-api.yaml`) descreve um objeto de mensagem que **não é o que a API
> devolve** — é a quarta divergência documentada e, de longe, a maior: o objeto inteiro.
>
> 🔑 **A regra da casa que isto reforça: a spec diz que um campo EXISTE; o `typeof` de uma
> resposta real diz o que ele É.** Quem implementar o módulo de análise de atendimento vai
> bater nisto de novo se não ler daqui.

---

## 🛑🛑 A ARMADILHA QUE MAIS ENGANA: **VAZIO SILENCIOSO**

> **`getChatMessages` responde `HTTP 200` com `messages: []` e `maxKId: 0` quando o chat
> pertence a OUTRA FILA.**

**Parece dado e é PERMISSÃO.** Não há erro, não há status diferente, não há campo dizendo
"você não tem acesso" — a resposta de um chat inacessível é **byte por byte** a resposta de
um chat legitimamente sem mensagens.

🔑 **E por isso ela é pior que um 403:** um 403 manda investigar; um `200` vazio manda
concluir. Quem medir cobertura de histórico com este endpoint vai reportar "75% dos
atendimentos não têm mensagem" e estará descrevendo a própria chave de API.

**Foi exatamente o que quase aconteceu aqui:** 9 de 12 vieram vazios e a primeira leitura
foi *"retenção da plataforma"* — uma causa plausível, que teria encerrado a investigação e
mudado o escopo do produto para "só analisa o que entrar daqui pra frente".

🔧 **A defesa é o `backupChatAsJson`** (chave global), que alcança todas as filas. E a
conferência que denuncia: se um chat vem vazio no `getChatMessages`, peça o backup do
MESMO id — se vier com mensagens, o vazio era permissão.

---

## O detalhe do vazio silencioso

`getChatsByDateRange` usa a **chave global** e devolve chats de **todas as filas**.
`getChatMessages` é **escopado por `queueId`** — e quando o chat não pertence à fila
informada, ele responde **HTTP 200 com `messages: []` e `maxKId: 0`**.

**Não é erro. Não é retenção. Não é chat vazio.** É o mesmo `200` de um chat legitimamente
sem mensagens, e nada na resposta distingue os dois.

Medido — 12 encerrados lidos com `queueId=7`:

| | resultado |
|---|---|
| vieram vazios | **9 de 12** |
| eram realmente vazios | **0** |
| eram de outra fila | **9** |

Passando o `queueId` correto, os mesmos chats devolvem 3, 4 e **178** mensagens.

⚠️ E a fila 22 devolve **401** mesmo com o `queueId` certo — a chave global não a alcança,
exatamente como no `getChatTags`. Ver `data/perguntas-agencia.md`, seção 3.

🔧 **A saída é `backupChatAsJson`**, que usa a chave global e alcançou **todas** as filas da
amostra, inclusive a 22. Ele devolve o chat inteiro com as mensagens embutidas.

📌 **Distribuição real dos encerrados (amostra de 25, 30 dias):** fila **19 → 20**,
fila 7 → 3, fila 22 → 2. **A nossa fila é minoria no histórico** — ler só a 7 perderia 88%.

---

## `getChatMessages` — o objeto de MENSAGEM

⚠️ **Tudo minúsculo/snake_case. A spec documenta camelCase.**

| a spec promete | a API entrega | observação |
|---|---|---|
| `text` | **`message`** | |
| `userId` | **`fk_user`** | `null` quando não há usuário |
| `kId` | **`id`** | |
| `mId` | **`messageid`** | |
| `srvRcvTime` (number) | **`srvrcvtime`** | **string ISO de 24 chars**, não número |
| `clientRcvTime` | `clientrcvtime` | idem |
| `clientReadTime` | `clientreadtime` | idem |
| `messageTimestamp` | `messagetimestamp` | número (epoch) |
| `direction: 'in'\|'out'\|…` | **`direction: 1 \| 2 \| 5 \| 8 \| 9 \| 10`** | **número**, não a enum |
| `location: { latitude, longitude }` | **achatado**: `latitude`, `longitude` | |
| `file: { fileId, mimeType, name }` | **achatado**: `fk_file`, `file_name`, `file_mimetype` | |
| `quotedText` / `quotedId` | `quotedtext` / `quotedid` | |
| `queueId`, `clientId` | **não existem** | |
| — | **`deleted`** | `0`/`1`, não booleano |

**Campos reais, na ordem em que vêm:**
`fk_user, fk_file, id, messageid, direction, message, quotedtext, quotedid, file_name,
file_mimetype, srvrcvtime, clientrcvtime, clientreadtime, messagetimestamp, latitude,
longitude, deleted`

---

## `backupChatAsJson` — OUTRO esquema, e o mais completo

⚠️⚠️ **NÃO é o mesmo objeto do `getChatMessages`.** É camelCase, tem campos que o outro não
tem, e — crucialmente — traz **`direction` em TEXTO e `directionCode` em número**. É a
pedra de Roseta dos códigos.

**Chat:** `id, clientName, clientNumber, clientId, clientEmail, clientUsername, queueId,
origin, queueType, beginTime, endTime, firstResponseTime, protocol, endReason,
endReasonObservation, initiatedByUserId, firstResponseUserId, lastUserId, closeUserId,
contactId, companyId, distributionFilter, marker, profilePicture, aiSummary, aiSuggestion,
aiScore, ad, campaignId, messages, remoteSupportSessions`

**Mensagem:** `id, messageId, direction, directionCode, userId, timestamp, timestampUnix,
text, quotedText, quotedMessageId, buttonId, transcription, serverReceivedTime,
clientReceivedTime, clientReadTime, deleted, error, reaction, visualGroupId, subject,
failed, assistantId, ivrId, rewrittenByAi, insultDetected, file, location, ad`

🛑 **`opportunities` NÃO está no backup** — 0 de 25. O vínculo com a oportunidade só aparece
em `getAllOpenChats`.

---

## 🔑 O mapa `direction` ↔ `directionCode`

Medido em 369 mensagens de 25 atendimentos encerrados:

| `direction` | código | mensagens | com `userId` | sem |
|---|---|---|---|---|
| `in` | **1** | 252 | 121 | 131 |
| `system` | **10** | 104 | 98 | 6 |
| `out` | **2** | **5** ⚠️ | 5 | 0 |
| `alert` | **8** | 3 | 0 | 3 |
| `info` | **5** | 3 | 0 | 3 |
| `alert` | **9** | 2 | 0 | 2 |

🛑 **A MENSAGEM DE AGENTE SÃO CINCO, EM 25 ATENDIMENTOS.** `out` / código 2 é o que o
vendedor escreve — e há 5 delas contra 252 `in` e 104 `system`.

⚠️⚠️ **Isso é pouco demais para qualquer conclusão sobre desempenho de vendedor.** Cinco
mensagens não medem tempo de resposta, não medem qualidade, não medem nada. Qualquer
métrica de atendimento construída sobre esta amostra estaria descrevendo ruído.

**E a amostra precisa crescer ANTES da proposta, não depois** — porque o número muda o que
se promete: se o padrão se confirmar, a maior parte do que sai da empresa é `system`, e o
produto analisaria automação em vez de conversa.

⚠️ **`alert` tem DOIS códigos (8 e 9).** A spec lista cinco valores de enum; a API usa pelo
menos seis códigos. Não sei o que separa 8 de 9.

### 🛑 A inferência que estava ERRADA, e como ela foi desfeita

Lendo só o `getChatMessages` (que dá o número cru), o padrão parecia óbvio: `direction: 10`
com `fk_user` preenchido = mensagem do agente humano, porque era 313 de 321 num chat.

**`10` é `system`.** A mensagem de agente é `out`, código **2** — e são **5 em 25
atendimentos**.

**O que desfez a inferência não foi pensar melhor: foi o `backupChatAsJson` trazer o rótulo
ao lado do código.** Enquanto só havia o número, a correlação com `fk_user` era o único
sinal — e ela apontava para o lugar errado, porque a automação também tem usuário.

### 🔑 A RÉGUA: CORRELAÇÃO NÃO É RÓTULO

**Enquanto só havia o número, o único sinal disponível apontava para o lugar errado.** A
correlação `código 10` ↔ `fk_user preenchido` era forte (313 de 321) e real — e mesmo
assim a conclusão que ela sugeria estava invertida, porque a automação também tem usuário.

**O que desfez não foi raciocínio melhor: foi uma FONTE que trouxe o rótulo ao lado do
código.** Nenhuma quantidade de análise sobre o número sozinho teria chegado lá.

⚠️ **Antes de nomear uma categoria a partir de correlação, procure a fonte que traz o
NOME.** Se ela não existir, o nome fica em aberto — e uma pergunta em aberto é mais barata
que uma categoria errada consumida por três telas.

📌 **Isto é INFERÊNCIA, não campo, e continua sendo:** não existe booleano "é bot". O que se
sabe é que `system/10` carrega `userId` em 98 de 104 casos — ou seja, **`userId` preenchido
NÃO significa humano.** Pergunta aberta para o Manuel.

---

## Os campos de IA que a plataforma JÁ TEM

O chat traz `aiSummary`, `aiSuggestion`, `aiScore`; a mensagem traz `rewrittenByAi`,
`insultDetected`, `transcription`, `assistantId`.

**Medido: 0 de 25 chats com qualquer um preenchido.**

⚠️ **E zero preenchido não autoriza dizer que a plataforma não faz isso.** Diz que **nestes
25 não estava em uso** — pode ser recurso não contratado, desligado, ou de outra fila. A
diferença importa: se o Xmax já entrega resumo e score, o módulo pode estar reconstruindo
algo que se liga num botão. **Pergunta para o Manuel, antes de qualquer proposta.**

---

## Os endpoints de chat, e o que cada um exige

| endpoint | chave | exige | devolve |
|---|---|---|---|
| `getAllOpenChats` | fila | `queueId` | **abertos** da fila, **com `opportunities`** |
| `getClientOpenChats` | fila | `clientId` | abertos de um cliente, todas as filas |
| `getChatMessages` | **fila** | `chatId` | mensagens — 🛑 **vazio silencioso fora da fila** |
| `getChatDetail` | fila | `chatId` | detalhe — **404** fora da fila |
| `getGlobalChatDetail` | **global** | `chatId` | detalhe sem precisar de `queueId` |
| `getClientChatHistory` | fila | `clientId` | histórico do cliente |
| `getChatsByDateRange` | **global** | `startDate`, `endDate` | **IDs** de encerrados, todas as filas |
| `getAllChatsClosedYesterday` | **global** | — | IDs encerrados ontem |
| `getChatsMinIdAndDate` | **global** | — | o **piso** do histórico |
| `backupChatAsJson` | **global** | `id` | 🔧 **o chat inteiro, todas as filas** |

⚠️ `getChatMessages` aceita `fromId` — é o que torna a coleta **incremental**. Testado: com
`fromId: 0` e todos os `include*`, o vazio de fila errada continua vazio (o problema não é
filtro).

---

## Até onde o histórico existe

```
getChatsMinIdAndDate → minId 1, de 23/09/2021
```

**O histórico começa em setembro de 2021** — quase cinco anos. E foram **152 atendimentos
encerrados nos últimos 30 dias**, em todas as filas.

---

## Volume e custo, medidos

Sobre 25 encerrados (30 dias), via `backupChatAsJson`:

| | valor |
|---|---|
| mensagens por atendimento | **mediana 6** · p25 4 · **maior 178** |
| caracteres de texto | **mediana 303** · maior 27.561 |
| tokens (piso ~4 chars) | **mediano ~76** · **maior ~6.890** |
| bytes do backup | mediana 6.884 · maior 187.032 |

⚠️ **A mediana e o máximo diferem 90×.** Um teto por atendimento é obrigatório: o pior caso
sozinho é ~6.900 tokens de entrada.

🛑 **E a estimativa de token é PISO, não previsão** — ~4 caracteres por token é aproximação
para inglês, e português acentuado gasta mais. Contar de verdade exige o tokenizador.

📌 **Números anteriores desta mesma sessão estavam enviesados e foram descartados:** medir
pelos chats ABERTOS deu mediana 42 mensagens / 4.333 caracteres, porque os 28 abertos são
todos do mesmo usuário, nenhum respondido — **é um disparo, não conversa.** Amostra de
conveniência mede o que está por cima, não o que é típico.
