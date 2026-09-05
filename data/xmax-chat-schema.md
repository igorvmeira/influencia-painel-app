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
MESMO id — se vier com mensagens, o vazio **não era o chat**.

⚠️ **O backup diz que o vazio é falso; NÃO diz por quê — e há três motivos possíveis**
(medido em 02/09/2026, ver a seção do vazio silencioso adiante):

| causa | como se distingue | o que fazer |
|---|---|---|
| **permissão** — chat de outra fila | o `queueId` do backup ≠ o que você pediu | pedir com o `queueId` certo |
| **filtro** — só há `system`/`alert` | os `directionCode` do backup são 8 e 10 | ligar os `include*` |
| **dado** — o chat é vazio mesmo | o backup também vem sem mensagens | nada; é verdade |

🛑 **Concluir "permissão" só porque o backup trouxe mensagens é pular do vazio para a causa
mais dramática das três.** Foi o erro que gerou a correção de 02/09 neste arquivo: a mesma
resposta de 26 bytes serve às três, e é o CAMPO do backup (`queueId`, `directionCode`) que
separa, nunca o fato de ele ter respondido.

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

🛑 **CORREÇÃO — 02/09/2026. Esta linha dizia o contrário do medido.**

> ~~"E a fila 22 devolve **401** mesmo com o `queueId` certo — a chave global não a
> alcança, exatamente como no `getChatTags`."~~

**Reproduzido em 02/09/2026, 20:23Z: `getChatMessages` com `queueId: 22` e o chat 14004
devolve `HTTP 200`.** Não há 401 na fila 22 em endpoint nenhum. A fila que 401 é a **18**,
e lá o `AUTH_018` atinge os quatro endpoints escopados de uma vez — é por FILA, nunca por
endpoint. Matriz completa em `data/perguntas-agencia.md`, seção 3.

⚠️ **De onde veio o erro:** o 401 foi medido em **20/08/2026 no `getChatTags`** e eu o
apliquei ao `getChatMessages`, onde nunca tinha sido medido — e à fila 22, que desde então
passou a responder. Duas trocas numa frase só, e ela ficou aqui treze dias parecendo
medição.

🔧 **`backupChatAsJson`** usa a chave global e alcança **todas** as filas da amostra,
inclusive a 22 (confirmado de novo em 02/09: `HTTP 200`, `queueId: 22`, 4 mensagens). Ele
devolve o chat inteiro com as mensagens embutidas. **Mas ele não é mais a "saída" para a
fila 22** — o `getChatMessages` também chega lá. Ele continua sendo a saída para o vazio
silencioso de fila errada, que é outra coisa.

🕳️ **E o vazio da fila 22 tinha uma TERCEIRA causa, que não é nenhuma das duas acima:
FILTRO.** O chat 14004 só tem mensagens `alert` (8) e `system` (10) — zero `in`/`out`. Sem
`includeSystemInfo: true`, o `getChatMessages` não tem o que devolver e responde vazio
**corretamente**. Com a flag, devolve as 2 e `maxKId: 463192`.
**Três coisas produzem `200` + `messages: []`, e a resposta é idêntica nas três:** chat de
outra fila (permissão), chat sem mensagem (dado), e mensagem que existe mas está fora do
filtro pedido (parâmetro). O `backupChatAsJson` distingue as três; a resposta, nenhuma.

📌 **Distribuição dos encerrados — MEDIDA NOS 152, não numa amostra:**

| fila | encerrados em 30 dias |
|---|---|
| **7** (a nossa) | **89** (58,6%) |
| 19 | 60 (39,5%) |
| 22 | 3 (2,0%) |

**Ler só a fila 7 perderia ~41% do histórico.** Significativo, e menos do que parecia.

🛑 **CORREÇÃO — o primeiro número que escrevi aqui estava ERRADO.** A versão inicial deste
arquivo dizia *"fila 19 → 20, fila 7 → 3, a nossa é minoria, perderia 88%"*. Aquilo veio de
ler **os 25 primeiros IDs** de `getChatsByDateRange` — que é uma FATIA ORDENADA, não uma
amostra. Lendo os 152, a proporção inverte: a fila 7 é MAIORIA.

⚠️ **É a mesma armadilha registrada no CLAUDE.md — *amostra que você viu não é amostra que
você tirou* — e ela me pegou no mesmo dia, no arquivo em que estava documentando outras
armadilhas.** `.slice(0, 25)` sobre uma lista ordenada parece amostragem e não é.
**Sempre que a população couber inteira, leia inteira**: os 152 levaram 3 segundos.

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

🛑 **`opportunities` NÃO está no backup** — e a evidência é ESTRUTURAL, não estatística: a
chave simplesmente **não existe** na lista de campos do chat acima. Não é "veio vazio em N
casos", é "o endpoint não devolve o campo".
O vínculo com a oportunidade só aparece em `getAllOpenChats`.

### 🛑🛑 `queueType` NÃO é o tipo configurado da fila — medido em 05/09/2026

O backup traz um campo `queueType` no chat. **Ele não fala o mesmo idioma do campo `type`
do `getAllQueues`**, que é onde mora a configuração real da fila. Nas três filas em que os
dois endpoints têm dado, eles discordam nas **três**:

| fila | `backupChatAsJson` → `chat.queueType` | `getAllQueues` → `type` |
|---|---|---|
| 7 | `WA Cloud API` | **`WAGS`** |
| 19 | `WAMD` | **`WAMD3`** |
| 22 | `WAMD` | **`WAMD2`** |

O backup **colapsa as variantes** (`WAMD2` e `WAMD3` viram `WAMD`) e na fila 7 diverge por
inteiro. Medido em 05/09/2026 sobre 80 chats de `getChatsByDateRange` (janela de 30 dias) e
uma chamada a `getAllQueues`, tudo com a chave global.

📌 **Os tipos reais das 7 filas, por `getAllQueues` (05/09/2026):**

| fila | nome | `type` | `enabled` |
|---|---|---|---|
| 7 | Influência Marketing | `WAGS` | true |
| 15 | OS DIRETORES | `WAMD` | false |
| 17 | INSTAGRAM | `WAGS` | true |
| 18 | IA - PROVEDOR DE INTENET | `WAMD` | false |
| 19 | marketing | `WAMD3` | true |
| 20 | DISPAROS | `WAMD` | false |
| 22 | Número de Notificações Internas | `WAMD2` | true |

⚠️ E a spec **também não bate**: a linha 1720 do `data/xmax-api.yaml` documenta o tipo como
enum NUMÉRICO (`5 para WAMD`, `9 para WAGS`). O `getAllQueues` devolve **string com
variantes**. São **três** vocabulários para a mesma ideia — o da spec, o do `getAllQueues`
e o do backup — e só o do meio descreve a configuração.

🔧 **Para qualquer pergunta sobre o TIPO da fila, a fonte é `getAllQueues`.** O `queueType`
do backup serve para agrupar chats, e só.

---

## 🔑 O mapa `direction` ↔ `directionCode`

Medido em **3.222 mensagens de TODOS os 152 atendimentos** encerrados em 30 dias:

| `direction` | código | mensagens | % | com `userId` | chars/msg |
|---|---|---|---|---|---|
| `system` | **10** | 2.349 | **72,9%** | 2.231 | 98 |
| `in` | **1** | 596 | 18,5% | 284 | 99 |
| `info` | **5** | 91 | 2,8% | 0 | 41 |
| `alert` | **9** | 78 | 2,4% | 17 | 129 |
| `alert` | **8** | 75 | 2,3% | 0 | 42 |
| **`out`** | **2** | **33** | **1,0%** | 29 | 181 |

## 🛑🛑 O NÚMERO QUE DECIDE A PROPOSTA: **1% do volume é mensagem de agente**

A amostra foi ampliada de 25 para **os 152 encerrados**, e o padrão não só se confirmou —
ficou mais extremo:

| | |
|---|---|
| mensagens de agente (`out`) | **33 de 3.222 — 1,0%** |
| atendimentos com ALGUMA `out` | **16 de 152 — 10,5%** |
| com `firstResponseTime` | 6 de 152 — 3,9% |
| `system` | **72,9%** |
| usuários distintos em 3.222 mensagens | **1** (id 23) |

🔑 **Em 89% dos atendimentos encerrados NINGUÉM da empresa escreveu nada.** O que sai é
`system` — automação — e vem tudo sob um único usuário.

**Isso muda o que se promete, não como se implementa.** Um módulo de "análise de
atendimento" treinado nesta base analisaria **automação**, não conversa de vendedor. As
métricas óbvias — tempo de resposta, qualidade da abordagem, aderência a script — não têm
sobre o que ser calculadas em 9 de cada 10 atendimentos.

⚠️ **E o que ISSO não diz:** não diz que a equipe não atende. Pode atender por outro canal,
por outra fila, ou por um caminho que a API não expõe. **Diz apenas que a conversa de
vendedor não está NESTES dados** — e é sobre estes dados que o módulo seria construído.

📌 O texto de agente, quando existe, tem mediana de **354 caracteres** em 16 atendimentos.

⚠️ **`alert` tem DOIS códigos (8 e 9).** A spec lista cinco valores de enum; a API usa pelo
menos seis códigos. Não sei o que separa 8 de 9.

### 🛑 A inferência que estava ERRADA, e como ela foi desfeita

Lendo só o `getChatMessages` (que dá o número cru), o padrão parecia óbvio: `direction: 10`
com `fk_user` preenchido = mensagem do agente humano, porque era 313 de 321 num chat.

**`10` é `system`.** A mensagem de agente é `out`, código **2** — e são **33 em 3.222
mensagens (1,0%)**, medido sobre os 152.

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

### 🛑🛑 A RÉGUA IRMÃ: **MEDIÇÃO TEM ENDPOINT E DATA. SEM OS DOIS, ELA VIRA CRENÇA.**

A régua acima trata de um número lido **na fonte errada**. Esta trata do mesmo número lido
na fonte certa e depois **citado fora dela** — e é a mais fácil de cometer, porque não
exige erro nenhum no momento da medição.

**Caso real, 02/09/2026.** Estava escrito neste arquivo: *"a fila 22 devolve 401 mesmo com
o `queueId` certo"*. O 401 tinha sido medido — **em 20/08/2026, no `getChatTags`**. A frase
o transportou para o `getChatMessages`, onde nunca fora medido, e para uma data em que já
não valia. **Nada foi inventado; só perdeu as duas etiquetas.**

🔑 **A medição vira crença exatamente quando as etiquetas caem**, e o sintoma é que ela
passa a soar como propriedade do sistema. Compare:

| com etiqueta (medição) | sem etiqueta (crença) |
|---|---|
| "`getChatTags` na fila 22 deu 401 em 20/08/2026" | "a fila 22 dá 401" |
| "`me/adaccounts` não listou 9 das 117 em 16/08/2026" | "o token não enxerga conta de BM" |
| "117 chamadas ao `/api/sync-meta`, 17/08/2026: mediana 4,2s, maior 33,7s, zero estouros" | "o plano grátis corta em ~10s" |

⚠️ **A terceira linha estava no `CLAUDE.md` deste estúdio**, herdada da documentação da
Vercel, e quase fez quebrar um sync em blocos por causa de um teto que não existia. Crença
não precisa vir de medição nenhuma — basta soar como fato.

A coluna da direita é sempre **mais curta, mais útil e mais fácil de repetir** — por isso
ela vence. E é a única que não dá para conferir nem expirar: sem endpoint não se sabe o que
repetir, sem data não se sabe se ainda vale.

⚠️ **O custo é assimétrico e recai sobre TERCEIROS.** Esta crença específica quase virou um
chamado ao fornecedor pedindo que investigasse um 401 inexistente num endpoint que nunca
falhou. Medição errada gasta o nosso tempo; **crença exportada gasta o de quem confia na
gente**, e volta como desconfiança de tudo o mais que a gente mandou.

🔧 **Na prática, três exigências — e a terceira é a que faltou aqui:**
1. toda linha que afirma comportamento da API nomeia o **endpoint** e a **data**;
2. guarda o **corpo cru**, não só o status — `{"errorCode":"AUTH_018"}` tem 24 bytes e é o
   que separa "mudou" de "eu errei" quando alguém remedir;
3. **antes de exportar um número para fora, remeça.** Este tinha treze dias, e treze dias
   foram suficientes.

⚠️ **Corolário — CORREÇÃO SE FAZ RISCANDO, NÃO APAGANDO.** A frase errada fica no arquivo,
tachada, com a data e a medição nova ao lado (é o formato usado no topo deste arquivo e na
tabela de filas de `perguntas-agencia.md`). Apagar deixaria o doc CERTO e esconderia o que
mais importa: **que ele esteve errado, por quanto tempo, e que ninguém notou.** Quem lê um
doc sem cicatriz confia demais nele — e a próxima frase sem etiqueta passa igual.

---

### 🛑🛑 A TERCEIRA IRMÃ: **CAMPO COM O MESMO NOME EM DOIS ENDPOINTS NÃO É O MESMO CAMPO.**

As três atacam o mesmo ponto — dar sentido a um valor — por eixos diferentes:

| | o que o valor tinha | como enganou |
|---|---|---|
| `direction: 10` | **número sem rótulo** | a correlação disponível apontava para o lado errado |
| a fila 22 "dá 401" | **rótulo sem endpoint e sem data** | virou propriedade do sistema |
| `queueType: "WAMD"` | **rótulo que EXISTE nos dois lugares, com vocabulários diferentes** | pareceu confirmação |

**Caso real, 05/09/2026.** O TI do fornecedor disse *"a chave global não abre fila do tipo
WAMD, e a 18 é WAMD"*. O backup mostrava a fila 22 com `queueType: "WAMD"` e ela responde
`200` — contradição aparente, pronta para ser mandada de volta.

**Não havia contradição.** A 22 é **`WAMD2`** no `getAllQueues`; `WAMD` era o rótulo do
backup, que colapsa as variantes. Nem os nomes dos campos eram iguais — `queueType` × `type`
— e mesmo assim li um como o outro, **porque o VALOR era plausível**.

🔑 **É esse o mecanismo: valor plausível dispensa a conferência do campo.** Se o backup
tivesse devolvido `queueType: 5` ou `queueType: "tipo_3"`, ninguém teria comparado com o
`type` do `getAllQueues` sem olhar duas vezes. Foi a **coincidência parcial de vocabulário**
que fez a comparação parecer desnecessária. Um valor esquisito protege; um valor razoável
não.

⚠️ **A régua: antes de comparar valores de dois endpoints, confirme que os dois campos
falam a mesma língua — medindo os casos em que AMBOS têm dado.** Foi o que resolveu aqui:
três filas com dado nos dois lados, três discordâncias. A conferência custou uma chamada.

🛑🛑 **E O QUE ISTO QUASE CUSTOU NÃO ERA NOSSO — a assimetria de novo, agora no pior
sentido.** As duas irmãs acima produziram **erro interno**: doc errado, investigação no
arquivo errado, tempo nosso. Esta ia virar **objeção mandada para fora** — o TI abriria o
`getAllQueues`, leria `WAMD2`, e a nossa contestação cairia sozinha.

**Medição errada gasta o nosso tempo; objeção errada gasta a confiança de quem responde a
gente** — e essa não volta na medição seguinte. Vale para o fornecedor, para o Manuel e
para a agência: quem já foi contestado com um argumento furado passa a conferir tudo, e o
custo recai justamente sobre as medições CERTAS que vierem depois.

🔧 **O procedimento que sai daqui: toda afirmação que vai CONTESTAR alguém passa por uma
conferência a mais que uma afirmação que fica em casa** — e a conferência é sempre a mesma
pergunta, *"de que endpoint veio este campo, e ele é o campo de que a outra pessoa está
falando?"*.

---

## Os campos de IA que a plataforma JÁ TEM

O chat traz `aiSummary`, `aiSuggestion`, `aiScore`; a mensagem traz `rewrittenByAi`,
`insultDetected`, `transcription`, `assistantId`.

**Medido: 0 de 152 chats com qualquer um preenchido.**

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

Sobre **TODOS os 152** encerrados em 30 dias, via `backupChatAsJson` (3 segundos):

| | valor |
|---|---|
| mensagens por atendimento | **mediana 10** · p90 55 · **maior 178** |
| caracteres de texto | **mediana 975** · p90 5.605 · maior 27.561 |
| tokens (piso ~4 chars) | **mediano ~244** · p90 ~1.401 · **maior ~6.890** |

🛑 **Estes números substituem os de uma amostra de 25 que estava enviesada** (davam mediana
6 mensagens / 303 caracteres). Mesma causa da correção por fila: `.slice(0, 25)` de uma
lista ordenada.

⚠️ **A mediana e o máximo diferem 90×.** Um teto por atendimento é obrigatório: o pior caso
sozinho é ~6.900 tokens de entrada.

🛑 **E a estimativa de token é PISO, não previsão** — ~4 caracteres por token é aproximação
para inglês, e português acentuado gasta mais. Contar de verdade exige o tokenizador.

📌 **Números anteriores desta mesma sessão estavam enviesados e foram descartados:** medir
pelos chats ABERTOS deu mediana 42 mensagens / 4.333 caracteres, porque os 28 abertos são
todos do mesmo usuário, nenhum respondido — **é um disparo, não conversa.** Amostra de
conveniência mede o que está por cima, não o que é típico.
